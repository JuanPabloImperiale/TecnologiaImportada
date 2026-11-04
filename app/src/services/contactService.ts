import {
  collection,
  doc,
  documentId,
  endAt,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  startAt,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { nombreContactoBusqueda, normalizarCelular } from '@/lib/contactos';
import { run, type Result } from './result';

const clientesCol = collection(db, 'clientes');
const migracionRef = doc(db, 'clientesMeta', 'proyeccion-v1');

export interface Contacto {
  id: string;
  celular: string;
  nombre: string;
  nombreOriginal?: string;
  cuitDni?: string;
  ultimoContacto?: unknown;
  cantidadPedidos: number;
  cantidadVentas: number;
  cantidadCuentas: number;
  eliminado?: boolean;
  actualizadoEn?: unknown;
}

export interface ContactoPage {
  contactos: Contacto[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

function toContacto(snapshot: QueryDocumentSnapshot<DocumentData> | { id: string; data: () => DocumentData }): Contacto {
  const data = snapshot.data() as Omit<Contacto, 'id'>;
  return {
    id: snapshot.id,
    celular: String(data.celular ?? snapshot.id),
    nombre: String(data.nombre ?? data.nombreOriginal ?? ''),
    nombreOriginal: data.nombreOriginal,
    cuitDni: data.cuitDni,
    ultimoContacto: data.ultimoContacto,
    cantidadPedidos: Number(data.cantidadPedidos ?? 0),
    cantidadVentas: Number(data.cantidadVentas ?? 0),
    cantidadCuentas: Number(data.cantidadCuentas ?? 0),
    eliminado: data.eliminado === true,
    actualizadoEn: data.actualizadoEn,
  };
}

export const contactService = {
  async get(id: string): Promise<Result<Contacto | null>> {
    return run(async () => {
      const key = normalizarCelular(id);
      if (!key) return null;
      const snapshot = await getDoc(doc(clientesCol, key));
      return snapshot.exists() ? toContacto(snapshot) : null;
    });
  },

  async search(term: string, pageSize = 20): Promise<Result<Contacto[]>> {
    return run(async () => {
      const value = term.trim();
      if (!value) return [];
      const size = Math.max(1, Math.min(pageSize, 50));
      const digits = normalizarCelular(value);
      if (digits === value.replace(/\D/g, '') && digits.length > 0) {
        const snapshot = await getDoc(doc(clientesCol, digits));
        return snapshot.exists() && snapshot.data().eliminado !== true ? [toContacto(snapshot)] : [];
      }

      const prefix = nombreContactoBusqueda(value);
      const snapshot = await getDocs(query(
        clientesCol,
        orderBy('nombreBusqueda'),
        startAt(prefix),
        endAt(`${prefix}\uf8ff`),
        limit(size),
      ));
      return snapshot.docs.map(toContacto).filter((contacto) => !contacto.eliminado);
    });
  },

  async getMany(ids: string[]): Promise<Result<Map<string, Contacto>>> {
    return run(async () => {
      const keys = [...new Set(ids.map(normalizarCelular).filter(Boolean))];
      const map = new Map<string, Contacto>();
      if (keys.length === 0) return map;
      const snapshot = await getDocs(query(clientesCol, where(documentId(), 'in', keys.slice(0, 30))));
      snapshot.docs.forEach((item) => map.set(item.id, toContacto(item)));
      return map;
    });
  },

  async getPage(pageSize = 30, cursor?: QueryDocumentSnapshot<DocumentData> | null): Promise<Result<ContactoPage>> {
    return run(async () => {
      const size = Math.max(1, Math.min(pageSize, 100));
      const constraints = cursor
        ? [orderBy('ultimoContacto', 'desc'), startAfter(cursor), limit(size)]
        : [orderBy('ultimoContacto', 'desc'), limit(size)];
      const snapshot = await getDocs(query(clientesCol, ...constraints));
      const contactos = snapshot.docs
        .map(toContacto)
        .filter((contacto) => !contacto.eliminado);
      return {
        contactos,
        cursor: snapshot.docs[snapshot.docs.length - 1] ?? null,
        hasMore: snapshot.docs.length === size,
      };
    });
  },

  async save(celular: string, data: Partial<Pick<Contacto, 'nombre' | 'nombreOriginal' | 'cuitDni' | 'eliminado'>>): Promise<Result<void>> {
    return run(async () => {
      const key = normalizarCelular(celular);
      if (!key) throw new Error('Celular inválido');
      const patch: Record<string, unknown> = {
        celular: key,
        actualizadoEn: serverTimestamp(),
      };
      if (data.nombre !== undefined) {
        patch.nombre = data.nombre.trim();
        patch.nombreBusqueda = nombreContactoBusqueda(data.nombre);
      }
      if (data.nombreOriginal !== undefined) patch.nombreOriginal = data.nombreOriginal.trim();
      if (data.cuitDni !== undefined) patch.cuitDni = data.cuitDni.trim();
      if (data.eliminado !== undefined) patch.eliminado = data.eliminado;
      await setDoc(doc(clientesCol, key), patch, { merge: true });
    });
  },

  async migrarDesdeHistorial(): Promise<Result<void>> {
    return run(async () => {
      const marker = await getDoc(migracionRef);
      if (marker.exists() && marker.data().estado === 'completa') return;

      const [pedidos, ventas, cuentas] = await Promise.all([
        getDocs(collection(db, 'pedidos')),
        getDocs(collection(db, 'ventas')),
        getDocs(collection(db, 'cuentasCobrar')),
      ]);
      const contactos = new Map<string, Record<string, unknown>>();
      const agregar = (celular: unknown, nombre: unknown, tipo: 'pedido' | 'venta' | 'cuenta', cuitDni?: unknown) => {
        const key = normalizarCelular(String(celular ?? ''));
        if (!key) return;
        
        // SECURITY: Limitar longitud de campos a 255 caracteres
        const nombreStr = String(nombre ?? '').trim().slice(0, 255);
        const cuitDniStr = String(cuitDni ?? '').trim().slice(0, 255);
        
        const actual = contactos.get(key) ?? {
          celular: key,
          nombre: nombreStr,
          nombreOriginal: nombreStr,
          cantidadPedidos: 0,
          cantidadVentas: 0,
          cantidadCuentas: 0,
        };
        if (!actual.nombre && nombre) actual.nombre = nombreStr;
        if (cuitDniStr && !actual.cuitDni) actual.cuitDni = cuitDniStr;
        actual[`cantidad${tipo[0].toUpperCase()}${tipo.slice(1)}s`] = Number(actual[`cantidad${tipo[0].toUpperCase()}${tipo.slice(1)}s`] ?? 0) + 1;
        actual.ultimoContacto = (actual.ultimoContacto as { seconds?: number } | undefined)?.seconds
          ? actual.ultimoContacto
          : serverTimestamp();
        contactos.set(key, actual);
      };

      pedidos.docs.forEach((item) => {
        const data = item.data();
        agregar(data.contactoId ?? data.celular, data.nombre, 'pedido');
      });
      ventas.docs.forEach((item) => {
        const cliente = item.data().cliente as Record<string, unknown> | undefined;
        agregar(cliente?.celular, cliente?.nombre, 'venta', cliente?.cuitDni);
      });
      cuentas.docs.forEach((item) => {
        const cliente = item.data().cliente as Record<string, unknown> | undefined;
        agregar(cliente?.celular, cliente?.nombre, 'cuenta', cliente?.cuitDni);
      });
      let batch = writeBatch(db);
      let writes = 0;
      for (const [key, data] of contactos) {
        batch.set(doc(clientesCol, key), {
          ...data,
          nombreBusqueda: nombreContactoBusqueda(String(data.nombre ?? '')),
          actualizadoEn: serverTimestamp(),
        }, { merge: true });
        writes += 1;
        if (writes === 400) {
          await batch.commit();
          batch = writeBatch(db);
          writes = 0;
        }
      }
      if (writes > 0) await batch.commit();
      await setDoc(migracionRef, { estado: 'completa', actualizadoEn: serverTimestamp() }, { merge: true });
    });
  },
};