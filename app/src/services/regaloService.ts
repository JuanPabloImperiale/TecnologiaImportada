import {
  collection,
  deleteField,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { monthDateRange } from '@/lib/utils';
import { fail, ok, type Result } from './result';
import { syncLowStockIndex } from './lowStockService';
import { invalidateProductSearchCache } from './productService';
import type { Regalo, RegaloItem } from '@/models';

const col = collection(db, 'regalos');

export type RegaloCursor = QueryDocumentSnapshot<DocumentData>;

export interface RegaloPage {
  regalos: Regalo[];
  cursor: RegaloCursor | null;
  hasMore: boolean;
}

export interface NuevoRegaloItemInput {
  productId: string;
  cantidad: number;
}

export interface NuevoRegaloInput {
  items: NuevoRegaloItemInput[];
  ventaId?: string;
  ventaNumero?: number;
}

function mapRegalo(snapshot: QueryDocumentSnapshot<DocumentData>): Regalo {
  return { id: snapshot.id, ...(snapshot.data() as Omit<Regalo, 'id'>) };
}

export const regaloService = {
  subscribeMonth(
    ym: string,
    onData: (items: Regalo[]) => void,
    onError: (message: string) => void,
  ): () => void {
    const { start, end } = monthDateRange(ym);
    return onSnapshot(
      query(
        col,
        where('creado', '>=', Timestamp.fromDate(start)),
        where('creado', '<', Timestamp.fromDate(end)),
        orderBy('creado', 'desc'),
      ),
      (snapshot) => onData(snapshot.docs.map(mapRegalo)),
      () => onError('No se pudieron cargar los regalos del mes.'),
    );
  },

  async registrar(input: NuevoRegaloInput): Promise<Result<{ id: string }>> {
    if (input.items.length === 0) return fail('validacion', 'Agregá al menos un accesorio.');
    if (new Set(input.items.map((item) => item.productId)).size !== input.items.length) {
      return fail('validacion', 'Cada accesorio debe aparecer una sola vez.');
    }
    if (input.items.some((item) => !Number.isInteger(item.cantidad) || item.cantidad <= 0)) {
      return fail('validacion', 'Las cantidades deben ser números enteros mayores que cero.');
    }

    try {
      const regaloRef = doc(col);
      await runTransaction(db, async (transaction) => {
        const productRefs = input.items.map((item) => doc(db, 'products', item.productId));
        const [products, ventaSnapshot] = await Promise.all([
          Promise.all(productRefs.map((ref) => transaction.get(ref))),
          input.ventaId ? transaction.get(doc(db, 'ventas', input.ventaId)) : Promise.resolve(null),
        ]);
        if (input.ventaId) {
          if (!ventaSnapshot?.exists()) throw new Error('La venta asociada no existe.');
          if (input.ventaNumero !== undefined && ventaSnapshot.data().numero !== input.ventaNumero) {
            throw new Error('El número de venta no coincide con la venta asociada.');
          }
        }
        const items: RegaloItem[] = input.items.map((item, index) => {
          const product = products[index];
          if (!product.exists()) throw new Error('Uno de los accesorios ya no existe.');
          const data = product.data();
          if (data.negocio !== 'accesorios') throw new Error('Los regalos solo admiten productos de la unidad Accesorios.');
          if (data.activo === false) throw new Error(`El accesorio ${String(data.nombre ?? '')} está inactivo.`);
          const stock = Number(data.stock ?? 0);
          if (item.cantidad > stock) throw new Error(`Stock insuficiente de ${String(data.nombre ?? '')} (hay ${stock}).`);
          return {
            productId: item.productId,
            nombre: String(data.nombre ?? ''),
            negocio: 'accesorios',
            moneda: data.monedaVenta === 'USD' ? 'USD' : 'ARS',
            cantidad: item.cantidad,
            costoUnitario: Number(data.costo) || 0,
          };
        });

        transaction.set(regaloRef, {
          items,
          ...(input.ventaId ? { ventaId: input.ventaId } : {}),
          ...(input.ventaNumero !== undefined ? { ventaNumero: input.ventaNumero } : {}),
          creado: serverTimestamp(),
          registradoPor: auth.currentUser?.email ?? auth.currentUser?.uid ?? '',
        });

        products.forEach((product, index) => {
          const item = items[index];
          const stock = Number(product.data()?.stock ?? 0) - item.cantidad;
          transaction.update(productRefs[index], { stock });
          syncLowStockIndex(transaction, item.productId, product.data() ?? null, { ...product.data(), stock });
          transaction.set(doc(collection(db, 'movimientosStock')), {
            productId: item.productId,
            tipo: 'regalo',
            cantidad: item.cantidad,
            motivo: input.ventaNumero ? `Regalo asociado a venta #${input.ventaNumero}` : 'Regalo',
            usuario: auth.currentUser?.email ?? '',
            fecha: serverTimestamp(),
          });
        });
      });
      invalidateProductSearchCache();
      return ok({ id: regaloRef.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo registrar el regalo.';
      return fail('regalo', message, error);
    }
  },

  async actualizar(id: string, input: NuevoRegaloInput): Promise<Result<void>> {
    if (input.items.length === 0) return fail('validacion', 'Agregá al menos un accesorio.');
    if (new Set(input.items.map((item) => item.productId)).size !== input.items.length) {
      return fail('validacion', 'Cada accesorio debe aparecer una sola vez.');
    }
    if (input.items.some((item) => !Number.isInteger(item.cantidad) || item.cantidad <= 0)) {
      return fail('validacion', 'Las cantidades deben ser números enteros mayores que cero.');
    }

    try {
      await runTransaction(db, async (transaction) => {
        const regaloRef = doc(col, id);
        const regaloSnapshot = await transaction.get(regaloRef);
        if (!regaloSnapshot.exists()) throw new Error('El regalo no existe.');
        const anterior = regaloSnapshot.data() as Omit<Regalo, 'id'>;
        const productIds = new Set([
          ...anterior.items.map((item) => item.productId),
          ...input.items.map((item) => item.productId),
        ]);
        const productRefs = [...productIds].map((productId) => doc(db, 'products', productId));
        const [products, ventaSnapshot] = await Promise.all([
          Promise.all(productRefs.map((ref) => transaction.get(ref))),
          input.ventaId ? transaction.get(doc(db, 'ventas', input.ventaId)) : Promise.resolve(null),
        ]);
        if (input.ventaId) {
          if (!ventaSnapshot?.exists()) throw new Error('La venta asociada no existe.');
          if (input.ventaNumero !== undefined && ventaSnapshot.data().numero !== input.ventaNumero) {
            throw new Error('El número de venta no coincide con la venta asociada.');
          }
        }

        const snapshots = new Map(productRefs.map((ref, index) => [ref.id, products[index]]));
        const anteriores = new Map(anterior.items.map((item) => [item.productId, item.cantidad]));
        const items: RegaloItem[] = input.items.map((item) => {
          const product = snapshots.get(item.productId);
          if (!product?.exists()) throw new Error('Uno de los accesorios ya no existe.');
          const data = product.data();
          if (data.negocio !== 'accesorios') throw new Error('Los regalos solo admiten productos de la unidad Accesorios.');
          if (data.activo === false) throw new Error(`El accesorio ${String(data.nombre ?? '')} está inactivo.`);
          const stockDisponible = Number(data.stock ?? 0) + (anteriores.get(item.productId) ?? 0);
          if (item.cantidad > stockDisponible) throw new Error(`Stock insuficiente de ${String(data.nombre ?? '')} (hay ${stockDisponible}).`);
          return {
            productId: item.productId,
            nombre: String(data.nombre ?? ''),
            negocio: 'accesorios',
            moneda: data.monedaVenta === 'USD' ? 'USD' : 'ARS',
            cantidad: item.cantidad,
            costoUnitario: Number(data.costo) || 0,
          };
        });

        for (const productId of productIds) {
          const product = snapshots.get(productId);
          if (!product?.exists()) throw new Error('Uno de los accesorios anteriores ya no existe.');
          const oldQuantity = anteriores.get(productId) ?? 0;
          const newQuantity = input.items.find((item) => item.productId === productId)?.cantidad ?? 0;
          const stock = Number(product.data().stock ?? 0) + oldQuantity - newQuantity;
          transaction.update(doc(db, 'products', productId), { stock });
          syncLowStockIndex(transaction, productId, product.data(), { ...product.data(), stock });
          if (oldQuantity !== newQuantity) {
            transaction.set(doc(collection(db, 'movimientosStock')), {
              productId,
              tipo: 'ajuste',
              cantidad: Math.abs(newQuantity - oldQuantity),
              motivo: `Edición de regalo${input.ventaNumero ? ` asociado a venta #${input.ventaNumero}` : ''}`,
              usuario: auth.currentUser?.email ?? '',
              fecha: serverTimestamp(),
            });
          }
        }

        transaction.update(regaloRef, {
          items,
          ...(input.ventaId ? { ventaId: input.ventaId } : { ventaId: deleteField() }),
          ...(input.ventaNumero !== undefined ? { ventaNumero: input.ventaNumero } : { ventaNumero: deleteField() }),
          actualizadoEn: serverTimestamp(),
        });
      });
      invalidateProductSearchCache();
      return ok(undefined);
    } catch (error) {
      return fail('regalo', error instanceof Error ? error.message : 'No se pudo editar el regalo.', error);
    }
  },

  async getPage(pageSize: number, ym: string, cursor?: RegaloCursor | null): Promise<Result<RegaloPage>> {
    try {
      const size = Math.max(1, Math.min(pageSize, 100));
      const { start, end } = monthDateRange(ym);
      const constraints = cursor
        ? [
            where('creado', '>=', Timestamp.fromDate(start)),
            where('creado', '<', Timestamp.fromDate(end)),
            orderBy('creado', 'desc'),
            startAfter(cursor),
            limit(size),
          ]
        : [
            where('creado', '>=', Timestamp.fromDate(start)),
            where('creado', '<', Timestamp.fromDate(end)),
            orderBy('creado', 'desc'),
            limit(size),
          ];
      const snapshot = await getDocs(query(col, ...constraints));
      return ok({
        regalos: snapshot.docs.map(mapRegalo),
        cursor: snapshot.docs[snapshot.docs.length - 1] ?? null,
        hasMore: snapshot.docs.length === size,
      });
    } catch (error) {
      return fail('regalos', error instanceof Error ? error.message : 'No se pudieron cargar los regalos.', error);
    }
  },

  async getByVenta(ventaId: string): Promise<Result<Regalo[]>> {
    try {
      const snapshot = await getDocs(query(col, where('ventaId', '==', ventaId), orderBy('creado', 'desc')));
      return ok(snapshot.docs.map(mapRegalo));
    } catch (error) {
      return fail('regalos', error instanceof Error ? error.message : 'No se pudieron cargar los regalos de la venta.', error);
    }
  },
};