import { POST } from '@/app/api/fatos-imersao/[id]/certificado/route';
import prisma from '@/lib/prisma';
import { FATO_CHECKLIST_ITEMS } from '@/lib/fatos-imersao-checklist';
import { buildVerificacaoPayload } from '@/lib/fatos-imersao-service';

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { fatoImersao: { findUnique: jest.fn() }, certificadoFatoImersao: { upsert: jest.fn() } } }));

const context = { params: Promise.resolve({ id: '42' }) };
const request = (overrides: Record<string, unknown> = {}) => new Request('http://localhost/api/fatos-imersao/42/certificado', { method: 'POST', body: JSON.stringify({ resultado: 'Aprovado', dataValidade: '2028-01-01', emitidoPor: 'Técnico', confirmarRevisao: true, verificacaoId: 7, ...overrides }) }) as never;
const verification = () => ({ ...buildVerificacaoPayload({ checklist: Object.fromEntries(FATO_CHECKLIST_ITEMS.map(item => [item.key, 'OK'])), leakMetodo: 'soap_air', leakResultado: 'OK', leakReTest: 'N/A', inspectorNome: 'Técnico', trace: { manualReferencia: 'Manual', manualRevisao: 'Rev 1', equipamentoEnsaio: 'Dispositivo', reparacoes: '' } }), id: 7, dataVerificacao: new Date('2026-01-01') });

beforeEach(() => jest.clearAllMocks());

it('recusa certificado aprovado quando a última verificação está pendente', async () => {
  jest.mocked(prisma.fatoImersao.findUnique).mockResolvedValue({ id: 42, verificacoes: [{ ...verification(), resultadoGeral: 'REPARAR' }] } as never);
  const response = await POST(request(), context);
  expect(response.status).toBe(400);
  expect(prisma.certificadoFatoImersao.upsert).not.toHaveBeenCalled();
});

it('aceita emissão quando a última verificação está aprovada', async () => {
  jest.mocked(prisma.fatoImersao.findUnique).mockResolvedValue({ id: 42, verificacoes: [verification()] } as never);
  jest.mocked(prisma.certificadoFatoImersao.upsert).mockResolvedValue({ id: 1 } as never);
  expect((await POST(request(), context)).status).toBe(201);
  expect(prisma.certificadoFatoImersao.upsert).toHaveBeenCalledTimes(1);
});

it.each([{ confirmarRevisao: false }, { verificacaoId: 6 }, { emitidoPor: '' }, { dataValidade: '' }, { dataValidade: '2025-01-01' }])('recusa confirmação ou validade inválida: %j', async (input) => {
  jest.mocked(prisma.fatoImersao.findUnique).mockResolvedValue({ id: 42, verificacoes: [verification()] } as never);
  expect((await POST(request(input), context)).status).toBe(400);
  expect(prisma.certificadoFatoImersao.upsert).not.toHaveBeenCalled();
});

it('recusa registo antigo sem rastreabilidade mesmo se marcado OK', async () => {
  jest.mocked(prisma.fatoImersao.findUnique).mockResolvedValue({ id: 42, verificacoes: [{ ...verification(), checklistJson: '{}' }] } as never);
  expect((await POST(request(), context)).status).toBe(400);
});
