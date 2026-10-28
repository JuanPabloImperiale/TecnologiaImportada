import { describe, expect, it, vi } from 'vitest';
import { migrateLowStock } from './backfillLowStock.mjs';

const root = 'projects/test-project/databases/(default)/documents';
const product = {
  name: `${root}/products/p1`, updateTime: '2026-10-28T12:00:00Z',
  fields: { nombre: { stringValue: 'Producto' }, negocio: { stringValue: 'productos' }, activo: { booleanValue: true }, stock: { integerValue: '2' }, stockMinimo: { integerValue: '2' } },
};

describe('inicializacion de stockBajo', () => {
  it('simula sin escribir y considera el limite de stock', async () => {
    const request = vi.fn().mockResolvedValueOnce({ documents: [] }).mockResolvedValueOnce({ documents: [product] });
    expect(await migrateLowStock({ project: 'test-project', request })).toEqual({ products: 1, pending: 1, updated: 0 });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('crea el indice verificando las versiones y sin modificar productos', async () => {
    const request = vi.fn().mockResolvedValueOnce({ documents: [] }).mockResolvedValueOnce({ documents: [product] }).mockResolvedValueOnce({});
    await migrateLowStock({ project: 'test-project', request, apply: true });
    const writes = JSON.parse(request.mock.calls[2][1].body).writes;
    expect(writes[0]).toEqual({ verify: product.name, currentDocument: { updateTime: product.updateTime } });
    expect(writes[1]).toEqual({ update: { name: `${root}/stockBajo/p1`, fields: product.fields }, currentDocument: { exists: false } });
  });

  it('no vuelve a escribir productos ya indexados', async () => {
    const request = vi.fn().mockResolvedValueOnce({ documents: [{ ...product, name: `${root}/stockBajo/p1` }] }).mockResolvedValueOnce({ documents: [product] });
    expect((await migrateLowStock({ project: 'test-project', request, apply: true })).updated).toBe(0);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('no indexa productos sin minimo configurado ni con minimo cero', async () => {
    const withoutMinimum = { ...product, fields: { ...product.fields, stock: { integerValue: '0' } } };
    delete withoutMinimum.fields.stockMinimo;
    const zeroMinimum = { ...product, name: `${root}/products/p2`, fields: { ...product.fields, stock: { integerValue: '0' }, stockMinimo: { integerValue: '0' } } };
    const request = vi.fn().mockResolvedValueOnce({ documents: [] }).mockResolvedValueOnce({ documents: [withoutMinimum, zeroMinimum] });
    expect((await migrateLowStock({ project: 'test-project', request, apply: true })).updated).toBe(0);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('quita productos repuestos, desactivados o eliminados del indice', async () => {
    const indexed = { ...product, name: `${root}/stockBajo/p1` };
    const replenished = { ...product, fields: { ...product.fields, stock: { integerValue: '3' } } };
    const request = vi.fn().mockResolvedValueOnce({ documents: [indexed] }).mockResolvedValueOnce({ documents: [replenished] }).mockResolvedValueOnce({});
    await migrateLowStock({ project: 'test-project', request, apply: true });
    expect(JSON.parse(request.mock.calls[2][1].body).writes[1].delete).toBe(indexed.name);
    const deleted = vi.fn().mockResolvedValueOnce({ documents: [indexed] }).mockResolvedValueOnce({ documents: [] }).mockResolvedValueOnce({});
    await migrateLowStock({ project: 'test-project', request: deleted, apply: true });
    expect(JSON.parse(deleted.mock.calls[2][1].body).writes[0].currentDocument).toEqual({ exists: false });
  });
});