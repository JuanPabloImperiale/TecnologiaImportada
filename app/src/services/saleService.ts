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
  type QuerySnapshot,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { baseDescuentoEfectivo, calcDescuento, monthDateRange } from '@/lib/utils';
import { run, ok, fail, type Result } from './result';
import { createQueryCache } from './queryCache';
import { invalidateProductSearchCache } from './productService';
import { syncLowStockIndex } from './lowStockService';
import type { Venta, ItemVenta, Negocio, CanalVenta, Envio, PagoVenta } from '@/models';

const col = collection(db, 'ventas');
const historyCache = createQueryCache<Venta[]>();

export function invalidateSaleHistoryCache() {
  historyCache.clear();
}

export type VentaCursor = QueryDocumentSnapshot<DocumentData>;

export interface VentaPage {
  ventas: Venta[];
  cursor: VentaCursor | null;
  hasMore: boolean;
}

function mapVenta(snapshot: QueryDocumentSnapshot<DocumentData>): Venta {
  return { id: snapshot.id, ...(snapshot.data() as Omit<Venta, 'id'>) };
}

function orderedVentas(snapshot: QuerySnapshot<DocumentData>): Venta[] {
  return snapshot.docs.map(mapVenta).sort((first, second) =>
    (second.creado?.seconds ?? 0) - (first.creado?.seconds ?? 0) ||
    (second.creado?.nanoseconds ?? 0) - (first.creado?.nanoseconds ?? 0) ||
    (first.id < second.id ? 1 : first.id > second.id ? -1 : 0),
  );
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

  async getAll(forceRefresh = false): Promise<Result<Venta[]>> {
    if (forceRefresh) historyCache.clear();
    return historyCache.get(auth.currentUser?.uid ?? '', () => run(async () => {
      const snapshot = await getDocs(query(col, orderBy('creado', 'desc')));
      return snapshot.docs.map(mapVenta);
    }));
  },

  async getByProduct(productId: string, forceRefresh = false): Promise<Result<Venta[]>> {
    if (!productId.trim()) return fail('validacion', 'Seleccioná un producto.');
    if (forceRefresh) historyCache.clear();
    const key = JSON.stringify([auth.currentUser?.uid ?? '', 'product', productId]);
    return historyCache.get(key, () => run(async () => {
      let snapshot: QuerySnapshot<DocumentData>;
      try {
        snapshot = await getDocs(query(col, where('productIds', 'array-contains', productId), orderBy('creado', 'desc')));
      } catch (error) {
        if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'failed-precondition') throw error;
        snapshot = await getDocs(query(col, where('productIds', 'array-contains', productId)));
      }
      return orderedVentas(snapshot);
    }));
  },

  async getByAmount(amount: number, currency: 'ARS' | 'USD', forceRefresh = false): Promise<Result<Venta[]>> {
    const cents = Math.round(amount * 100);
    if (!Number.isSafeInteger(cents) || amount < 0 || !['ARS', 'USD'].includes(currency)) return fail('validacion', 'Ingresá un monto cobrado válido.');
    if (forceRefresh) historyCache.clear();
    const key = JSON.stringify([auth.currentUser?.uid ?? '', 'amount', currency, cents]);
    return historyCache.get(key, () => run(async () => {
      const field = currency === 'USD' ? 'pago.usd' : 'pago.ars';
      const snapshot = await getDocs(query(col,
        where(field, '>=', (cents - 0.5) / 100),
        where(field, '<', (cents + 0.5) / 100),
      ));
      return orderedVentas(snapshot).filter((venta) => Math.round((currency === 'USD' ? venta.pago?.usd : venta.pago?.ars) * 100) === cents);
    }));
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
          productIds: [...new Set(ventaItems.map((item) => item.productId))],
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
          const nuevoStock = stock - ventaItems[k].cantidad;
          tx.update(productRefs[k], { stock: nuevoStock });
          syncLowStockIndex(tx, ventaItems[k].productId, snap.data() ?? null, { ...snap.data(), stock: nuevoStock });
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
      historyCache.clear();
      invalidateProductSearchCache();
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
            const nuevoStock = stock + it.cantidad;
            tx.update(refs[k], { stock: nuevoStock });
            syncLowStockIndex(tx, it.productId, snaps[k].data(), { ...snaps[k].data(), stock: nuevoStock });
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
      historyCache.clear();
      invalidateProductSearchCache();
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
      historyCache.clear();
    });
  },
};
