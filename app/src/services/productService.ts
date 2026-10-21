import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { run, type Result } from './result';
import { registrarMovimiento } from './movimientosService';
import { slugify } from '@/lib/utils';
import { createSharedSubscription } from '@/lib/sharedSubscription';
import type { Producto, Negocio } from '@/models';
import type { ProductoForm } from '@/schemas';

// El producto vive en una sola moneda (monedaVenta); costo y precio NO se convierten.
export type ProductoInput = ProductoForm & { imagenes: string[] };
export type ProductoCursor = QueryDocumentSnapshot<DocumentData>;

export interface ProductoPage {
  products: Producto[];
  cursor: ProductoCursor | null;
  hasMore: boolean;
}

export interface ProductoSearchFilters {
  negocio?: Negocio;
  soloActivos?: boolean;
}

const col = collection(db, 'products');
export const PUBLIC_PRODUCTS_CACHE_KEY = 'ti_public_products_cache_v1';

/** Quita claves con valor undefined (Firestore no las acepta). */
function clean<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function mapProducto(snapshot: QueryDocumentSnapshot<DocumentData>): Producto {
  return { id: snapshot.id, ...(snapshot.data() as Omit<Producto, 'id'>) };
}

const activeProductsSubscription = createSharedSubscription<Producto[]>((onData, onError) =>
  onSnapshot(
    query(col, where('activo', '==', true)),
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Producto, 'id'>) }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
      try {
        localStorage.setItem(PUBLIC_PRODUCTS_CACHE_KEY, JSON.stringify(items));
      } catch {
        // no-op: si storage está lleno o bloqueado, seguimos sin cache.
      }
      onData(items);
    },
    (err) => {
      console.error('[productService]', err);
      onError('No se pudieron cargar los productos.');
    },
  ),
);

async function getProductPage(
  filters: QueryConstraint[],
  pageSize: number,
  cursor?: ProductoCursor | null,
): Promise<ProductoPage> {
  const constraints: QueryConstraint[] = [...filters, orderBy('nombre')];
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(Math.max(1, Math.min(pageSize, 100))));
  const snapshot = await getDocs(query(col, ...constraints));
  return {
    products: snapshot.docs.map(mapProducto),
    cursor: snapshot.docs[snapshot.docs.length - 1] ?? null,
    hasMore: snapshot.docs.length === Math.max(1, Math.min(pageSize, 100)),
  };
}

export const productService = {
  /** Suscripción en vivo a los productos de una unidad. Devuelve unsubscribe. */
  subscribe(
    negocio: Negocio,
    onData: (items: Producto[]) => void,
    onError: (msg: string) => void,
  ): () => void {
    const q = query(col, where('negocio', '==', negocio));
    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Producto, 'id'>) }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre));
        onData(items);
      },
      (err) => {
        console.error('[productService]', err);
        onError('No se pudieron cargar los productos.');
      },
    );
  },

  async get(id: string): Promise<Result<Producto | null>> {
    return run(async () => {
      const snap = await getDoc(doc(db, 'products', id));
      return snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<Producto, 'id'>) }) : null;
    });
  },

  /** Suscripción pública: solo productos activos (de ambas unidades). */
  subscribeActive(onData: (items: Producto[]) => void, onError: (msg: string) => void): () => void {
    return activeProductsSubscription.subscribe(onData, (error) => onError(String(error)));
  },

  subscribeFeatured(onData: (items: Producto[]) => void, onError: (msg: string) => void): () => void {
    const q = query(col, where('destacado', '==', true));
    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Producto, 'id'>) }))
          .filter((product) => product.activo)
          .sort((a, b) => a.nombre.localeCompare(b.nombre));
        onData(items);
      },
      (err) => {
        console.error('[productService.subscribeFeatured]', err);
        onError('No se pudieron cargar los productos destacados.');
      },
    );
  },

  /** Lee productos públicos desde cache local (si existe). */
  getCachedActive(): Producto[] {
    try {
      const raw = localStorage.getItem(PUBLIC_PRODUCTS_CACHE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Producto[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  create(data: ProductoInput): Promise<Result<string>> {
    return run(async () => {
      const payload = clean({
        ...data,
        slug: slugify(data.nombre),
        creado: serverTimestamp(),
        actualizado: serverTimestamp(),
      });
      const docRef = await addDoc(col, payload);
      if (data.stock > 0) {
        await registrarMovimiento(docRef.id, 'ingreso', data.stock, 'Alta de producto');
      }
      return docRef.id;
    });
  },

  update(id: string, data: ProductoInput): Promise<Result<void>> {
    return run(async () => {
      const prev = await getDoc(doc(db, 'products', id));
      const stockAnterior = prev.exists() ? ((prev.data() as Producto).stock ?? 0) : 0;

      await updateDoc(
        doc(db, 'products', id),
        clean({ ...data, slug: slugify(data.nombre), actualizado: serverTimestamp() }),
      );

      const diff = data.stock - stockAnterior;
      if (diff !== 0) {
        await registrarMovimiento(id, 'ajuste', Math.abs(diff), `Ajuste manual (${diff > 0 ? '+' : ''}${diff})`);
      }
    });
  },

  /** Desactiva/activa (visibilidad en la tienda) sin borrar el documento. */
  setActivo(id: string, activo: boolean): Promise<Result<void>> {
    return run(async () => {
      await updateDoc(doc(db, 'products', id), { activo, actualizado: serverTimestamp() });
    });
  },

  /**
   * Borra el producto definitivamente. Las ventas guardan snapshot propio, así
   * que el historial no se rompe. Devuelve las URLs de imágenes que quedaron
   * (para intentar limpiarlas en Cloudinary).
   */
  remove(id: string): Promise<Result<string[]>> {
    return run(async () => {
      const snap = await getDoc(doc(db, 'products', id));
      const imagenes = snap.exists() ? ((snap.data() as Producto).imagenes ?? []) : [];
      await deleteDoc(doc(db, 'products', id));
      return imagenes;
    });
  },
  getActivePage(pageSize = 16, cursor?: ProductoCursor | null): Promise<Result<ProductoPage>> {
    return run(() => getProductPage([where('activo', '==', true)], pageSize, cursor));
  },

  getInventoryPage(negocio: Negocio, pageSize = 30, cursor?: ProductoCursor | null): Promise<Result<ProductoPage>> {
    return run(() => getProductPage([where('negocio', '==', negocio)], pageSize, cursor));
  },

  /** Carga el universo de búsqueda acotado a la unidad y estado solicitados. */
  searchAll(filters: ProductoSearchFilters = {}): Promise<Result<Producto[]>> {
    return run(async () => {
      const constraints: QueryConstraint[] = [];
      if (filters.negocio) constraints.push(where('negocio', '==', filters.negocio));
      if (filters.soloActivos) constraints.push(where('activo', '==', true));
      const snapshot = await getDocs(query(col, ...constraints));
      return snapshot.docs.map(mapProducto);
    });
  },

  getLowStockProducts(maxResults = 6, pageSize = 30): Promise<Result<Producto[]>> {
    return run(async () => {
      const objetivo = Math.max(1, Math.min(maxResults, 30));
      const productos: Producto[] = [];
      let cursor: ProductoCursor | null = null;
      let hasMore = true;
      while (hasMore && productos.length < objetivo) {
        const page = await getProductPage([where('activo', '==', true)], pageSize, cursor);
        productos.push(...page.products.filter((product) => product.stock <= product.stockMinimo).slice(0, objetivo - productos.length));
        cursor = page.cursor;
        hasMore = page.hasMore;
      }
      return productos;
    });
  },
};
