import { NextRequest } from 'next/server';
import { GET } from './route';
import prisma from '@/lib/prisma';
import { getAccessContext } from '@/lib/access-control';
import { buildVisibleServiceStationWhere } from '@/lib/service-station-visibility';

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {
  serviceStation: { findMany: jest.fn(async () => []) }, tecnico: { findMany: jest.fn(async () => []) },
} }));
jest.mock('@/lib/access-control', () => ({ getAccessContext: jest.fn() }));
jest.mock('@/lib/station-selection', () => ({ resolveActiveServiceStationId: jest.fn(() => 5) }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, allowedStationIds: [2, 5] } as never);
});

it('allows an explicitly requested permitted raft station rather than the unrelated active cookie station', async () => {
  const response = await GET(new NextRequest('http://localhost/api/tecnicos?serviceStationId=2'));
  expect(response.status).toBe(200);
  expect(prisma.serviceStation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: buildVisibleServiceStationWhere({ id: 2 }) }));
  expect(await response.json()).toMatchObject({ activeStationId: 2 });
});

it.each([['3', 403], ['0', 400], ['bad', 400]])('rejects forbidden or invalid station %s', async (station, status) => {
  const response = await GET(new NextRequest(`http://localhost/api/tecnicos?serviceStationId=${station}`));
  expect(response.status).toBe(status);
  expect(prisma.serviceStation.findMany).not.toHaveBeenCalled();
});

it('preserves existing cookie-scoped directory behavior when no station is requested', async () => {
  const response = await GET(new NextRequest('http://localhost/api/tecnicos'));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ activeStationId: 5 });
});
