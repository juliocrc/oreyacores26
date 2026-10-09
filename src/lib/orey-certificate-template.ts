import path from 'node:path';
import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { toDateKey } from '@/lib/date-utils';
import { loadTemplateBuffer } from '@/lib/template-loader';

type XlsxLoadArg = Parameters<ExcelJS.Xlsx['load']>[0];

export type OreyCertificateTemplateInput = {
  certNumber?: string;
  inspectionDate?: string;
  nextInspectionDate?: string;
  shipName?: string;
  shipFlag?: string;
  shipImo?: string;
  shipCallSign?: string;
  owner?: string;
  brand?: string;
  brandLogoUrl?: string;
  launchType?: string;
  raftType?: string;
  raftModel?: string;
  raftCapacity?: string | number;
  raftSerial?: string;
  manufactureDate?: string;
  fabricType?: string;
  painterLength?: string;
  maxStowageHeight?: string;
  cylinderSerial?: string;
  cylinderCo2?: string | number;
  cylinderN2?: string | number;
  cylinderHydroTestDate?: string;
  packType?: string;
  hruReference?: string;
  hruSerial?: string;
  hruExpiry?: string;
  radarReflector?: string;
  radarReflectorExpiry?: string;
  technician?: string;
  status?: string;
  checklist?: Record<string, unknown>;
};

const SERVICE_STATION_NAME = 'OREY TÉCNICA - SERVIÇOS NAVAIS, LDA       50937';

function asString(value: unknown) {
  return String(value ?? '').trim();
}

function sanitizeFileNameSegment(value: unknown, fallback: string) {
  const normalized = asString(value)
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || fallback;
}

function formatDateDDMMYYYY(value: unknown) {
  const iso = toDateKey(value);
  if (!iso) return asString(value);
  const [isoYear, isoMonth, isoDay] = iso.split('-');
  return `${isoDay}/${isoMonth}/${isoYear}`;
}

function formatDateLabel(value: unknown) {
  const iso = toDateKey(value);
  if (!iso) return asString(value);
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function formatMonthYear(value: unknown) {
  // toDateKey normaliza Date/ISO para YYYY-MM-DD antes do fallback. Sem isto,
  // um DateTime do Prisma chegava como "Mon Dec 26 2001 ... (Hora padrão dos
  // Açores)", nenhuma regex casava e a célula saia com o texto em inglês.
  const iso = toDateKey(value);
  if (!iso) return '';
  const [year, month] = iso.split('-');
  return `${month}-${year}`;
}

// Returns MM/YYYY (slash) — used for manufacture date and cylinder hydro test
function formatMonthYearSlash(value: unknown) {
  const iso = toDateKey(value);
  if (!iso) return '';
  const [year, month] = iso.split('-');
  return `${month}/${year}`;
}

// Returns MM/AA (two-digit year) — used in the tests section latest test date
function formatMonthYearShort(value: unknown) {
  const iso = toDateKey(value);
  if (!iso) return '';
  const [year, month] = iso.split('-');
  return `${month}/${year.slice(2)}`;
}

function asYesNo(value: unknown) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized || ['no', 'nao', 'não', 'false', '0', 'n', 'not_ok', 'n/a', 'na', 'n.d', 'nd'].includes(normalized)) return 'NO';
    if (['yes', 'sim', 'true', '1', 'y', 'ok', 'passou', 'aprovou', 'realizado', 'feito'].includes(normalized)) return 'YES';
  }
  return value ? 'YES' : 'NO';
}

function asYesNoOrNA(value: unknown, fallback: 'YES' | 'NO' = 'NO'): 'YES' | 'NO' | 'N/A' {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    if (['n/a', 'na', 'n.d', 'nd', 'não aplicável', 'nao aplicavel', 'not applicable'].includes(normalized)) return 'N/A';
    if (['yes', 'sim', 'true', '1', 'y', 'ok', 'passou', 'aprovou', 'realizado', 'feito'].includes(normalized)) return 'YES';
    if (['no', 'nao', 'não', 'false', '0', 'n', 'not_ok'].includes(normalized)) return 'NO';
  }
  if (typeof value === 'boolean') return value ? 'YES' : 'NO';
  if (typeof value === 'number') return value ? 'YES' : 'NO';
  return fallback;
}

