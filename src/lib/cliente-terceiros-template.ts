import path from 'node:path';
import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';

export type ClienteTerceirosTemplateInput = {
  id: number;
  nome?: string | null;
  numeroCliente?: string | null;
  modoPagamento?: string | null;
  nif?: string | null;
  email?: string | null;
  telefone?: string | null;
  telmovel?: string | null;
  morada?: string | null;
  moradaNumero?: string | null;
  codigoPostal?: string | null;
  localidade?: string | null;
  ilha?: string | null;
  navios?: Array<{
    id: number;
    nome?: string | null;
    matricula?: string | null;
    ilha?: string | null;
    tipoPesca?: string | null;
  }>;
};

const TEMPLATE_CANDIDATE_PATHS = [
  path.join(process.cwd(), 'templates', 'terceiro template.xlsx'),
  path.join(process.cwd(), 'templates', 'terceiro template.xltx'),
  path.join(process.cwd(), 'templates', '3o template.xlsx'),
  path.join(process.cwd(), 'templates', '3º template.xlsx'),
  path.join(process.cwd(), 'templates', 'CRIAÇÃO DE TERCEIROS.xltx'),
  path.join(process.cwd(), 'templates', 'CRIAÇAO DE TERCEIROS.xltx'),
  path.join(process.cwd(), 'templates', 'CRIAÇÃO DE TERCEIROS.xlsx'),
  path.join(process.cwd(), 'templates', 'CRIAÇAO DE TERCEIROS.xlsx'),
  path.join(process.cwd(), 'templates', 'CRIACAO DE TERCEIROS.xltx'),
  path.join(process.cwd(), 'templates', 'CRIACAO DE TERCEIROS.xlsx'),
];

type FieldDefinition = {
  key: string;
  value: string;
  labels: string[];
};

