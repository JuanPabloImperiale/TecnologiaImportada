import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export function productIdsWrite(document) {
  const items = document.fields?.items?.arrayValue;
  if (!items) throw new Error('Una venta no tiene un listado de items valido.');
  const ids = (items.values ?? []).map((item) => item.mapValue?.fields?.productId?.stringValue);
  if (ids.some((id) => typeof id !== 'string' || !id.trim())) throw new Error('Una venta contiene un item sin productId valido.');
  const productIds = [...new Set(ids)];
  const previous = document.fields?.productIds?.arrayValue;
  const previousIds = (previous?.values ?? []).map((value) => value.stringValue);
  if (previous && previousIds.length === productIds.length && productIds.every((id) => previousIds.includes(id))) return null;
  if (!document.updateTime) throw new Error('Falta la version de una venta; no se puede actualizar de forma segura.');
  return {
    update: { name: document.name, fields: { productIds: { arrayValue: { values: productIds.map((id) => ({ stringValue: id })) } } } },
    updateMask: { fieldPaths: ['productIds'] },
    currentDocument: { updateTime: document.updateTime },
  };
}

export async function migrateVentaProductIds({ project, request, apply = false }) {
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project ?? '')) throw new Error('Indica un ID de proyecto valido con --project.');
  const root = `projects/${project}/databases/(default)/documents`;
  const stats = { scanned: 0, pending: 0, updated: 0 };
  let pageToken;
  do {
    const params = new URLSearchParams({ pageSize: '200', orderBy: '__name__' });
    params.append('mask.fieldPaths', 'items');
    params.append('mask.fieldPaths', 'productIds');
    if (pageToken) params.set('pageToken', pageToken);
    const page = await request(`${root}/ventas?${params}`);
    const documents = page.documents ?? [];
    const writes = [];
    for (const document of documents) {
      if (!document.name?.startsWith(`${root}/ventas/`)) throw new Error('La respuesta contiene un documento fuera de ventas.');
      const write = productIdsWrite(document);
      if (write) writes.push(write);
    }
    stats.scanned += documents.length;
    stats.pending += writes.length;
    if (apply && writes.length) {
      await request(`${root}:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
      stats.updated += writes.length;
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return stats;
}

export function createFirebaseRequest() {
  const bin = (process.env.PATH ?? '').split(delimiter).find((entry) => existsSync(resolve(entry, '../firebase-tools/lib/auth.js')));
  if (!bin) throw new Error('Ejecuta con npm exec --package=firebase-tools -- node scripts/backfillVentaProductIds.mjs.');
  const require = createRequire(resolve(bin, '../firebase-tools/package.json'));
  const auth = require('./lib/auth.js');
  const account = auth.getProjectDefaultAccount(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  if (!account?.tokens?.refresh_token) throw new Error('Inicia sesion con firebase login antes de migrar.');
  return async (path, options = {}) => {
    const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
    const response = await fetch(`https://firestore.googleapis.com/v1/${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Firestore respondio HTTP ${Number(response.status)}; migracion detenida.`);
    return response.json();
  };
}

async function main() {
  const { values } = parseArgs({ options: { project: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  const stats = await migrateVentaProductIds({ project: values.project, request: createFirebaseRequest(), apply: values.apply });
  console.log('Ventas revisadas: %d; pendientes detectadas: %d; actualizadas: %d.', stats.scanned, stats.pending, stats.updated);
  if (!values.apply) console.log('Simulacion: no se modificaron documentos. Usa --apply para actualizar.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('Migracion fallida: %s', String(error.message).replace(/[\r\n\t]/g, ' ').slice(0, 200));
    process.exitCode = 1;
  });
}