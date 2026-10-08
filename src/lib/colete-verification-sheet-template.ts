import ExcelJS from 'exceljs';
import { loadTemplateBuffer } from '@/lib/template-loader';
import { APP_CONFIG } from '@/lib/app-config';
import { lifejacketModelData, type LifejacketBrandCatalog, type LifejacketModel } from '@/modules/lifejackets/lifejacketModelData';

const TEMPLATE_NAME = 'template Ficha de Verif. Múltipla.xlsx';
type XlsxLoadArg = Parameters<ExcelJS.Xlsx['load']>[0];
const SHEET_NAME = 'IM.022 - Ficha Verif. Múltipla';
const ROWS_PER_SHEET = 15;
const MANUAL_BLOCK_MARKER = '[SISTEMA DE INSUFLAÇÃO - MANUAL]';
const MANUAL_CHECKLIST_MARKER = '[CHECKLIST MANUAL DO COLETE]';

type ChecklistStatus = 'OK' | 'F' | 'S' | 'R' | '';

export type ColeteVerificationSheetRowInput = {
  id: number;
  serial: string;
  marca?: string | null;
  modelo?: string | null;
  tamanho?: string | null;
  dataFabrico?: string | null;
  latestVerification?: {
    dataVerificacao?: string | Date | null;
    inspectorNome?: string | null;
    observacoes?: string | null;
    tecidoExterior?: string | null;
    colagens?: string | null;
    zataosVelcro?: string | null;
    fitasReflectoras?: string | null;
    sistemaInflacao?: string | null;
    mecanismoInflacao?: string | null;
    camaras?: string | null;
    garrafaCO2?: string | null;
    tuboInflador?: string | null;
  } | null;
};

export type NavioColetesVerificationSheetInput = {
  shipName: string;
  shipFlag?: string | null;
  clientOrVessel?: string | null;
  serviceStation?: string | null;
  technician?: string | null;
  workNumber?: string | null;
  inspectionDate?: string | Date | null;
  nextInspectionDate?: string | Date | null;
  notes?: string | null;
  rows: ColeteVerificationSheetRowInput[];
};

function asString(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ');
}

function formatDateDDMMYYYY(value: unknown) {
  const raw = asString(value);
  if (!raw) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-');
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

function sanitizeFileNameSegment(value: unknown, fallback: string) {
  return asString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || fallback;
}

function normalizeChecklistStatus(value: unknown): ChecklistStatus {
  const normalized = asString(value).toUpperCase();
  if (normalized === 'OK' || normalized === 'F' || normalized === 'S' || normalized === 'R') return normalized;
  return '';
}

function normalizeMechanismCode(value: unknown) {
  const normalized = asString(value).toUpperCase();
  if (!normalized) return '';
  if (['HM', 'HR', 'SEC', 'LZ', 'UML', 'CREW', 'PL'].includes(normalized)) return normalized;
  if (normalized.includes('HAMMAR')) return 'HM';
  if (normalized.includes('HALKEY')) return 'HR';
  if (normalized.includes('SECUMAR')) return 'SEC';
  if (normalized.includes('LALIZAS')) return 'LZ';
  if (normalized.includes('UNITED') || normalized.includes('UML')) return 'UML';
  if (normalized.includes('CREWSAVER')) return 'CREW';
  if (normalized.includes('PLASTIMO')) return 'PL';
  return normalized.slice(0, 10);
}

function chunkRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks.length ? chunks : [[]];
}

function writeCellValue(cell: ExcelJS.Cell, value: string) {
  cell.value = value;
  if (value.includes('\n')) {
    cell.alignment = {
      ...(cell.alignment || {}),
      wrapText: true,
      vertical: cell.alignment?.vertical || 'top',
    };
  }
}

