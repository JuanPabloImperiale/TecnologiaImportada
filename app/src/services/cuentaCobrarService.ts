import {
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { calcularSaldosCuenta, fechaCompletaCuenta, validarPagoCuenta } from '@/lib/cuentasCobrar';
import { MEDIOS_PAGO } from '@/lib/mediosPago';
import { settingsService } from '@/services/settingsService';
import { fail, ok, type Result } from './result';
import { invalidateSaleHistoryCache } from './saleService';
import { invalidateProductSearchCache } from './productService';
import { syncLowStockIndex } from './lowStockService';
import type {
  CuentaCobrar,
  ItemVenta,
  MedioPago,
  PagoRegistrado,
  Venta,
} from '@/models';

const col = collection(db, 'cuentasCobrar');

async function runCuenta<T>(operation: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await operation());
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : 'cuenta';
    const messages: Record<string, string> = {
      'permission-denied': 'No tenés permisos para esta acción.',
      unauthenticated: 'Necesitás iniciar sesión.',
      unavailable: 'Sin conexión con el servidor. Revisá tu internet.',
    };
    const message = messages[code] ?? (error instanceof Error ? error.message : 'No se pudo completar la operación.');
    return fail(code, message, error);
  }
}

export interface CuentaCobrarItemInput {
  productId: string;
  cantidad: number;
  precioUnitario: number;
}

export interface NuevaCuentaCobrarInput {
  items: CuentaCobrarItemInput[];
  cliente: { nombre: string; celular?: string; cuitDni?: string };
  canal: 'presencial' | 'whatsapp';
  envio: { metodo: 'retiro' | 'envio'; costo: number };
}

export interface PagoCuentaInput {
  fecha: Date;
  monto: number;
  moneda: 'USD' | 'ARS';
  medio: MedioPago;
}

function datosPago(pagos: PagoRegistrado[]) {
  const pagadoUsd = pagos.filter((pago) => pago.moneda === 'USD').reduce((suma, pago) => suma + pago.monto, 0);
  const pagadoArs = pagos.filter((pago) => pago.moneda === 'ARS').reduce((suma, pago) => suma + pago.monto, 0);
  const mediosArs = [...new Set(pagos.filter((pago) => pago.moneda === 'ARS').map((pago) => pago.medio))];
  return {
    usd: pagadoUsd,
    ars: pagadoArs,
    medioArs: mediosArs.length > 1 ? 'varios' : mediosArs[0] ?? 'efectivo',
  } as const;
}

