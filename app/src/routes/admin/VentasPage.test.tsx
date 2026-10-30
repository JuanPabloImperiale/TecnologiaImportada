import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import type { Producto, Venta } from '@/models';
import { saleService } from '@/services/saleService';
import { useCatalog } from '@/hooks/useCatalog';
import { VentasPage } from './VentasPage';

vi.mock('@/services/saleService', () => ({ saleService: { getPage: vi.fn(), getAll: vi.fn(), getByProduct: vi.fn(), getByAmount: vi.fn() } }));
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
  venta(5, 'otro', { pago: { usd: 0, ars: 5700, medioArs: 'efectivo', tipoCambio: 9.5 } }),
  venta(4, 'iphone', { cliente: { nombre: 'Ana' }, pago: { usd: 0, ars: 5700, medioArs: 'efectivo', tipoCambio: 9.5 } }),
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

async function cambiar(id: string, value: string) {
  await act(async () => {
    renderer.root.findByProps({ id }).props.onChange({ target: { value } });
  });
}

async function seleccionar() {
  await act(async () => { renderer.root.findByProps({ id: 'venta-producto' }).props.onFocus(); });
  await cambiar('venta-producto', 'APL-15');
  await act(async () => { boton('iPhone 15').props.onClick(); });
}

async function buscar() {
  await act(async () => { renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() }); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(useCatalog).mockReturnValue({ all: [producto], products: [producto], featured: [], categorias: [], catMap: new Map([['telefonos', 'Teléfonos']]), loading: false, error: null });
  vi.mocked(saleService.getPage).mockResolvedValue({ ok: true, data: { ventas: recientes, cursor: null, hasMore: true } });
  vi.mocked(saleService.getAll).mockResolvedValue({ ok: true, data: historicas });
  vi.mocked(saleService.getByProduct).mockResolvedValue({ ok: true, data: historicas.filter((venta) => venta.items.some((item) => item.productId === producto.id)) });
  vi.mocked(saleService.getByAmount).mockImplementation(async (amount, currency) => ({ ok: true, data: historicas.filter((venta) => (currency === 'ARS' ? venta.pago.ars : venta.pago.usd) === amount) }));
});

afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  vi.useRealTimers();
});

