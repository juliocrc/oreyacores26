import { NextRequest } from 'next/server';
import { GET } from '@/app/api/navios/route';
import { getAccessContext } from '../access-control';
import prisma from '../prisma';

jest.mock('../access-control', () => ({ getAccessContext: jest.fn() }));
jest.mock('../auditoria', () => ({ logAuditoria: jest.fn() }));
jest.mock('../station-selection', () => ({ resolveActiveServiceStationId: jest.fn() }));
jest.mock('../prisma', () => ({
  __esModule: true,
  default: {
    navio: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
    cliente: { findMany: jest.fn() },
  },
}));

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true } as never);
  jest.mocked(prisma.navio.count).mockResolvedValue(0);
  jest.mocked(prisma.navio.groupBy).mockResolvedValue([]);
  jest.mocked(prisma.cliente.findMany).mockResolvedValue([]);
});

it.each(['', '?lite=1', '?limite=10000'])('does not truncate records in the %s load path', async query => {
  const rows = Array.from({ length: 10001 }, (_, id) => ({ id, nome: `Navio ${id}`, matricula: '' }));
  jest.mocked(prisma.navio.findMany).mockResolvedValue(rows as never);
  const result = await GET(new NextRequest(`http://localhost/api/navios${query}`));
  expect(result.status).toBe(200);
  const body = await result.json();
  expect(Array.isArray(body) ? body : body.items).toHaveLength(10001);
  expect(jest.mocked(prisma.navio.findMany).mock.calls[0][0]?.take).toBeUndefined();
});

it('starts independent list, stats, port and client reads before awaiting the fleet', async () => {
  let finish!: (value: never) => void;
  jest.mocked(prisma.navio.findMany).mockImplementation(() => new Promise(resolve => { finish = resolve; }) as never);
  const pending = GET(new NextRequest('http://localhost/api/navios?limite=10000'));
  // Access context is resolved before the independent database reads start.
  await Promise.resolve();
  expect(prisma.navio.count).toHaveBeenCalledTimes(5);
  expect(prisma.navio.groupBy).toHaveBeenCalledTimes(3);
  expect(prisma.cliente.findMany).toHaveBeenCalledTimes(1);
  finish([] as never);
  expect((await pending).status).toBe(200);
});

it('requires authentication before loading any records', async () => {
  jest.mocked(getAccessContext).mockResolvedValue(null);
  expect((await GET(new NextRequest('http://localhost/api/navios?lite=1'))).status).toBe(401);
  expect(prisma.navio.findMany).not.toHaveBeenCalled();
});