function asString(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeText(value: unknown) {
  return asString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sanitizeFileNameSegment(value: unknown, fallback: string) {
  const text = asString(value) || fallback;
  return text
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || fallback;
}

function formatNumeroCliente(input: ClienteTerceirosTemplateInput) {
  const numero = asString(input.numeroCliente);
  if (numero) return numero;
  return `CLI-${String(input.id).padStart(5, '0')}`;
}

function buildAddressLine(input: ClienteTerceirosTemplateInput) {
  return [asString(input.morada), asString(input.moradaNumero)].filter(Boolean).join(', ');
}

function buildPostalLocalidade(input: ClienteTerceirosTemplateInput) {
  return [asString(input.codigoPostal), asString(input.localidade)].filter(Boolean).join(' ');
}

function buildTelefoneTemplateValue(input: ClienteTerceirosTemplateInput) {
  return asString(input.telmovel) || asString(input.telefone);
}

function formatTodayPt() {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());
}

import { canonicalizeAzoresIsland, inferAzoresIslandFromPort } from "@/lib/azores-islands";

function buildNaviosResumo(input: ClienteTerceirosTemplateInput) {
  const navios = Array.isArray(input.navios) ? input.navios : [];
  if (navios.length === 0) return '';
  return navios
    .map((navio) => {
      const nome = asString(navio.nome);
      const matricula = asString(navio.matricula);
      let ilha = asString(navio.ilha);
      // Try canonicalization or infer from port-like names
      ilha = (canonicalizeAzoresIsland(ilha) ?? inferAzoresIslandFromPort(ilha) ?? ilha) || '';
      const tipo = asString(navio.tipoPesca);
      const detalhes = [matricula, ilha, tipo].filter(Boolean).join(' · ');
      return detalhes ? `${nome} (${detalhes})` : nome;
    })
    .filter(Boolean)
    .join('\n');
}

async function resolveTemplatePath() {
  for (const candidate of TEMPLATE_CANDIDATE_PATHS) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error('Template de ficha de cliente não encontrado em /templates. Coloque o ficheiro "terceiro template.xlsx" (preferencial) ou um template "CRIAÇÃO DE TERCEIROS" (.xlsx/.xltx).');
}

function getFieldDefinitions(input: ClienteTerceirosTemplateInput): FieldDefinition[] {
  return [
    { key: 'nome', value: asString(input.nome), labels: ['cliente', 'nome', 'nome cliente', 'designacao', 'designação', 'terceiro', 'nome terceiro'] },
    { key: 'numeroCliente', value: formatNumeroCliente(input), labels: ['numero cliente', 'n cliente', 'nº cliente', 'n. cliente', 'codigo cliente', 'código cliente'] },
    { key: 'modoPagamento', value: asString(input.modoPagamento), labels: ['modo pagamento', 'modos pagamento', 'condicoes pagamento', 'condições pagamento', 'payment terms', 'payment mode'] },
    { key: 'nif', value: asString(input.nif), labels: ['nif', 'contribuinte', 'numero contribuinte', 'n contribuinte', 'nº contribuinte'] },
    { key: 'email', value: asString(input.email), labels: ['email', 'e mail', 'correio eletronico', 'correio eletrónico'] },
    { key: 'telefone', value: asString(input.telefone), labels: ['telefone', 'tel', 'contacto telefonico', 'contacto telefónico'] },
    { key: 'telemovel', value: asString(input.telmovel), labels: ['telemovel', 'telemóvel', 'tm', 'mobile'] },
    { key: 'morada', value: buildAddressLine(input), labels: ['morada', 'endereco', 'endereço', 'rua'] },
    { key: 'codigoPostal', value: asString(input.codigoPostal), labels: ['codigo postal', 'código postal', 'cp'] },
    { key: 'localidade', value: asString(input.localidade), labels: ['localidade', 'cidade', 'local'] },
    { key: 'postalLocalidade', value: buildPostalLocalidade(input), labels: ['codigo postal localidade', 'código postal localidade', 'cp localidade'] },
    { key: 'ilha', value: asString(input.ilha), labels: ['ilha'] },
    { key: 'navios', value: buildNaviosResumo(input), labels: ['navios', 'embarcacoes', 'embarcações', 'frota'] },
  ].filter((field) => field.value);
}

function getCandidateTargetCells(worksheet: ExcelJS.Worksheet, row: number, col: number) {
  return [
    worksheet.getCell(row, col + 1),
    worksheet.getCell(row, col + 2),
    worksheet.getCell(row + 1, col),
    worksheet.getCell(row + 1, col + 1),
  ];
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

function getCellRawValue(cell?: ExcelJS.Cell | null): unknown {
  if (!cell) return '';

  try {
    if (cell.value != null) return cell.value;
  } catch {
    // Ignore ExcelJS edge cases on merged cells.
  }

  try {
    const master = (cell as ExcelJS.Cell & { master?: ExcelJS.Cell | null }).master;
    if (master && master !== cell && master.value != null) return master.value;
  } catch {
    // Ignore ExcelJS edge cases on merged cells.
  }

  return '';
}

function getCellTextSafe(cell?: ExcelJS.Cell | null): string {
  if (!cell) return '';

  try {
    const text = cell.text;
    if (text != null) return String(text).trim();
  } catch {
    // ExcelJS may throw on merged cells whose master value is null.
  }

  const rawValue = getCellRawValue(cell);
  if (rawValue == null) return '';

  if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') {
    return String(rawValue).trim();
  }

  if (rawValue instanceof Date) {
    return Number.isNaN(rawValue.getTime()) ? '' : rawValue.toISOString();
  }

  if (typeof rawValue === 'object') {
    const richTextValue = rawValue as { richText?: Array<{ text?: string | null }>; text?: string | null; result?: unknown; formula?: string | null };
    if (Array.isArray(richTextValue.richText)) {
      return richTextValue.richText.map((part) => String(part?.text ?? '')).join('').trim();
    }
    if (richTextValue.text != null) return String(richTextValue.text).trim();
    if (richTextValue.result != null) return String(richTextValue.result).trim();
    if (richTextValue.formula != null) return String(richTextValue.formula).trim();
  }

  return asString(rawValue);
}

function resolveWritableCell(cell?: ExcelJS.Cell | null): ExcelJS.Cell | null {
  if (!cell) return null;

  try {
    const master = (cell as ExcelJS.Cell & { master?: ExcelJS.Cell | null }).master;
    if (master && master !== cell) return master;
  } catch {
    // Ignore and use the original cell.
  }

  return cell;
}

function writeValueToAddress(worksheet: ExcelJS.Worksheet, address: string, value: string, options?: { allowEmpty?: boolean }) {
  const normalizedValue = asString(value);
  if (!normalizedValue && !options?.allowEmpty) return;

  const writableCell = resolveWritableCell(worksheet.getCell(address));
  if (!writableCell) return;
  writeCellValue(writableCell, normalizedValue);
}

function applyFixedCellMappings(worksheet: ExcelJS.Worksheet, input: ClienteTerceirosTemplateInput) {
  const mappings: Array<{ address: string; value: string; allowEmpty?: boolean }> = [
    { address: 'B4', value: formatTodayPt() },
    { address: 'B15', value: '', allowEmpty: true },
    { address: 'B21', value: asString(input.nif) },
    { address: 'B23', value: asString(input.nome) },
    { address: 'B25', value: buildAddressLine(input) },
    { address: 'B30', value: asString(input.codigoPostal) },
    { address: 'B34', value: asString(input.ilha) },
    { address: 'B36', value: buildTelefoneTemplateValue(input) },
    { address: 'B40', value: asString(input.email) },
    { address: 'E44', value: 'X' },
    { address: 'E47', value: 'PP' },
  ];

  for (const mapping of mappings) {
    writeValueToAddress(worksheet, mapping.address, mapping.value, { allowEmpty: mapping.allowEmpty });
  }
}

function fillWorksheetByLabels(worksheet: ExcelJS.Worksheet, fields: FieldDefinition[]) {
  const remaining = new Map(fields.map((field) => [field.key, field]));

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (remaining.size === 0) return;
      const cellText = normalizeText(getCellTextSafe(cell));
      if (!cellText) return;

      for (const [key, field] of remaining.entries()) {
        if (!field.labels.some((label) => cellText === normalizeText(label) || cellText.includes(normalizeText(label)))) {
          continue;
        }

        const sourceCell = resolveWritableCell(cell);
        const target = getCandidateTargetCells(worksheet, rowNumber, colNumber).find((candidate) => {
          const writableCandidate = resolveWritableCell(candidate);
          const candidateText = getCellTextSafe(writableCandidate);
          return !candidateText || writableCandidate?.address === sourceCell?.address;
        });

        const writableTarget = resolveWritableCell(target);
        if (!writableTarget || writableTarget.address === sourceCell?.address) continue;
        writeCellValue(writableTarget, field.value);
        remaining.delete(key);
        break;
      }
    });
  });

  return remaining;
}