function getTestDateCellValue(status: 'YES' | 'NO' | 'N/A', dateValue: string) {
  if (status === 'YES') return dateValue;
  if (status === 'N/A') return 'N/A';
  return '';
}

function normalizeFabricType(value: unknown) {
  const raw = asString(value).toUpperCase();
  if (!raw) return '';
  if (raw === 'PU' || /(^|\W)PU($|\W)/.test(raw) || raw.includes('POLYURETHANE') || raw.includes('POLIURET')) return 'PU';
  if (raw === 'NR' || /(^|\W)NR($|\W)/.test(raw) || raw.includes('NATURAL RUBBER') || raw.includes('BORRACHA NATURAL') || raw.includes('NEOPRENE RUBBER')) return 'NR';
  if (raw === 'PVC' || /(^|\W)PVC($|\W)/.test(raw)) return 'PVC';
  return '';
}

function isGreenLikeFill(fill: ExcelJS.Fill | undefined) {
  if (!fill || typeof fill !== 'object') return false;
  const anyFill = fill as any;
  const fg = anyFill?.fgColor;
  if (!fg) return false;

  const rgb = String(fg.rgb || '').toUpperCase();
  const themed = typeof fg.theme === 'number';

  if (rgb) {
    const hex = rgb.slice(-6);
    if (/^[0-9A-F]{6}$/.test(hex)) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (g >= r + 20 && g >= b + 20) return true;
    }

    if (
      rgb.includes('92D050') ||
      rgb.includes('00B050') ||
      rgb.includes('C6EFCE') ||
      rgb.includes('E2F0D9')
    ) {
      return true;
    }
  }

  // No template atual, os fundos verdes relevantes vêm frequentemente como theme colors
  return themed;
}

function findFirstValidity(checklist: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = checklist?.[key];
    const formatted = formatMonthYear(value);
    if (formatted) return formatted;
  }
  return '';
}

function combineBrandAndModel(brand: unknown, model: unknown) {
  const brandText = asString(brand);
  const modelText = asString(model);

  if (!brandText) return modelText;
  if (!modelText) return brandText;

  const brandUpper = brandText.toUpperCase();
  const modelUpper = modelText.toUpperCase();
  if (modelUpper.startsWith(brandUpper)) return modelText;
  if (brandUpper.startsWith(modelUpper)) return brandText;

  return `${brandText} ${modelText}`;
}

function setText(cell: ExcelJS.Cell, value: unknown) {
  cell.value = asString(value);
}

function formatValueWithUnit(value: unknown, unit: string) {
  const raw = asString(value);
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  const normalizedUnit = unit.toLowerCase();
  if (normalized.includes(normalizedUnit)) return raw;
  return `${raw} ${unit}`;
}

function formatWeightKg(value: unknown) {
  const raw = asString(value);
  if (!raw) return '';
  const n = Number(String(raw).replace(',', '.'));
  if (Number.isNaN(n)) return `${raw} kg`;
  return `${n.toFixed(3)} kg`;
}

function formatMeters(value: unknown) {
  return formatValueWithUnit(value, 'm');
}

function mergeIfPossible(worksheet: ExcelJS.Worksheet, range: string) {
  try {
    worksheet.mergeCells(range);
  } catch {
    // Ignore invalid/duplicate merge attempts from template pre-existing merges.
  }
}

function applyCertificateMerges(worksheet: ExcelJS.Worksheet) {
  // Requested fixed merges in generated Excel certificate.
  mergeIfPossible(worksheet, 'C41:D41');
  mergeIfPossible(worksheet, 'C43:D43');

  // NOTE: "D46:F46" is contained in "C46:F46". We apply the broader merge to avoid overlap conflicts.
  mergeIfPossible(worksheet, 'C46:F46');
  mergeIfPossible(worksheet, 'G46:J46');
  mergeIfPossible(worksheet, 'G47:J47');
  mergeIfPossible(worksheet, 'K46:L46');
  mergeIfPossible(worksheet, 'K47:L47');
}

