import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import type { Producto, Venta } from '@/models';
import { saleService } from '@/services/saleService';
import { useCatalog } from '@/hooks/useCatalog';
import { VentasPage } from './VentasPage';

vi.mock('@/services/saleService', () => ({ saleService: { getPage: vi.fn(), getAll: vi.fn(), getByProduct: vi.fn() } }));
vi.mock('@/hooks/useCatalog', () => ({ useCatalog: vi.fn() }));

const fecha = { toDate: () => new Date('2026-10-10T12:00:00') } as Venta['creado'];
const producto: Producto = {
  id: 'iphone', nombre: 'iPhone 15', slug: 'iphone-15', negocio: 'productos',
  categoriaId: 'telefonos', descripcion: '', monedaVenta: 'USD', precioVenta: 600,
  costo: 400, sku: 'APL-15', stock: 0, stockMinimo: 0, imagenes: [],
  activo: true, destacado: false, creado: fecha, actualizado: fecha,
};

function venta(numero: number, productId: string, extra: Partial<Venta> = {}): Venta {
  return {
    id: `venta-${numero}`, numero, negocio: 'productos',
    items: [{ productId, nombre: 'Nombre histórico', negocio: 'productos', moneda: 'USD', tipo: 'venta', cantidad: 1, precioUnitario: 600, costoUnitario: 400 }],
    totalUsd: 600, totalArs: 0, costoUsd: 400, costoArs: 0, costoBonifUsd: 0, costoBonifArs: 0,
    envio: { metodo: 'retiro', costo: 0 }, pago: { usd: 600, ars: 0, medioArs: 'efectivo', tipoCambio: 0 },
    facturacion: { estado: 'sin_facturar', tipo: 'C' },
    canal: 'presencial', estado: 'confirmada', vendedorId: 'admin', creado: fecha,
    ...extra,
  };
}

const recientes = Array.from({ length: 30 }, (_, index) => venta(index + 10, 'otro'));
const historicas = [
  ...recientes,
  venta(3, 'iphone', { cliente: { nombre: 'Ana' }, facturacion: { estado: 'facturada', tipo: 'C' } }),
  venta(2, 'iphone', { estado: 'anulada' }),
  venta(1, 'otro'),
];

let renderer: ReactTestRenderer;

async function montar() {
  await act(async () => { renderer = create(<MemoryRouter><VentasPage /></MemoryRouter>); });
}

function enlacesVentas() {
  return renderer.root.findAllByType('a').map((node) => node.props.href).filter((href: string) => /^\/adm\/ventas\/venta-/.test(href));
}

function boton(texto: string) {
  return renderer.root.findAllByType('button').find((node) => node.findAll((child) => typeof child.type === 'string' && child.children.some((value) => typeof value === 'string' && value.trim() === texto)).length > 0)!;
}

async function buscar(texto: string) {
  await act(async () => {
    renderer.root.findByProps({ 'aria-label': 'Buscar producto para filtrar ventas' }).props.onChange({ target: { value: texto } });
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(1_200); });
}

async function seleccionar() {
  await buscar('APL-15');
  await act(async () => { boton('iPhone 15').props.onClick(); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(useCatalog).mockReturnValue({ all: [producto], products: [producto], featured: [], categorias: [], catMap: new Map([['telefonos', 'Teléfonos']]), loading: false, error: null });
  vi.mocked(saleService.getPage).mockResolvedValue({ ok: true, data: { ventas: recientes, cursor: null, hasMore: true } });
  vi.mocked(saleService.getByProduct).mockResolvedValue({ ok: true, data: historicas.filter((venta) => venta.items.some((item) => item.productId === producto.id)) });
});

afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  vi.useRealTimers();
});

