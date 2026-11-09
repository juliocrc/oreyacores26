import { NextRequest } from 'next/server';
import { GET } from './route';
import { getAuthSession } from '@/auth';
import prisma from '@/lib/prisma';

jest.mock('@/auth', () => ({ getAuthSession: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {
  cliente: { findUnique: jest.fn(), findFirst: jest.fn() }, navio: { findMany: jest.fn() },
  jangada: { findMany: jest.fn() }, ordemServico: { findMany: jest.fn() }, fatura: { findMany: jest.fn() },
} }));

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: 'user-7', role: 'CLIENTE', clienteId: 7 } } as never);
  jest.mocked(prisma.cliente.findUnique).mockResolvedValue({ id: 7, nome: 'Cliente' } as never);
  jest.mocked(prisma.navio.findMany).mockResolvedValue([]);
  jest.mocked(prisma.jangada.findMany).mockResolvedValue([]);
  jest.mocked(prisma.ordemServico.findMany).mockResolvedValue([]);
});

it('also limits the legacy portal invoice list to official PDFs owned by the session client', async () => {
  const base = { id: 10, numeroFatura: 'INTERNAL', dataEmissao: new Date(), valorTotal: 100, recibos: [], ordemServicos: [] };
  jest.mocked(prisma.fatura.findMany).mockResolvedValue([
    { ...base, metadados: '{}' },
    { ...base, metadados: JSON.stringify({ numeroFaturaOficial: 'REFERENCE-ONLY' }) },
    { ...base, metadados: JSON.stringify({ numeroFaturaOficial: 'NAV-10', pdfOficial: { key: 'SECRET', storage: 'local-dev', filename: 'official.pdf' } }) },
  ] as never);
  const response = await GET(new NextRequest('https://example.test/api/portal/cliente-auth?nif=other-client'));
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(prisma.cliente.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 } }));
  expect(prisma.cliente.findFirst).not.toHaveBeenCalled();
  expect(prisma.fatura.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clienteId: 7 } }));
  expect(data.faturas).toEqual([expect.objectContaining({ numeroFatura: 'NAV-10', faturaPdfUrl: '/api/portal/faturas/10/oficial' })]);
  for (const secret of ['INTERNAL', 'REFERENCE-ONLY', 'SECRET', 'local-dev', 'fatura-pdf']) expect(JSON.stringify(data)).not.toContain(secret);
});