function inferExcelImageExtension(source: string, contentType?: string | null): 'png' | 'jpeg' | null {
  const ext = path.extname(source).replace('.', '').toLowerCase();
  if (ext === 'png') return 'png';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';

  const normalizedType = String(contentType || '').toLowerCase();
  if (normalizedType.includes('png')) return 'png';
  if (normalizedType.includes('jpeg') || normalizedType.includes('jpg')) return 'jpeg';

  return null;
}

async function loadLogoImage(source: unknown) {
  const raw = asString(source);
  if (!raw) return null;

  if (raw.startsWith('data:image/')) {
    const match = raw.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
    if (!match) return null;
    const extension = match[1].toLowerCase() === 'png' ? 'png' : 'jpeg';
    return {
      extension,
      buffer: Buffer.from(match[2], 'base64'),
    } as const;
  }

  if (/^https?:\/\//i.test(raw)) {
    const response = await fetch(raw);
    if (!response.ok) return null;
    const extension = inferExcelImageExtension(raw, response.headers.get('content-type'));
    if (!extension) return null;
    return {
      extension,
      buffer: Buffer.from(await response.arrayBuffer()),
    } as const;
  }

  const relativePath = raw.replace(/^\/+/, '');
  const absolutePath = path.isAbsolute(raw)
    ? raw
    : path.join(process.cwd(), 'public', ...relativePath.split('/'));
  const extension = inferExcelImageExtension(absolutePath);
  if (!extension) return null;

  try {
    return {
      extension,
      buffer: await fs.readFile(absolutePath),
    } as const;
  } catch {
    return null;
  }
}

function buildBase64DataUrl(extension: 'png' | 'jpeg', buffer: Buffer<ArrayBufferLike>) {
  return `data:image/${extension};base64,${buffer.toString('base64')}`;
}

function isThrowOverRaft(input: OreyCertificateTemplateInput) {
  const candidates = [
    input.launchType,
    input.raftType,
    input.raftModel,
    input.packType,
    typeof input.checklist?.configuracao === 'string' ? input.checklist.configuracao : '',
    typeof input.checklist?.configuration === 'string' ? input.checklist.configuration : '',
    typeof input.checklist?.tipo_jangada === 'string' ? input.checklist.tipo_jangada : '',
  ];

  return candidates.some((candidate) => {
    const normalized = asString(candidate).toLowerCase();
    if (!normalized) return false;
    return /(^|\W)to($|\W)/.test(normalized) || /throw[-\s]?over/.test(normalized);
  });
}

