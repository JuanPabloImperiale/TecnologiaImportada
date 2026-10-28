import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  app: {}, auth: {}, db: {}, manager: {}, cache: {},
  initializeFirestore: vi.fn(), persistentLocalCache: vi.fn(), persistentMultipleTabManager: vi.fn(),
}));

vi.mock('firebase/app', () => ({ initializeApp: () => mocks.app }));
vi.mock('firebase/auth', () => ({ getAuth: () => mocks.auth }));
vi.mock('firebase/firestore', () => ({
  initializeFirestore: mocks.initializeFirestore,
  persistentLocalCache: mocks.persistentLocalCache,
  persistentMultipleTabManager: mocks.persistentMultipleTabManager,
}));
vi.mock('firebase/analytics', () => ({ isSupported: async () => false, getAnalytics: vi.fn() }));

afterEach(() => vi.unstubAllEnvs());

it('initializes Firestore with persistent cache shared across tabs', async () => {
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-key');
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
  vi.stubEnv('VITE_FIREBASE_APPCHECK_SITE_KEY', '');
  mocks.persistentMultipleTabManager.mockReturnValue(mocks.manager);
  mocks.persistentLocalCache.mockReturnValue(mocks.cache);
  mocks.initializeFirestore.mockReturnValue(mocks.db);

  const { db } = await import('./firebase');

  expect(mocks.persistentMultipleTabManager).toHaveBeenCalledOnce();
  expect(mocks.persistentLocalCache).toHaveBeenCalledWith({ tabManager: mocks.manager });
  expect(mocks.initializeFirestore).toHaveBeenCalledWith(mocks.app, { localCache: mocks.cache });
  expect(db).toBe(mocks.db);
});