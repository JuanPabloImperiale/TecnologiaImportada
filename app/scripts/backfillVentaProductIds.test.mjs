import { describe, expect, it, vi } from 'vitest';
import { migrateVentaProductIds, productIdsWrite } from './backfillVentaProductIds.mjs';

const root = 'projects/test-project/databases/(default)/documents';
function venta(ids, indexed) {
  return {
    name: `${root}/ventas/v1`, updateTime: '2026-10-27T12:00:00Z',
    fields: {
      items: { arrayValue: { values: ids.map((id) => ({ mapValue: { fields: { productId: { stringValue: id } } } })) } },
      ...(indexed ? { productIds: { arrayValue: { values: indexed.map((id) => ({ stringValue: id })) } } } : {}),
    },
  };
}

describe('migracion de productIds en ventas', () => {
  it('solo actualiza productIds, sin duplicados y con control de version', () => {
    const write = productIdsWrite(venta(['p1', 'p2', 'p1']));
    expect(write.update.fields).toEqual({ productIds: { arrayValue: { values: [{ stringValue: 'p1' }, { stringValue: 'p2' }] } } });
    expect(write.updateMask.fieldPaths).toEqual(['productIds']);
    expect(write.currentDocument.updateTime).toBe('2026-10-27T12:00:00Z');
  });

  it('omite ventas ya indexadas aunque los ids tengan otro orden', () => {
    expect(productIdsWrite(venta(['p1', 'p2'], ['p2', 'p1']))).toBeNull();
  });

  it('no escribe al simular', async () => {
    const request = vi.fn(async () => ({ documents: [venta(['p1'])] }));
    expect(await migrateVentaProductIds({ project: 'test-project', request })).toEqual({ scanned: 1, pending: 1, updated: 0 });
    expect(request).toHaveBeenCalledOnce();
  });

  it('pagina y actualiza solo las ventas pendientes', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ documents: [venta(['p1'])], nextPageToken: 'next' })
      .mockResolvedValueOnce({ writeResults: [{}] })
      .mockResolvedValueOnce({ documents: [venta(['p2'], ['p2'])] });
    expect(await migrateVentaProductIds({ project: 'test-project', request, apply: true })).toEqual({ scanned: 2, pending: 1, updated: 1 });
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[2][0]).toContain('pageToken=next');
    expect(JSON.parse(request.mock.calls[1][1].body).writes).toEqual([productIdsWrite(venta(['p1']))]);
  });

  it('detiene la migracion si un item es invalido sin escribir esa pagina', async () => {
    const request = vi.fn(async () => ({ documents: [venta(['p1']), venta([null])] }));
    await expect(migrateVentaProductIds({ project: 'test-project', request, apply: true })).rejects.toThrow('productId valido');
    expect(request).toHaveBeenCalledOnce();
  });

  it('no acepta documentos fuera de ventas ni proyectos invalidos', async () => {
    const request = vi.fn(async () => ({ documents: [{ ...venta(['p1']), name: `${root}/products/p1` }] }));
    await expect(migrateVentaProductIds({ project: 'test-project', request, apply: true })).rejects.toThrow('fuera de ventas');
    await expect(migrateVentaProductIds({ project: '../otro', request })).rejects.toThrow('proyecto valido');
  });
});