function fillTemplate(worksheet: ExcelJS.Worksheet, input: OreyCertificateTemplateInput) {
  const checklist = input.checklist || {};
  const statusYesNo = asYesNoOrNA(input.status && !String(input.status).toLowerCase().includes('pend'));
  const napTestYesNo = asYesNoOrNA((checklist as Record<string, unknown>).teste_nap ?? (checklist as Record<string, unknown>).teste_wp ?? statusYesNo, 'NO');
  const giTestYesNo = asYesNoOrNA((checklist as Record<string, unknown>).teste_gi, 'NO');
  const fsTestYesNo = asYesNoOrNA((checklist as Record<string, unknown>).teste_fs, 'NO');
  const loadTestYesNo = asYesNoOrNA((checklist as Record<string, unknown>).teste_dl, 'NO');
  const firstAidExpiry = findFirstValidity(checklist, ['validade_farmacia']);
  const hasFirstAid = asYesNo(checklist.ambulancia) === 'YES' || Boolean(firstAidExpiry) || Boolean(checklist.ref_farmacia) || Boolean(checklist.farmacia);
  const isThrowOver = isThrowOverRaft(input);
  const cylinderSerial =
    asString(input.cylinderSerial) ||
    asString((checklist as Record<string, unknown>).cilindro_co2) ||
    asString((checklist as Record<string, unknown>).ref_cilindro_co2);

  setText(worksheet.getCell('K3'), input.certNumber);
  setText(worksheet.getCell('I5'), '');
  setText(worksheet.getCell('K4'), '');
  setText(worksheet.getCell('C3'), input.brand);

  // Identification row — green cells
  setText(worksheet.getCell('C13'), combineBrandAndModel(input.brand, input.raftModel));
  setText(worksheet.getCell('G13'), input.raftCapacity);
  setText(worksheet.getCell('I13'), input.raftSerial);
  setText(worksheet.getCell('K13'), formatMonthYearSlash(input.manufactureDate));

  // Cylinder data — row 18
  setText(worksheet.getCell('C20'), cylinderSerial);
  setText(worksheet.getCell('D18'), cylinderSerial);
  setText(worksheet.getCell('E18'), formatWeightKg(input.cylinderCo2));
  setText(worksheet.getCell('G18'), formatWeightKg(input.cylinderN2));
  setText(worksheet.getCell('K18'), formatMonthYearSlash(input.cylinderHydroTestDate));

  // Clear old wrong cells from previous mapping
  setText(worksheet.getCell('D11'), '');
  setText(worksheet.getCell('D12'), '');
  setText(worksheet.getCell('F11'), '');
  setText(worksheet.getCell('F12'), '');
  setText(worksheet.getCell('H11'), '');
  setText(worksheet.getCell('H12'), '');
  setText(worksheet.getCell('J11'), '');
  setText(worksheet.getCell('J12'), '');
  setText(worksheet.getCell('L11'), '');
  setText(worksheet.getCell('L12'), '');

  // Second identification row
  setText(worksheet.getCell('C16'), normalizeFabricType(input.fabricType));
  setText(worksheet.getCell('G16'), input.painterLength);
  setText(worksheet.getCell('K16'), formatMeters(input.maxStowageHeight));

  // Cylinder data — row 20
  setText(worksheet.getCell('D20'), cylinderSerial);
  setText(worksheet.getCell('H20'), formatWeightKg(input.cylinderCo2));
  setText(worksheet.getCell('J20'), formatWeightKg(input.cylinderN2));
  setText(worksheet.getCell('L20'), formatMonthYearSlash(input.cylinderHydroTestDate));

  // Cylinder labels — row 19 (headers for row 20)
  setText(worksheet.getCell('D19'), 'Serial No.');
  setText(worksheet.getCell('H19'), 'Contents CO2');
  setText(worksheet.getCell('J19'), 'Contents N2');
  setText(worksheet.getCell('L19'), 'Latest hyd. Test');

  // Clear row 18
  setText(worksheet.getCell('D18'), '');
  setText(worksheet.getCell('H18'), '');
  setText(worksheet.getCell('J18'), '');
  setText(worksheet.getCell('L18'), '');

  // Keep C27:E27 untouched in the template.
  setText(worksheet.getCell('G27'), input.packType);
  setText(worksheet.getCell('I27'), input.raftSerial);
  setText(worksheet.getCell('K27'), formatDateDDMMYYYY(input.nextInspectionDate));

  // HRU row (merged label C31:E31 "HRU test:") — reference, serial and expiry.
  setText(worksheet.getCell('G31'), input.hruReference);
  setText(worksheet.getCell('I31'), input.hruSerial);
  setText(worksheet.getCell('K31'), formatMonthYear(input.hruExpiry));

  if (asString(input.radarReflector)) {
    setText(worksheet.getCell('D33'), '1');
    setText(worksheet.getCell('G33'), input.radarReflector);
    setText(worksheet.getCell('K33'), formatMonthYear(input.radarReflectorExpiry));
  }

  // Keep C35:E35 untouched in the template.
  // G35:H36 is a shared block for the first-aid expiry; only fill it when the raft carries a first-aid kit.
  setText(worksheet.getCell('G35'), hasFirstAid ? 'Farmacia Solas' : '');
  setText(worksheet.getCell('K35'), hasFirstAid && firstAidExpiry ? firstAidExpiry : '');

  // Tests status (YES/NO)
  setText(worksheet.getCell('E41'), napTestYesNo);
  setText(worksheet.getCell('H41'), giTestYesNo);
  setText(worksheet.getCell('J41'), fsTestYesNo);
  setText(worksheet.getCell('L41'), loadTestYesNo);

  // Test latest dates — shown in MM/AA (short year) format
  const napTestDate = formatMonthYearShort(input.inspectionDate);
  setText(worksheet.getCell('E43'), getTestDateCellValue(napTestYesNo, napTestDate));
  setText(worksheet.getCell('D43'), '');
  setText(worksheet.getCell('H43'), getTestDateCellValue(giTestYesNo, napTestDate));
  setText(worksheet.getCell('J43'), getTestDateCellValue(fsTestYesNo, napTestDate));
  // NOTE: cells L41/L42 and E43/H43/J43/L43 are merged blocks; avoid writing
  // to secondary merged cells to prevent overriding the top-left value.
  setText(worksheet.getCell('L43'), getTestDateCellValue(loadTestYesNo, napTestDate));

  setText(worksheet.getCell('C48'), formatDateDDMMYYYY(input.inspectionDate));
  setText(worksheet.getCell('G48'), SERVICE_STATION_NAME);
  setText(worksheet.getCell('K48'), formatDateDDMMYYYY(input.nextInspectionDate));
  setText(worksheet.getCell('F51'), 'REPORT ANNEXED');

  setText(worksheet.getCell('D59'), asString(input.shipFlag) || 'Portugal');
  setText(worksheet.getCell('D61'), input.shipImo);
  setText(worksheet.getCell('D63'), input.shipCallSign);
  setText(worksheet.getCell('D65'), input.shipName);
  setText(worksheet.getCell('D67'), input.owner);
}

