import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductoInput } from './productService';
import { where } from 'firebase/firestore';

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(), updateDoc: vi.fn(), runTransaction: vi.fn(), deleteDoc: vi.fn(),
  onSnapshot: vi.fn(),
  batch: { set: vi.fn<(reference: unknown, data: Record<string, unknown>) => void>(), delete: vi.fn(), commit: vi.fn(async () => {}) },
  auth: { currentUser: { uid: 'admin' } },
}));

vi.mock('@/lib/firebase', () => ({ db: {}, auth: mocks.auth }));
vi.mock('./movimientosService', () => ({ registrarMovimiento: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ path: name })),
  doc: vi.fn((base: unknown, name?: string, id?: string) => ({
    id: id ?? name ?? 'generated',
    path: id ? `${name}/${id}` : `${(base as { path?: string })?.path ?? ''}/${name ?? 'generated'}`,
  })), query: vi.fn((...parts) => parts),
  where: vi.fn((...parts) => parts), orderBy: vi.fn(), limit: vi.fn(), startAfter: vi.fn(),
  onSnapshot: mocks.onSnapshot, serverTimestamp: vi.fn(), increment: vi.fn(),
  getDocs: mocks.getDocs, updateDoc: mocks.updateDoc, runTransaction: mocks.runTransaction,
  deleteDoc: mocks.deleteDoc,
  deleteField: vi.fn(),
  writeBatch: () => mocks.batch,
  getDoc: vi.fn(async () => ({ exists: () => false })), addDoc: vi.fn(async () => ({ id: 'new' })),
  Timestamp: { fromDate: vi.fn() },
}));

let products: typeof import('./productService').productService;
let sales: typeof import('./saleService').saleService;

const productInput: ProductoInput = {
  nombre: 'Producto', negocio: 'productos', categoriaId: 'audio', descripcion: '',
  monedaVenta: 'USD', costo: 50, precioVenta: 100, gananciaModo: 'porcentaje',
  stock: 1, stockMinimo: 0, activo: true, destacado: false, variantes: [], imagenes: [],
};

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.auth.currentUser = { uid: 'admin' };
  mocks.getDocs.mockResolvedValue({ docs: [{ id: 'p1', data: () => ({ nombre: 'Producto' }) }] });
  mocks.updateDoc.mockResolvedValue(undefined);
  mocks.deleteDoc.mockResolvedValue(undefined);
  mocks.runTransaction.mockResolvedValue({ id: 'v1', numero: 1 });
  mocks.onSnapshot.mockReturnValue(vi.fn());
  products = (await import('./productService')).productService;
  sales = (await import('./saleService')).saleService;
});

