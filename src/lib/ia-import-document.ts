import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { PDFParse } from "pdf-parse";
import type { AnalyzeResult, ExtractedArtigo, HeaderFields, Row } from "@/types/ia-importacao-page";
import { EMPTY_HEADER } from "@/types/ia-importacao-page";
import { extractChecklistArticles, inferHeader, normalizeKey } from "@/lib/ia-importacao-page-helpers";
import { summarizeImportRows } from "@/lib/ia-import-analysis";
import { cellText } from "@/lib/excel-cell-text";

const MAX_ROWS = 400;
const MAX_COLS = 30;

/* ------------------------------------------------------------------ */
/* Utilidades de células                                              */
/* ------------------------------------------------------------------ */


function columnLetter(index1: number): string {
  let n = index1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

type SheetGrid = {
  grid: Record<string, string>;
  matrix: (string | null)[][];
  maxRow: number;
  maxCol: number;
  columns: string[];
};

function buildSheetGrid(ws: ExcelJS.Worksheet): SheetGrid {
  const grid: Record<string, string> = {};
  let maxRow = 0;
  let maxCol = 0;
  ws.eachRow({ includeEmpty: false }, (row, rn) => {
    if (rn > MAX_ROWS) return;
    row.eachCell({ includeEmpty: false }, (cell, cn) => {
      if (cn > MAX_COLS) return;
      const t = cellText(cell);
      if (!t) return;
      grid[`${rn}_${cn}`] = t;
      if (rn > maxRow) maxRow = rn;
      if (cn > maxCol) maxCol = cn;
    });
  });
  const matrix: (string | null)[][] = [];
  for (let r = 1; r <= maxRow; r += 1) {
    const rowVals: (string | null)[] = [];
    for (let c = 1; c <= maxCol; c += 1) rowVals.push(grid[`${r}_${c}`] ?? null);
    matrix.push(rowVals);
  }
  const columns = Array.from({ length: maxCol }, (_, i) => columnLetter(i + 1));
  return { grid, matrix, maxRow, maxCol, columns };
}

function buildSheetGridFromMatrix(matrix: unknown[][]): SheetGrid {
  const grid: Record<string, string> = {};
  let maxRow = 0;
  let maxCol = 0;

  for (let r = 0; r < Math.min(matrix.length, MAX_ROWS); r += 1) {
    const row = matrix[r] ?? [];
    for (let c = 0; c < Math.min(row.length, MAX_COLS); c += 1) {
      const value = row[c];
      const text = value == null ? "" : String(value).trim();
      if (!text) continue;
      grid[`${r + 1}_${c + 1}`] = text;
      if (r + 1 > maxRow) maxRow = r + 1;
      if (c + 1 > maxCol) maxCol = c + 1;
    }
  }

  const normalized: (string | null)[][] = [];
  for (let r = 1; r <= maxRow; r += 1) {
    const rowVals: (string | null)[] = [];
    for (let c = 1; c <= maxCol; c += 1) rowVals.push(grid[`${r}_${c}`] ?? null);
    normalized.push(rowVals);
  }
  const columns = Array.from({ length: maxCol }, (_, i) => columnLetter(i + 1));
  return { grid, matrix: normalized, maxRow, maxCol, columns };
}

function matrixToRows(sheet: SheetGrid): Row[] {
  const rows: Row[] = [];
  for (const rowVals of sheet.matrix) {
    const obj: Row = {};
    let hasValue = false;
    rowVals.forEach((value, index) => {
      obj[`col${index + 1}`] = value ?? null;
      if (value != null && String(value).trim() !== "") hasValue = true;
    });
    if (hasValue) rows.push(obj);
  }
  return rows;
}

function gridToText(sheet: SheetGrid): string {
  return sheet.matrix
    .map((rowVals) => rowVals.map((value) => (value == null ? "" : String(value))).join("\t").replace(/\t+$/g, ""))
    .filter((line) => line.trim() !== "")
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* Normalização de datas                                              */
/* ------------------------------------------------------------------ */

const FAB_DATE_RE = /^(\d{1,2})[\/\-.](\d{4})$/;
const FAB_DATE_YY_RE = /^(\d{1,2})[\/\-.](\d{2})$/;
const ISO_DATE_RE = /^(\d{4})[\/\-.](\d{1,2})(?:[\/\-.](\d{1,2}))?/;
const FULL_DATE_RE = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/;

function toMonthYearIso(raw: string): string | null {
  const s = String(raw || "").trim();
  // Data completa DD/MM/AAAA (ex.: células de data do Excel) -> usar o mês.
  const full = s.match(FULL_DATE_RE);
  if (full) {
    const month = Number(full[2]);
    if (month >= 1 && month <= 12) return `${full[3]}-${String(month).padStart(2, "0")}-01`;
  }
  let m = s.match(FAB_DATE_RE);
  if (m) {
    const month = Number(m[1]);
    if (month >= 1 && month <= 12) return `${m[2]}-${String(month).padStart(2, "0")}-01`;
  }
  m = s.match(FAB_DATE_YY_RE);
  if (m) {
    const month = Number(m[1]);
    if (month >= 1 && month <= 12) return `20${m[2]}-${String(month).padStart(2, "0")}-01`;
  }
  m = s.match(ISO_DATE_RE);
  if (m) {
    const month = Number(m[2]);
    if (month >= 1 && month <= 12) return `${m[1]}-${String(month).padStart(2, "0")}-01`;
  }
  return null;
}

function toFullDateIso(raw: string): string | null {
  const s = String(raw || "").trim();
  const full = s.match(FULL_DATE_RE);
  if (full) {
    const day = Number(full[1]);
    const month = Number(full[2]);
    const year = Number(full[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return toMonthYearIso(s) ?? (s.match(ISO_DATE_RE) ? s.match(ISO_DATE_RE)![0].replace(/[\/.]/g, "-") : null);
}

function toDisplayMonthYear(iso: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : iso;
}

function normFabric(raw: string): string | null {
  const s = String(raw || "").trim().toUpperCase().replace(/[.\s]/g, "");
  if (s === "PU") return "PU";
  if (s === "NR") return "NR";
  if (s === "PVC") return "PVC";
  return null;
}

/* ------------------------------------------------------------------ */
/* Aba QUADRO — artigos + validades                                   */
/* ------------------------------------------------------------------ */

const QUADRO_LABEL_MAP: Record<string, { name: string; keepValidade: boolean }> = {
  "FIRST AID KIT": { name: "Farmácia SOLAS", keepValidade: true },
  AMBULANCIA: { name: "Farmácia SOLAS", keepValidade: true },
  "SEASICKNESS TABLES": { name: "Comprimidos p/ Enjoo", keepValidade: true },
  "COMPRIMIDOS P ENJOO": { name: "Comprimidos p/ Enjoo", keepValidade: true },
  "COMPRIMIDOS DE ENJOO": { name: "Comprimidos p/ Enjoo", keepValidade: true },
  "COMPRIMIDOS PARA ENJOO": { name: "Comprimidos p/ Enjoo", keepValidade: true },
  "PARACHUTE ROCKETS": { name: "Foguetes Paraquedas", keepValidade: true },
  "FOGUETOES PARAQUEDAS": { name: "Foguetes Paraquedas", keepValidade: true },
  "FOGUETES PARAQUEDAS": { name: "Foguetes Paraquedas", keepValidade: true },
  HANDFLARES: { name: "Fachos de Mão", keepValidade: true },
  "FACHOS DE MAO": { name: "Fachos de Mão", keepValidade: true },
  "SMOKE SIGNALS": { name: "Potes de Fumo", keepValidade: true },
  "POTES DE FUMO": { name: "Potes de Fumo", keepValidade: true },
  "TORCH BATTERIES": { name: "Pilhas para Lanterna", keepValidade: true },
  "PILHAS PARA LANTERNA": { name: "Pilhas para Lanterna", keepValidade: true },
  "TORCH WITH SPARES": { name: "Lanterna", keepValidade: false },
  LANTERNA: { name: "Lanterna", keepValidade: false },
  "TOP LIGHT AND BATTERY": { name: "Luz Exterior e Bateria", keepValidade: true },
  "LUZ EXTERIOR E BATERIA": { name: "Luz Exterior e Bateria", keepValidade: true },
  "INSIDE LIGHT AND BATTERY": { name: "Luz Interior e Bateria", keepValidade: true },
  "LUZ INTERIOR E BATERIA": { name: "Luz Interior e Bateria", keepValidade: true },
  "LITHIUM BATTERY": { name: "Luz Interior e Bateria", keepValidade: true },
  "BATERIA DE LITIO": { name: "Luz Interior e Bateria", keepValidade: true },
  "WATER SACHETS": { name: "Saco de Água", keepValidade: true },
  "SACO DE AGUA": { name: "Saco de Água", keepValidade: true },
  "FOOD RATIONS 0,5 KG": { name: "Rações Alimentares 0,5 Kg", keepValidade: true },
  "RACOES ALIMENTARES 0,5 KG": { name: "Rações Alimentares 0,5 Kg", keepValidade: true },
  "FOOD RATIONS": { name: "Rações Alimentares", keepValidade: true },
  "RACOES ALIMENTARES": { name: "Rações Alimentares", keepValidade: true },
  "THERMAL PROTECTIVE AIDS": { name: "Ajudas Térmicas", keepValidade: false },
  "AJUDAS TERMICAS": { name: "Ajudas Térmicas", keepValidade: false },
};

/** Mapa indexado pelo mesmo critério dos rótulos lidos da folha (normalizeKey). */
const QUADRO_LABEL_LOOKUP: Record<string, { name: string; keepValidade: boolean }> = (() => {
  const out: Record<string, { name: string; keepValidade: boolean }> = {};
  for (const [label, mapped] of Object.entries(QUADRO_LABEL_MAP)) {
    out[normalizeKey(label)] = mapped;
  }
  return out;
})();

const QUADRO_SKIP_LABEL = /RAMPA|BOARDING RAMP|ESCADA|LADDER|DATA FABRICO|MANUF/i;
const QUADRO_GROUPS: Array<{ itemCol: number; valCol: number }> = [
  { itemCol: 2, valCol: 3 },
  { itemCol: 4, valCol: 6 },
  { itemCol: 7, valCol: 10 },
];

function extractQuadroHeader(sheet: SheetGrid): Partial<HeaderFields> {
  const q = sheet;
  const out: Partial<HeaderFields> = {};
  const cert = q.grid["5_9"] || q.grid["5_10"] || "";
  const serial = findQuadroSerial(q) || q.grid["7_3"] || "";
  const ship = q.grid["7_5"] || "";
  const capRaw = q.grid["7_10"] || "";
  const mm8 = q.grid["7_8"] || "";
  const mm9 = q.grid["7_9"] || "";
  const fabRaw = q.grid["79_7"] || q.grid["79_8"] || "";
  const inspRaw = q.grid["81_6"] || q.grid["81_5"] || "";

  if (serial) out.raftSerial = serial;
  if (cert) out.certificadoNumero = cert;
  if (ship) out.shipName = ship;

  const cap = Number((capRaw.match(/\d{1,3}/) || [])[0]);
  if (Number.isFinite(cap) && cap > 0 && cap <= 200) out.capacity = String(cap);

  if (mm8 || mm9) {
    if (mm9 && normalizeKey(mm9) !== normalizeKey(mm8)) {
      out.brand = mm8;
      out.model = mm9;
    } else {
      const combined = (mm9 || mm8).trim();
      const parts = combined.split(/\s+/);
      if (parts.length >= 2) {
        out.brand = parts[0];
        out.model = parts.slice(1).join(" ");
      } else {
        out.model = combined;
      }
    }
  }

  const fabIso = toMonthYearIso(fabRaw);
  if (fabIso) out.dataFabrico = toDisplayMonthYear(fabIso);
  const inspIso = toFullDateIso(inspRaw);
  if (inspIso) out.dataInspecao = inspIso;

  return out;
}

function extractQuadroArtigos(sheet: SheetGrid): ExtractedArtigo[] {
  const byName = new Map<string, ExtractedArtigo>();
  for (let r = 9; r <= Math.min(sheet.maxRow, 90); r += 1) {
    for (const g of QUADRO_GROUPS) {
      const label = sheet.grid[`${r}_${g.itemCol}`];
      if (!label) continue;
      if (QUADRO_SKIP_LABEL.test(label)) continue;
      const key = normalizeKey(label);
      const mapped = QUADRO_LABEL_LOOKUP[key];
      if (!mapped) continue;
      const valRaw = sheet.grid[`${r}_${g.valCol}`] || "";
      const validade = mapped.keepValidade ? toMonthYearIso(valRaw) : null;
      const existing = byName.get(mapped.name);
      if (existing && existing.validade) continue;
      byName.set(mapped.name, {
        name: mapped.name,
        validade: validade ?? undefined,
      });
    }
  }
  return [...byName.values()];
}

/** Perecíveis listados na tabela de equipamento do próprio CERTIFICADO. */
function extractCertArtigos(sheet: SheetGrid): ExtractedArtigo[] {
  const byName = new Map<string, ExtractedArtigo>();
  for (const cellKey of Object.keys(sheet.grid)) {
    const [r, c] = cellKey.split("_").map(Number);
    const label = sheet.grid[cellKey];
    if (!label || label.length > 40) continue;
    const norm = normalizeKey(label);
    if (!norm) continue;
    let mapped: { name: string; keepValidade: boolean } | undefined;
    for (const [lk, mv] of Object.entries(QUADRO_LABEL_LOOKUP)) {
      if (norm === lk || norm.includes(lk)) { mapped = mv; break; }
    }
    if (!mapped) continue;

    let validade: string | undefined;
    if (mapped.keepValidade) {
      for (let dc = 1; dc <= 8; dc += 1) {
        const v = sheet.grid[`${r}_${c + dc}`];
        if (!v) continue;
        const iso = toMonthYearIso(v);
        if (iso) { validade = iso; break; }
      }
    }

    const existing = byName.get(mapped.name);
    if (existing && existing.validade) continue;
    byName.set(mapped.name, { name: mapped.name, validade });
  }
  return [...byName.values()];
}

function findQuadroSerial(sheet: SheetGrid): string {
  const direct = sheet.grid["7_3"];
  if (direct && /\d/.test(direct) && !FAB_DATE_RE.test(direct) && direct.length >= 4) return direct;
  for (const key of Object.keys(sheet.grid)) {
    const [r, c] = key.split("_").map(Number);
    const t = sheet.grid[key];
    if (/^JANGADA:?$|^LIFERAFT:?$/i.test(t)) {
      for (let dc = 1; dc <= 3; dc += 1) {
        const v = sheet.grid[`${r}_${c + dc}`];
        if (v && /\d/.test(v) && !FAB_DATE_RE.test(v) && v.length >= 4) return v;
      }
    }
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* Aba CERTIFICADO — identificação                                    */
/* ------------------------------------------------------------------ */

const HEADER_LABELS: Array<{ field: keyof HeaderFields; re: RegExp }> = [
  { field: "certificadoNumero", re: /certificado\s*(n|no|nº|num)|certificate\s*(no|n)/i },
  { field: "raftSerial", re: /no\.?\s*s[ée]rie|serial\s*no|n[ºo]?\s*de\s*s[ée]rie|^serial$/i },
  { field: "brand", re: /marca|brand|fabricante|manufacturer/i },
  { field: "model", re: /modelo|model/i },
  { field: "capacity", re: /lota[çc][ãa]o|capacidade|capacity|persons/i },
  { field: "ownerName", re: /armador|owner|propriet[áa]rio/i },
  { field: "shipName", re: /navio|embarca[çc][ãa]o|^ship$|vessel/i },
  { field: "dataInspecao", re: /data\s*(de\s*)?inspec|inspection\s*date|date\s*of\s*insp/i },
  { field: "dataProxInspecao", re: /pr[óo]xima\s*(data\s*de\s*)?inspec|next\s*insp|pr[óo]x\.?\s*insp|validade|expiry|expira/i },
  { field: "emergencyPackType", re: /pack|solas|iso\s*9650|tipo\s*de\s*equip/i },
  { field: "cylinderSerial", re: /cilindro.*s[ée]rie|cylinder.*serial|serial.*cilindro/i },
  { field: "cylinderCo2", re: /co2/i },
  { field: "cylinderN2", re: /n2|nitrog/i },
  { field: "cylinderTara", re: /\btara\b/i },
  { field: "cylinderPesoBruto", re: /peso\s*bruto|gross\s*weight/i },
  { field: "cylinderSistema", re: /sistema\s*(de\s*)?insufl|inflation/i },
];

const LABELISH_RE = /serial|s[ée]rie|fabr|manuf|fabric|tela|modelo|model|capac|length|height|painter|retenida|lan[çc]amento|date of|data de|inspection|inspec|certificate|certificado|no\.|número|numero|name|navio|embarca|ship|owner|cylind|validade|address|morada|pack|solas|marca|brand|co2|n2|\btara\b|peso|identific|\btipo\b|\btype\b/i;

function isPlausibleHeaderValue(field: keyof HeaderFields, value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/^[\s:;\-–—]+$/.test(text)) return false;

  switch (field) {
    case "capacity": {
      const n = Number((text.match(/\d{1,3}/) || [])[0]);
      return Number.isFinite(n) && n > 0 && n <= 200;
    }
    case "dataInspecao":
    case "dataProxInspecao":
      return Boolean(toFullDateIso(text));
    case "cylinderCo2":
    case "cylinderN2":
    case "cylinderTara":
    case "cylinderPesoBruto":
      return /\d/.test(text);
    case "certificadoNumero":
      return text.length >= 3 && /[a-z0-9]/i.test(text);
    case "raftSerial":
    case "cylinderSerial":
      return text.length >= 4 && /[a-z0-9]/i.test(text) && /\d/.test(text) && !FAB_DATE_RE.test(text);
    case "shipName":
    case "ownerName":
      return text.length >= 3 && !/^serial\b|^date\b/i.test(text);
    case "brand":
    case "model":
    case "emergencyPackType":
    case "cylinderSistema":
      return text.length >= 2 && !LABELISH_RE.test(text);
    default:
      return text.length > 0;
  }
}

function scanCertHeader(sheet: SheetGrid): Partial<HeaderFields> {
  const at = (r: number, c: number) => sheet.grid[`${r}_${c}`] ?? "";
  const out: Partial<HeaderFields> = {};

  const candidates = (r: number, c: number): string[] => {
    const values: string[] = [];
    for (let dc = 1; dc <= 4; dc += 1) {
      const t = at(r, c + dc);
      if (t) values.push(t);
    }
    for (let dr = 1; dr <= 3; dr += 1) {
      for (let dc = -1; dc <= 4; dc += 1) {
        const t = at(r + dr, c + dc);
        if (t) values.push(t);
      }
    }
    return values;
  };

  for (const key of Object.keys(sheet.grid)) {
    const [r, c] = key.split("_").map(Number);
    const t = sheet.grid[key];

    if (!out.certificadoNumero) {
      const certMatch = t.match(/AZ\d{2}-\d+/i);
      if (certMatch) out.certificadoNumero = certMatch[0].toUpperCase();
    }

    // Ignorar células de texto corrido (frases legais com "manufacturer", etc.).
    if (t.length > 45) continue;

    for (const { field, re } of HEADER_LABELS) {
      if (out[field]) continue;
      if (!re.test(t)) continue;
      for (const cand of candidates(r, c)) {
        if (LABELISH_RE.test(cand)) continue;
        if (isPlausibleHeaderValue(field, cand)) {
          out[field] = field === "dataInspecao" || field === "dataProxInspecao" ? toFullDateIso(cand) ?? cand : cand.trim();
          break;
        }
      }
    }

    if (!out.model && /^(type|tipo)\s*[:.]?$/i.test(t.trim())) {
      for (const cand of candidates(r, c)) {
        if (LABELISH_RE.test(cand)) continue;
        if (isPlausibleHeaderValue("model", cand)) {
          out.model = cand.trim();
          break;
        }
      }
    }

    if (!out.dataFabrico && /data de fabr|data fabrico|date of manuf|manuf/i.test(t)) {
      for (const cand of candidates(r, c)) {
        const iso = toMonthYearIso(cand);
        if (iso) {
          out.dataFabrico = toDisplayMonthYear(iso);
          break;
        }
      }
    }

    if (!out.fabricType && /tipo de tela|fabric type|canvas/i.test(t)) {
      for (const cand of candidates(r, c)) {
        const f = normFabric(cand);
        if (f) {
          out.fabricType = f;
          break;
        }
      }
    }
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Extração genérica (fallback)                                       */
/* ------------------------------------------------------------------ */

function analyzeGenericRows(rows: Row[]) {
  const header = inferHeader(rows);
  const artigos = extractChecklistArticles(rows)
    .map((a) => ({
      name: a.name || "",
      validade: a.validade ? toFullDateIso(a.validade) ?? a.validade : undefined,
      quantidade: a.quantidade,
      referencia: a.referencia,
      codigoFabricante: a.codigoFabricante,
    }))
    .filter((a) => a.name);
  return { header, artigos };
}

/* ------------------------------------------------------------------ */
/* Entradas públicas                                                  */
/* ------------------------------------------------------------------ */

export function detectFileType(fileName: string, buffer: Buffer): "pdf" | "excel" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (/\.(xlsx|xlsm|xls)$/.test(lower)) return "excel";
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("latin1") === "%PDF") return "pdf";
  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) return "excel";
  return "pdf";
}

type WorkbookSheet = { name: string; sheet: SheetGrid };

async function analyzeExcelWithXlsx(fileName: string, buffer: Buffer): Promise<AnalyzeResult> {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheets: WorkbookSheet[] = workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    return { name, sheet: buildSheetGridFromMatrix(matrix) };
  }).filter((sheet) => sheet.sheet.maxRow > 0);

  return analyzeExcelSheets(fileName, buffer, sheets);
}

async function analyzeExcel(fileName: string, buffer: Buffer): Promise<AnalyzeResult> {
  let sheets: WorkbookSheet[] = [];
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    sheets = wb.worksheets
      .map((ws) => ({ name: ws.name, sheet: buildSheetGrid(ws) }))
      .filter((sheet) => sheet.sheet.maxRow > 0);
  } catch (error) {
    // O ExcelJS só lê o formato OOXML (.xlsx/.xlsm). Os .xls antigos
    // (BIFF) e alguns ficheiros exportados por sistemas legacy precisam
    // do leitor alternativo.
    console.warn("[ia-import-document] ExcelJS falhou; a tentar XLSX", fileName, error);
    return analyzeExcelWithXlsx(fileName, buffer);
  }

  return analyzeExcelSheets(fileName, buffer, sheets);
}

function analyzeExcelSheets(fileName: string, buffer: Buffer, sheets: WorkbookSheet[]): AnalyzeResult {
  const certSheet = sheets.find((s) => /certificad/i.test(s.name)) ?? null;
  const quadroSheet = sheets.find((s) => /quadro|worksheet|inspection/i.test(s.name)) ?? null;
  const primary = certSheet ?? quadroSheet ?? sheets[0] ?? null;

  const rows = primary ? matrixToRows(primary.sheet) : [];
  const rawText = sheets.map((s) => `# ${s.name}\n${gridToText(s.sheet)}`).join("\n\n");
  const analysis = summarizeImportRows(rows, fileName, primary?.name ?? null);

  let header: HeaderFields = { ...EMPTY_HEADER };
  let artigos: ExtractedArtigo[] = [];
  let quadroHeader: Partial<HeaderFields> | null = null;

  if (quadroSheet) {
    quadroHeader = extractQuadroHeader(quadroSheet.sheet);
    artigos = extractQuadroArtigos(quadroSheet.sheet);
  }

  if (certSheet) {
    const scanned = scanCertHeader(certSheet.sheet);
    header = { ...header, ...mergeNonEmpty(header, scanned) };
    const certArtigos = extractCertArtigos(certSheet.sheet);
    const have = new Set(artigos.map((a) => a.name));
    for (const a of certArtigos) {
      if (!have.has(a.name)) {
        artigos.push(a);
        have.add(a.name);
      }
    }
  }

  if (!certSheet && !quadroSheet) {
    const generic = analyzeGenericRows(rows);
    header = mergeNonEmpty(header, generic.header);
    artigos = generic.artigos;
  }

  header = mergeNonEmpty(header, inferHeader(rows));

  // A aba QUADRO é a fonte mais fiável: sobrepõe-se ao resultado difuso.
  if (quadroHeader) {
    for (const [key, value] of Object.entries(quadroHeader)) {
      if (value != null && String(value).trim()) (header as Record<string, unknown>)[key] = value;
    }
  }

  // Higienização: campos que têm de obedecer a um formato conhecido.
  const fabCheck = header.dataFabrico ? toMonthYearIso(header.dataFabrico) : null;
  header.dataFabrico = fabCheck ? toDisplayMonthYear(fabCheck) : "";
  header.fabricType = normFabric(header.fabricType) ?? "";
  if (header.brand && !/[a-z]/i.test(header.brand)) header.brand = "";
  if (header.model && !/[a-z]/i.test(header.model)) header.model = "";

  return {
    fileName,
    fileType: "excel",
    sizeBytes: buffer.length,
    summary: { sheetCount: sheets.length, estimatedRecords: rows.length },
    preview: {
      columns: primary?.sheet.columns ?? [],
      rows,
      rawTextFull: rawText,
      sourceSheetName: primary?.name,
      extractedHeader: header,
      extractedArtigos: artigos,
      analysis,
    },
  };
}

const PDF_FIELD_PATTERNS: Array<{ field: keyof HeaderFields; re: RegExp }> = [
  { field: "certificadoNumero", re: /(AZ\d{2}-\d+)/i },
  { field: "raftSerial", re: /(?:jangada|liferaft|n[ºo]?\s*de\s*s[ée]rie|serial\s*no|s[ée]rie)\s*[:.]?\s*([A-Z0-9][A-Z0-9\-]{3,})/i },
  { field: "dataFabrico", re: /(?:data\s*(?:de\s*)?fabr[io]co|date\s*of\s*manuf)\s*[:.]?\s*(\d{1,2}[\/\-.]\d{4})/i },
  { field: "fabricType", re: /(?:tipo\s*de\s*tela|fabric\s*type)\s*[:.]?\s*(PU|NR|PVC)/i },
  { field: "capacity", re: /(?:lota[çc][ãa]o|capacidade|capacity|persons)\s*[:.]?\s*(\d{1,3})/i },
  { field: "brand", re: /(?:marca|brand)\s*[:.]?\s*(.+)/i },
  { field: "model", re: /(?:modelo|model)\s*[:.]?\s*(.+)/i },
  { field: "ownerName", re: /(?:armador|owner)\s*[:.]?\s*(.+)/i },
  { field: "shipName", re: /(?:nome\s*do\s*navio|name\s*of\s*ship|navio|embarca[çc][ãa]o)\s*[:.]?\s*(.+)/i },
  { field: "dataInspecao", re: /(?:data\s*(?:de\s*)?inspec[çc][ãa]o|inspection\s*date)\s*[:.]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})/i },
  { field: "dataProxInspecao", re: /(?:pr[óo]xima\s*(?:data\s*de\s*)?inspec|next\s*insp)\s*[:.]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}|\d{1,2}[\/\-.]\d{4})/i },
  { field: "cylinderCo2", re: /\bco2\b\s*[:.]?\s*([\d.,]+)/i },
  { field: "cylinderN2", re: /\bn2\b\s*[:.]?\s*([\d.,]+)/i },
];