function wrapPreviewHtml(sheetHtml: string) {
  return `<!doctype html>
<html lang="pt">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Certificado Orey</title>
    <style>
      body { margin: 0; padding: 24px; background: #e5e7eb; font-family: Arial, Helvetica, sans-serif; }
      .sheet-wrap { display: flex; justify-content: center; }
      table { background: white; box-shadow: 0 10px 35px rgba(15, 23, 42, 0.12); }
      td { vertical-align: middle; }
      img { display: none !important; }
    </style>
  </head>
  <body>
    <div class="sheet-wrap">${sheetHtml}</div>
  </body>
</html>`;
}

function configureCertificatePrintLayout(worksheet: ExcelJS.Worksheet) {
  worksheet.pageSetup = {
    paperSize: 9, // A4
    orientation: 'portrait',
    fitToPage: true,
    fitToHeight: 1,
    fitToWidth: 1,
    horizontalCentered: true,
    verticalCentered: false,
    printArea: 'A1:M76',
    margins: {
      left: 0.3,
      right: 0.3,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2,
    },
  };
}

export async function buildOreyCertificateArtifacts(input: OreyCertificateTemplateInput) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await loadTemplateBuffer('template certificado orey.xltx')) as unknown as XlsxLoadArg);

  const worksheet = workbook.getWorksheet('CERTIFICADO') || workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Folha CERTIFICADO não encontrada no template Orey.');
  }

  applyCertificateMerges(worksheet);
  fillTemplate(worksheet, input);

  // Pedido operacional: gerar o certificado Excel sem o logo da marca da jangada.
  // Mantemos os dados técnicos e layout original, apenas sem inserir imagem de marca.

  // Remove green fills from all cells
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      if (isGreenLikeFill(cell.fill)) {
        cell.fill = { type: 'pattern', pattern: 'none' };
      }
    });
  });

  // Configure page setup for A4 printing
  configureCertificatePrintLayout(worksheet);

  const written = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.isBuffer(written) ? written : Buffer.from(written as ArrayBuffer);
  const previewWorkbook = XLSX.read(buffer, { type: 'buffer', cellStyles: true });
  const previewSheet = previewWorkbook.Sheets[previewWorkbook.SheetNames[0]];
  const html = wrapPreviewHtml(XLSX.utils.sheet_to_html(previewSheet, { editable: false }));
  const certificateNumber = sanitizeFileNameSegment(input.certNumber, 'SEM-NUMERO');
  const shipName = sanitizeFileNameSegment(asString(input.shipName).toUpperCase(), 'SEM NAVIO');
  // Formato pedido: AZ26-NNN (NOME DO NAVIO)
  const fileName = `${certificateNumber} (${shipName}).xlsx`;

  return {
    buffer,
    html,
    fileName,
  };
}