describe('indice y cache en cada cambio de stock', () => {
  it.each([
    ['venta', 3, 2, 'set'],
    ['anulacion', 2, 3, 'delete'],
    ['importacion', 2, 4, 'delete'],
    ['regalo', 3, 2, 'set'],
    ['editar-regalo', 3, 2, 'set'],
    ['reserva', 3, 2, 'set'],
    ['cancelar-reserva', 2, 3, 'delete'],
    ['editar-producto', 3, 1, 'set'],
    ['desactivar', 2, 2, 'delete'],
    ['eliminar', 2, 0, 'delete'],
  ] as const)('%s mantiene el indice en la misma transaccion y descarta la cache', async (operation, beforeStock, afterStock, expected) => {
    const product = { ...productInput, negocio: operation.includes('regalo') ? 'accesorios' : 'productos', stock: beforeStock, stockMinimo: 2 };
    const item = { productId: 'p1', nombre: 'Producto', cantidad: 1, tipo: 'venta' as const, negocio: 'productos' as const, moneda: 'USD' as const, precioUnitario: 100, costoUnitario: 50 };
    const transaction = {
      get: vi.fn(async (reference: { path: string; id: string }) => ({
        id: reference.id, exists: () => true,
        data: () => reference.path.startsWith('products/') ? product : { ultimo: 1, estado: 'pendiente', items: [item], pagos: [], envio: { metodo: 'retiro', costo: 0 }, cliente: {} },
      })),
      set: vi.fn<(reference: { path: string }, data: Record<string, unknown>, options?: unknown) => void>(),
      update: vi.fn(), delete: vi.fn(),
    };
    mocks.runTransaction.mockImplementation(async (_db, action) => action(transaction));
    await products.searchAll();
    let result: { ok: boolean };
    if (operation === 'venta') result = await sales.crearVenta({ items: [item], envio: { metodo: 'retiro', costo: 0 }, pago: { usd: 100, ars: 0, medioArs: 'efectivo', tipoCambio: 0 }, canal: 'presencial' });
    else if (operation === 'anulacion') result = await sales.anular('v1');
    else if (operation === 'importacion') {
      const { importService } = await import('./importService');
      result = await importService.crearLote({ proveedor: 'Proveedor', fecha: new Date(), items: [{ productId: 'p1', nombre: 'Producto', cantidad: 2, moneda: 'USD' }] });
    } else if (operation.includes('regalo')) {
      const { regaloService } = await import('./regaloService');
      result = operation === 'regalo' ? await regaloService.registrar({ items: [{ productId: 'p1', cantidad: 1 }] }) : await regaloService.actualizar('r1', { items: [{ productId: 'p1', cantidad: 2 }] });
    } else if (operation === 'reserva' || operation === 'cancelar-reserva') {
      const { cuentaCobrarService } = await import('./cuentaCobrarService');
      result = operation === 'reserva' ? await cuentaCobrarService.crear({ items: [item], cliente: { nombre: 'Cliente' }, canal: 'presencial', envio: { metodo: 'retiro', costo: 0 } }) : await cuentaCobrarService.cancelar('c1');
    } else if (operation === 'editar-producto') result = await products.update('p1', { ...productInput, stock: 1, stockMinimo: 2 });
    else if (operation === 'desactivar') result = await products.setActivo('p1', false);
    else result = await products.remove('p1');
    expect(result.ok).toBe(true);
    if (expected === 'set') {
      const write = transaction.set.mock.calls.find(([reference]) => reference.path === 'stockBajo/p1');
      expect(write?.[1].stock).toBe(afterStock);
    } else expect(transaction.delete).toHaveBeenCalledWith(expect.objectContaining({ path: 'stockBajo/p1' }));
    await products.searchAll();
    expect(mocks.getDocs).toHaveBeenCalledTimes(2);
  });

  it('incluye un producto nuevo con stock bajo en el mismo batch que el alta', async () => {
    await products.create({ ...productInput, stockMinimo: 2 });
    expect(mocks.batch.set).toHaveBeenCalledWith(expect.objectContaining({ path: 'stockBajo/generated' }), expect.objectContaining({ stock: 1, stockMinimo: 2 }));
    expect(mocks.batch.commit).toHaveBeenCalledOnce();
  });
});

afterEach(() => vi.useRealTimers());

describe('reducción de lecturas de productos', () => {
  it('reutiliza una sola lectura completa para búsquedas consecutivas y simultáneas', async () => {
    await Promise.all([products.searchAll({ negocio: 'productos' }), products.searchAll({ negocio: 'productos' })]);
    await products.searchAll({ negocio: 'productos' });
    expect(mocks.getDocs).toHaveBeenCalledOnce();
  });

  it('no mezcla productos públicos, inventario ni unidades diferentes', async () => {
    await products.searchAll({ soloActivos: true });
    await products.searchAll({ negocio: 'productos' });
    await products.searchAll({ negocio: 'accesorios' });
    expect(mocks.getDocs).toHaveBeenCalledTimes(3);
  });

  it.each(['setActivo', 'remove'] as const)('invalida la búsqueda al ejecutar %s', async (method) => {
    await products.searchAll();
    if (method === 'setActivo') await products.setActivo('p1', false);
    else await products.remove('p1');
    await products.searchAll();
    expect(mocks.getDocs).toHaveBeenCalledTimes(2);
  });

  it.each(['create', 'update'] as const)('invalida la búsqueda al ejecutar %s', async (method) => {
    await products.searchAll();
    if (method === 'create') await products.create(productInput);
    else await products.update('p1', productInput);
    await products.searchAll();
    expect(mocks.getDocs).toHaveBeenCalledTimes(2);
  });

  it('invalida la búsqueda cuando llegan actualizaciones del catálogo en vivo', async () => {
    vi.useFakeTimers();
    await products.searchAll({ soloActivos: true });
    const unsubscribe = products.subscribeActive(vi.fn(), vi.fn());
    mocks.onSnapshot.mock.calls[0][1]({ docs: [] });
    await products.searchAll({ soloActivos: true });
    expect(mocks.getDocs).toHaveBeenCalledTimes(2);
    unsubscribe();
    vi.advanceTimersByTime(30_000);
  });
});

