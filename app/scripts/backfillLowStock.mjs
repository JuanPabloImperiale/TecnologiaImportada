import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createFirebaseRequest } from './backfillVentaProductIds.mjs';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

export async function migrateLowStock({ project, request, apply = false }) {
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project ?? '')) throw new Error('Indica un ID de proyecto valido.');
  const root = `projects/${project}/databases/(default)/documents`;
  const existing = new Map();
  const stats = { products: 0, pending: 0, updated: 0 };
  const readPage = (collection, token) => {
    const params = new URLSearchParams({ pageSize: '200', orderBy: '__name__' });
    if (token) params.set('pageToken', token);
    return request(`${root}/${collection}?${params}`);
  };
  const submit = async (writes) => {
    const changes = writes.filter((write) => write.update || write.delete).length;
    stats.pending += changes;
    if (apply && changes) {
      await request(`${root}:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
      stats.updated += changes;
    }
  };
  let token;
  do {
    const page = await readPage('stockBajo', token);
    for (const document of page.documents ?? []) {
      if (!document.name?.startsWith(`${root}/stockBajo/`) || !document.updateTime) throw new Error('Documento de indice invalido.');
      existing.set(document.name.split('/').pop(), document);
    }
    token = page.nextPageToken;
  } while (token);

  do {
    const page = await readPage('products', token);
    const writes = [];
    for (const product of page.documents ?? []) {
      if (!product.name?.startsWith(`${root}/products/`) || !product.updateTime) throw new Error('Documento de producto invalido.');
      stats.products += 1;
      const id = product.name.split('/').pop();
      const previous = existing.get(id);
      existing.delete(id);
      const fields = product.fields ?? {};
      const stock = Number(fields.stock?.integerValue ?? fields.stock?.doubleValue ?? 0);
      const minimum = Number(fields.stockMinimo?.integerValue ?? fields.stockMinimo?.doubleValue ?? 0);
      const low = fields.activo?.booleanValue === true && minimum > 0 && stock <= minimum;
      if (!low && !previous) continue;
      const indexedFields = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== 'id'));
      if (low && previous && JSON.stringify(canonical(indexedFields)) === JSON.stringify(canonical(previous.fields))) continue;
      writes.push({ verify: product.name, currentDocument: { updateTime: product.updateTime } });
      if (low) {
        writes.push({ update: { name: `${root}/stockBajo/${id}`, fields: indexedFields }, currentDocument: previous ? { updateTime: previous.updateTime } : { exists: false } });
      } else {
        writes.push({ delete: previous.name, currentDocument: { updateTime: previous.updateTime } });
      }
    }
    await submit(writes);
    token = page.nextPageToken;
  } while (token);

  const obsolete = [...existing.entries()];
  for (let offset = 0; offset < obsolete.length; offset += 200) {
    await submit(obsolete.slice(offset, offset + 200).flatMap(([id, document]) => [
      { verify: `${root}/products/${id}`, currentDocument: { exists: false } },
      { delete: document.name, currentDocument: { updateTime: document.updateTime } },
    ]));
  }
  return stats;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { project: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  migrateLowStock({ project: values.project, request: createFirebaseRequest(), apply: values.apply }).then((stats) => {
    console.log('Productos revisados: %d; cambios de indice detectados: %d; aplicados: %d.', stats.products, stats.pending, stats.updated);
    if (!values.apply) console.log('Simulacion: no se modificaron documentos.');
  }).catch((error) => {
    console.error('Migracion fallida: %s', String(error.message).replace(/[\r\n\t]/g, ' ').slice(0, 200));
    process.exitCode = 1;
  });
}