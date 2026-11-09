import { POST, GET } from '@/app/api/fatos-imersao/[id]/verificacoes/route';
import { POST as issue } from '@/app/api/fatos-imersao/[id]/certificado/route';
import { FATO_CHECKLIST_ITEMS } from '@/lib/fatos-imersao-checklist';
import { parseInspectionTrace } from '@/lib/fatos-imersao-service';
import prisma from '@/lib/prisma';

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { fatoImersao: { findUnique: jest.fn(), update: jest.fn() }, verificacaoFatoImersao: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() }, certificadoFatoImersao: { upsert: jest.fn() } } }));
const context = { params: Promise.resolve({ id: '42' }) };
const trace = { manualReferencia: 'Manual', manualRevisao: '1', equipamentoEnsaio: 'Dispositivo', reparacoes: '' };
const request = (data: unknown) => new Request('http://localhost/api/fatos-imersao/42/verificacoes', { method: 'POST', body: JSON.stringify(data) }) as never;

beforeEach(() => jest.clearAllMocks());

it('grava inspeção, recupera rastreabilidade e emite com confirmação da mesma verificação', async () => {
  let saved: any;
  jest.mocked(prisma.fatoImersao.findUnique).mockResolvedValueOnce({ id: 42 } as never).mockImplementationOnce(() => Promise.resolve({ id: 42, verificacoes: [saved] }) as never);
  jest.mocked(prisma.verificacaoFatoImersao.create).mockImplementation(((args: any) => { saved = { ...args.data, id: 9 }; return Promise.resolve(saved); }) as never);
  jest.mocked(prisma.verificacaoFatoImersao.findFirst).mockImplementation((() => Promise.resolve(saved)) as never);
  jest.mocked(prisma.verificacaoFatoImersao.findMany).mockImplementation((() => Promise.resolve([saved])) as never);
  jest.mocked(prisma.certificadoFatoImersao.upsert).mockResolvedValue({ id: 1 } as never);
  const body = { checklist: Object.fromEntries(FATO_CHECKLIST_ITEMS.map(item => [item.key, 'OK'])), leakMetodo: 'soap_air', leakResultado: 'OK', leakReTest: 'N/A', inspectorNome: 'Técnico', trace, dataVerificacao: '2026-01-01', dataProxInspecao: '2027-01-01' };
  expect((await POST(request(body), context)).status).toBe(201);
  const list = await (await GET(request({}), context)).json();
  expect(parseInspectionTrace(list[0].checklistJson)).toEqual(trace);
  expect(saved.resultadoGeral).toBe('OK');
  const certReq = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ resultado: 'Aprovado', confirmarRevisao: true, verificacaoId: 9, emitidoPor: 'Técnico', dataValidade: '2027-01-01' }) }) as never;
  expect((await issue(certReq, context)).status).toBe(201);
});

it('não altera a próxima data ao sincronizar uma verificação antiga', async () => {
  jest.mocked(prisma.fatoImersao.findUnique).mockResolvedValue({ id: 42 } as never);
  jest.mocked(prisma.verificacaoFatoImersao.create).mockResolvedValue({ id: 8 } as never);
  jest.mocked(prisma.verificacaoFatoImersao.findFirst).mockResolvedValue({ id: 9, dataVerificacao: new Date('2027-01-01') } as never);
  expect((await POST(request({ checklist: {}, dataVerificacao: '2025-01-01', dataProxInspecao: '2026-01-01' }), context)).status).toBe(201);
  expect(prisma.fatoImersao.update).not.toHaveBeenCalled();
});