function resolveWritableCell(cell?: ExcelJS.Cell | null): ExcelJS.Cell | null {
  if (!cell) return null;

  try {
    const master = (cell as ExcelJS.Cell & { master?: ExcelJS.Cell | null }).master;
    if (master && master !== cell) return master;
  } catch {
    // Ignore merged-cell edge cases and fall back to the original cell.
  }

  return cell;
}

function writeValueToAddress(worksheet: ExcelJS.Worksheet, address: string, value: unknown, options?: { allowEmpty?: boolean }) {
  const normalizedValue = asString(value);
  if (!normalizedValue && !options?.allowEmpty) return;

  const writableCell = resolveWritableCell(worksheet.getCell(address));
  if (!writableCell) return;
  writeCellValue(writableCell, normalizedValue);
}

function clearValueAtAddress(worksheet: ExcelJS.Worksheet, address: string) {
  const writableCell = resolveWritableCell(worksheet.getCell(address));
  if (!writableCell) return;
  writableCell.value = '';
}

function resolveTechnicalCatalog(marca?: string | null, modelo?: string | null): {
  brandCatalog: LifejacketBrandCatalog | null;
  model: LifejacketModel | null;
} {
  const normalizedBrand = normalizeText(marca);
  const brandCatalog = lifejacketModelData.find((entry) => normalizeText(entry.brand) === normalizedBrand) || null;
  if (!brandCatalog) {
    return { brandCatalog: null, model: null };
  }

  const normalizedModel = normalizeText(modelo);
  const matchedModel = brandCatalog.models.find((entry) => {
    const candidate = normalizeText(entry.model);
    return candidate === normalizedModel || candidate.includes(normalizedModel) || normalizedModel.includes(candidate);
  }) || null;

  return { brandCatalog, model: matchedModel };
}

function getChamberCount(model: LifejacketModel | null) {
  const chamber = normalizeText(model?.chamber || '');
  if (!chamber) return '';
  if (chamber.includes('dupla') || chamber.includes('twin') || chamber.includes('dual')) return '2';
  if (chamber.includes('simples') || chamber.includes('single')) return '1';
  return '';
}

type ParsedManualObservation = {
  baseRemark: string;
  mechanism: string;
  capsuleRef: string;
  capsuleExpiry: string;
  cylinderRefs: string[];
  cylinderExpiryValues: string[];
  lightRef: string;
  lightExpiry: string;
  clipRef: string;
};

function parseFieldLine(text: string, label: string) {
  const regex = new RegExp(`^-\\s*${label.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*:\\s*(.*)$`, 'i');
  const line = text.split(/\r?\n/).find((entry) => regex.test(entry.trim()));
  if (!line) return '';
  const match = line.trim().match(regex);
  return asString(match?.[1] || '');
}

function parseManualObservation(observacoes?: string | null): ParsedManualObservation {
  const text = String(observacoes || '');
  if (!text.trim()) {
    return {
      baseRemark: '',
      mechanism: '',
      capsuleRef: '',
      capsuleExpiry: '',
      cylinderRefs: [],
      cylinderExpiryValues: [],
      lightRef: '',
      lightExpiry: '',
      clipRef: '',
    };
  }

  const markerIndex = text.indexOf(MANUAL_BLOCK_MARKER);
  const checklistIndex = text.indexOf(MANUAL_CHECKLIST_MARKER);
  const baseRemark = (markerIndex >= 0 ? text.slice(0, markerIndex) : checklistIndex >= 0 ? text.slice(0, checklistIndex) : text)
    .trim();

  const mechanism = parseFieldLine(text, 'Mecanismo selecionado');
  const capsuleRef = parseFieldLine(text, 'Cápsula referência');
  const capsuleExpiry = parseFieldLine(text, 'Cápsula validade');
  const cylinder1 = parseFieldLine(text, 'Garrafa CO₂ #1');
  const cylinder2 = parseFieldLine(text, 'Garrafa CO₂ #2');
  const lightRefLine = parseFieldLine(text, 'Luz referência');
  const clipRef = parseFieldLine(text, 'Clip de segurança');

  const extractRef = (value: string) => asString(value.replace(/\(.*?\)/g, '').replace(/^N\/D$/i, '').replace(/^Não aplicável$/i, ''));
  const extractExpiry = (value: string) => {
    const match = value.match(/Val:\s*([^\)]+)/i);
    return asString(match?.[1] || '');
  };

  const cylinderRefs = [extractRef(cylinder1), extractRef(cylinder2)].filter(Boolean);
  const cylinderExpiryValues = [extractExpiry(cylinder1), extractExpiry(cylinder2)].filter(Boolean);

  return {
    baseRemark,
    mechanism,
    capsuleRef,
    capsuleExpiry,
    cylinderRefs,
    cylinderExpiryValues,
    lightRef: extractRef(lightRefLine),
    lightExpiry: extractExpiry(lightRefLine),
    clipRef: extractRef(clipRef),
  };
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => asString(value)).filter(Boolean)));
}

