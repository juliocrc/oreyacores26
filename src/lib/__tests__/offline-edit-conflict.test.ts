import { enqueueOfflineSyncOperation, flushOfflineSyncQueue, getOfflineSyncQueue, importLegacyOfflineInspections } from '../offline-sync/client';

beforeEach(() => {
  const items = new Map<string, string>();
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => items.set(key, value),
    removeItem: (key: string) => items.delete(key),
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage, dispatchEvent: jest.fn() } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  Object.defineProperty(globalThis, 'CustomEvent', { configurable: true, value: jest.fn() });
  jest.useFakeTimers();
  global.fetch = jest.fn();
});
afterEach(() => jest.useRealTimers());

it('preserves a conflicting operation and its original token without automatic replay', async () => {
  const body = { expectedUpdatedAt: '2026-10-01T00:00:00.000Z', owner: 'LOCAL' };
  const queued = enqueueOfflineSyncOperation({ path: '/api/jangadas/1', method: 'PUT', body });
  (fetch as jest.Mock).mockResolvedValue({ ok: true, text: async () => JSON.stringify({ ok: false, results: [
    { id: queued!.id, ok: false, status: 409, body: { code: 'EDIT_CONFLICT' }, error: 'Conflito' },
  ] }) });
  await flushOfflineSyncQueue();
  expect(getOfflineSyncQueue()).toEqual([expect.objectContaining({ body, failedPermanently: true })]);
  await flushOfflineSyncQueue();
  jest.advanceTimersByTime(600000);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(getOfflineSyncQueue()[0].body).toEqual(body);
});

it('keeps unversioned shipped drafts locally instead of replaying blind writes', async () => {
  enqueueOfflineSyncOperation({ path: '/api/jangadas/1', method: 'PUT', body: { owner: 'OLD LOCAL' } });
  await flushOfflineSyncQueue();
  expect(fetch).not.toHaveBeenCalled();
  expect(getOfflineSyncQueue()).toEqual([expect.objectContaining({ failedPermanently: true, body: { owner: 'OLD LOCAL' } })]);
  const legacy = [{ jangadaId: 1, payload: { owner: 'LEGACY' } }];
  localStorage.setItem('offline_inspections', JSON.stringify(legacy));
  expect(importLegacyOfflineInspections()).toBe(0);
  expect(JSON.parse(localStorage.getItem('offline_inspections')!)).toEqual(legacy);
});