// Os certificados Orey têm etiquetas numa linha e os valores na linha seguinte
// (por exemplo "Identificação: Tipo: ..." e depois "ZODIAC COASTAL PT 6 ...").
// Estes extratores leem esse layout tabular, que as regex "etiqueta: valor"
// não conseguem apanhar.
function looksLikeLabelLine(line: string): boolean {
  const text = String(line || "").trim();
  if (!text) return false;
  const colons = (text.match(/:/g) || []).length;
  if (colons >= 2) return true;
  return /^(identifica[çc][ãa]o|identification|marca|modelo|capacidade|capacity|serial|s[ée]rie|tipo|data|fabric|cilindros?|cylinders?|equipamento|equipment)\b/i.test(
    text,
  );
}

function nextValueLine(lines: string[], fromIndex: number): string | null {
  for (let i = fromIndex + 1; i < Math.min(fromIndex + 5, lines.length); i += 1) {
    const value = String(lines[i] || "").trim();
    if (!value || looksLikeLabelLine(value)) continue;
    return value;
  }
  return null;
}

function nextDateValueLine(lines: string[], fromIndex: number): string | null {
  for (let i = fromIndex + 1; i < Math.min(fromIndex + 5, lines.length); i += 1) {
    const value = String(lines[i] || "").trim();
    if (!value) continue;
    if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}\b/.test(value)) return value;
    if (looksLikeLabelLine(value)) continue;
  }
  return null;
}

