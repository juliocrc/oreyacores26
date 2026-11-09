import { NextRequest } from 'next/server';
import { POST, PUT } from '@/app/api/inspecoes/route';
import { saveInspection } from '@/app/inspecoes/actions';
import prisma from '../prisma';
import { EditConflictError } from '../edit-conflict';
import { saveInspectionSnapshot } from '../inspection-snapshots';

jest.mock('@/app/inspecoes/actions', () => ({ saveInspection: jest.fn() }));
jest.mock('../prisma', () => ({ __esModule: true, default: {
  inspecao: { findUnique: jest.fn() }, ordemServico: { update: jest.fn() },
} }));
jest.mock('../inspection-snapshots', () => ({ saveInspectionSnapshot: jest.fn() }));
jest.mock('../access-control', () => ({ getAccessContext: jest.fn() }));
jest.mock('../docs-por-enviar', () => ({ ensureDocumentoPorEnviar: jest.fn() }));
jest.mock('../observability', () => ({ beginApiRequest: jest.fn(() => ({})), finishApiRequest: jest.fn(), captureApiError: jest.fn(), withRequestId: (response: Response) => response }));

const token = '2026-10-01T00:00:00.000Z';
const request = () => new NextRequest('http://localhost/api/inspecoes?id=10', { method: 'PUT', body: JSON.stringify({ date: '2026-10-01', raftId: 1, ordemId: 3, expectedUpdatedAt: token, expectedRaftUpdatedAt: token }) });

beforeEach(() => jest.clearAllMocks());

it.each([POST, PUT])('returns EDIT_CONFLICT without reopening or downstream side effects', async handler => {
  jest.mocked(saveInspection).mockRejectedValue(new EditConflictError());
  const response = await handler(request());
  expect(response.status).toBe(409);
  const body = await response.json();
  expect(body.code).toBe('EDIT_CONFLICT');
  expect(body.requerReabertura).toBeUndefined();
  expect(prisma.ordemServico.update).not.toHaveBeenCalled();
  expect(prisma.inspecao.findUnique).not.toHaveBeenCalled();
  expect(saveInspectionSnapshot).not.toHaveBeenCalled();
});

it('returns the committed token, not the version of a later concurrent reread', async () => {
  jest.mocked(saveInspection).mockResolvedValue({ id: 10, updatedAt: new Date(token), raftUpdatedAt: new Date(token), certificadoNumero: 'AZ26-001', artigosSubstituidosCount: 0, stockWarnings: [] });
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValue({ id: 10, updatedAt: new Date('2026-10-02'), status: 'Draft' } as never);
  const response = await PUT(new NextRequest('http://localhost/api/inspecoes?id=10', { method: 'PUT', body: JSON.stringify({ date: '2026-10-01' }) }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ id: 10, updatedAt: token, raftUpdatedAt: token });
});
