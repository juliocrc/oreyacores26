import { NextRequest } from 'next/server';
import { GET } from '@/app/api/jangadas/[id]/historico-equipamentos/route';
import { POST as addArticle } from '@/app/api/jangadas/[id]/artigos/route';
import { GET as replacementOptions, POST as replaceArticle } from '@/app/api/jangadas/substituir-artigo/route';
import { GET as hruOptions, POST as replaceHru } from '@/app/api/jangadas/substituir-hru/route';
import { POST as syncPack } from '@/app/api/jangadas/[id]/sync-pack/route';
import { getAccessContext } from '../access-control';
import prisma from '../prisma';

jest.mock('../access-control', () => ({ getAccessContext: jest.fn() }));
jest.mock('../user-permissions', () => ({ canEditPath: jest.fn(() => true) }));
jest.mock('../prisma', () => ({ __esModule: true, default: {
  jangada: { findUnique: jest.fn() }, auditoria: { findMany: jest.fn(), create: jest.fn() },
  artigoJangada: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
  stock: { findMany: jest.fn(), findFirst: jest.fn() }, inspecao: { findFirst: jest.fn() }, $transaction: jest.fn(),
} }));
jest.mock('../ordens-servico', () => ({ resolveLotStock: jest.fn() }));
jest.mock('../checklist-sync', () => ({ syncRaftArticlesWithPackType: jest.fn() }));
const context = { params: Promise.resolve({ id: '7' }) };
const request = (query = '', body?: object) => new NextRequest(`http://localhost/api/jangadas/7/historico-equipamentos${query}`, body ? { method: 'POST', body: JSON.stringify(body) } : undefined);

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAccessContext).mockResolvedValue({ email: 'ana@orey.pt', isAdmin: false, allowedStationIds: [3], permissions: {} } as never);
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ id: 7, serviceStationId: 3 } as never);
  const { canEditPath } = jest.requireMock('../user-permissions');
  canEditPath.mockReturnValue(true);
  jest.mocked(prisma.$transaction).mockImplementation((async (callback: (tx: typeof prisma) => unknown) => callback(prisma)) as never);
});

it('requires a session before querying history', async () => {
  jest.mocked(getAccessContext).mockResolvedValue(null);
  expect((await GET(request(), context)).status).toBe(401);
  expect(prisma.auditoria.findMany).not.toHaveBeenCalled();
});

it('blocks other stations across history, articles, replacement and pack endpoints', async () => {
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ id: 7, serviceStationId: 4 } as never);
  expect((await GET(request(), context)).status).toBe(403);
  expect((await addArticle(request('', {}), context)).status).toBe(403);
  expect((await replacementOptions(request('?jangadaId=7'))).status).toBe(403);
  expect((await hruOptions(request('?jangadaId=7'))).status).toBe(403);
  expect((await replaceArticle(request('', { jangadaId: 7 }))).status).toBe(403);
  expect((await replaceHru(request('', { jangadaId: 7 }))).status).toBe(403);
  expect((await syncPack(request('', {}), context)).status).toBe(403);
  expect(prisma.auditoria.findMany).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(prisma.stock.findMany).not.toHaveBeenCalled();
});

it('uses a bounded raft-scoped descending cursor and returns before/after fields', async () => {
  jest.mocked(prisma.auditoria.findMany).mockResolvedValue([{
    id: 8, createdAt: new Date('2026-10-25T10:00:00Z'), usuario: 'ana@orey.pt', descricao: 'Ficha',
    dadosAntes: '{"hruReferencia":"OLD"}', dadosDepois: '{"hruReferencia":"NEW"}',
  }, { id: 7 }] as never);
  const response = await GET(request('?limit=1&cursor=9'), context);
  expect(response.status).toBe(200);
  expect(prisma.auditoria.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { tabela: 'JangadaEquipment', idRegisto: 7, id: { lt: 9 } }, take: 2, orderBy: { id: 'desc' },
  }));
  expect(await response.json()).toMatchObject({ nextCursor: 8, items: [{ id: 8, quem: 'ana@orey.pt',
    alteracoes: [{ campo: 'hruReferencia', antes: 'OLD', depois: 'NEW' }],
  }] });
});

it.each(['?limit=101', '?limit=0', '?limit=1.5', '?cursor=no', '?cursor=-1'])('rejects invalid pagination %s', async query => {
  expect((await GET(request(query), context)).status).toBe(400);
  expect(prisma.auditoria.findMany).not.toHaveBeenCalled();
});

it('rejects articles linked to an inspection of another raft', async () => {
  jest.mocked(prisma.inspecao.findFirst).mockResolvedValue(null);
  expect((await addArticle(request('', { name: 'Water', inspecaoId: 42 }), context)).status).toBe(400);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('creates an article and its session-authored audit in the same transaction', async () => {
  jest.mocked(prisma.artigoJangada.create).mockResolvedValue({ id: 9, name: 'Water', quantidade: 0, validade: null, jangadaId: 7 } as never);
  expect((await addArticle(request('', { name: 'Water', quantidade: 0 }), context)).status).toBe(201);
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  expect(prisma.auditoria.create).toHaveBeenCalledWith({ data: expect.objectContaining({ idRegisto: 7, usuario: 'ana@orey.pt', tabela: 'JangadaEquipment' }) });
});
