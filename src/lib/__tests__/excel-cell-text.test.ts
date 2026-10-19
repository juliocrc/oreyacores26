import ExcelJS from "exceljs";
import { cellText, formatCellDate } from "@/lib/excel-cell-text";

function sheetWith(values: Record<string, ExcelJS.CellValue>): ExcelJS.Worksheet {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("S");
  for (const [ref, value] of Object.entries(values)) ws.getCell(ref).value = value;
  return ws;
}

describe("excel-cell-text", () => {
  it("formata células Date como DD/MM/AAAA preservando o dia", () => {
    const ws = sheetWith({
      A1: new Date(Date.UTC(2026, 1, 12)),
      A2: new Date(Date.UTC(2025, 0, 15)),
    });
    expect(cellText(ws.getCell("A1"))).toBe("12/02/2026");
    expect(cellText(ws.getCell("A2"))).toBe("15/01/2025");
  });

  it("não troca dia/mês em datas ambíguas", () => {
    expect(formatCellDate(new Date(Date.UTC(2026, 1, 5)))).toBe("05/02/2026");
    expect(formatCellDate(new Date(Date.UTC(2026, 11, 2)))).toBe("02/12/2026");
    expect(cellText(sheetWith({ A1: new Date(Date.UTC(2026, 11, 2)) }).getCell("A1"))).toBe("02/12/2026");
  });

  it("lê o resultado Date de células com fórmula", () => {
    const ws = sheetWith({
      B1: { formula: "QUADRO!F81", result: new Date(Date.UTC(2026, 1, 12)) } as ExcelJS.CellFormulaValue,
    });
    expect(cellText(ws.getCell("B1"))).toBe("12/02/2026");
  });

  it("mantém texto simples e devolve vazio para booleanos/ausentes", () => {
    const ws = sheetWith({ C1: "  15/01/2026  ", C2: 12, C3: true });
    expect(cellText(ws.getCell("C1"))).toBe("15/01/2026");
    expect(cellText(ws.getCell("C2"))).toBe("12");
    expect(cellText(ws.getCell("C3"))).toBe("");
    expect(cellText(undefined)).toBe("");
  });
});
