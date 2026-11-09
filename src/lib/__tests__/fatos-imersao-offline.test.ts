import { enqueueOfflineSyncOperation, getOfflineSyncQueue, performOfflineAwareJsonRequest } from '../offline-sync/client';

beforeEach(() => {
  const items = new Map<string, string>();
  const storage = { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value), removeItem: (key: string) => items.delete(key) };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage, dispatchEvent: jest.fn() } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  Object.defineProperty(globalThis, 'CustomEvent', { configurable: true, value: jest.fn() });
});

it('mantém a rastreabilidade na operação em fila', async () => {
  const body = { trace: { manualReferencia: 'Manual', manualRevisao: '1', equipamentoEnsaio: 'A' }, leakResultado: 'OK' };
  const result = await performOfflineAwareJsonRequest({ path: '/api/fatos-imersao/42/verificacoes', method: 'POST', body });
  expect(result.queued).toBe(true);
  expect(getOfflineSyncQueue()[0].body).toEqual(body);
});

it('assinala erro em vez de indicar gravação quando a fila está cheia', async () => {
  for (let i = 0; i < 200; i++) enqueueOfflineSyncOperation({ path: '/api/test', method: 'POST' });
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(performOfflineAwareJsonRequest({ path: '/api/fatos-imersao/42/verificacoes', method: 'POST', body: {} })).rejects.toThrow('fila offline está cheia');
  warning.mockRestore();
});
