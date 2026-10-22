import ExcelJS from "exceljs";
import { APP_CONFIG } from "@/lib/app-config";
import { FATO_CHECKLIST_ITEMS } from "@/lib/fatos-imersao-checklist";

export type FatoVerificationSheetRow = {
  serial: string;
  marca?: string | null;
  modelo?: string | null;
  tamanho?: string | null;
  designNo?: string | null;
  dataFabrico?: string | null;
  dataInspecao?: string | null;
  dataProxInspecao?: string | null;
  resultadoGeral?: string | null;
  leakResultado?: string | null;
  codigoBER?: string | null;
  inspectorNome?: string | null;
  checklist?: Record<string, string | null | undefined>;
};

export type NavioFatosVerificationSheetInput = {
  shipName: string;
  shipFlag?: string | null;
  clientOrVessel?: string | null;
  serviceStation?: string | null;
  technician?: string | null;
  inspectionDate?: string | null;
  nextInspectionDate?: string | null;
  notes?: string | null;
  rows: FatoVerificationSheetRow[];
};

function fmtDate(value?: string | null) {
  if (!value) return "";
  if (/^\d{4}-\d{2}$/.test(value.trim())) {
    const [y, m] = value.trim().split("-");
    return `${m}/${y}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-PT").format(d);
}

function sanitize(value: unknown, fallback: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || fallback;
}

const KEY_COLS = FATO_CHECKLIST_ITEMS.slice(0, 12).map((i) => ({ key: i.key, label: i.label }));

export async function buildNavioFatosImersaoVerificationSheet(input: NavioFatosVerificationSheetInput) {
  const wb = new ExcelJS.Workbook();
  wb.creator = APP_CONFIG.issuerName || "Gestor Naval Pro";
  wb.created = new Date();

  const ws = wb.addWorksheet("Ficha Fatos Imersão", {
    views: [{ state: "frozen", ySplit: 8 }],
  });

  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = "FICHA DE VERIFICAÇÃO MÚLTIPLA — FATOS DE IMERSÃO";
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF0F766E" } };

  ws.getCell("A3").value = "Navio / Embarcação";
  ws.getCell("B3").value = input.shipName || "";
  ws.getCell("C3").value = "Bandeira";
  ws.getCell("D3").value = input.shipFlag || "";
  ws.getCell("E3").value = "Cliente";
  ws.getCell("F3").value = input.clientOrVessel || "";

  ws.getCell("A4").value = "Estação";
  ws.getCell("B4").value = input.serviceStation || APP_CONFIG.issuerName || "";
  ws.getCell("C4").value = "Técnico";
  ws.getCell("D4").value = input.technician || "";
  ws.getCell("E4").value = "Data inspeção";
  ws.getCell("F4").value = fmtDate(input.inspectionDate);
  ws.getCell("G4").value = "Próxima";
  ws.getCell("H4").value = fmtDate(input.nextInspectionDate);

  ws.getCell("A5").value = "Notas";
  ws.mergeCells("B5:H5");
  ws.getCell("B5").value = input.notes || "Checklist unificada Crewsaver/Viking/Lalizas · MSC/Circ.1114";

  const headers = [
    "#",
    "Serial",
    "Marca",
    "Modelo",
    "Design/P/N",
    "Tamanho",
    "Fabrico",
    "Inspeção",
    "Próx.",
    "Leak",
    "Resultado",
    "BER",
    "Inspetor",
    ...KEY_COLS.map((c) => c.label),
  ];

  const headerRow = ws.getRow(8);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E7490" } };
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  });
  headerRow.height = 28;

  input.rows.forEach((row, idx) => {
    const r = ws.getRow(9 + idx);
    const base = [
      idx + 1,
      row.serial || "",
      row.marca || "",
      row.modelo || "",
      row.designNo || "",
      row.tamanho || "",
      fmtDate(row.dataFabrico),
      fmtDate(row.dataInspecao),
      fmtDate(row.dataProxInspecao),
      row.leakResultado || "",
      row.resultadoGeral || "",
      row.codigoBER || "",
      row.inspectorNome || "",
    ];
    const checks = KEY_COLS.map((c) => row.checklist?.[c.key] || "");
    [...base, ...checks].forEach((v, i) => {
      r.getCell(i + 1).value = v;
      r.getCell(i + 1).font = { size: 9 };
      r.getCell(i + 1).alignment = { vertical: "middle" };
    });
  });

  ws.columns = headers.map((h, i) => ({
    width: i === 0 ? 4 : i === 1 ? 16 : i < 13 ? 12 : 10,
  }));

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `ficha-verificacao-fatos-imersao-${sanitize(input.shipName, "navio")}.xlsx`;
  return { buffer: Buffer.from(buffer), fileName };
}
