import { NextRequest, NextResponse } from 'next/server';
import { POST } from './route';
import { POST as requestCode } from '../client-code/route';
import prisma from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limit';

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {
  cliente: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() }, pedidoAssistencia: { create: jest.fn() },
} }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimit: jest.fn() }));
jest.mock('../client-code/route', () => ({ POST: jest.fn() }));
const data = { nome: 'Owner', nif: '501117334', email: 'owner@example.test', phone: '912345678' };
const client = { id: 7, nome: data.nome, email: data.email, telmovel: data.phone, telefone: null, serviceStationId: 2 };
const request = (body: unknown = data) => POST(new NextRequest('http://localhost/api/auth/client-registration', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(checkRateLimit).mockResolvedValue({ allowed: true, status: 200 } as never);
  jest.mocked(prisma.cliente.findUnique).mockResolvedValue(client as never);
  jest.mocked(prisma.pedidoAssistencia.create).mockResolvedValue({ id: 9 } as never);
  jest.mocked(requestCode).mockImplementation(async () => NextResponse.json({ success: true }));
});
it('sends to the existing matching contact without updating or duplicating clients', async () => {
  expect((await request()).status).toBe(200);
  const forwarded = jest.mocked(requestCode).mock.calls[0][0];
  expect(await forwarded.json()).toEqual({ email: client.email, nif: data.nif });
  expect(prisma.cliente.update).not.toHaveBeenCalled();
  expect(prisma.cliente.create).not.toHaveBeenCalled();
});
it('never accepts a NIF alone as proof for replacing contacts', async () => {
  const response = await request({ ...data, email: 'new@example.test', phone: '919999999' });
  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({ registrationPending: true, assistanceRequested: true });
  expect(requestCode).not.toHaveBeenCalled();
  expect(prisma.cliente.update).not.toHaveBeenCalled();
  expect(prisma.pedidoAssistencia.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    serviceStationId: 2, origem: 'portal_acesso', descricao: expect.stringContaining('Nenhum contacto existente foi substituido'),
  }) }));
});
it('keeps unknown registrations for team validation without creating an authenticated client', async () => {
  jest.mocked(prisma.cliente.findUnique).mockResolvedValue(null);
  expect((await request()).status).toBe(202);
  expect(prisma.cliente.create).not.toHaveBeenCalled();
  expect(requestCode).not.toHaveBeenCalled();
});
it('uses the registered phone for lookup when email is missing, with update only after login', async () => {
  jest.mocked(prisma.cliente.findUnique).mockResolvedValue({ ...client, email: null } as never);
  jest.mocked(requestCode).mockImplementation(async () => NextResponse.json({ success: false, manualDelivery: true }, { status: 202 }));
  const response = await request();
  expect(await response.json()).toMatchObject({ manualDelivery: true, verifyWithNif: true, updateAfterLogin: true });
  expect(await jest.mocked(requestCode).mock.calls[0][0].json()).toEqual({ phone: '+351912345678', nif: data.nif });
  expect(prisma.cliente.update).not.toHaveBeenCalled();
});
it('accepts a client with no email for assisted access', async () => {
  jest.mocked(prisma.cliente.findUnique).mockResolvedValue({ ...client, email: null } as never);
  expect((await request({ ...data, email: '' })).status).toBe(200);
  expect(requestCode).toHaveBeenCalled();
});
it.each([{ ...data, nome: '' }, { ...data, email: 'invalid', phone: '' }, { ...data, email: '', phone: '' }])('rejects incomplete registration', async body => {
  expect((await request(body)).status).toBe(400);
  expect(prisma.cliente.findUnique).not.toHaveBeenCalled();
});
it('does not write or send when rate limiting denies the request', async () => {
  jest.mocked(checkRateLimit).mockResolvedValue({ allowed: false, status: 429 } as never);
  expect((await request()).status).toBe(429);
  expect(prisma.pedidoAssistencia.create).not.toHaveBeenCalled();
  expect(requestCode).not.toHaveBeenCalled();
});
