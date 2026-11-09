import { buildPortalClienteData } from "../portal-cliente";
import prisma from "../prisma";

jest.mock("../prisma", () => ({ __esModule: true, default: {
  cliente: { findUnique: jest.fn() }, navio: { findMany: jest.fn() },
  jangada: { findMany: jest.fn() }, inspecao: { findMany: jest.fn() },
  colete: { findMany: jest.fn() },
  ordemServico: { findMany: jest.fn() }, fatura: { findMany: jest.fn() },
} }));
jest.mock("../jangada-workflow-status", () => ({ getJangadaWorkflowStatus: jest.fn() }));

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(prisma.cliente.findUnique).mockResolvedValue({ id: 7, nome: "Shared name" } as never);
  jest.mocked(prisma.navio.findMany).mockResolvedValue([]);
  jest.mocked(prisma.jangada.findMany).mockResolvedValue([]);
  jest.mocked(prisma.colete.findMany).mockResolvedValue([]);
  jest.mocked(prisma.ordemServico.findMany).mockResolvedValue([]);
  jest.mocked(prisma.fatura.findMany).mockResolvedValue([]);
});

it("does not expose rafts belonging to a namesake when the client has no ships", async () => {
  const data = await buildPortalClienteData(7);
  expect(data?.jangadas).toEqual([]);
  expect(data?.coletes).toEqual([]);
  expect(prisma.colete.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { shipId: { in: [] } } }));
  expect(prisma.navio.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clienteId: 7 } }));
  expect(prisma.jangada.findMany).toHaveBeenCalledWith({ where: { shipId: { in: [] } } });
  expect(prisma.inspecao.findMany).not.toHaveBeenCalled();
  expect(prisma.ordemServico.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clienteId: 7 } }));
});

it('returns only owned ship coletes with model, serial and the actual saved next date', async () => {
  jest.mocked(prisma.navio.findMany).mockResolvedValue([{ id: 10 }] as never);
  const colete = { id: 22, shipId: 10, serial: 'LJ-22', marca: 'Brand', modelo: 'Model', dataProxInspecao: '2020-02-29' };
  jest.mocked(prisma.colete.findMany).mockResolvedValue([colete] as never);
  expect((await buildPortalClienteData(7))?.coletes).toEqual([colete]);
  expect(prisma.colete.findMany).toHaveBeenCalledWith({
    where: { shipId: { in: [10] } },
    select: { id: true, shipId: true, serial: true, marca: true, modelo: true, dataProxInspecao: true },
    orderBy: { serial: 'asc' },
  });
});

it("uses only the session client's ship relations, never an owner-name fallback", async () => {
  jest.mocked(prisma.navio.findMany).mockResolvedValue([{ id: 10 }] as never);
  await buildPortalClienteData(7);
  expect(prisma.jangada.findMany).toHaveBeenCalledWith({ where: { shipId: { in: [10] } } });
});

it('lists only uploaded official invoices, displays Navision references and never exposes storage locators or proformas', async () => {
  const base = { id: 101, numeroFatura: 'INTERNAL-SECRET', valorTotal: 120, recibos: [], ordemServicos: [], dataEmissao: new Date(), cancelada: false };
  const pdf = { storage: 'encrypted-blob', key: 'private/storage/locator', filename: 'official.pdf', size: 100 };
  jest.mocked(prisma.fatura.findMany).mockResolvedValue([
    ...Array.from({ length: 12 }, (_, i) => ({ ...base, id: i, metadados: '{}' })),
    { ...base, id: 100, metadados: JSON.stringify({ numeroFaturaOficial: 'NAV-NO-PDF' }) },
    { ...base, id: 102, metadados: JSON.stringify({ pdfOficial: pdf }) },
    { ...base, metadados: JSON.stringify({ numeroFaturaOficial: 'NAV-101', pdfOficial: pdf }) },
  ] as never);
  const data = await buildPortalClienteData(7);
  expect(prisma.fatura.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clienteId: 7 } }));
  expect(data?.faturas).toEqual([expect.objectContaining({ id: 101, numeroFatura: 'NAV-101', faturaPdfUrl: '/api/portal/faturas/101/oficial' })]);
  expect(data?.resumoFaturas.totalFaturas).toBe(1);
  for (const secret of ['INTERNAL-SECRET', 'NAV-NO-PDF', pdf.key, 'fatura-pdf', 'encrypted-blob']) expect(JSON.stringify(data)).not.toContain(secret);
});

it('exposes the latest exact saved inspection quadro, never a draft or certificate-only fallback', async () => {
  jest.mocked(prisma.navio.findMany).mockResolvedValue([{ id: 10 }] as never);
  jest.mocked(prisma.jangada.findMany).mockResolvedValue([{ id: 20, shipId: 10, serial: 'RAFT' }] as never);
  const inspection = { id: 101, jangadaId: 20, status: 'Concluída', certificadoNumero: 'AZ-101', dataInspecao: '2026-10-01', dataProxInspecao: '2027-10-01' };
  jest.mocked(prisma.inspecao.findMany).mockResolvedValue([inspection] as never);
  expect((await buildPortalClienteData(7))?.jangadas[0].quadroPdfUrl).toBe('/api/portal/documentos?jangadaId=20&inspecaoId=101&document=quadro&format=pdf');
  expect(prisma.inspecao.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ dataInspecao: 'desc' }, { id: 'desc' }] }));
  jest.mocked(prisma.inspecao.findMany).mockResolvedValue([{ ...inspection, status: 'Rascunho' }, inspection] as never);
  expect((await buildPortalClienteData(7))?.jangadas[0].quadroPdfUrl).toBeNull();
  jest.mocked(prisma.inspecao.findMany).mockResolvedValue([] as never);
  expect((await buildPortalClienteData(7))?.jangadas[0].quadroPdfUrl).toBeNull();
});

it('takes ten official PDFs after filtering internal entries and totals only the displayed invoices', async () => {
  const pdf = { storage: 'encrypted-blob', key: 'private', filename: 'official.pdf', size: 100 };
  const base = { numeroFatura: 'INTERNAL', valorTotal: 100, recibos: [], ordemServicos: [], dataEmissao: new Date(), cancelada: false };
  jest.mocked(prisma.fatura.findMany).mockResolvedValue([
    ...Array.from({ length: 12 }, (_, id) => ({ ...base, id, metadados: '{}' })),
    ...Array.from({ length: 11 }, (_, index) => ({ ...base, id: 100 + index,
      metadados: JSON.stringify({ numeroFaturaOficial: `NAV-${index}`, pdfOficial: pdf }) })),
  ] as never);
  const data = await buildPortalClienteData(7);
  expect(data?.faturas.map(invoice => invoice.id)).toEqual(Array.from({ length: 10 }, (_, index) => 100 + index));
  expect(data?.resumoFaturas).toEqual({ totalFaturas: 10, totalFaturado: 1000, totalRecebido: 0, totalEmDivida: 1000 });
  expect(prisma.fatura.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clienteId: 7 } }));
  expect(jest.mocked(prisma.fatura.findMany).mock.calls[0][0]).not.toHaveProperty('take');
});