const PDF_KNOWN_BRANDS = [
  "RFD",
  "ZODIAC",
  "DSB",
  "ALMAR",
  "EUROVINIL",
  "SURVITEC",
  "VIKING",
  "PLASTIMO",
  "LALIZAS",
  "BOMBARD",
  "OCEAN SAFETY",
];

function extractPdfHeaderFromLines(lines: string[]): Partial<HeaderFields> {
  const extracted: Partial<HeaderFields> = {};

  const setIfEmpty = (field: keyof HeaderFields, value: string | null | undefined) => {
    const text = String(value ?? "").trim();
    if (text && !extracted[field]) extracted[field] = text;
  };

  // Bloco de identificação (linha de valores imediatamente após o cabeçalho).
  const identIndex = lines.findIndex((line) => /^(identifica[çc][ãa]o|identification)\b/i.test(line));
  if (identIndex >= 0) {
    const valuesLine = nextValueLine(lines, identIndex);
    if (valuesLine) {
      const row = valuesLine.match(/^(.+?)\s+(\d{1,3})\s+([A-Z0-9][A-Z0-9\-]{2,})\s+(\d{1,2}[\/\-]\d{4})$/i);
      if (row) {
        const brandModel = row[1].trim().split(/\s+/);
        const firstToken = String(brandModel[0] || "").toUpperCase();
        const knownBrand = PDF_KNOWN_BRANDS.find((brand) => brand === firstToken);
        if (knownBrand) {
          setIfEmpty("brand", brandModel[0]);
          setIfEmpty("model", brandModel.slice(1).join(" "));
        } else {
          // Sem marca impressa: não inventar, manter o texto todo como modelo.
          setIfEmpty("model", brandModel.join(" "));
        }
        setIfEmpty("capacity", row[2]);
        setIfEmpty("raftSerial", row[3]);
        const manufacture = toMonthYearIso(row[4]);
        if (manufacture) setIfEmpty("dataFabrico", toDisplayMonthYear(manufacture));
      }
    }
  }

  // Tipo de tela e medidas: valores na linha seguinte ao cabeçalho.
  const fabricIndex = lines.findIndex((line) => /^(tipo\s*de\s*tela|fabric\s*type)\b/i.test(line));
  if (fabricIndex >= 0) {
    const valuesLine = nextValueLine(lines, fabricIndex);
    if (valuesLine) {
      const fabric = valuesLine.match(/\b(PU|NR|PVC)\b/i);
      if (fabric) setIfEmpty("fabricType", normFabric(fabric[1]) ?? "");
    }
  }

  // Cilindro: "<série> <CO2> kg <N2> kg <MM/AAAA>".
  const cylinderIndex = lines.findIndex((line) => /^(cilindros?|cylinders?)\b/i.test(line));
  if (cylinderIndex >= 0) {
    const valuesLine = nextValueLine(lines, cylinderIndex);
    if (valuesLine) {
      const cylinder = valuesLine.match(
        /^([A-Z0-9\-]{3,})\s+([\d.,]+)\s*(?:kg)?\s+([\d.,]+)\s*(?:kg)?\s+(\d{1,2}[\/\-]\d{4})$/i,
      );
      if (cylinder) {
        setIfEmpty("cylinderSerial", cylinder[1]);
        setIfEmpty("cylinderCo2", cylinder[2]);
        setIfEmpty("cylinderN2", cylinder[3]);
      }
    }
  }

  const inspectionIndex = lines.findIndex((line) =>
    /(?:data\s*da\s*inspec[çc][ãa]o|date\s*of\s*inspection)/i.test(line),
  );
  if (inspectionIndex >= 0) {
    const valueLine = nextDateValueLine(lines, inspectionIndex);
    if (valueLine) {
      const dates = [...valueLine.matchAll(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/g)]
        .map((match) => toFullDateIso(match[0]))
        .filter((value): value is string => Boolean(value));
      if (dates[0]) setIfEmpty("dataInspecao", dates[0]);
      const nextDate = dates.find((value) => value !== dates[0]);
      if (nextDate) setIfEmpty("dataProxInspecao", nextDate);
    }
  }

  const shipIndex = lines.findIndex((line) =>
    /(?:nome\s*do\s*navio|name\s*of\s*ship)/i.test(line),
  );
  if (shipIndex >= 0) {
    const sameLine = lines[shipIndex].replace(/.*(?:nome\s*do\s*navio|name\s*of\s*ship)\s*[:.]?/i, "").trim();
    setIfEmpty("shipName", sameLine || nextValueLine(lines, shipIndex));
  }

  const ownerIndex = lines.findIndex((line) => /(?:armador|ship\s*owner)\b/i.test(line));
  if (ownerIndex >= 0) {
    const sameLine = lines[ownerIndex].replace(/.*(?:armador|ship\s*owner)\s*[:.]?/i, "").trim();
    setIfEmpty("ownerName", sameLine || nextValueLine(lines, ownerIndex));
  }

  return extracted;
}

