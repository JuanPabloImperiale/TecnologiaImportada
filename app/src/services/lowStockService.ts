import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, where, type DocumentData, type DocumentReference } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createSharedSubscription } from '@/lib/sharedSubscription';
import { isLowStock } from '@/lib/stock';
import { run } from './result';
import type { Negocio, Producto } from '@/models';

interface StockWriter {
  set(reference: DocumentReference, data: DocumentData): unknown;
  delete(reference: DocumentReference): unknown;
}

export { isLowStock };

export function syncLowStockIndex(writer: StockWriter, id: string, before: DocumentData | null, after: DocumentData | null) {
  const reference = doc(db, 'stockBajo', id);
  if (isLowStock(after)) {
    writer.set(reference, Object.fromEntries(Object.entries(after ?? {}).filter(([key, value]) => key !== 'id' && value !== undefined)));
  } else if (isLowStock(before)) {
    writer.delete(reference);
  }
}

const col = collection(db, 'stockBajo');
const subscriptions = new Map<Negocio, ReturnType<typeof createSharedSubscription<Producto[]>>>();

export const lowStockService = {
  subscribe(negocio: Negocio, onData: (products: Producto[]) => void, onError: (message: string) => void) {
    let shared = subscriptions.get(negocio);
    if (!shared) {
      shared = createSharedSubscription<Producto[]>((next, error) => onSnapshot(
        query(col, where('negocio', '==', negocio)),
        (snapshot) => next(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Producto))),
        () => error('No se pudo cargar el indice de stock bajo.'),
      ));
      subscriptions.set(negocio, shared);
    }
    return shared.subscribe(onData, (error) => onError(String(error)));
  },

  getTop(maxResults = 6) {
    return run(async () => {
      const snapshot = await getDocs(query(col, orderBy('nombre'), limit(Math.max(1, Math.min(maxResults, 30)))));
      return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Producto));
    });
  },

  getByNegocio(negocio: Negocio) {
    return run(async () => {
      const snapshot = await getDocs(query(col, where('negocio', '==', negocio)));
      return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Producto));
    });
  },
};