describe('VentasPage: busqueda manual combinada', () => {
  it('no consulta ventas ni aplica filtros al escribir o seleccionar un producto', async () => {
    await montar();
    expect(vi.mocked(useCatalog).mock.calls[0][0]).toEqual({ loadProducts: false });
    await cambiar('venta-texto', 'Ana');
    await cambiar('venta-monto', '5700');
    await cambiar('venta-estado', 'anulada');
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(vi.mocked(useCatalog).mock.lastCall?.[0]).toEqual({ loadProducts: false });
    await seleccionar();
    expect(saleService.getAll).not.toHaveBeenCalled();
    expect(saleService.getByProduct).not.toHaveBeenCalled();
    expect(saleService.getByAmount).not.toHaveBeenCalled();
    expect(saleService.getPage).toHaveBeenCalledOnce();
    expect(enlacesVentas()).toHaveLength(30);
  });

  it('consulta el producto solo al confirmar y restaura la paginacion al limpiar', async () => {
    await montar();
    await seleccionar();
    await buscar();
    expect(saleService.getAll).not.toHaveBeenCalled();
    expect(saleService.getByProduct).toHaveBeenCalledTimes(1);
    expect(saleService.getByProduct).toHaveBeenLastCalledWith('iphone', false);
    expect(enlacesVentas()).toEqual(['/adm/ventas/venta-4', '/adm/ventas/venta-3', '/adm/ventas/venta-2']);
    expect(JSON.stringify(renderer.toJSON())).not.toContain('Cargar 30 ventas anteriores');
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Limpiar filtros' }).props.onClick(); });
    expect(enlacesVentas()).toHaveLength(30);
    expect(saleService.getPage).toHaveBeenCalledTimes(2);
    expect(renderer.root.findByProps({ id: 'venta-producto' }).props.value).toBe('');
  });

  it('busca por monto efectivamente cobrado en ARS o USD sin confundirlo con totalUsd', async () => {
    await montar();
    await cambiar('venta-monto', '5700');
    await buscar();
    expect(saleService.getByAmount).toHaveBeenLastCalledWith(5700, 'ARS', false);
    expect(enlacesVentas()).toEqual(['/adm/ventas/venta-5', '/adm/ventas/venta-4']);
    await cambiar('venta-moneda', 'USD');
    await cambiar('venta-monto', '600');
    expect(enlacesVentas()).toEqual(['/adm/ventas/venta-5', '/adm/ventas/venta-4']);
    await buscar();
    expect(saleService.getByAmount).toHaveBeenLastCalledWith(600, 'USD', false);
    expect(enlacesVentas()).not.toContain('/adm/ventas/venta-4');
    expect(enlacesVentas()).toContain('/adm/ventas/venta-3');
    expect(saleService.getAll).not.toHaveBeenCalled();
  });

  it('combina producto, cliente, monto, estado y facturacion en una sola consulta selectiva', async () => {
    await montar();
    await seleccionar();
    await cambiar('venta-texto', 'Ana');
    await cambiar('venta-monto', '5700');
    await cambiar('venta-estado', 'confirmada');
    await cambiar('venta-facturacion', 'sin_facturar');
    await buscar();
    expect(enlacesVentas()).toEqual(['/adm/ventas/venta-4']);
    expect(saleService.getByAmount).toHaveBeenCalledOnce();
    expect(saleService.getByProduct).not.toHaveBeenCalled();
    expect(saleService.getAll).not.toHaveBeenCalled();
  });

  it('conserva la busqueda parcial por numero o cliente en el historial solo al confirmar', async () => {
    await montar();
    await cambiar('venta-texto', 'ana');
    await buscar();
    expect(saleService.getAll).toHaveBeenLastCalledWith(false);
    expect(enlacesVentas()).toEqual(['/adm/ventas/venta-4', '/adm/ventas/venta-3']);
    await cambiar('venta-texto', '3');
    expect(enlacesVentas()).toEqual(['/adm/ventas/venta-4', '/adm/ventas/venta-3']);
    await buscar();
    expect(enlacesVentas()).toContain('/adm/ventas/venta-3');
    expect(enlacesVentas()).toContain('/adm/ventas/venta-13');
  });

  it('mantiene los filtros anteriores hasta volver a buscar y puede mostrar cero coincidencias', async () => {
    await montar();
    await seleccionar();
    await cambiar('venta-estado', 'confirmada');
    await cambiar('venta-facturacion', 'facturada');
    await buscar();
    expect(enlacesVentas()).toEqual(['/adm/ventas/venta-3']);
    await cambiar('venta-texto', 'inexistente');
    expect(enlacesVentas()).toEqual(['/adm/ventas/venta-3']);
    await buscar();
    expect(enlacesVentas()).toEqual([]);
    expect(JSON.stringify(renderer.toJSON())).toContain('Sin ventas coincidentes');
  });

  it('valida importes y productos sin consultar ventas y permite buscar monto cero', async () => {
    await montar();
    await cambiar('venta-monto', '-1');
    await buscar();
    expect(saleService.getByAmount).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer.toJSON())).toContain('Ingresá un monto válido.');
    await cambiar('venta-monto', '0');
    await cambiar('venta-producto', 'Sin seleccionar');
    await buscar();
    expect(JSON.stringify(renderer.toJSON())).toContain('Seleccioná un producto de la lista.');
    await cambiar('venta-producto', '');
    await buscar();
    expect(saleService.getByAmount).toHaveBeenLastCalledWith(0, 'ARS', false);
  });

  it('reintenta con los filtros aplicados, no con los cambios todavia sin confirmar', async () => {
    vi.mocked(saleService.getByAmount).mockResolvedValueOnce({ ok: false, error: { code: 'red', message: 'No se pudo cargar la búsqueda.' } });
    await montar();
    await cambiar('venta-monto', '5700');
    await buscar();
    expect(JSON.stringify(renderer.toJSON())).toContain('No se pudo cargar la búsqueda.');
    await cambiar('venta-monto', '9999');
    await act(async () => { boton('Actualizar').props.onClick(); });
    expect(saleService.getByAmount).toHaveBeenLastCalledWith(5700, 'ARS', true);
    expect(enlacesVentas()).toEqual(['/adm/ventas/venta-5', '/adm/ventas/venta-4']);
  });

  it('descarta una pagina anterior pendiente cuando se confirma otra busqueda', async () => {
    await montar();
    let resolver!: (value: Awaited<ReturnType<typeof saleService.getPage>>) => void;
    vi.mocked(saleService.getPage).mockReturnValueOnce(new Promise((resolve) => { resolver = resolve; }));
    await act(async () => { boton('Cargar 30 ventas anteriores').props.onClick(); });
    await cambiar('venta-monto', '5700');
    await buscar();
    await act(async () => { resolver({ ok: true, data: { ventas: [venta(99, 'otro')], cursor: null, hasMore: false } }); });
    expect(enlacesVentas()).toEqual(['/adm/ventas/venta-5', '/adm/ventas/venta-4']);
  });
});