import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { GET as quoteExcel } from "./[id]/orcamento-excel/route";
import { GET as documentJson } from "./[id]/documento/route";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";

jest.mock("@/lib/prisma", () => ({ __esModule: true, default: {
  ordemServico: { findUnique: jest.fn() },
} }));
jest.mock("@/lib/access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("@/lib/iva", () => ({ getIvaRate: () => 0.16 }));

const request = new NextRequest("http://localhost/api/ordens-servico/42/documento");
const context = { params: Promise.resolve({ id: "42" }) };
const order = {
  id: 42, numeroOrdem: "OT-42", valorPecas: 30, valorMaoObra: 20, valorDesconto: 5,
  isIsentoIva: false, cliente: { nome: "Cliente" },
  metadados: JSON.stringify({ linhas: [
    { referencia: "REF", descricao: "Discounted", quantidade: 2, unitPrice: 20, descontoPercentual: 25, total: 30 },
    { descricao: "Free", quantidade: 1, unitPrice: 50, descontoPercentual: 100, total: 0 },
  ], totais: { subtotal: 45, iva: 7.2, totalComIva: 52.2 } }),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true, allowedStationIds: [] } as never);
  jest.mocked(prisma.ordemServico.findUnique).mockResolvedValue(order as never);
});

async function spreadsheet() {
  const response = await quoteExcel(request, context);
  expect(response.status).toBe(200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  return workbook.worksheets[0];
}

function rowWith(sheet: ExcelJS.Worksheet, text: string, column = "A") {
  let found = 0;
  sheet.eachRow(row => { if (row.getCell(column).value === text) found = row.number; });
  expect(found).toBeGreaterThan(0);
  return found;
}

it("exports numeric inputs and linked net, subtotal, VAT and total formulas", async () => {
  const sheet = await spreadsheet();
  const header = rowWith(sheet, "Ref.");
  expect(["A", "B", "C", "D", "E", "F"].map(col => sheet.getCell(`${col}${header}`).value))
    .toEqual(["Ref.", "Descrição", "Qtd", "Desconto (%)", "Preço unitário", "Valor"]);
  const line = rowWith(sheet, "REF");
  expect(sheet.getCell(`C${line}`).value).toBe(2);
  expect(sheet.getCell(`D${line}`).value).toBe(25);
  expect(sheet.getCell(`E${line}`).value).toBe(20);
  expect(sheet.getCell(`F${line}`).value).toEqual({ formula: `ROUND(C${line}*E${line}*(1-D${line}/100),2)`, result: 30 });
  expect(sheet.getCell(`D${line}`).dataValidation).toMatchObject({ type: "decimal", formulae: [0, 100] });
  expect(sheet.getCell(`F${line + 1}`).result).toBe(0);
  const labour = rowWith(sheet, "Mao de obra");
  const discount = rowWith(sheet, "Desconto Comercial");
  const subtotal = rowWith(sheet, "Subtotal");
  const vat = rowWith(sheet, "IVA (16%)");
  const total = rowWith(sheet, "TOTAL");
  expect(sheet.getCell(`F${labour}`).value).toBe(20);
  expect(sheet.getCell(`F${discount}`).value).toBe(-5);
  expect(sheet.getCell(`F${subtotal}`).value).toEqual({ formula: `ROUND(MAX(0,SUM(F${line}:F${subtotal - 1})),2)`, result: 45 });
  expect(sheet.getCell(`F${vat}`).value).toEqual({ formula: `ROUND(F${subtotal}*0.16,2)`, result: 7.2 });
  expect(sheet.getCell(`F${total}`).value).toEqual({ formula: `ROUND(F${subtotal}+F${vat},2)`, result: 52.2 });
});

it("keeps legacy aliases, aggregate-only amounts and omitted discounts readable", async () => {
  jest.mocked(prisma.ordemServico.findUnique).mockResolvedValue({ ...order, metadados: JSON.stringify({ linhas: [
    { descricao: "Legacy", quantidade: 2, precoUnitario: 15, total: 30 },
    { descricao: "Aggregate", total: 12 },
  ] }) } as never);
  const sheet = await spreadsheet();
  const legacy = rowWith(sheet, "Legacy", "B");
  const aggregate = rowWith(sheet, "Aggregate", "B");
  expect(sheet.getCell(`D${legacy}`).value).toBe(0);
  expect(sheet.getCell(`E${legacy}`).value).toBe(15);
  expect(sheet.getCell(`F${legacy}`).result).toBe(30);
  expect(sheet.getCell(`C${aggregate}`).value).toBe(1);
  expect(sheet.getCell(`E${aggregate}`).value).toBe(12);
});

it("keeps exempt, empty quotes formula-driven without circular references", async () => {
  jest.mocked(prisma.ordemServico.findUnique).mockResolvedValue({ ...order, valorPecas: 0, valorMaoObra: 0,
    valorDesconto: 5, isIsentoIva: true, metadados: JSON.stringify({ linhas: [] }),
  } as never);
  const sheet = await spreadsheet();
  const first = rowWith(sheet, "Servicos e materiais registados");
  const subtotal = rowWith(sheet, "Subtotal");
  const total = rowWith(sheet, "TOTAL");
  expect(sheet.getCell(`F${subtotal}`).formula).toBe(`ROUND(MAX(0,SUM(F${first}:F${subtotal - 1})),2)`);
  expect(sheet.getCell(`F${total}`).formula).toBe(`ROUND(F${subtotal},2)`);
  // ExcelJS may omit a zero cached formula result when reading the workbook back.
  expect(sheet.getCell(`F${subtotal}`).result ?? 0).toBe(0);
  expect(sheet.getCell(`F${total}`).result ?? 0).toBe(0);
});

it("exports percentages and preserves zero net values in document JSON", async () => {
  const response = await documentJson(request);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ linhas: [
    expect.objectContaining({ precoUnitario: 20, descontoPercentual: 25, total: 30 }),
    expect.objectContaining({ precoUnitario: 50, descontoPercentual: 100, total: 0 }),
  ], totais: { subtotal: 45, iva: 7.2, totalComIva: 52.2 } });
});

it("calculates missing JSON totals using legacy prices and line percentages", async () => {
  jest.mocked(prisma.ordemServico.findUnique).mockResolvedValue({ ...order, metadados: JSON.stringify({ linhas: [
    { quantidade: 3, precoUnitario: 1.115, descontoPercentual: 10 },
    { descricao: "Aggregate", total: 12 },
  ] }) } as never);
  expect(await (await documentJson(request)).json()).toMatchObject({ linhas: [
    expect.objectContaining({ precoUnitario: 1.115, descontoPercentual: 10, total: 3.01 }),
    expect.objectContaining({ quantidade: 1, precoUnitario: 12, descontoPercentual: 0, total: 12 }),
  ] });
});