function buildMaterialLines(rows: ColeteVerificationSheetRowInput[]) {
  const parsedRows = rows.map((row) => parseManualObservation(row.latestVerification?.observacoes));

  return [
    {
      rowNumber: 25,
      item: 'Baterias/Luzes',
      reference: uniqueNonEmpty(parsedRows.map((row) => row.lightRef)).join(' ; '),
      quantity: uniqueNonEmpty(parsedRows.map((row) => row.lightRef)).length ? String(uniqueNonEmpty(parsedRows.map((row) => row.lightRef)).length) : '',
      expiry: uniqueNonEmpty(parsedRows.map((row) => row.lightExpiry)).join(' ; '),
    },
    {
      rowNumber: 27,
      item: 'Mecanismo de Insuflação',
      reference: uniqueNonEmpty(parsedRows.flatMap((row) => [row.mechanism, row.capsuleRef])).join(' ; '),
      quantity: uniqueNonEmpty(parsedRows.map((row) => row.capsuleRef)).length ? String(uniqueNonEmpty(parsedRows.map((row) => row.capsuleRef)).length) : '',
      expiry: uniqueNonEmpty(parsedRows.map((row) => row.capsuleExpiry)).join(' ; '),
    },
    {
      rowNumber: 28,
      item: 'Garrafa CO2',
      reference: uniqueNonEmpty(parsedRows.flatMap((row) => row.cylinderRefs)).join(' ; '),
      quantity: parsedRows.reduce((acc, row) => acc + row.cylinderRefs.length, 0) ? String(parsedRows.reduce((acc, row) => acc + row.cylinderRefs.length, 0)) : '',
      expiry: uniqueNonEmpty(parsedRows.flatMap((row) => row.cylinderExpiryValues)).join(' ; '),
    },
    {
      rowNumber: 32,
      item: 'Outro',
      reference: uniqueNonEmpty(parsedRows.map((row) => row.clipRef)).join(' ; '),
      quantity: uniqueNonEmpty(parsedRows.map((row) => row.clipRef)).length ? String(uniqueNonEmpty(parsedRows.map((row) => row.clipRef)).length) : '',
      expiry: '',
    },
  ];
}

function buildRemarks(rows: ColeteVerificationSheetRowInput[]) {
  const lines = rows
    .map((row) => {
      const parsed = parseManualObservation(row.latestVerification?.observacoes);
      const latestDate = formatDateDDMMYYYY(row.latestVerification?.dataVerificacao);
      if (!parsed.baseRemark) return '';
      return `#${row.serial}${latestDate ? ` (${latestDate})` : ''}: ${parsed.baseRemark}`;
    })
    .filter(Boolean);

  return lines.join('\n');
}

function cloneTemplateSheet(workbook: ExcelJS.Workbook, templateSheet: ExcelJS.Worksheet, name: string) {
  const sheet = workbook.addWorksheet(name);
  sheet.model = structuredClone(templateSheet.model as ExcelJS.WorksheetModel);
  return sheet;
}

