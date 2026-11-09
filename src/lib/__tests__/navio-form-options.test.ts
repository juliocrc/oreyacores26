import { loadNavioClientOptions, loadNavioEquipmentOptions, loadNavioFormOptions, updateNavioAssociation } from '../navio-form-options';

const originalFetch = global.fetch;
const fetchMock = jest.fn();
const signal = new AbortController().signal;
const response = (data: unknown, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => data });

beforeEach(() => { global.fetch = fetchMock; fetchMock.mockReset(); });
afterAll(() => { global.fetch = originalFetch; });

it('starts all equipment reads before any response resolves and preserves available/current records', async () => {
  const resolvers: Array<(value: unknown) => void> = [];
  fetchMock.mockImplementation(() => new Promise(resolve => resolvers.push(resolve)));
  const pending = loadNavioEquipmentOptions(7, signal);
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/api/jangadas?scope=all', '/api/coletes', '/api/epirbs']);
  for (const resolve of resolvers) resolve(response([
    { id: 1, serial: 'Z', shipId: null },
    { id: 2, serial: 'A', shipId: 7 },
    { id: 3, serial: 'B', shipId: 8 },
  ]));
  const data = await pending;
  for (const items of Object.values(data)) expect(items.map(item => item.id)).toEqual([2, 1]);
  for (const call of fetchMock.mock.calls) expect(call[1]).toEqual({ signal });
});

it('only offers unassigned equipment for a new ship', async () => {
  fetchMock.mockResolvedValue(response([{ id: 1, serial: 'A', shipId: 7 }, { id: 2, serial: 'B' }]));
  const data = await loadNavioEquipmentOptions(null, signal);
  expect(data.jangadas.map(item => item.id)).toEqual([2]);
});

it('sorts clients once on load without limiting results', async () => {
  const clients = Array.from({ length: 10001 }, (_, id) => ({ id, nome: id === 10000 ? 'A' : 'Z' }));
  fetchMock.mockResolvedValue(response(clients));
  const data = await loadNavioClientOptions(signal);
  expect(data).toHaveLength(10001);
  expect(data[0].id).toBe(10000);
});

it.each([response([], false), response({ error: 'invalid' })])('rejects failures instead of presenting empty options', async result => {
  fetchMock.mockResolvedValue(result);
  await expect(loadNavioFormOptions('/api/clientes', signal)).rejects.toThrow();
});

it('does not expose partial equipment results as a successful editable selection', async () => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(response([], url !== '/api/coletes')));
  await expect(loadNavioEquipmentOptions(7, signal)).rejects.toThrow('503');
});

it('propagates cancellation without substituting empty options', async () => {
  fetchMock.mockRejectedValue(new Error('aborted'));
  await expect(loadNavioClientOptions(signal)).rejects.toThrow('aborted');
});

it('reports HTTP failures when saving associations instead of silently succeeding', async () => {
  fetchMock.mockResolvedValue(response({}, false));
  await expect(updateNavioAssociation('/api/coletes/1', { method: 'PUT' })).rejects.toThrow('503');
});
