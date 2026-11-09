import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { PDFDocument, PDFPage } from "pdf-lib";
import { GET as quoteExcel } from "./[id]/orcamento-excel/route";
import { GET as invoiceExcel } from "./[id]/fatura-excel/route";
import { GET as invoicePdf } from "./[id]/fatura-pdf/route";
import { GET as receiptExcel } from "./[id]/recibo-excel/route";
import { GET as creditExcel } from "./[id]/nota-credito-excel/route";
import { GET as historicalExcel } from "./orcamento-historico/route";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { carregarFaturaPorOrdemServico } from "@/lib/faturamento";

jest.mock("@/lib/prisma", () => ({ __esModule: true, default: {
  ordemServico: { findUnique: jest.fn(), findFirst: jest.fn() },
  inspecao: { findUnique: jest.fn() }, jangada: { findUnique: jest.fn() }, stock: { findMany: jest.fn() },
} }));
jest.mock("@/lib/access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("@/lib/faturamento", () => ({
  ...jest.requireActual("@/lib/faturamento"), carregarFaturaPorOrdemServico: jest.fn(),
}));
jest.mock("@/lib/certificados-organizados", () => ({ saveExternalCertificadoToNavioFolder: jest.fn() }));
jest.mock("@/lib/iva", () => ({ getIvaRate: () => 0.16 }));

const order = {
  id: 42, numeroOrdem: "OT-2026/42", status: "concluida", orcamentoStatus: "Aprovado",
  valorPecas: 100, valorMaoObra: 20, valorDesconto: 10, isIsentoIva: false,
  cliente: { nome: "Cliente registado", nif: "123456789" },
  jangada: { serial: "RAFT42", shipNameManual: "Navio registado", brand: "Marca", model: "Modelo" },
  metadados: JSON.stringify({ linhas: [{ quantidade: 1, unitPrice: 100, total: 100, descricao: "Servico" }] }),
};
const request = new NextRequest("http://localhost/api/ordens-servico/42/documento");
const context = { params: Promise.resolve({ id: "42" }) };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true, allowedStationIds: [] } as never);
  jest.mocked(prisma.ordemServico.findUnique).mockResolvedValue(order as never);
  jest.mocked(carregarFaturaPorOrdemServico).mockResolvedValue(null);
});

it.each([invoiceExcel, receiptExcel, creditExcel])("does not fabricate an unregistered financial document", async handler => {
  const response = await handler(request, context);
  expect(response.status).toBe(404);
  expect(response.headers.get("content-type")).toContain("application/json");
});

it.each([invoiceExcel, invoicePdf, receiptExcel, creditExcel])("requires administrator access for financial downloads", async handler => {
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false } as never);
  expect((await handler(request, context)).status).toBe(403);
  expect(prisma.ordemServico.findUnique).not.toHaveBeenCalled();
});

