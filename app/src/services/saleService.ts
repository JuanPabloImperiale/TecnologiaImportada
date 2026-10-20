import {
  collection,
  DocumentData,
  doc,
  getDocs,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { baseDescuentoEfectivo, calcDescuento, monthDateRange } from '@/lib/utils';
import { run, ok, fail, type Result } from './result';
import type { Venta, ItemVenta, Negocio, CanalVenta, Envio, PagoVenta } from '@/models';

const col = collection(db, 'ventas');

export type VentaCursor = QueryDocumentSnapshot<DocumentData>;

export interface VentaPage {
  ventas: Venta[];
  cursor: VentaCursor | null;
  hasMore: boolean;
}

function mapVenta(snapshot: QueryDocumentSnapshot<DocumentData>): Venta {
  return { id: snapshot.id, ...(snapshot.data() as Omit<Venta, 'id'>) };
}

export interface NuevaVentaInput {
  items: ItemVenta[];
  envio: Envio; // ARS
  pago: PagoVenta;
  canal: CanalVenta;
  cliente?: { nombre?: string; celular?: string; cuitDni?: string };
  pedidoId?: string;
  /** % de descuento sobre accesorios vendidos en pesos. */
  descuentoPorcentaje?: number;
}

/** Deriva la unidad de negocio del conjunto de items. */
function negocioDeItems(items: ItemVenta[]): Negocio | 'mixta' {
  const set = new Set(items.map((i) => i.negocio));
  if (set.size === 1) return [...set][0];
  return 'mixta';
}

export const saleService = {
  subscribe(onData: (items: Venta[]) => void, onError: (msg: string) => void): () => void {
    const q = query(col, orderBy('creado', 'desc'));
    return onSnapshot(
      q,
      (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Venta, 'id'>) }))),
      (err) => {
        console.error('[saleService]', err);
        onError('No se pudieron cargar las ventas.');
      },
    );
  },

  async getAll(): Promise<Result<Venta[]>> {
    return run(async () => {
      const snapshot = await getDocs(query(col, orderBy('creado', 'desc')));
      return snapshot.docs.map(mapVenta);
    });
  },

  subscribeMonth(
    ym: string,
    onData: (items: Venta[]) => void,
    onError: (msg: string) => void,
  ): () => void {
    const { start, end } = monthDateRange(ym);
    const q = query(
      col,
      where('creado', '>=', Timestamp.fromDate(start)),
      where('creado', '<', Timestamp.fromDate(end)),
      orderBy('creado', 'desc'),
    );
    return onSnapshot(
      q,
      (snap) => onData(snap.docs.map(mapVenta)),
      (err) => {
        console.error('[saleService.subscribeMonth]', err);
        onError('No se pudieron cargar las ventas del mes.');
      },
    );
  },

  async getPage(pageSize = 30, cursor?: VentaCursor | null): Promise<Result<VentaPage>> {
    return run(async () => {
      const size = Math.max(1, Math.min(pageSize, 100));
      const constraints = cursor
        ? [orderBy('creado', 'desc'), startAfter(cursor), limit(size)]
        : [orderBy('creado', 'desc'), limit(size)];
      const snap = await getDocs(query(col, ...constraints));
      return {
        ventas: snap.docs.map(mapVenta),
        cursor: snap.docs[snap.docs.length - 1] ?? null,
        hasMore: snap.docs.length === size,
      };
    });
  },

  async getByMonth(ym: string): Promise<Result<Venta[]>> {
    return run(async () => {
      const { start, end } = monthDateRange(ym);
      const snap = await getDocs(query(
        col,
        where('creado', '>=', Timestamp.fromDate(start)),
        where('creado', '<', Timestamp.fromDate(end)),
        orderBy('creado', 'desc'),
      ));
      return snap.docs.map(mapVenta);
    });
  },

  /**
   * Registra una venta de forma atómica: asigna número correlativo, valida y
   * descuenta stock, escribe la venta y los movimientos de stock.
   */
  async crearVenta(input: NuevaVentaInput): Promise<Result<{ id: string; numero: number }>> {
    const ventaItems = input.items.filter((i) => i.cantidad > 0);
    if (ventaItems.length === 0) return fail('validacion', 'Agregá al menos un producto.');
    if (!ventaItems.some((i) => i.tipo === 'venta'))
      return fail('validacion', 'Tiene que haber al menos un producto vendido (no todo bonificación).');

    try {
      const result = await runTransaction(db, async (tx) => {
        // 1) Lecturas: contador + productos
        const counterRef = doc(db, 'counters', 'ventas');
        const counterSnap = await tx.get(counterRef);
        const ultimo = counterSnap.exists() ? ((counterSnap.data().ultimo as number) ?? 0) : 0;
        const numero = ultimo + 1;

        const productRefs = ventaItems.map((i) => doc(db, 'products', i.productId));
        const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)));

        // Validar stock
        for (let k = 0; k < ventaItems.length; k++) {
          const snap = productSnaps[k];
          if (!snap.exists()) throw new Error(`El producto ${ventaItems[k].nombre} ya no existe.`);
          const stock = (snap.data()?.stock as number) ?? 0;
          if (ventaItems[k].cantidad > stock)
            throw new Error(`Stock insuficiente de ${ventaItems[k].nombre} (hay ${stock}).`);
        }

        // 2) Cálculos por moneda (sin conversión)
        let totalUsd = 0, totalArs = 0, costoUsd = 0, costoArs = 0, costoBonifUsd = 0, costoBonifArs = 0;
        for (const i of ventaItems) {
          const costo = i.costoUnitario * i.cantidad;
          const ingreso = i.tipo === 'bonificacion' ? 0 : i.precioUnitario * i.cantidad;
          if (i.moneda === 'USD') {
            totalUsd += ingreso;
            costoUsd += costo;
            if (i.tipo === 'bonificacion') costoBonifUsd += costo;
          } else {
            totalArs += ingreso;
            costoArs += costo;
            if (i.tipo === 'bonificacion') costoBonifArs += costo;
          }
        }

        const descuentoArs = calcDescuento(baseDescuentoEfectivo(ventaItems), input.descuentoPorcentaje ?? 0);
        totalArs -= descuentoArs;

        // 3) Escrituras
        const ventaRef = doc(col);
        tx.set(ventaRef, {
          numero,
          negocio: negocioDeItems(ventaItems),
          items: ventaItems,
          totalUsd,
          totalArs,
          ...(descuentoArs > 0
            ? { descuento: { porcentaje: input.descuentoPorcentaje, montoArs: descuentoArs } }
            : {}),
          costoUsd,
          costoArs,
          costoBonifUsd,
          costoBonifArs,
          envio: input.envio,
          pago: input.pago,
          canal: input.canal,
          cliente: input.cliente ?? {},
          pedidoId: input.pedidoId ?? null,
          estado: 'confirmada',
          facturacion: { estado: 'sin_facturar', tipo: 'C' },
          vendedorId: auth.currentUser?.email ?? auth.currentUser?.uid ?? '',
          creado: serverTimestamp(),
        });

        const contactoId = input.cliente?.celular?.replace(/\D/g, '');
        if (contactoId) {
          tx.set(doc(db, 'clientes', contactoId), {
            celular: contactoId,
            ...(input.cliente?.nombre ? {
              nombreOriginal: input.cliente.nombre,
              nombre: input.cliente.nombre,
              nombreBusqueda: input.cliente.nombre.trim().toLocaleLowerCase(),
            } : {}),
            ...(input.cliente?.cuitDni ? { cuitDni: input.cliente.cuitDni } : {}),
            cantidadVentas: increment(1),
            ultimoContacto: serverTimestamp(),
            eliminado: false,
            actualizadoEn: serverTimestamp(),
          }, { merge: true });
        }

        tx.set(counterRef, { ultimo: numero }, { merge: true });

        for (let k = 0; k < ventaItems.length; k++) {
          const snap = productSnaps[k];
          const stock = (snap.data()?.stock as number) ?? 0;
          tx.update(productRefs[k], { stock: stock - ventaItems[k].cantidad });
          tx.set(doc(collection(db, 'movimientosStock')), {
            productId: ventaItems[k].productId,
            tipo: 'venta',
            cantidad: ventaItems[k].cantidad,
            motivo: `Venta #${numero}`,
            usuario: auth.currentUser?.email ?? '',
            fecha: serverTimestamp(),
          });
        }

        return { id: ventaRef.id, numero };
      });
      return ok(result);
    } catch (error) {
      console.error('[saleService.crearVenta]', error);
      const msg = error instanceof Error ? error.message : 'No se pudo registrar la venta.';
      return fail('venta', msg, error);
    }
  },

  /** Anula una venta y reintegra el stock (atómico). */
  async anular(ventaId: string): Promise<Result<void>> {
    try {
      await runTransaction(db, async (tx) => {
        const ventaRef = doc(db, 'ventas', ventaId);
        const ventaSnap = await tx.get(ventaRef);
        if (!ventaSnap.exists()) throw new Error('La venta no existe.');
        const venta = ventaSnap.data() as Venta;
        if (venta.estado === 'anulada') throw new Error('La venta ya está anulada.');

        const refs = venta.items.map((i) => doc(db, 'products', i.productId));
        const snaps = await Promise.all(refs.map((r) => tx.get(r)));

        tx.update(ventaRef, { estado: 'anulada' });
        venta.items.forEach((it, k) => {
          if (snaps[k].exists()) {
            const stock = (snaps[k].data().stock as number) ?? 0;
            tx.update(refs[k], { stock: stock + it.cantidad });
            tx.set(doc(collection(db, 'movimientosStock')), {
              productId: it.productId,
              tipo: 'anulacion',
              cantidad: it.cantidad,
              motivo: `Anulación venta #${venta.numero}`,
              usuario: auth.currentUser?.email ?? '',
              fecha: serverTimestamp(),
            });
          }
        });
      });
      return ok(undefined);
    } catch (error) {
      console.error('[saleService.anular]', error);
      const msg = error instanceof Error ? error.message : 'No se pudo anular la venta.';
      return fail('anular', msg, error);
    }
  },

  async get(id: string): Promise<Result<Venta | null>> {
    return run(async () => {
      const snap = await getDoc(doc(db, 'ventas', id));
      return snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<Venta, 'id'>) }) : null;
    });
  },

  async getByNumero(numero: number): Promise<Result<Venta | null>> {
    return run(async () => {
      const snapshot = await getDocs(query(col, where('numero', '==', numero), limit(1)));
      const item = snapshot.docs[0];
      return item ? mapVenta(item) : null;
    });
  },

  /** Registra manualmente los datos de la Factura C emitida en ARCA. */
  registrarFactura(ventaId: string, nroFacturaC: string, cae: string): Promise<Result<void>> {
    return run(async () => {
      await updateDoc(doc(db, 'ventas', ventaId), {
        facturacion: { estado: 'facturada', tipo: 'C', nroFacturaC, cae },
      });
    });
  },
};
