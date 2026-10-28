import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  collection: vi.fn((_db: unknown, name: string) => name),
  getDocs: vi.fn(),
  limit: vi.fn((count: number) => ({ type: 'limit', count })),
  orderBy: vi.fn((field: string, direction: string) => ({ type: 'orderBy', field, direction })),
  query: vi.fn((...constraints: unknown[]) => constraints),
  runTransaction: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: mocks.collection,
  doc: vi.fn(),
  getDocs: mocks.getDocs,
  increment: vi.fn(),
  limit: mocks.limit,
  orderBy: mocks.orderBy,
  query: mocks.query,
  runTransaction: mocks.runTransaction,
  serverTimestamp: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null } }));
vi.mock('@/services/movimientosService', () => ({ registrarMovimiento: vi.fn() }));
vi.mock('./productService', () => ({ invalidateProductSearchCache: vi.fn() }));

import { importService } from './importService';

describe('importService.getRecentBatches', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the latest batches ordered by arrival date and maps document ids', async () => {
    const batch = {
      proveedor: 'Proveedor A',
      fecha: new Date(2026, 9, 7),
      items: [{ productId: 'p1', nombre: 'Cargador', cantidad: 2, costo: 100, moneda: 'ARS' }],
    };
    mocks.getDocs.mockResolvedValue({ docs: [{ id: 'lote1', data: () => batch }] });

    const result = await importService.getRecentBatches();

    expect(result).toEqual({ ok: true, data: [{ id: 'lote1', ...batch }] });
    expect(mocks.collection).toHaveBeenCalledWith({}, 'importBatches');
    expect(mocks.orderBy).toHaveBeenCalledWith('fecha', 'desc');
    expect(mocks.limit).toHaveBeenCalledWith(20);
  });
});