describe('VentasPage: filtro por producto', () => {
  it('busca por nombre, SKU y categoría sin cargar el historial hasta seleccionar', async () => {
    await montar();
    expect(vi.mocked(useCatalog).mock.calls[0][0]).toEqual({ loadProducts: false });
    for (const termino of ['iphone', 'APL-15', 'telefonos']) {
      await buscar(termino);
      expect(boton('iPhone 15')).toBeDefined();
    }
    expect(vi.mocked(useCatalog).mock.lastCall?.[0]).toEqual({ loadProducts: true });
    expect(saleService.getAll).not.toHaveBeenCalled();
    expect(saleService.getByProduct).not.toHaveBeenCalled();
    await buscar('inexistente');
    expect(JSON.stringify(renderer.toJSON())).toContain('Sin productos coincidentes.');
  });

  it('encuentra todas las ventas históricas por ID y vuelve a paginar al quitar el filtro', async () => {
    await montar();
    expect(enlacesVentas()).toHaveLength(30);
    await seleccionar();
    expect(saleService.getAll).not.toHaveBeenCalled();
    expect(saleService.getByProduct).toHaveBeenCalledTimes(1);
    expect(saleService.getByProduct).toHaveBeenLastCalledWith('iphone', false);
    expect(enlacesVentas()).toEqual(['/adm/ventas/venta-3', '/adm/ventas/venta-2']);
    expect(JSON.stringify(renderer.toJSON())).not.toContain('Cargar 30 ventas anteriores');
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Quitar filtro de producto' }).props.onClick(); });
    expect(enlacesVentas()).toHaveLength(30);
    expect(saleService.getPage).toHaveBeenCalledTimes(2);
  });

  it('combina el producto con estado, facturación y búsqueda por cliente', async () => {
    await montar();
    await seleccionar();
    await act(async () => { boton('confirmada').props.onClick(); });
    expect(enlacesVentas()).toEqual(['/adm/ventas/venta-3']);
    await act(async () => {
      renderer.root.findAllByType('select').find((node) => node.children.some((child) => typeof child !== 'string' && child.props.value === 'facturada'))!.props.onChange({ target: { value: 'sin_facturar' } });
    });
    expect(enlacesVentas()).toEqual([]);
    expect(JSON.stringify(renderer.toJSON())).toContain('Sin ventas coincidentes');
    await act(async () => {
      renderer.root.findAllByType('select').find((node) => node.children.some((child) => typeof child !== 'string' && child.props.value === 'facturada'))!.props.onChange({ target: { value: 'todas' } });
      renderer.root.findByProps({ placeholder: 'Buscar por N° o cliente…' }).props.onChange({ target: { value: 'Ana' } });
    });
    expect(enlacesVentas()).toEqual(['/adm/ventas/venta-3']);
    expect(saleService.getByProduct).toHaveBeenCalledTimes(1);
  });

  it('muestra errores del historial y permite reintentar', async () => {
    vi.mocked(saleService.getByProduct).mockResolvedValueOnce({ ok: false, error: { code: 'red', message: 'No se pudo cargar el historial.' } });
    await montar();
    await seleccionar();
    expect(JSON.stringify(renderer.toJSON())).toContain('No se pudo cargar el historial.');
    await act(async () => { boton('Actualizar').props.onClick(); });
    expect(saleService.getByProduct).toHaveBeenLastCalledWith('iphone', true);
    expect(enlacesVentas()).toEqual(['/adm/ventas/venta-3', '/adm/ventas/venta-2']);
  });

  it('ignora el historial pendiente si se quita el producto antes de recibirlo', async () => {
    let resolver!: (value: Awaited<ReturnType<typeof saleService.getByProduct>>) => void;
    vi.mocked(saleService.getByProduct).mockReturnValueOnce(new Promise((resolve) => { resolver = resolve; }));
    await montar();
    await seleccionar();
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Quitar filtro de producto' }).props.onClick(); });
    await act(async () => { resolver({ ok: true, data: historicas }); });
    expect(enlacesVentas()).toHaveLength(30);
    expect(enlacesVentas()).not.toContain('/adm/ventas/venta-3');
  });
});