it("includes labour and persisted parts in the quote Excel totals", async () => {
  const response = await quoteExcel(request, context);
  expect(response.status).toBe(200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const rows: unknown[] = [];
  workbook.worksheets[0].eachRow(row => rows.push(row.values));
  const text = JSON.stringify(rows);
  expect(text).toContain("Mao de obra");
  expect(text).toContain('"result":127.6');
});

it("uses the actual order context for a pro-forma and does not invent an invoice number", async () => {
  const draw = jest.spyOn(PDFPage.prototype, "drawText");
  try {
    const response = await invoicePdf(request, context);
    expect(response.status).toBe(200);
    const text = draw.mock.calls.map(([value]) => value).join("\n");
    expect(text).toContain("Cliente registado");
    expect(text).toContain("OT-2026/42");
    expect(text).toContain("Navio registado");
    expect(text).not.toContain("FAT-S/N");
    expect(text).toContain("Mao de obra");
    expect((await PDFDocument.load(await response.arrayBuffer())).getPageCount()).toBe(1);
  } finally { draw.mockRestore(); }
});

it("shows article discounts and net values in the internal PDF", async () => {
  jest.mocked(prisma.ordemServico.findUnique).mockResolvedValue({ ...order,
    metadados: JSON.stringify({ linhas: [
      { descricao: "Discounted", quantidade: 2, unitPrice: 20, descontoPercentual: 25, total: 30 },
      { descricao: "Free", quantidade: 1, unitPrice: 50, descontoPercentual: 100, total: 0 },
    ] }),
  } as never);
  const draw = jest.spyOn(PDFPage.prototype, "drawText");
  try {
    expect((await invoicePdf(request, context)).status).toBe(200);
    const text = draw.mock.calls.map(([value]) => value).join("\n");
    expect(text).toContain("Discounted");
    expect(text).toContain("30,00");
    expect(text).toContain("50,00");
    expect(text).toContain("0,00");
  } finally { draw.mockRestore(); }
});

it("rejects a pro-forma before approval", async () => {
  jest.mocked(prisma.ordemServico.findUnique).mockResolvedValue({ ...order, orcamentoStatus: "Rascunho" } as never);
  expect((await invoicePdf(request, context)).status).toBe(400);
});

it("uses the draft billing recipient for a pro-forma without creating an invoice", async () => {
  jest.mocked(prisma.ordemServico.findUnique).mockResolvedValue({ ...order, metadados: JSON.stringify({
    destinatarioFaturacao: { nome: "Destinatario editado", nif: "999999999", morada: "Morada editada" },
  }) } as never);
  const draw = jest.spyOn(PDFPage.prototype, "drawText");
  try {
    expect((await invoicePdf(request, context)).status).toBe(200);
    const text = draw.mock.calls.map(([value]) => value).join("\n");
    expect(text).toContain("Destinatario editado");
    expect(text).toContain("999999999");
    expect(text).not.toContain("Cliente registado");
    expect(text).toContain("N\u00e3o constitui documento fiscal");
    expect(carregarFaturaPorOrdemServico).toHaveBeenCalledWith(42);
  } finally { draw.mockRestore(); }
});

it("uses the immutable recipient, articles and amounts from an issued invoice snapshot", async () => {
  jest.mocked(carregarFaturaPorOrdemServico).mockResolvedValue({ fatura: {
    numeroFatura: "FT-2026/7", dataEmissao: new Date("2026-01-01"),
    valorSubtotal: 100, valorIva: 23, valorTotal: 123,
    cliente: { nome: "Cliente alterado posteriormente" }, ordemServicos: [{ ordemServico: order }],
    metadados: JSON.stringify({ destinatario: { nome: "Destinatario congelado", nif: "123", morada: "Morada congelada" },
      ordensSnapshot: [{ ...order, valorMaoObra: 0, valorDesconto: 0, metadados: JSON.stringify({ linhas: [{ descricao: "Artigo congelado", quantidade: 1, unitPrice: 100, total: 100 }] }) }],
    }),
  } } as never);
  const draw = jest.spyOn(PDFPage.prototype, "drawText");
  try {
    expect((await invoicePdf(request, context)).status).toBe(200);
    const text = draw.mock.calls.map(([value]) => value).join("\n");
    expect(text).toContain("Destinatario congelado");
    expect(text).toContain("Artigo congelado");
    expect(text).toContain("23%");
    expect(text).not.toContain("Cliente alterado posteriormente");
    expect(text).toContain("N\u00e3o constitui documento fiscal");
    expect(text).toContain("PRO FORMA");
  } finally { draw.mockRestore(); }
});

it("redirects to the protected official attachment rather than generating or publishing a substitute", async () => {
  jest.mocked(carregarFaturaPorOrdemServico).mockResolvedValue({ fatura: {
    id: 7, numeroFatura: "FT-INTERNAL", metadados: JSON.stringify({ numeroFaturaOficial: "NAV-7", pdfOficial: { filename: "official.pdf" } }),
  } } as never);
  const draw = jest.spyOn(PDFPage.prototype, "drawText");
  try {
    const response = await invoicePdf(request, context);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/api/faturas/7/oficial");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(draw).not.toHaveBeenCalled();
  } finally { draw.mockRestore(); }
});

it("paginates a long pro-forma without dropping its final lines", async () => {
  jest.mocked(prisma.ordemServico.findUnique).mockResolvedValue({ ...order,
    metadados: JSON.stringify({ linhas: Array.from({ length: 80 }, (_, i) => ({ descricao: `Servico-${i}`, quantidade: 1, unitPrice: 1, total: 1 })) }),
  } as never);
  const draw = jest.spyOn(PDFPage.prototype, "drawText");
  try {
    const response = await invoicePdf(request, context);
    expect(response.status).toBe(200);
    expect(draw.mock.calls.some(([text]) => text === "Servico-79")).toBe(true);
    expect((await PDFDocument.load(await response.arrayBuffer())).getPageCount()).toBeGreaterThan(1);
  } finally { draw.mockRestore(); }
});

it.each([invoiceExcel, receiptExcel])("does not download an active-looking document for a cancelled invoice", async handler => {
  jest.mocked(carregarFaturaPorOrdemServico).mockResolvedValue({ fatura: { cancelada: true, recibos: [{}] } } as never);
  expect((await handler(request, context)).status).toBe(400);
});

it.each([
  [invoiceExcel, "FT-2026/7"], [receiptExcel, "REC-2026/9"], [creditExcel, "NC-2026/8"],
] as const)("exports only the registered document numbers", async (handler, number) => {
  jest.mocked(carregarFaturaPorOrdemServico).mockResolvedValue({ fatura: {
    numeroFatura: "FT-2026/7", cancelada: false, dataEmissao: new Date("2026-01-01"),
    valorSubtotal: 110, valorIva: 17.6, valorTotal: 127.6, pagamentoStatus: "Pago Parcialmente",
    cliente: order.cliente, ordemServicos: [{ ordemServico: order }],
    notaCredito: { numeroNotaCredito: "NC-2026/8", dataEmissao: new Date("2026-01-02"), motivo: "Correcao" },
    recibos: [{ numeroRecibo: "REC-2026/9", valorPago: 25, dataEmissao: new Date("2026-01-03") }],
  } } as never);
  const response = await handler(request, context);
  expect(response.status).toBe(200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const values: unknown[] = [];
  workbook.worksheets[0].eachRow(row => values.push(row.values));
  expect(JSON.stringify(values)).toContain(number);
  if (handler === receiptExcel) expect(JSON.stringify(values)).toContain(new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(25));
});

it("never reprices a historical quote from current stock or a default article price", async () => {
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValue({ id: 7, artigos: [{ name: "Sem preco", referencia: "REF", quantidade: 2 }] } as never);
  jest.mocked(prisma.ordemServico.findFirst).mockResolvedValue(order as never);
  const response = await historicalExcel(new NextRequest("http://localhost/api/ordens-servico/orcamento-historico?inspecaoId=7"));
  expect(response.status).toBe(200);
  expect(prisma.stock.findMany).not.toHaveBeenCalled();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const values: unknown[] = [];
  workbook.worksheets[0].eachRow(row => values.push(row.values));
  expect(JSON.stringify(values)).toContain("Nao registado");
});