export const cuentaCobrarService = {
  subscribe(onData: (items: CuentaCobrar[]) => void, onError: (message: string) => void): () => void {
    return onSnapshot(
      query(col, orderBy('creada', 'desc')),
      (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<CuentaCobrar, 'id'>) }))),
      () => onError('No se pudieron cargar las cuentas por cobrar.'),
    );
  },

  async get(id: string): Promise<CuentaCobrar | null> {
    const snapshot = await getDoc(doc(db, 'cuentasCobrar', id));
    return snapshot.exists() ? ({ id: snapshot.id, ...(snapshot.data() as Omit<CuentaCobrar, 'id'>) }) : null;
  },

  crear(input: NuevaCuentaCobrarInput) {
    return runCuenta(async () => {
      const itemsSinDuplicados = new Set(input.items.map((item) => item.productId));
      if (input.items.length === 0) throw new Error('Agregá al menos un producto.');
      if (itemsSinDuplicados.size !== input.items.length) throw new Error('Cada producto debe aparecer una sola vez.');
      if (!input.cliente.nombre.trim()) throw new Error('Ingresá el nombre del cliente.');
      if (input.items.some((item) =>
        !Number.isFinite(item.cantidad) || item.cantidad <= 0 ||
        !Number.isFinite(item.precioUnitario) || item.precioUnitario <= 0,
      )) {
        throw new Error('Revisá las cantidades y precios de los productos.');
      }
      if (!Number.isFinite(input.envio.costo) || input.envio.costo < 0) throw new Error('El costo de envío no es válido.');

      const counterRef = doc(db, 'counters', 'cuentasCobrar');
      const cuentaRef = doc(col);
      const productRefs = input.items.map((item) => doc(db, 'products', item.productId));
      const movementRefs = input.items.map(() => doc(collection(db, 'movimientosStock')));

      const result = await runTransaction(db, async (transaction) => {
        const counterSnapshot = await transaction.get(counterRef);
        const products = await Promise.all(productRefs.map((ref) => transaction.get(ref)));
        const numero = ((counterSnapshot.data()?.ultimo as number) ?? 0) + 1;
        const items: ItemVenta[] = input.items.map((item, index) => {
          const product = products[index];
          if (!product.exists()) throw new Error('Uno de los productos ya no existe.');
          const data = product.data();
          if (data.negocio !== 'productos' || data.activo === false) {
            throw new Error('Las cuentas por cobrar solo admiten productos activos de la unidad Productos.');
          }
          const stock = (data.stock as number) ?? 0;
          if (item.cantidad > stock) throw new Error(`Stock insuficiente de ${String(data.nombre)} (hay ${stock}).`);
          return {
            productId: item.productId,
            nombre: String(data.nombre ?? ''),
            negocio: 'productos',
            moneda: data.monedaVenta === 'USD' ? 'USD' : 'ARS',
            tipo: 'venta',
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
            costoUnitario: Number(data.costo) || 0,
          };
        });
        const saldoInicial = calcularSaldosCuenta(items, [], input.envio.costo);
        const totalProductosUsd = items.filter((item) => item.moneda === 'USD').reduce((total, item) => total + item.precioUnitario * item.cantidad, 0);
        const totalProductosArs = items.filter((item) => item.moneda === 'ARS').reduce((total, item) => total + item.precioUnitario * item.cantidad, 0);
        if ((saldoInicial.totalUsd <= 0 && saldoInicial.totalArs <= 0) || (totalProductosUsd <= 0 && totalProductosArs <= 0)) {
          throw new Error('El total de la cuenta debe ser mayor que cero.');
        }

        transaction.set(counterRef, { ultimo: numero }, { merge: true });
        transaction.set(cuentaRef, {
          numero,
          items,
          cliente: {
            nombre: input.cliente.nombre.trim(),
            celular: input.cliente.celular?.trim() ?? '',
            cuitDni: input.cliente.cuitDni?.trim() ?? '',
          },
          canal: input.canal,
          envio: input.envio,
          pagos: [],
          estado: 'pendiente',
          creada: serverTimestamp(),
          creadaPor: auth.currentUser?.email ?? auth.currentUser?.uid ?? '',
        });

        const contactoId = input.cliente.celular ? input.cliente.celular.replace(/\D/g, '') : '';
        if (contactoId) {
          transaction.set(doc(db, 'clientes', contactoId), {
            celular: contactoId,
            nombre: input.cliente.nombre.trim(),
            nombreOriginal: input.cliente.nombre.trim(),
            nombreBusqueda: input.cliente.nombre.trim().toLocaleLowerCase(),
            cuitDni: input.cliente.cuitDni?.trim() ?? '',
            cantidadCuentas: increment(1),
            ultimoContacto: serverTimestamp(),
            eliminado: false,
            actualizadoEn: serverTimestamp(),
          }, { merge: true });
        }

        products.forEach((product, index) => {
          const item = items[index];
          const stock = ((product.data()?.stock as number) ?? 0) - item.cantidad;
          transaction.update(productRefs[index], { stock });
          syncLowStockIndex(transaction, item.productId, product.data() ?? null, { ...product.data(), stock });
          transaction.set(movementRefs[index], {
            productId: item.productId,
            tipo: 'reserva',
            cantidad: item.cantidad,
            motivo: `Cuenta por cobrar #${numero}`,
            usuario: auth.currentUser?.email ?? '',
            fecha: serverTimestamp(),
          });
        });
        return { id: cuentaRef.id, numero };
      });
      invalidateProductSearchCache();
      return result;
    });
  },

  registrarPago(id: string, input: PagoCuentaInput) {
    return runCuenta(async () => {
      if (!MEDIOS_PAGO.some((medio) => medio.value === input.medio)) throw new Error('El medio de pago no está habilitado.');
      if (!Number.isFinite(input.fecha.getTime())) throw new Error('La fecha del pago no es válida.');
      if (input.moneda === 'USD' && input.medio !== 'efectivo') throw new Error('Los pagos en dólares deben registrarse en efectivo.');
      if (input.moneda === 'ARS') {
        const settings = await settingsService.get();
        if (!settings.mediosPago?.includes(input.medio)) throw new Error('Ese medio de pago no está habilitado en Configuración.');
      }

      return runTransaction(db, async (transaction) => {
        const ref = doc(db, 'cuentasCobrar', id);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error('La cuenta no existe.');
        const cuenta = { id: snapshot.id, ...(snapshot.data() as Omit<CuentaCobrar, 'id'>) };
        if (cuenta.estado !== 'pendiente') throw new Error('Esta cuenta ya no acepta pagos.');

        const saldos = calcularSaldosCuenta(cuenta.items, cuenta.pagos, cuenta.envio.costo);
        const errorPago = validarPagoCuenta(input.monto, input.moneda, saldos);
        if (errorPago) throw new Error(errorPago);
        const pago: PagoRegistrado = {
          fecha: Timestamp.fromDate(input.fecha),
          monto: input.monto,
          moneda: input.moneda,
          medio: input.medio,
          registradoPor: auth.currentUser?.email ?? auth.currentUser?.uid ?? '',
        };
        const pagos = [...cuenta.pagos, pago];
        const nuevoSaldo = calcularSaldosCuenta(cuenta.items, pagos, cuenta.envio.costo);
        const fechaCompleta = nuevoSaldo.completa
          ? fechaCompletaCuenta(cuenta.items, pagos, cuenta.envio.costo)
          : null;
        if (nuevoSaldo.completa && !fechaCompleta) throw new Error('No se pudo determinar la fecha del pago que completó la cuenta.');
        transaction.update(ref, {
          pagos,
          estado: nuevoSaldo.completa ? 'pagada' : 'pendiente',
          ...(fechaCompleta ? { fechaCompleta: Timestamp.fromDate(fechaCompleta) } : {}),
        });
        return nuevoSaldo;
      });
    });
  },

  convertirEnVenta(id: string) {
    return runCuenta(async () => {
      const counterRef = doc(db, 'counters', 'ventas');
      const ventaRef = doc(collection(db, 'ventas'));
      const result = await runTransaction(db, async (transaction) => {
        const ref = doc(db, 'cuentasCobrar', id);
        const [snapshot, counterSnapshot] = await Promise.all([transaction.get(ref), transaction.get(counterRef)]);
        if (!snapshot.exists()) throw new Error('La cuenta no existe.');
        const cuenta = { id: snapshot.id, ...(snapshot.data() as Omit<CuentaCobrar, 'id'>) };
        if (cuenta.estado === 'convertida' && cuenta.ventaId) return { id: cuenta.ventaId, numero: cuenta.numeroVenta ?? 0 };
        if (cuenta.estado !== 'pagada' || !cuenta.fechaCompleta) throw new Error('La cuenta debe estar pagada al 100% para registrarla como venta.');

        const numero = ((counterSnapshot.data()?.ultimo as number) ?? 0) + 1;
        const totalUsd = cuenta.items.filter((item) => item.moneda === 'USD').reduce((total, item) => total + item.precioUnitario * item.cantidad, 0);
        const totalArs = cuenta.items.filter((item) => item.moneda === 'ARS').reduce((total, item) => total + item.precioUnitario * item.cantidad, 0);
        const costoUsd = cuenta.items.filter((item) => item.moneda === 'USD').reduce((total, item) => total + item.costoUnitario * item.cantidad, 0);
        const costoArs = cuenta.items.filter((item) => item.moneda === 'ARS').reduce((total, item) => total + item.costoUnitario * item.cantidad, 0);
        const pago = datosPago(cuenta.pagos);
        const venta: Omit<Venta, 'id'> = {
          numero,
          negocio: 'productos',
          items: cuenta.items,
          productIds: [...new Set(cuenta.items.map((item) => item.productId))],
          totalUsd,
          totalArs,
          costoUsd,
          costoArs,
          costoBonifUsd: 0,
          costoBonifArs: 0,
          envio: cuenta.envio,
          pago: { ...pago, tipoCambio: 0 },
          pagosDetalle: cuenta.pagos,
          cuentaCobrarId: cuenta.id,
          canal: cuenta.canal,
          cliente: cuenta.cliente,
          estado: 'confirmada',
          facturacion: { estado: 'sin_facturar', tipo: 'C' },
          vendedorId: auth.currentUser?.email ?? auth.currentUser?.uid ?? '',
          creado: cuenta.fechaCompleta,
        };

        transaction.set(ventaRef, { ...venta, registradoEn: serverTimestamp() });
        const contactoId = cuenta.cliente.celular?.replace(/\D/g, '');
        if (contactoId) {
          transaction.set(doc(db, 'clientes', contactoId), {
            celular: contactoId,
            cantidadVentas: increment(1),
            ultimoContacto: cuenta.fechaCompleta,
            actualizadoEn: serverTimestamp(),
          }, { merge: true });
        }
        transaction.set(counterRef, { ultimo: numero }, { merge: true });
        transaction.update(ref, { estado: 'convertida', ventaId: ventaRef.id, numeroVenta: numero });
        return { id: ventaRef.id, numero };
      });
      invalidateSaleHistoryCache();
      return result;
    });
  },

  cancelar(id: string) {
    return runCuenta(async () => {
      await runTransaction(db, async (transaction) => {
        const ref = doc(db, 'cuentasCobrar', id);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error('La cuenta no existe.');
        const cuenta = { id: snapshot.id, ...(snapshot.data() as Omit<CuentaCobrar, 'id'>) };
        if (cuenta.estado === 'convertida' || cuenta.estado === 'cancelada') {
          throw new Error('Esta cuenta ya no se puede cancelar.');
        }

        const productRefs = cuenta.items.map((item) => doc(db, 'products', item.productId));
        const movementRefs = cuenta.items.map(() => doc(collection(db, 'movimientosStock')));
        const products = await Promise.all(productRefs.map((productRef) => transaction.get(productRef)));
        products.forEach((product, index) => {
          if (!product.exists()) return;
          const item = cuenta.items[index];
          const stock = ((product.data().stock as number) ?? 0) + item.cantidad;
          transaction.update(productRefs[index], { stock });
          syncLowStockIndex(transaction, item.productId, product.data(), { ...product.data(), stock });
          transaction.set(movementRefs[index], {
            productId: item.productId,
            tipo: 'liberacion',
            cantidad: item.cantidad,
            motivo: `Cancelación cuenta por cobrar #${cuenta.numero}`,
            usuario: auth.currentUser?.email ?? '',
            fecha: serverTimestamp(),
          });
        });
        transaction.update(ref, { estado: 'cancelada' });
      });
      invalidateProductSearchCache();
    });
  },
};