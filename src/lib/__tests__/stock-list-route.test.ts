import { NextRequest } from 'next/server';
import { GET } from '@/app/api/stock/route';
import { getAccessContext, type AccessContext } from '../access-control';
import { canEditPath, canViewPath } from '../user-permissions';
import prisma from '../prisma';

jest.mock('../access-control', () => ({ getAccessContext: jest.fn() }));
jest.mock('../user-permissions', () => ({ canEditPath: jest.fn(), canViewPath: jest.fn() }));
jest.mock('../prisma', () => ({
  __esModule: true,
  default: { stock: { findMany: jest.fn(), count: jest.fn() } },
}));
jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  existsSync: jest.fn(() => false),
}));

const access: AccessContext = {
  userId: 1,
  email: 'stock@example.test',
  role: 'USER',
  isAdmin: false,
  stationId: null,
  allowedStationIds: [7, 8],
  permissions: {
    visibleModules: [], visiblePages: ['/stock'], editablePages: [],
    editableFields: {}, allowedStationCodes: [],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAccessContext).mockResolvedValue(access);
  jest.mocked(canViewPath).mockReturnValue(true);
  jest.mocked(canEditPath).mockReturnValue(false);
  jest.mocked(prisma.stock.findMany).mockResolvedValue([]);
  jest.mocked(prisma.stock.count).mockResolvedValue(0);
});

it.each(['', '?paginated=1'])('preserves physical row identities and quantities for %s', async query => {
  // Read-path regression fixture, not a claim that the schema permits new duplicate references.
  const rows = [
    { id: 22, referencia: 'REF-1', descricao: 'Article', categoria: null, codigoFabricante: null,
      foto: null, serviceStationId: 7, lote: 'LOT-B', validade: '2028-10-01',
      quantidade: 9, quantidadeReservada: 3, codigoBarras: 'BAR-B' },
    { id: 21, referencia: 'REF-1', descricao: 'Article', categoria: null, codigoFabricante: null,
      foto: null, serviceStationId: 7, lote: 'LOT-A', validade: '2027-10-01',
      quantidade: 5, quantidadeReservada: 1, codigoBarras: 'BAR-A' },
  ];
  jest.mocked(prisma.stock.findMany).mockResolvedValue(rows as never);
  jest.mocked(prisma.stock.count).mockResolvedValue(2);

  const response = await GET(new NextRequest(`http://localhost/api/stock${query}`));
  expect(response.status).toBe(200);
  const body = await response.json();
  const items = query ? body.items : body;
  expect(items).toHaveLength(2);
  expect(items).toEqual(rows.map(row => expect.objectContaining({
    ...row, nome: row.descricao, categoria: 'DIVERSOS',
  })));
  expect(prisma.stock.findMany).toHaveBeenCalledWith(expect.objectContaining({
    select: expect.objectContaining({
      id: true, referencia: true, lote: true, validade: true, quantidade: true,
      quantidadeReservada: true, codigoBarras: true, serviceStationId: true,
    }),
  }));
  if (query) expect(body.total).toBe(2);
});

it.each(['', '?paginated=1'])('combines lot search with active station scope for %s', async query => {
  const req = new NextRequest(`http://localhost/api/stock${query || '?'}${query ? '&' : ''}busca=%20LOT-A%20`, {
    headers: { cookie: 'active_service_station_id=7' },
  });
  expect((await GET(req)).status).toBe(200);
  const where = {
    OR: [{ serviceStationId: 7 }, { serviceStationId: null }],
    AND: [{ OR: [
      { referencia: { contains: 'LOT-A' } },
      { descricao: { contains: 'LOT-A' } },
      { codigoFabricante: { contains: 'LOT-A' } },
      { codigoBarras: { contains: 'LOT-A' } },
      { lote: { contains: 'LOT-A' } },
    ] }],
    estadoArtigo: { not: 'INATIVO' },
  };
  expect(prisma.stock.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
  if (query) expect(prisma.stock.count).toHaveBeenCalledWith({ where });
});

it.each([
  { allowedStationIds: [7, 8], cookie: '', stationIds: [7, 8] },
  { allowedStationIds: [7, 8], cookie: 'active_service_station_id=99', stationIds: [7, 8] },
  { allowedStationIds: [], cookie: '', stationIds: [-1] },
])('keeps allowed station scope with $allowedStationIds and cookie "$cookie"', async ({ allowedStationIds, cookie, stationIds }) => {
  jest.mocked(getAccessContext).mockResolvedValue({ ...access, allowedStationIds });
  const response = await GET(new NextRequest('http://localhost/api/stock?busca=LOT-A', {
    headers: { cookie },
  }));
  expect(response.status).toBe(200);
  expect(prisma.stock.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      OR: [{ serviceStationId: { in: stationIds } }, { serviceStationId: null }],
      AND: expect.arrayContaining([expect.objectContaining({
        OR: expect.arrayContaining([{ lote: { contains: 'LOT-A' } }]),
      })]),
    }),
  }));
});

it('requires authentication before querying stock', async () => {
  jest.mocked(getAccessContext).mockResolvedValue(null);
  expect((await GET(new NextRequest('http://localhost/api/stock'))).status).toBe(401);
  expect(prisma.stock.findMany).not.toHaveBeenCalled();
  expect(prisma.stock.count).not.toHaveBeenCalled();
});

it('requires stock view or edit permission before querying stock', async () => {
  jest.mocked(canViewPath).mockReturnValue(false);
  expect((await GET(new NextRequest('http://localhost/api/stock'))).status).toBe(403);
  expect(prisma.stock.findMany).not.toHaveBeenCalled();
  expect(prisma.stock.count).not.toHaveBeenCalled();
});
