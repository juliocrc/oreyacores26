import { GET } from './route';
import { getAuthSession } from '@/auth';
import prisma from '@/lib/prisma';

jest.mock('@/auth', () => ({ getAuthSession: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {
  navio: { findUnique: jest.fn() }, colete: { findMany: jest.fn() },
  fatoImersao: { findMany: jest.fn() }, epirb: { findMany: jest.fn() },
  extintor: { findMany: jest.fn() }, auditoria: { findMany: jest.fn() },
} }));

const request = new Request('http://localhost/api/portal/navios/10?clienteId=999');
const context = { params: Promise.resolve({ id: '10' }) };
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: '2', role: 'CLIENTE', clienteId: 7 } } as never);
  jest.mocked(prisma.navio.findUnique).mockResolvedValue({ id: 10, clienteId: 7, pirotecnicosBordoJson: '[]' } as never);
  for (const model of [prisma.colete, prisma.fatoImersao, prisma.epirb, prisma.extintor, prisma.auditoria]) jest.mocked(model.findMany).mockResolvedValue([]);
});

it('returns owned ship coletes with their actual model, serial and next inspection, not pending proposals', async () => {
  const item = { id: 22, serial: 'LJ-22', marca: 'Brand', modelo: 'Model', dataProxInspecao: '2020-02-29' };
  jest.mocked(prisma.colete.findMany).mockResolvedValue([item] as never);
  const response = await GET(request, context);
  expect(response.status).toBe(200);
  expect((await response.json()).equipamentos.coletes).toEqual([item]);
  expect(prisma.colete.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { shipId: 10 }, select: expect.objectContaining({ serial: true, modelo: true, dataProxInspecao: true }) }));
  expect(prisma.auditoria.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tabela: 'NavioDocumento', idRegisto: 10 } }));
});

it('does not query any equipment for another client ship', async () => {
  jest.mocked(prisma.navio.findUnique).mockResolvedValue({ id: 10, clienteId: 999 } as never);
  expect((await GET(request, context)).status).toBe(404);
  expect(prisma.colete.findMany).not.toHaveBeenCalled();
});

it('requires a session before querying ship or equipment data', async () => {
  jest.mocked(getAuthSession).mockResolvedValue(null);
  expect((await GET(request, context)).status).toBe(401);
  expect(prisma.navio.findUnique).not.toHaveBeenCalled();
  expect(prisma.colete.findMany).not.toHaveBeenCalled();
});
