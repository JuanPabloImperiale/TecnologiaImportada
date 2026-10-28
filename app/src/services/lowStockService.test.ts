import { describe, expect, it, vi } from 'vitest';
import { isLowStock, syncLowStockIndex } from './lowStockService';

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, name: string, id: string) => ({ path: `${name}/${id}` }),
  collection: vi.fn(), getDocs: vi.fn(), limit: vi.fn(), onSnapshot: vi.fn(), orderBy: vi.fn(), query: vi.fn(), where: vi.fn(),
}));

const product = { nombre: 'Producto', negocio: 'productos' as const, stock: 2, stockMinimo: 2, activo: true };

describe('indice de stock bajo', () => {
  it('incluye el limite y excluye inactivos y productos con stock suficiente', () => {
    expect(isLowStock(product)).toBe(true);
    expect(isLowStock({ ...product, stock: 3 })).toBe(false);
    expect(isLowStock({ ...product, activo: false })).toBe(false);
    expect(isLowStock(null)).toBe(false);
    expect(isLowStock({ ...product, stock: 0, stockMinimo: 0 })).toBe(false);
    expect(isLowStock({ activo: true, stock: 0 })).toBe(false);
  });

  it('crea y actualiza el documento usando los datos nuevos del producto', () => {
    const writer = { set: vi.fn(), delete: vi.fn() };
    syncLowStockIndex(writer, 'p1', { ...product, stock: 3 }, { ...product, id: 'p1' });
    expect(writer.set).toHaveBeenCalledWith({ path: 'stockBajo/p1' }, product);
    expect(writer.delete).not.toHaveBeenCalled();
    syncLowStockIndex(writer, 'p1', product, { ...product, nombre: 'Nuevo nombre', stock: 1 });
    expect(writer.set).toHaveBeenLastCalledWith({ path: 'stockBajo/p1' }, { ...product, nombre: 'Nuevo nombre', stock: 1 });
  });

  it.each([{ ...product, stock: 3 }, { ...product, activo: false }, null])('quita el indice al reponer, desactivar o eliminar', (after) => {
    const writer = { set: vi.fn(), delete: vi.fn() };
    syncLowStockIndex(writer, 'p1', product, after);
    expect(writer.delete).toHaveBeenCalledWith({ path: 'stockBajo/p1' });
    expect(writer.set).not.toHaveBeenCalled();
  });

  it('no agrega escrituras si antes y despues hay stock suficiente', () => {
    const writer = { set: vi.fn(), delete: vi.fn() };
    syncLowStockIndex(writer, 'p1', { ...product, stock: 5 }, { ...product, stock: 4 });
    expect(writer.set).not.toHaveBeenCalled();
    expect(writer.delete).not.toHaveBeenCalled();
  });
});