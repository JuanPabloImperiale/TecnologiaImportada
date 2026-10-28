import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { productService } from '@/services/productService';
import { lowStockService } from '@/services/lowStockService';
import type { Producto } from '@/models';
import { InventarioPage } from './InventarioPage';

vi.mock('@/services/productService', () => ({ productService: { getInventoryPage: vi.fn(), searchAll: vi.fn() } }));
vi.mock('@/services/lowStockService', () => ({ lowStockService: { subscribe: vi.fn(), getByNegocio: vi.fn() } }));
vi.mock('@/hooks/useCategories', () => {
  const categories: never[] = [];
  return { useCategories: () => ({ categories }) };
});
vi.mock('@/hooks/useQrPrint', () => ({ useQrPrint: () => ({ printQr: vi.fn(), sheet: null }) }));

const producto: Producto = {
  id: 'p1', nombre: 'iPhone', slug: 'iphone', negocio: 'productos', categoriaId: 'telefonos',
  descripcion: '', monedaVenta: 'USD', precioVenta: 600, costo: 400,
  stock: 1, stockMinimo: 2, imagenes: [], activo: true, destacado: false,
  creado: new Date() as unknown as Producto['creado'], actualizado: new Date() as unknown as Producto['actualizado'],
};
let renderer: ReactTestRenderer;

async function montar() {
  await act(async () => { renderer = create(<MemoryRouter><InventarioPage /></MemoryRouter>); });
}

function escribir(value: string) {
  act(() => renderer.root.findByProps({ placeholder: 'Buscar por nombre, SKU o categoría…' }).props.onChange({ target: { value } }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(productService.getInventoryPage).mockResolvedValue({ ok: true, data: { products: [producto], cursor: null, hasMore: true } });
  vi.mocked(productService.searchAll).mockResolvedValue({ ok: true, data: [producto] });
  vi.mocked(lowStockService.subscribe).mockImplementation((_negocio, next) => {
    next([producto, { ...producto, id: 'p2', nombre: 'Otro producto fuera de la primera pagina' }]);
    return vi.fn();
  });
});

afterEach(() => {
  act(() => renderer.unmount());
  vi.useRealTimers();
});

describe('InventarioPage: consultas prioritarias', () => {
  it('solo carga 30 productos al entrar sin leer todo el inventario para contar stock bajo', async () => {
    await montar();
    expect(productService.getInventoryPage).toHaveBeenCalledOnce();
    expect(productService.getInventoryPage).toHaveBeenCalledWith('productos', 30, null);
    expect(productService.searchAll).not.toHaveBeenCalled();
    const text = renderer.root.findAllByType('p').map((node) => node.children.filter((child) => typeof child === 'string').join('')).join(' ');
    expect(text).toContain('2 con stock bajo en Productos');
    const links = renderer.root.findAllByType('a').map((node) => node.props.href);
    expect(links).toContain('/adm/inventario/nuevo?negocio=productos');
    expect(links).toContain('/adm/inventario/p1');
  });

  it('muestra todo el indice de stock bajo sin descargar el inventario completo', async () => {
    await montar();
    await act(async () => {
      renderer.root.findAllByType('button').find((node) => node.children.some((child) => typeof child === 'string' && child.trim() === 'Stock bajo'))!.props.onClick();
    });
    expect(productService.searchAll).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer.toJSON())).toContain('Otro producto fuera de la primera pagina');
  });

  it('busca solo despues de 1.2 segundos y restablece una sola pagina al borrar', async () => {
    await montar();
    escribir('ip');
    expect(renderer.root.findAllByProps({ role: 'status' })).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    escribir('iphone');
    await act(async () => { await vi.advanceTimersByTimeAsync(1_199); });
    expect(productService.searchAll).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(productService.searchAll).toHaveBeenCalledOnce();
    expect(productService.searchAll).toHaveBeenCalledWith({ negocio: 'productos' });
    expect(renderer.root.findAllByProps({ role: 'status' })).toHaveLength(0);
    escribir('');
    await act(async () => {});
    expect(productService.getInventoryPage).toHaveBeenCalledTimes(2);
  });
});