function fillServiceInformation(worksheet: ExcelJS.Worksheet, input: NavioColetesVerificationSheetInput, rows: ColeteVerificationSheetRowInput[]) {
  const technician = asString(input.technician) || APP_CONFIG.issuerName;
  const notes = [
    asString(input.notes),
    rows.length ? `Folha com ${rows.length} colete(s).` : '',
  ].filter(Boolean).join(' ');

  writeValueToAddress(worksheet, 'AC41', asString(input.serviceStation) || APP_CONFIG.name);
  writeValueToAddress(worksheet, 'AC42', technician.toUpperCase());
  writeValueToAddress(worksheet, 'AC43', asString(input.workNumber));
  writeValueToAddress(worksheet, 'AC44', formatDateDDMMYYYY(input.inspectionDate));
  writeValueToAddress(worksheet, 'AC45', formatDateDDMMYYYY(input.nextInspectionDate));
  writeValueToAddress(worksheet, 'AC46', asString(input.clientOrVessel) || asString(input.shipName));
  writeValueToAddress(worksheet, 'AC47', asString(input.shipFlag) || 'Portugal');
  writeValueToAddress(worksheet, 'AC49', notes, { allowEmpty: true });
}

function fillMaterialTable(worksheet: ExcelJS.Worksheet, rows: ColeteVerificationSheetRowInput[]) {
  const materials = buildMaterialLines(rows);
  for (const material of materials) {
    writeValueToAddress(worksheet, `Q${material.rowNumber}`, material.item, { allowEmpty: true });
    writeValueToAddress(worksheet, `W${material.rowNumber}`, material.reference, { allowEmpty: true });
    writeValueToAddress(worksheet, `Z${material.rowNumber}`, material.quantity, { allowEmpty: true });
    writeValueToAddress(worksheet, `AC${material.rowNumber}`, material.expiry, { allowEmpty: true });
  }
}

function fillRemarks(worksheet: ExcelJS.Worksheet, rows: ColeteVerificationSheetRowInput[]) {
  writeValueToAddress(worksheet, 'B62', buildRemarks(rows), { allowEmpty: true });
}

