import { GET } from '@/app/api/jangadas/[id]/previsao-custos/route';
import prisma from '@/lib/prisma';
import { equipmentAccess } from '@/lib/jangada-equipment-access';

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { jangada: { findUnique: jest.fn() }, stock: { findMany: jest.fn() }, inspecao: { findFirst: jest.fn() } } }));
jest.mock('@/lib/jangada-equipment-access', () => ({ equipmentAccess: jest.fn() }));

const request = new Request('http://localhost/api/jangadas/1/previsao-custos') as never;
const context = { params: Promise.resolve({ id: '1' }) };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(equipmentAccess).mockResolvedValue({ access: { isAdmin: true, allowedStationIds: [] }, raft: { id: 1, serviceStationId: 2 } } as never);
  jest.mocked(prisma.stock.findMany).mockResolvedValue([]);
  jest.mocked(prisma.inspecao.findFirst).mockResolvedValue(null);
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ id: 1, serial: 'TEST', brand: 'RFD', model: 'SURVIVA MKIV TO', containerModel: 'MK10', launchType: 'TO', dataFabrico: '2010-01-01', capacity: 10, packType: 'SOLAS A', maxStowageHeight: '18', dataProxInspecao: '2027-06-01', artigos: [
    { id: 1, name: 'Artigo', referencia: 'A', quantidade: 2, validade: new Date('2027-05-01T00:00:00Z'), stock: { precoVenda: 5, serviceStationId: 2 } },
    { id: 2, name: 'Sem preço', referencia: 'B', quantidade: 1, validade: new Date('2027-04-01T00:00:00Z'), stock: null },
  ] } as never);
});

it('shows only a recorded completed GI and labels the five-year date as an estimate', async () => {
  jest.mocked(prisma.inspecao.findFirst).mockResolvedValue({ id: 22, dataInspecao: '2022-06-01' } as never);
  const body = await (await GET(request, context)).json();
  expect(body.ultimoGi).toEqual({ inspecaoId: 22, dataInspecao: '2022-06-01', proximaEstimativa: '2027-06-01' });
  expect(prisma.inspecao.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ jangadaId: 1, status: 'Concluída', testeGI: 'PASSOU' }) }));
});

it('uses the inspection date, recorded expiry and six-euro straps without inventing missing prices', async () => {
  const response = await GET(request, context);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.itens).toHaveLength(2);
  expect(body.fecho.find((item: { kind: string }) => item.kind === 'cinta')).toMatchObject({ quantidade: 6, unitario: 6, total: 36 });
  expect(body.subtotalConhecido).toBe(46);
  expect(body.semPreco).toBeGreaterThan(0);
  expect(body.testes.length).toBeGreaterThan(0);
});

it('stops before querying data when access is denied', async () => {
  jest.mocked(equipmentAccess).mockResolvedValue({ error: new Response(null, { status: 403 }) } as never);
  expect((await GET(request, context)).status).toBe(403);
  expect(prisma.jangada.findUnique).not.toHaveBeenCalled();
});

it('does not include unconfirmed generic closure suggestions in the subtotal', async () => {
  jest.mocked(prisma.stock.findMany).mockResolvedValue([{ referencia: 'FITA-ADESIVA', precoVenda: 100, serviceStationId: 2 }] as never);
  const body = await (await GET(request, context)).json();
  expect(body.fecho.find((item: { referencia: string }) => item.referencia === 'FITA-ADESIVA').total).toBe(100);
  expect(body.subtotalConhecido).toBe(46);
});

it('prices an expired HRU only from the raft station', async () => {
  const raft = await prisma.jangada.findUnique({ where: { id: 1 } });
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...raft, hruReferencia: 'HRU-X', hruValidade: '2027-05' } as never);
  jest.mocked(prisma.stock.findMany).mockImplementation(((args: any) => Promise.resolve(args.where.referencia === 'HRU-X'
    ? [{ referencia: 'HRU-X', precoVenda: 80, serviceStationId: 2 }] : [])) as never);
  const body = await (await GET(request, context)).json();
  expect(body.itens[0]).toMatchObject({ nome: 'HRU (Libertador Hidrostático)', unitario: 80, total: 80 });
  expect(body.subtotalConhecido).toBe(126);
  expect(prisma.stock.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { referencia: 'HRU-X', serviceStationId: 2 } }));
});

it('leaves conflicting HRU stock prices undefined and reports missing validity', async () => {
  const raft = await prisma.jangada.findUnique({ where: { id: 1 } });
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...raft, hruReferencia: 'HRU-X', hruValidade: '2027-05' } as never);
  jest.mocked(prisma.stock.findMany).mockImplementation(((args: any) => Promise.resolve(args.where.referencia === 'HRU-X'
    ? [{ precoVenda: 80, serviceStationId: 2 }, { precoVenda: 90, serviceStationId: 2 }] : [])) as never);
  let body = await (await GET(request, context)).json();
  expect(body.itens[0]).toMatchObject({ unitario: null, total: null });
  expect(body.subtotalConhecido).toBe(46);
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...raft, hruReferencia: 'HRU-X', hruValidade: null } as never);
  body = await (await GET(request, context)).json();
  expect(body.pendentes).toEqual(expect.arrayContaining([expect.objectContaining({ nome: 'HRU (Libertador Hidrostático)' })]));
});

it('does not forecast HRU for SOS document-only rafts', async () => {
  const raft = await prisma.jangada.findUnique({ where: { id: 1 } });
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...raft, model: 'SOS', hruReferencia: 'HRU-X', hruValidade: '2027-05' } as never);
  const body = await (await GET(request, context)).json();
  expect(body.itens.some((item: { nome: string }) => item.nome.includes('HRU'))).toBe(false);
});