function analyzePdfText(fileName: string, buffer: Buffer, text: string): AnalyzeResult {
  const cleanText = text.replace(/\r/g, "");
  const lines = cleanText.split("\n").map((l) => l.trim()).filter(Boolean);
  const header: HeaderFields = { ...EMPTY_HEADER, ...extractPdfHeaderFromLines(lines) };

  for (const { field, re } of PDF_FIELD_PATTERNS) {
    if (header[field]) continue;
    const m = cleanText.match(re);
    if (!m || !m[1]) continue;
    const value = m[1].trim();
    if (field === "dataFabrico") {
      const iso = toMonthYearIso(value);
      if (iso) header.dataFabrico = toDisplayMonthYear(iso);
    } else if (field === "dataInspecao" || field === "dataProxInspecao") {
      const iso = toFullDateIso(value);
      if (iso) header[field] = iso;
    } else if (field === "fabricType") {
      header.fabricType = normFabric(value) ?? "";
    } else if (isPlausibleHeaderValue(field, value)) {
      header[field] = value.replace(/\s+/g, " ").trim();
    }
  }

  const artigos: ExtractedArtigo[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i += 1) {
    const window = `${lines[i]} ${lines[i + 1] ?? ""}`;
    const norm = normalizeKey(lines[i]);
    for (const [key, mapped] of Object.entries(QUADRO_LABEL_LOOKUP)) {
      if (!norm.includes(key)) continue;
      if (seen.has(mapped.name)) break;
      const dateMatch = window.match(/(\d{1,2}[\/\-.]\d{4})/);
      const validade = mapped.keepValidade && dateMatch ? toMonthYearIso(dateMatch[1]) : null;
      artigos.push({ name: mapped.name, validade: validade ?? undefined });
      seen.add(mapped.name);
      break;
    }
  }

  const rows: Row[] = lines.map((line, index) => {
    const obj: Row = { linha: index + 1 };
    line.split(/\t|\s{2,}/).forEach((cell, cellIndex) => {
      obj[`col${cellIndex + 1}`] = cell.trim() || null;
    });
    return obj;
  });

  const warning =
    cleanText.replace(/\s+/g, "").length < 40
      ? "PDF sem texto extraível (provavelmente digitalizado/scan). A extração automática não consegue ler imagens — preencha os dados manualmente."
      : undefined;

  return {
    fileName,
    fileType: "pdf",
    sizeBytes: buffer.length,
    warning,
    summary: { words: (cleanText.match(/\S+/g) || []).length, lines: lines.length },
    preview: {
      columns: ["linha", "col1", "col2", "col3", "col4"],
      rows,
      rawTextFull: cleanText,
      extractedHeader: header,
      extractedArtigos: artigos,
      analysis: summarizeImportRows([], fileName, null),
    },
  };
}

export async function analyzeImportFile(params: { fileName: string; buffer: Buffer }): Promise<AnalyzeResult> {
  const { fileName, buffer } = params;
  const fileType = detectFileType(fileName, buffer);

  if (fileType === "excel") {
    return analyzeExcel(fileName, buffer);
  }

  let text = "";
  try {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText({});
      text = typeof result?.text === "string" ? result.text : "";
    } finally {
      await parser.destroy();
    }
  } catch {
    text = "";
  }

  return analyzePdfText(fileName, buffer, text);
}

function mergeNonEmpty<T extends Record<string, unknown>>(base: T, extra: Partial<T> | undefined | null): T {
  if (!extra) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(extra)) {
    if (value == null) continue;
    const text = String(value).trim();
    if (!text) continue;
    if (!String(out[key] ?? "").trim()) out[key] = value;
  }
  return out as T;
}