function fillRow(worksheet: ExcelJS.Worksheet, row: ColeteVerificationSheetRowInput, rowIndex: number, globalIndex: number) {
  const visualRow = 7 + rowIndex;
  const identificationRow = 45 + rowIndex;
  const { model } = resolveTechnicalCatalog(row.marca, row.modelo);

  writeValueToAddress(worksheet, `B${visualRow}`, String(globalIndex));
  writeValueToAddress(worksheet, `C${visualRow}`, normalizeChecklistStatus(row.latestVerification?.tecidoExterior), { allowEmpty: true });
  writeValueToAddress(worksheet, `D${visualRow}`, normalizeChecklistStatus(row.latestVerification?.colagens), { allowEmpty: true });
  writeValueToAddress(worksheet, `E${visualRow}`, normalizeChecklistStatus(row.latestVerification?.zataosVelcro), { allowEmpty: true });
  writeValueToAddress(worksheet, `F${visualRow}`, normalizeChecklistStatus(row.latestVerification?.fitasReflectoras), { allowEmpty: true });
  writeValueToAddress(worksheet, `G${visualRow}`, normalizeChecklistStatus(row.latestVerification?.sistemaInflacao), { allowEmpty: true });
  writeValueToAddress(worksheet, `H${visualRow}`, normalizeMechanismCode(row.latestVerification?.mecanismoInflacao), { allowEmpty: true });
  writeValueToAddress(worksheet, `J${visualRow}`, normalizeChecklistStatus(row.latestVerification?.camaras), { allowEmpty: true });
  writeValueToAddress(worksheet, `K${visualRow}`, normalizeChecklistStatus(row.latestVerification?.garrafaCO2), { allowEmpty: true });
  writeValueToAddress(worksheet, `L${visualRow}`, normalizeChecklistStatus(row.latestVerification?.tuboInflador), { allowEmpty: true });
  writeValueToAddress(worksheet, `AA${visualRow}`, normalizeChecklistStatus(row.latestVerification?.camaras), { allowEmpty: true });
  writeValueToAddress(worksheet, `AB${visualRow}`, normalizeChecklistStatus(row.latestVerification?.colagens), { allowEmpty: true });
  writeValueToAddress(worksheet, `AC${visualRow}`, normalizeChecklistStatus(row.latestVerification?.tuboInflador), { allowEmpty: true });
  writeValueToAddress(worksheet, `AD${visualRow}`, normalizeChecklistStatus(row.latestVerification?.sistemaInflacao), { allowEmpty: true });

  writeValueToAddress(worksheet, `B${identificationRow}`, String(globalIndex));
  writeValueToAddress(worksheet, `C${identificationRow}`, row.serial, { allowEmpty: true });
  writeValueToAddress(worksheet, `F${identificationRow}`, asString(row.marca), { allowEmpty: true });
  writeValueToAddress(worksheet, `I${identificationRow}`, asString(row.modelo), { allowEmpty: true });
  writeValueToAddress(worksheet, `L${identificationRow}`, formatDateDDMMYYYY(row.dataFabrico), { allowEmpty: true });
  writeValueToAddress(worksheet, `N${identificationRow}`, asString(row.tamanho), { allowEmpty: true });
  writeValueToAddress(worksheet, `P${identificationRow}`, getChamberCount(model), { allowEmpty: true });
  writeValueToAddress(worksheet, `R${identificationRow}`, asString(model?.buoyancy), { allowEmpty: true });
  writeValueToAddress(worksheet, `T${identificationRow}`, model?.certifications.join(' · ') || '', { allowEmpty: true });
}

function clearUnusedRows(worksheet: ExcelJS.Worksheet, usedCount: number) {
  for (let index = usedCount; index < ROWS_PER_SHEET; index += 1) {
    const visualRow = 7 + index;
    const identificationRow = 45 + index;
    ['C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'AA', 'AB', 'AC', 'AD'].forEach((column) => clearValueAtAddress(worksheet, `${column}${visualRow}`));
    ['C', 'F', 'I', 'L', 'N', 'P', 'R', 'T'].forEach((column) => clearValueAtAddress(worksheet, `${column}${identificationRow}`));
  }
}

export async function buildNavioColetesVerificationSheet(input: NavioColetesVerificationSheetInput) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await loadTemplateBuffer(TEMPLATE_NAME)) as unknown as XlsxLoadArg);

  const templateSheet = workbook.getWorksheet(SHEET_NAME) || workbook.worksheets[0];
  if (!templateSheet) {
    throw new Error('Folha do template de verificação múltipla não encontrada.');
  }

  const pageChunks = chunkRows(input.rows, ROWS_PER_SHEET);
  const sheets = [templateSheet];

  for (let pageIndex = 1; pageIndex < pageChunks.length; pageIndex += 1) {
    sheets.push(cloneTemplateSheet(workbook, templateSheet, `${templateSheet.name} (${pageIndex + 1})`));
  }

  pageChunks.forEach((chunk, pageIndex) => {
    const worksheet = sheets[pageIndex];
    fillServiceInformation(worksheet, input, chunk);
    fillMaterialTable(worksheet, chunk);
    fillRemarks(worksheet, chunk);
    chunk.forEach((row, rowIndex) => fillRow(worksheet, row, rowIndex, pageIndex * ROWS_PER_SHEET + rowIndex + 1));
    clearUnusedRows(worksheet, chunk.length);
  });

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const today = new Date();
  const todayStamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const fileName = `ficha-verificacao-coletes-${sanitizeFileNameSegment(input.shipName, 'navio')}-${todayStamp}.xlsx`;

  return { buffer, fileName };
}
