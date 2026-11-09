import { NextRequest } from 'next/server';
import { PATCH } from './route';
import prisma from '@/lib/prisma';
import { getAuthSession } from '@/auth';
import { checkRateLimit } from '@/lib/rate-limit';
jest.mock('@/auth', () => ({ getAuthSession: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { cliente: { findUnique: jest.fn(), updateMany: jest.fn() } } }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimit: jest.fn() }));
const request = (body: unknown = { email: 'new@example.test' }) => PATCH(new NextRequest('http://localhost/api/portal/dados-registo', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: '10', role: 'CLIENTE', clienteId: 7 } } as never);
  jest.mocked(checkRateLimit).mockResolvedValue({ allowed: true } as never);
  jest.mocked(prisma.cliente.findUnique).mockResolvedValue({ email: null, telmovel: '912345678' } as never);
  jest.mocked(prisma.cliente.updateMany).mockResolvedValue({ count: 1 });
});
it('requires authentication before adding email', async () => {
  jest.mocked(getAuthSession).mockResolvedValue(null);
  expect((await request()).status).toBe(401);
  expect(prisma.cliente.updateMany).not.toHaveBeenCalled();
});
it('does not allow a staff session to update a client by impersonation', async () => {
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: '1', role: 'ADMIN', clienteId: 7 } } as never);
  expect((await request()).status).toBe(403);
});
it('adds only missing email on the authenticated client and protects the previous value', async () => {
  expect((await request()).status).toBe(200);
  expect(prisma.cliente.updateMany).toHaveBeenCalledWith({ where: { id: 7, email: null }, data: { email: 'new@example.test' } });
});
it('cannot replace an existing email through this flow', async () => {
  jest.mocked(prisma.cliente.findUnique).mockResolvedValue({ email: 'old@example.test', telmovel: '912345678' } as never);
  expect((await request()).status).toBe(409);
  expect(prisma.cliente.updateMany).not.toHaveBeenCalled();
});
it('rejects targeting another client or adding extra profile fields', async () => {
  expect((await request({ email: 'new@example.test', clienteId: 999 })).status).toBe(400);
  expect(prisma.cliente.updateMany).not.toHaveBeenCalled();
});
it('detects a concurrent contact update without overwriting it', async () => {
  jest.mocked(prisma.cliente.updateMany).mockResolvedValue({ count: 0 });
  expect((await request()).status).toBe(409);
});
