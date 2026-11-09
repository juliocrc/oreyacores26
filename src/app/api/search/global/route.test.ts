import { NextRequest, NextResponse } from 'next/server';
import { GET } from './route';
import { getDashboardScope } from '@/lib/dashboard-access';
import prisma from '@/lib/prisma';

jest.mock('@/lib/dashboard-access', () => ({ getDashboardScope: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: Object.fromEntries(
  ['jangada', 'navio', 'cliente', 'colete', 'epirb', 'fatoImersao', 'stock', 'fatura', 'ordemServico'].map(key => [key, { findMany: jest.fn(async () => []) }]),
) }));
const request = () => new NextRequest('http://localhost/api/search/global?q=teste');
beforeEach(() => jest.clearAllMocks());

it('rejects unauthenticated requests without querying', async () => {
  jest.mocked(getDashboardScope).mockResolvedValue({ error: NextResponse.json({ error: 'Sessão obrigatória' }, { status: 401 }) } as never);
  expect((await GET(request())).status).toBe(401);
  expect(prisma.jangada.findMany).not.toHaveBeenCalled();
});
it('only queries permitted modules and restricts the station', async () => {
  jest.mocked(getDashboardScope).mockResolvedValue({ access: { isAdmin: false, permissions: { visibleModules: ['jangadas'], visiblePages: ['/jangadas'] } }, where: { serviceStationId: { in: [3] } } } as never);
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(prisma.jangada.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { serviceStationId: { in: [3] } } }));
  expect(prisma.cliente.findMany).not.toHaveBeenCalled();
  expect(prisma.stock.findMany).not.toHaveBeenCalled();
  expect(prisma.navio.findMany).not.toHaveBeenCalled();
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
it('limits equipment to ships in the authorised station', async () => {
  jest.mocked(getDashboardScope).mockResolvedValue({ access: { isAdmin: false, permissions: { visibleModules: ['equipamentos'], visiblePages: ['/equipamentos'] } }, where: { serviceStationId: 3 } } as never);
  jest.mocked(prisma.navio.findMany).mockResolvedValue([{ id: 7 }] as never);
  await GET(request());
  expect(prisma.colete.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { shipId: { in: [7] } } }));
  expect(prisma.epirb.findMany).not.toHaveBeenCalled();
});