describe('reducción de lecturas del historial de ventas', () => {
  it('busca montos cobrados por moneda sin descargar el historial ni necesitar otro indice compuesto', async () => {
    await sales.getByAmount(5700, 'ARS');
    await sales.getByAmount(5700, 'ARS');
    expect(mocks.getDocs).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledWith('pago.ars', '>=', 5699.995);
    expect(where).toHaveBeenCalledWith('pago.ars', '<', 5700.005);
    await sales.getByAmount(5700, 'USD');
    expect(where).toHaveBeenCalledWith('pago.usd', '>=', 5699.995);
    expect(mocks.getDocs).toHaveBeenCalledTimes(2);
    await sales.getByAmount(5700, 'USD', true);
    expect(mocks.getDocs).toHaveBeenCalledTimes(3);
  });

  it('rechaza montos invalidos sin consultar Firestore y permite buscar cero', async () => {
    for (const amount of [-1, NaN, Infinity, Number.MAX_VALUE]) expect((await sales.getByAmount(amount, 'ARS')).ok).toBe(false);
    expect(mocks.getDocs).not.toHaveBeenCalled();
    expect((await sales.getByAmount(0, 'ARS')).ok).toBe(true);
    expect(where).toHaveBeenCalledWith('pago.ars', '>=', -0.005);
  });

  it('encuentra centavos afectados por coma flotante sin incluir montos de otro centavo', async () => {
    mocks.getDocs.mockResolvedValueOnce({ docs: [
      { id: 'exacta', data: () => ({ pago: { ars: 0.1 + 0.2 } }) },
      { id: 'distinta', data: () => ({ pago: { ars: 0.31 } }) },
    ] });
    const result = await sales.getByAmount(0.3, 'ARS');
    expect(result.ok && result.data.map((item) => item.id)).toEqual(['exacta']);
    expect(where).toHaveBeenCalledWith('pago.ars', '>=', 0.295);
    expect(where).toHaveBeenCalledWith('pago.ars', '<', 0.305);
  });

  it('mantiene la busqueda selectiva mientras se construye el indice compuesto', async () => {
    mocks.getDocs.mockRejectedValueOnce({ code: 'failed-precondition' }).mockResolvedValueOnce({ docs: [
      { id: 'v1', data: () => ({ creado: { seconds: 1, nanoseconds: 0 } }) },
      { id: 'v2', data: () => ({ creado: { seconds: 2, nanoseconds: 0 } }) },
    ] });
    const result = await sales.getByProduct('p1');
    expect(result.ok && result.data.map((item) => item.id)).toEqual(['v2', 'v1']);
    expect(mocks.getDocs).toHaveBeenCalledTimes(2);
    expect(mocks.getDocs.mock.calls[0][0]).toHaveLength(3);
    expect(mocks.getDocs.mock.calls[1][0]).toHaveLength(2);
    expect(where).toHaveBeenCalledWith('productIds', 'array-contains', 'p1');
  });

  it('consulta solo las ventas del producto con array-contains y reutiliza el resultado', async () => {
    await sales.getByProduct('p1');
    await sales.getByProduct('p1');
    expect(where).toHaveBeenCalledWith('productIds', 'array-contains', 'p1');
    expect(mocks.getDocs).toHaveBeenCalledOnce();
    await sales.getByProduct('p2');
    expect(mocks.getDocs).toHaveBeenCalledTimes(2);
    await sales.getByProduct('p1', true);
    expect(mocks.getDocs).toHaveBeenCalledTimes(3);
  });

  it('no consulta Firestore sin un producto seleccionado', async () => {
    expect((await sales.getByProduct('  ')).ok).toBe(false);
    expect(mocks.getDocs).not.toHaveBeenCalled();
  });

  it('reutiliza el historial al cambiar de producto y fuerza una lectura al actualizar', async () => {
    await Promise.all([sales.getAll(), sales.getAll()]);
    await sales.getAll();
    expect(mocks.getDocs).toHaveBeenCalledOnce();
    await sales.getAll(true);
    expect(mocks.getDocs).toHaveBeenCalledTimes(2);
  });

  it('separa la caché por usuario autenticado', async () => {
    await sales.getAll();
    mocks.auth.currentUser = { uid: 'otro-admin' };
    await sales.getAll();
    expect(mocks.getDocs).toHaveBeenCalledTimes(2);
  });

  it('invalida las ventas después de facturar', async () => {
    await sales.getAll();
    await sales.registrarFactura('v1', '0001-001', '123');
    await sales.getAll();
    expect(mocks.getDocs).toHaveBeenCalledTimes(2);
  });

  it('invalida ventas y stock después de anular una venta', async () => {
    await sales.getAll();
    await products.searchAll();
    await sales.anular('v1');
    await sales.getAll();
    await products.searchAll();
    expect(mocks.getDocs).toHaveBeenCalledTimes(4);
  });

  it('invalida ventas y stock después de registrar una venta', async () => {
    await sales.getAll();
    await products.searchAll();
    await sales.crearVenta({
      items: [{ productId: 'p1', nombre: 'Producto', negocio: 'productos', moneda: 'USD', tipo: 'venta', cantidad: 1, precioUnitario: 100, costoUnitario: 50 }],
      envio: { metodo: 'retiro', costo: 0 }, pago: { usd: 100, ars: 0, medioArs: 'efectivo', tipoCambio: 0 }, canal: 'presencial',
    });
    await sales.getAll();
    await products.searchAll();
    expect(mocks.getDocs).toHaveBeenCalledTimes(4);
  });

  it('guarda los IDs unicos de productos vendidos y bonificados, excluyendo cantidades cero', async () => {
    const transaction = {
      get: vi.fn(async () => ({ exists: () => true, data: () => ({ stock: 10, ultimo: 40 }) })),
      set: vi.fn<(reference: unknown, data: Record<string, unknown>, options?: unknown) => void>(), update: vi.fn(),
    };
    mocks.runTransaction.mockImplementationOnce(async (_db, operation) => operation(transaction));
    const base = { nombre: 'Producto', negocio: 'productos' as const, moneda: 'USD' as const, cantidad: 1, precioUnitario: 100, costoUnitario: 50 };
    const result = await sales.crearVenta({
      items: [
        { ...base, productId: 'p1', tipo: 'venta' },
        { ...base, productId: 'p1', tipo: 'venta' },
        { ...base, productId: 'p2', tipo: 'bonificacion' },
        { ...base, productId: 'p3', tipo: 'venta', cantidad: 0 },
      ],
      envio: { metodo: 'retiro', costo: 0 }, pago: { usd: 200, ars: 0, medioArs: 'efectivo', tipoCambio: 0 }, canal: 'presencial',
    });
    expect(result.ok).toBe(true);
    const saved = transaction.set.mock.calls.find((call) => call[1]?.items)?.[1];
    expect(saved?.productIds).toEqual(['p1', 'p2']);
  });

  it('indexa tambien las ventas convertidas de cuentas a cobrar e invalida la busqueda', async () => {
    const { cuentaCobrarService } = await import('./cuentaCobrarService');
    const base = { productId: 'p1', nombre: 'Producto', negocio: 'productos', moneda: 'USD', tipo: 'venta', cantidad: 1, precioUnitario: 100, costoUnitario: 50 };
    const transaction = {
      get: vi.fn(async () => ({ id: 'cuenta-1', exists: () => true, data: () => ({ estado: 'pagada', fechaCompleta: {}, items: [base, base], pagos: [], envio: { metodo: 'retiro', costo: 0 }, cliente: {}, ultimo: 40 }) })),
      set: vi.fn<(reference: unknown, data: Record<string, unknown>, options?: unknown) => void>(), update: vi.fn(),
    };
    mocks.runTransaction.mockImplementationOnce(async (_db, operation) => operation(transaction));
    await sales.getByProduct('p1');
    const result = await cuentaCobrarService.convertirEnVenta('cuenta-1');
    expect(result.ok).toBe(true);
    const saved = transaction.set.mock.calls.find((call) => call[1]?.items)?.[1];
    expect(saved?.productIds).toEqual(['p1']);
    await sales.getByProduct('p1');
    expect(mocks.getDocs).toHaveBeenCalledTimes(2);
  });
});