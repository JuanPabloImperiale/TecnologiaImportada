import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  collection: vi.fn(() => 'regalos'),
  getDocs: vi.fn(),
  limit: vi.fn((size: number) => ({ type: 'limit', size })),
  orderBy: vi.fn((field: string, direction: string) => ({ type: 'orderBy', field, direction })),
  query: vi.fn((...constraints: unknown[]) => constraints),
  startAfter: vi.fn((cursor: unknown) => ({ type: 'startAfter', cursor })),
  fromDate: vi.fn((date: Date) => ({ date })),
  where: vi.fn((field: string, operator: string, value: unknown) => ({ type: 'where', field, operator, value })),
}));

vi.mock('firebase/firestore', () => ({
  collection: mocks.collection,
  deleteField: vi.fn(),
  doc: vi.fn(),
  getDocs: mocks.getDocs,
  limit: mocks.limit,
  onSnapshot: vi.fn(),
  orderBy: mocks.orderBy,
  query: mocks.query,
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  startAfter: mocks.startAfter,
  Timestamp: { fromDate: mocks.fromDate },
  where: mocks.where,
}));

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('./productService', () => ({ invalidateProductSearchCache: vi.fn() }));

import { regaloService } from './regaloService';

describe('regaloService.getPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('limits the page query to the selected month', async () => {
    mocks.getDocs.mockResolvedValue({ docs: [] });

    const result = await regaloService.getPage(30, '2026-10');

    expect(result.ok).toBe(true);
    expect(mocks.fromDate).toHaveBeenNthCalledWith(1, new Date(2026, 9, 1));
    expect(mocks.fromDate).toHaveBeenNthCalledWith(2, new Date(2026, 10, 1));
    expect(mocks.where).toHaveBeenNthCalledWith(1, 'creado', '>=', { date: new Date(2026, 9, 1) });
    expect(mocks.where).toHaveBeenNthCalledWith(2, 'creado', '<', { date: new Date(2026, 10, 1) });
    expect(mocks.orderBy).toHaveBeenCalledWith('creado', 'desc');
  });
});