function appendFallbackSheet(workbook: ExcelJS.Workbook, input: ClienteTerceirosTemplateInput, fields: FieldDefinition[], unresolved: Map<string, FieldDefinition>) {
  const sheet = workbook.addWorksheet('DADOS_CLIENTE');
  sheet.columns = [
    { header: 'Campo', key: 'campo', width: 28 },
    { header: 'Valor', key: 'valor', width: 80 },
  ];

  const baseRows = [
    ['Cliente', asString(input.nome)] as [string, string],
    ['Nº Cliente', formatNumeroCliente(input)] as [string, string],
    ['Modo de Pagamento', asString(input.modoPagamento)] as [string, string],
    ['NIF', asString(input.nif)] as [string, string],
    ['Email', asString(input.email)] as [string, string],
    ['Telefone', asString(input.telefone)] as [string, string],
    ['Telemóvel', asString(input.telmovel)] as [string, string],
    ['Morada', buildAddressLine(input)] as [string, string],
    ['Código Postal', asString(input.codigoPostal)] as [string, string],
    ['Localidade', asString(input.localidade)] as [string, string],
    ['Ilha', asString(input.ilha)] as [string, string],
    ['Navios', buildNaviosResumo(input)] as [string, string],
  ].filter((entry) => Boolean(entry[1]));

  for (const [campo, valor] of baseRows) {
    const row = sheet.addRow({ campo, valor });
    row.getCell(2).alignment = { vertical: 'top', wrapText: true };
  }

  if (unresolved.size > 0) {
    sheet.addRow({ campo: '', valor: '' });
    const titleRow = sheet.addRow({ campo: 'Campos não localizados automaticamente no template', valor: '' });
    titleRow.font = { bold: true };
    for (const field of unresolved.values()) {
      const row = sheet.addRow({ campo: field.labels[0] || field.key, valor: field.value });
      row.getCell(2).alignment = { vertical: 'top', wrapText: true };
    }
  }

  sheet.getRow(1).font = { bold: true };
}

export async function buildClienteTerceirosTemplateArtifacts(input: ClienteTerceirosTemplateInput) {
  const templatePath = await resolveTemplatePath();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  if (workbook.worksheets[0]) {
    applyFixedCellMappings(workbook.worksheets[0], input);
  }

  const fields = getFieldDefinitions(input);
  let unresolved = new Map<string, FieldDefinition>(fields.map((field) => [field.key, field]));

  for (const worksheet of workbook.worksheets) {
    unresolved = fillWorksheetByLabels(worksheet, Array.from(unresolved.values()));
    if (unresolved.size === 0) break;
  }

  if (workbook.worksheets[0]) {
    applyFixedCellMappings(workbook.worksheets[0], input);
  }

  appendFallbackSheet(workbook, input, fields, unresolved);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const fileName = `criacao_terceiros_${sanitizeFileNameSegment(input.nome, 'cliente')}.xlsx`;
  return { buffer, fileName };
}