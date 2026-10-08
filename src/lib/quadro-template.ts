import ExcelJS from 'exceljs';
import { toDateKey } from '@/lib/date-utils';
import { loadTemplateBuffer } from '@/lib/template-loader';

type XlsxLoadArg = Parameters<ExcelJS.Xlsx['load']>[0];

export type QuadroSubstitutedArticle = {
  label: string;
  reference: string;
  quantity: number;
  validity: string;
};

export type QuadroTemplateInput = {
  numeroObra?: string;
  certNumber?: string;
  inspectionDate?: string;
  nextInspectionDate?: string;
  shipName?: string;
  brand?: string;
  raftModel?: string;
  raftCapacity?: string | number;
  raftSerial?: string;
  manufactureDate?: string;
  cylinderSerial?: string;
  cylinderGrossWeight?: string | number;
  cylinderTare?: string | number;
  cylinderCo2?: string | number;
  cylinderN2?: string | number;
  cylinderHydroTestDate?: string;
  packType?: string;
  pressureUnit?: string;
  tempInitial?: string | number;
  tempFinal?: string | number;
  baroInitial?: string | number;
  baroFinal?: string | number;
  wpStartTime?: string;
  wpEndTime?: string;
  wpUpperStart?: string | number;
  wpUpperEnd?: string | number;
  wpUpperCorrected?: string | number;
  wpUpperDrop?: string | number;
  wpUpperDropPercent?: string | number;
  wpLowerStart?: string | number;
  wpLowerEnd?: string | number;
  wpLowerCorrected?: string | number;
  wpLowerDrop?: string | number;
  wpLowerDropPercent?: string | number;
  napTestDone?: unknown;
  fsTestDone?: unknown;
  giTestDone?: unknown;
  loadTestDone?: unknown;
  napTestDate?: string;
  fsTestDate?: string;
  giTestDate?: string;
  loadTestDate?: string;
  contentorClosureText?: string;
  contentorPainterLength?: string;
  checklist?: Record<string, string | number | boolean>;
  substituicoes?: Array<{
    descricao?: string | null;
    name?: string | null;
    referencia?: string | null;
    quantidade?: number | null;
    validade?: string | null;
    codigoFabricante?: string | null;
    motivo?: string | null;
  }>;
};

const SERVICE_STATION_NAME = 'OREY TÉCNICA – 50937';
const QUADRO_PRINT_AREA_MAX_ROW = 84;
const QUADRO_PRINT_AREA_MAX_COLUMN = 10;

type ChecklistCellKind = 'status' | 'date' | 'text' | 'days';

const EXPLICIT_REPLACEMENT_KEY_BY_REFERENCE_FIELD: Record<string, string> = {
  ref_farmacia: 'substituicao_explicita__farmacia',
  ref_comprimidos: 'substituicao_explicita__comprimidos_p_enjoo',
  ref_paraquedas: 'substituicao_explicita__foguetes_paraquedas',
  ref_fachos: 'substituicao_explicita__fachos_de_mao',
  ref_potes: 'substituicao_explicita__potes_de_fumo',
  ref_bateria: 'substituicao_explicita__pilhas_para_lanterna',
};

type SubstitutionDefinition = {
  replacementKey: string;
  label: string;
  refKey: string;
  qtyKey: string;
  valKey: string;
};

const SUBSTITUTION_DEFINITIONS: SubstitutionDefinition[] = [
  { replacementKey: 'substituicao_explicita__farmacia', label: 'Farmácia / First Aid Kit', refKey: 'ref_farmacia', qtyKey: 'qtd_farmacia', valKey: 'validade_farmacia' },
  { replacementKey: 'substituicao_explicita__comprimidos_p_enjoo', label: 'Comprimidos Enjoo', refKey: 'ref_comprimidos', qtyKey: 'qtd_comprimidos', valKey: 'validade_comprimidos' },
  { replacementKey: 'substituicao_explicita__foguetes_paraquedas', label: 'Foguetes Paraquedas', refKey: 'ref_paraquedas', qtyKey: 'qtd_paraquedas', valKey: 'validade_paraquedas' },
  { replacementKey: 'substituicao_explicita__fachos_de_mao', label: 'Fachos de Mão', refKey: 'ref_fachos', qtyKey: 'qtd_fachos', valKey: 'validade_fachos_mao' },
  { replacementKey: 'substituicao_explicita__potes_de_fumo', label: 'Potes de Fumo', refKey: 'ref_potes', qtyKey: 'qtd_potes', valKey: 'validade_potes_fumo' },
  { replacementKey: 'substituicao_explicita__pilhas_para_lanterna', label: 'Pilhas Lanterna', refKey: 'ref_bateria', qtyKey: 'qtd_pilhas_lanterna', valKey: 'validade_pilhas_lanterna' },
  { replacementKey: 'substituicao_explicita__hru', label: 'HRU (Disparo Hidrostático)', refKey: 'hruReferencia', qtyKey: 'qtd_hru', valKey: 'hru_val' },
  { replacementKey: 'substituicao_explicita__cilindro', label: 'Cilindro de Insuflação', refKey: 'cylinderSerial', qtyKey: 'qtd_cilindro', valKey: 'cyl_test_val' },
];

export function collectSubstitutedArticles(input: QuadroTemplateInput): QuadroSubstitutedArticle[] {
  const checklist = input.checklist || {};
  const seen = new Set<string>();
  const result: QuadroSubstitutedArticle[] = [];

  const add = (label: string, reference: string, quantity: number, validity: string, dedupeKey: string) => {
    if (!reference || reference === '—') return;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    result.push({
      label,
      reference,
      quantity,
      validity: validity ? formatMonthYear(validity) : '',
    });
  };

  SUBSTITUTION_DEFINITIONS.forEach((def) => {
    const qtyRaw = Number(checklist[def.replacementKey]);
    if (!Number.isFinite(qtyRaw) || qtyRaw <= 0) return;
    const reference = def.refKey === 'hruReferencia' && asString(checklist.hru_serial)
      ? asString(checklist.hru_serial)
      : asString(checklist[def.refKey]) || '—';
    add(
      def.label,
      reference,
      Math.max(1, Math.round(qtyRaw)),
      def.valKey ? asString(checklist[def.valKey]) : '',
      `checklist:${def.refKey}`,
    );
  });

  if (Array.isArray(input.substituicoes)) {
    input.substituicoes.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const quantity = Math.max(1, Number(item.quantidade || 1));
      if (!Number.isFinite(quantity)) return;
      const label = String(item.descricao || item.name || item.referencia || 'Artigo').trim() || 'Artigo';
      const reference = String(item.referencia || '').trim();
      if (!reference) return;
      add(label, reference, Math.round(quantity), String(item.validade || ''), `substituicoes:${reference}`);
    });
  }

  return result;
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

function sanitizeFriendlyFileNameSegment(value: unknown) {
  return asString(value)
    .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function asString(value: unknown) {
  return String(value ?? '').trim();
}

function formatDateDDMMYYYY(value: unknown) {
  const iso = toDateKey(value);
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function formatMonthYear(value: unknown) {
  // toDateKey normaliza Date/ISO. Sem isto um DateTime do Prisma chegava como
  // "Wed Sep 01 2027 ... (Hora de verão dos Açores)" e nenhuma regex casava,
  // deixando o texto em inglês na célula.
  const iso = toDateKey(value);
  if (!iso) return '';
  const [year, month] = iso.split('-');
  return `${month}-${year}`;
}

function formatMonthYearSlash(value: unknown) {
  const iso = toDateKey(value);
  if (!iso) return '';
  const [year, month] = iso.split('-');
  return `${month}-${year}`;
}

function formatCapacityForFileName(value: unknown) {
  const raw = sanitizeFriendlyFileNameSegment(value);
  if (!raw) return '';

  const normalized = raw.toUpperCase();
  if (/^\d+\s*P$/.test(normalized)) {
    return normalized.replace(/\s+/g, '');
  }

  const numeric = normalized.match(/\d+/);
  if (numeric) return `${Number(numeric[0])}P`;
  return normalized;
}

function formatMonthYearSpace(value: unknown) {
  const iso = toDateKey(value);
  if (!iso) return '';
  const [year, month] = iso.split('-');
  return `${month} ${year}`;
}

function anoDaInspecao(value: unknown) {
  const iso = toDateKey(value);
  return iso ? iso.slice(0, 4) : '';
}

/**
 * Formato pedido: MARCA, MODELO, LOTAÇÃO, NÚMERO DE SÉRIE e ANO DE INSPEÇÃO.
 * Ex.: "SURVITEC - 8MR - 14587 - SR-2231 - 2026.xlsx"
 */
function buildQuadroFileName(input: QuadroTemplateInput & Record<string, unknown>) {
  const marca = sanitizeFriendlyFileNameSegment(input.brand);
  const modelo = sanitizeFriendlyFileNameSegment(input.raftModel);
  const lotacao = sanitizeFriendlyFileNameSegment(input.numeroObra);
  const serie = sanitizeFriendlyFileNameSegment(input.raftSerial ?? input.serial);
  const ano = anoDaInspecao(input.inspectionDate);

  const parts = [marca, modelo, lotacao, serie, ano].filter(Boolean);

  if (!parts.length) return 'quadro_sem_dados.xlsx';
  if (parts.length < 5) {
    return `${parts.join(' - ')}_quadro.xlsx`;
  }

  return `${parts.join(' - ')}.xlsx`;
}

function asYesNo(value: unknown, fallback = 'NO') {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    if (['yes', 'sim', 'true', '1', 'y', 'ok', 'passou', 'aprovou', 'realizado', 'feito'].includes(normalized)) return 'YES';
    if (['no', 'nao', 'não', 'false', '0', 'n', 'not_ok', 'n/a', 'na', 'n.d', 'nd'].includes(normalized)) return 'NO';
  }
  if (typeof value === 'boolean') return value ? 'YES' : 'NO';
  if (typeof value === 'number') return value ? 'YES' : 'NO';
  return fallback;
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

function buildPressureUnitText(unit: unknown) {
  const normalized = asString(unit).toLowerCase();
  const inH2O = normalized === 'inh2o' ? 'X' : ' ';
  const inHg = normalized === 'inhg' ? 'X' : ' ';
  const mbar = normalized === 'mbar' ? 'X' : ' ';
  return `inH2O [ ${inH2O} ] inHg [ ${inHg} ] mbar [ ${mbar} ]`;
}

function setCell(cell: ExcelJS.Cell, value: unknown) {
  cell.value = asString(value);
}

function clearCellFill(cell: ExcelJS.Cell) {
  cell.fill = {
    type: 'pattern',
    pattern: 'none',
  };
}

function setCenteredCell(cell: ExcelJS.Cell, value: unknown) {
  setCell(cell, value);
  cell.alignment = {
    ...(cell.alignment || {}),
    horizontal: 'center',
    vertical: 'middle',
  };
}

function setFittedTextCell(cell: ExcelJS.Cell, value: unknown) {
  setCell(cell, value);
  cell.alignment = {
    ...(cell.alignment || {}),
    horizontal: 'center',
    vertical: 'middle',
    wrapText: true,
    shrinkToFit: true,
  };
}

function formatValueWithUnit(value: unknown, unit: string) {
  const raw = asString(value);
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  const normalizedUnit = unit.toLowerCase();
  if (normalized.includes(normalizedUnit)) return raw;
  return `${raw} ${unit}`;
}

function inferBatteryModel(value: unknown) {
  const raw = asString(value);
  if (!raw) return '';

  const normalized = raw.toUpperCase();
  if (normalized.includes('MASTER1') || normalized.includes('MASTER 1')) return 'Master1';
  if (normalized.includes('RB2')) return 'RB2';
  if (normalized.includes('RL6') || normalized.includes('RL06')) return 'RL6';
  if (normalized.includes('RL5') || normalized.includes('RL05')) return 'RL5';
  return raw;
}

function isChecklistTruthy(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const normalized = asString(value).toLowerCase();
  if (['no', 'nao', 'não', 'false', '0', 'n/a', 'na', 'n.d', 'nd'].includes(normalized)) {
    return false;
  }
  return true;
}

function formatChecklistCellValue(kind: ChecklistCellKind, value: unknown, key?: string) {
  if (kind === 'status') {
    return isChecklistTruthy(value) ? '☑' : '☐';
  }

  if (kind === 'date') {
    const raw = asString(value);
    if (!raw) return '';
    return formatMonthYearSlash(raw) || raw;
  }

  if (kind === 'days') {
    const days = Number(value);
    if (!Number.isFinite(days)) return '';
    if (days < 0) return `Expirado há ${Math.abs(days)} dias`;
    if (days <= 30) return `⚠ ${days} dias`;
    return `${days} dias`;
  }

  return asString(value);
}

function formatWeightKg(value: unknown) {
  const raw = asString(value);
  if (!raw) return '';
  const n = Number(String(raw).replace(',', '.'));
  if (Number.isNaN(n)) return `${raw} kg`;
  return `${n.toFixed(3)} kg`;
}

function formatPercentage(value: unknown) {
  return formatValueWithUnit(value, '%');
}

function safeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  const str = String(value).trim();
  if (str === '[object Object]') return '';
  return str;
}

function calculateDropAndPercent(startVal: unknown, endVal: unknown, correctedVal: unknown) {
  const start = Number(String(startVal ?? '').trim().replace(',', '.'));
  const end = Number(String(endVal ?? '').trim().replace(',', '.'));
  const corrected = correctedVal !== undefined && correctedVal !== null && String(correctedVal).trim() !== ''
    ? Number(String(correctedVal).trim().replace(',', '.'))
    : null;

  if (!Number.isFinite(start) || start <= 0) return { drop: '', percent: '' };
  
  const finalEnd = corrected !== null && Number.isFinite(corrected) ? corrected : end;
  if (!Number.isFinite(finalEnd)) return { drop: '', percent: '' };

  const drop = Math.max(0, start - finalEnd);
  const percent = (drop / start) * 100;

  return {
    drop: drop.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1'),
    percent: percent.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
  };
}

function getPressureDropPercent(input: QuadroTemplateInput, isLower = false) {
  const start = isLower ? input.wpLowerStart : input.wpUpperStart;
  const end = isLower ? input.wpLowerEnd : input.wpUpperEnd;
  const corrected = isLower ? input.wpLowerCorrected : input.wpUpperCorrected;
  const dropPercentVal = isLower ? input.wpLowerDropPercent : input.wpUpperDropPercent;
  const dropVal = isLower ? input.wpLowerDrop : input.wpUpperDrop;

  const cleanDropPercent = safeString(dropPercentVal);
  if (cleanDropPercent) return formatPercentage(cleanDropPercent);

  const calculated = calculateDropAndPercent(start, end, corrected);
  if (calculated.percent) return formatPercentage(calculated.percent);

  const cleanDrop = safeString(dropVal);
  return cleanDrop;
}

function formatReferenceWithQuantity(
  checklist: Record<string, string | number | boolean>,
  refKey: string,
  qtyKey: string,
  fallbackQty = 1,
) {
  const explicitReplacementKey = EXPLICIT_REPLACEMENT_KEY_BY_REFERENCE_FIELD[refKey];
  if (explicitReplacementKey) {
    const replacementQtyRaw = asString(checklist[explicitReplacementKey]);
    const replacementQty = Number(replacementQtyRaw);
    if (!Number.isFinite(replacementQty) || replacementQty <= 0) return '';
  }

  const reference = asString(checklist[refKey]);
  if (!reference) return '';

  const qtyRaw = asString(checklist[qtyKey]);
  const parsedQty = Number(qtyRaw);
  const quantity = Number.isFinite(parsedQty) && parsedQty > 0 ? Math.round(parsedQty) : fallbackQty;

  return `(${quantity}) ${reference}`;
}

function setChecklistCell(
  ws: ExcelJS.Worksheet,
  checklist: Record<string, string | number | boolean>,
  key: string,
  cellAddress: string,
  kind: ChecklistCellKind,
) {
  const value = formatChecklistCellValue(kind, checklist[key], key);
  const cell = ws.getCell(cellAddress);
  if (kind === 'status') {
    setCenteredCell(cell, value);
    return;
  }
  if (!value) return;
  setCell(cell, value);
}

function clearWorksheetFills(ws: ExcelJS.Worksheet) {
  for (let row = 1; row <= QUADRO_PRINT_AREA_MAX_ROW; row += 1) {
    for (let col = 1; col <= QUADRO_PRINT_AREA_MAX_COLUMN; col += 1) {
      clearCellFill(ws.getCell(row, col));
    }
  }
}

function fillTemplate(ws: ExcelJS.Worksheet, input: QuadroTemplateInput) {
  clearWorksheetFills(ws);

  setCell(ws.getCell('I3'), input.numeroObra);
  setCell(ws.getCell('I5'), input.certNumber);

  setCell(ws.getCell('C7'), input.raftSerial);
  setCell(ws.getCell('E7'), input.shipName);
  setCell(ws.getCell('H7'), input.brand);
  setFittedTextCell(ws.getCell('I7'), input.raftModel);
  setCell(ws.getCell('J7'), input.raftCapacity);

  setCell(ws.getCell('G79'), formatDateDDMMYYYY(input.manufactureDate));
  setCell(ws.getCell('F81'), formatDateDDMMYYYY(input.inspectionDate));
  setCell(ws.getCell('C81'), SERVICE_STATION_NAME);

  setCell(ws.getCell('E47'), input.packType);
  setCell(ws.getCell('F47'), input.packType);

  setCell(ws.getCell('I56'), input.cylinderSerial);
  setCell(ws.getCell('I58'), formatWeightKg(input.cylinderGrossWeight));
  const cylinderTareValue = input.cylinderTare ?? (input as any).cylinderTara;
  setCell(ws.getCell('I60'), formatWeightKg(cylinderTareValue));
  setCell(ws.getCell('I62'), formatWeightKg(input.cylinderCo2));
  setCell(ws.getCell('I64'), formatWeightKg(input.cylinderN2));
  setCell(ws.getCell('I66'), formatMonthYear(input.cylinderHydroTestDate));

  // Preserve the template's formulas and labels in the pressure block.
  setCell(ws.getCell('D69'), buildPressureUnitText(input.pressureUnit || 'inh2o'));
  setCell(ws.getCell('H69'), formatValueWithUnit(input.tempInitial, '°C'));
  setCell(ws.getCell('J69'), formatValueWithUnit(input.tempFinal, '°C'));
  setCell(ws.getCell('H71'), formatValueWithUnit(input.baroInitial, 'hPa'));
  setCell(ws.getCell('J71'), formatValueWithUnit(input.baroFinal, 'hPa'));
  setCenteredCell(ws.getCell('C72'), input.wpStartTime);
  setCenteredCell(ws.getCell('C73'), input.wpUpperStart);
  setCenteredCell(ws.getCell('D73'), input.wpUpperCorrected || input.wpUpperEnd);
  setCenteredCell(ws.getCell('E73'), getPressureDropPercent(input, false));
  setCenteredCell(ws.getCell('C75'), input.wpLowerStart);
  setCenteredCell(ws.getCell('D75'), input.wpLowerCorrected || input.wpLowerEnd);
  setCenteredCell(ws.getCell('E75'), getPressureDropPercent(input, true));

  const napDone = asYesNoOrNA(input.napTestDone, input.inspectionDate ? 'YES' : 'NO');
  const fsDone = asYesNoOrNA(input.fsTestDone, 'NO');
  const giDone = asYesNoOrNA(input.giTestDone, 'NO');
  const loadDone = asYesNoOrNA(input.loadTestDone, 'NO');

  setCell(ws.getCell('H46'), napDone);
  setCell(ws.getCell('H48'), fsDone);
  setCell(ws.getCell('H50'), giDone);
  setCell(ws.getCell('H52'), loadDone);

  const defaultTestDate = formatMonthYearSlash(input.inspectionDate);
  setCell(ws.getCell('J47'), getTestDateCellValue(napDone, formatMonthYearSlash(input.napTestDate || defaultTestDate)));
  setCell(ws.getCell('J49'), getTestDateCellValue(fsDone, formatMonthYearSlash(input.fsTestDate || defaultTestDate)));
  setCell(ws.getCell('J51'), getTestDateCellValue(giDone, formatMonthYearSlash(input.giTestDate || defaultTestDate)));
  setCell(ws.getCell('J53'), getTestDateCellValue(loadDone, formatMonthYearSlash(input.loadTestDate || defaultTestDate)));

  const checklist = input.checklist || {};
  const batteryModel = inferBatteryModel(checklist.modelo_bateria || checklist.ref_bateria);

  const statusMappings: Array<[string, string]> = [
    ['cobertura_exterior', 'C12'],
    ['saida_antena', 'C14'],
    ['refletores', 'C16'],
    ['tubo_identificacao', 'C18'],
    ['costuras_juntas', 'C20'],
    ['camara_fundos', 'C22'],
    ['sistema_endireitar', 'C24'],
    ['bolsas_estabilizacao', 'C26'],
    ['luz_exterior_bateria', 'C28'],
    ['escada_borda', 'C32'],
    ['valvulas_seguranca', 'C34'],
    ['uniao_banjo_superior', 'C36'],
    ['uniao_banjo_inferior', 'C38'],
    ['grinalda_espelhos', 'C40'],
    ['alca_retenida_espelhos', 'C42'],
    ['tubos_alta_pressao', 'C44'],
    ['cabo_disparo', 'C50'],
    ['capa_sistema_insuflacao', 'C52'],
    ['bolsa_cilindro', 'C54'],
    ['fecho_cobertura', 'E10'],
    ['protectores_juntas_interior', 'E12'],
    ['colectores_agua', 'E14'],
    ['manual_instrucoes', 'E16'],
    ['tecido_camara_fundo', 'E18'],
    ['fecho_saco_emergencia', 'E20'],
    ['luz_interior_bateria', 'E22'],
    ['bateria_litio', 'E24'],
    ['valvulas_insuflacao', 'E26'],
    ['valvulas_atestar_interior', 'E28'],
    ['suporte_antena', 'E30'],
    ['arco_cinta_remate', 'E32'],
    ['cinta_fecho', 'E36'],
    ['saco_retenida', 'E38'],
    ['marcas_involucro', 'E42'],
    ['pagaias', 'E48'],
    ['fole', 'E50'],
    ['jogo_reparacao', 'E52'],
    ['ancora_flutuante_linha', 'E54'],
    ['batedouro', 'E56'],
    ['reflector_radar', 'E58'],
    ['escada_entrada', 'C58'],
    ['grinalda_interior', 'C60'],
    ['anel_linha', 'C62'],
    ['faca_seguranca', 'C64'],
    ['cobertura_interior', 'C66'],
    ['ajudas_termicas', 'H10'],
    ['ambulancia', 'H12'],
    ['comprimidos_enjoo', 'H14'],
    ['foguetoes_paraquedas', 'H16'],
    ['fachos_mao', 'H18'],
    ['potes_fumo', 'H20'],
    ['lanterna', 'H22'],
    ['pilhas_lanterna', 'H24'],
    ['apito', 'H26'],
    ['estojo_pesca', 'H28'],
    ['esponjas', 'H30'],
    ['abre_latas', 'H32'],
    ['tesouras', 'H34'],
    ['sacos_enjoo', 'H36'],
    ['heliografo', 'H38'],
    ['manual_sobrevivencia', 'H40'],
    ['quadro_sinais', 'H42'],
    ['saco_agua', 'E62'],
    ['copo_graduado', 'E64'],
    ['racoes_alimentares', 'E66'],
  ];

  const dateMappings: Array<[string, string]> = [
    ['validade_luzes_exteriores', 'C29'],
    ['validade_agua', 'F63'],
    ['validade_racoes', 'F67'],
    ['validade_farmacia', 'J13'],
    ['validade_comprimidos', 'J15'],
    ['validade_paraquedas', 'J17'],
    ['validade_fachos_mao', 'J19'],
    ['validade_potes_fumo', 'J21'],
    ['validade_lanterna', 'J23'],
    ['validade_pilhas_lanterna', 'J25'],
    ['hru_val', 'K33'],
    ['cyl_test_val', 'I66'],
  ];

  const textMappings: Array<[string, string]> = [
    ['cilindro_co2', 'C47'],
    ['cabeca_disparo', 'C49'],
    ['comprimento_retenida', 'F41'],
  ];

  const daysMappings: Array<[string, string]> = [
    ['hru_days', 'L33'],
  ];

  // formatReferenceWithQuantity ja faz o filtro: so devolve valor quando o
  // artigo foi efetivamente substituido (>0 em substituicao_explicita__*) e
  // escreve "(quantidade) referencia". Referencia sem substituicao fica vazia.
  const referenceWithQuantityMappings: Array<[string, string, string, number]> = [
    ['ref_farmacia', 'qtd_farmacia', 'I13', 1],
    ['ref_comprimidos', 'qtd_comprimidos', 'I15', 1],
    ['ref_paraquedas', 'qtd_paraquedas', 'I17', 2],
    ['ref_fachos', 'qtd_fachos', 'I19', 2],
    ['ref_potes', 'qtd_potes', 'I21', 1],
    ['ref_bateria', 'qtd_pilhas_lanterna', 'I25', 4],
    ['ref_cinta_fecho', 'qtd_cinta_fecho', 'F37', 1],
    ['ref_jogo_reparacao', 'qtd_jogo_reparacao', 'F53', 1],
  ];

  statusMappings.forEach(([key, cellAddress]) => setChecklistCell(ws, checklist, key, cellAddress, 'status'));
  dateMappings.forEach(([key, cellAddress]) => setChecklistCell(ws, checklist, key, cellAddress, 'date'));
  textMappings.forEach(([key, cellAddress]) => setChecklistCell(ws, checklist, key, cellAddress, 'text'));
  daysMappings.forEach(([key, cellAddress]) => setChecklistCell(ws, checklist, key, cellAddress, 'days'));
  referenceWithQuantityMappings.forEach(([refKey, qtyKey, cellAddress, fallbackQty]) => {
    const value = formatReferenceWithQuantity(checklist, refKey, qtyKey, fallbackQty);
    if (!value) return;
    setCell(ws.getCell(cellAddress), value);
  });

  // Bateria de lítio: a CELULA F25 leva a VALIDADE (MM-AAAA), não a referência.
  // A validade da lanterna fica em J23 e a das pilhas em J25 — linhas distintas.
  setCell(ws.getCell('F25'), formatMonthYear(checklist.validade_bateria));
  const bateriaLitioPresente = checklist.ref_bateria_litio
    ? formatReferenceWithQuantity(checklist, 'ref_bateria_litio', 'qtd_bateria_litio', 1)
    : '';
  if (bateriaLitioPresente) setCell(ws.getCell('F26'), bateriaLitioPresente);

  setCell(ws.getCell('F23'), batteryModel);
  setCell(ws.getCell('F37'), input.contentorClosureText);
  setCell(ws.getCell('F41'), input.contentorPainterLength || checklist.comprimento_retenida);
}

function configureQuadroPrintLayout(ws: ExcelJS.Worksheet) {
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: true,
    verticalCentered: false,
    printArea: 'A1:J84',
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.35,
      bottom: 0.35,
      header: 0.2,
      footer: 0.2,
    },
  };
}

export async function buildQuadroInspectionArtifacts(input: QuadroTemplateInput) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await loadTemplateBuffer('template quadro.xlsx')) as unknown as XlsxLoadArg);

  const worksheet = workbook.getWorksheet('QUADRO') || workbook.worksheets[0];

  if (!worksheet) {
    throw new Error('Folha QUADRO não encontrada no template quadro.');
  }

  fillTemplate(worksheet, input);
  configureQuadroPrintLayout(worksheet);

  // Add "Artigos a Expirar" sheet
  const expiringSheet = workbook.addWorksheet('Artigos a Expirar');
  addExpiringArticlesSheet(expiringSheet, input);

  // Add "Artigos Substituídos" sheet
  const substitutedArticles = collectSubstitutedArticles(input);
  if (substitutedArticles.length > 0) {
    const substitutedSheet = workbook.addWorksheet('Artigos Substituidos');
    addSubstitutedArticlesSheet(substitutedSheet, substitutedArticles);
  }

  const written = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.isBuffer(written) ? written : Buffer.from(written as ArrayBuffer);

  const fileName = buildQuadroFileName(input as QuadroTemplateInput & Record<string, unknown>);
  return { buffer, fileName };
}

function addExpiringArticlesSheet(ws: ExcelJS.Worksheet, input: QuadroTemplateInput) {
  const checklist = input.checklist || {};
  const insDate = input.inspectionDate ? new Date(input.inspectionDate) : new Date();
  const nextInsDate = input.nextInspectionDate ? new Date(input.nextInspectionDate) : null;
  
  // Reference date for validity check (next inspection or 1 year from inspection)
  const refDate = nextInsDate || new Date(insDate.getFullYear() + 1, insDate.getMonth(), insDate.getDate());

  // Collect all article validities from checklist
  const validityKeys = [
    { key: 'validade_farmacia', label: 'Farmácia / First Aid Kit' },
    { key: 'validade_comprimidos', label: 'Comprimidos Enjoo' },
    { key: 'validade_paraquedas', label: 'Foguetes Paraquedas' },
    { key: 'validade_fachos_mao', label: 'Fachos de Mão' },
    { key: 'validade_potes_fumo', label: 'Potes de Fumo' },
    { key: 'validade_luzes_exteriores', label: 'Luz Exterior / Bateria' },
    { key: 'validade_bateria', label: 'Luz Interior / Bateria' },
    { key: 'validade_lanterna', label: 'Lanterna' },
    { key: 'validade_pilhas_lanterna', label: 'Pilhas Lanterna' },
    { key: 'validade_agua', label: 'Saco de Água' },
    { key: 'validade_racoes', label: 'Rações Alimentares' },
    { key: 'hru_val', label: 'HRU' },
    { key: 'cyl_test_val', label: 'Teste Hidráulico Cilindro' },
  ];

  const expiringItems: Array<{
    label: string;
    reference: string;
    quantity: number;
    validity: string;
    daysRemaining: number;
    status: 'EXPIRADO' | 'CRITICO' | 'ATENCAO' | 'OK';
  }> = [];

  validityKeys.forEach(({ key, label }) => {
    const val = checklist[key];
    if (!val) return;
    
    const refKey = key.replace('validade_', 'ref_').replace('hru_val', 'hruReferencia').replace('cyl_test_val', 'cylinderSerial');
    const qtyKey = key.replace('validade_', 'qtd_').replace('hru_val', '').replace('cyl_test_val', '');
    const reference = asString(checklist[refKey]) || '—';
    const quantity = Number(checklist[qtyKey]) || 1;
    
    const valStr = String(val);
    const [vYear, vMonth] = valStr.split('-').map(Number);
    if (!vYear || !vMonth) return;
    
    const expDate = new Date(vYear, (vMonth || 1) - 1, 1);
    const diffTime = expDate.getTime() - refDate.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let status: 'EXPIRADO' | 'CRITICO' | 'ATENCAO' | 'OK' = 'OK';
    if (daysRemaining < 0) status = 'EXPIRADO';
    else if (daysRemaining <= 30) status = 'CRITICO';
    else if (daysRemaining <= 90) status = 'ATENCAO';
    
    expiringItems.push({ label, reference, quantity, validity: valStr, daysRemaining, status });
  });

  // Sort by days remaining (expiring first)
  expiringItems.sort((a, b) => a.daysRemaining - b.daysRemaining);

  // Headers
  const headers = ['Artigo', 'Referência', 'Qtd', 'Validade (MM-AAAA)', 'Dias p/ Expirar', 'Estado'];
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true, size: 11 };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // Data rows
  expiringItems.forEach(item => {
    const row = ws.addRow([
      item.label,
      item.reference,
      item.quantity,
      item.validity,
      item.daysRemaining < 0 ? `Expirado há ${Math.abs(item.daysRemaining)} dias` : `${item.daysRemaining} dias`,
      item.status,
    ]);
    
    // Color coding by status
    const statusCell = row.getCell(6);
    if (item.status === 'EXPIRADO') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
      statusCell.font = { color: { argb: 'FFDC2626' }, bold: true };
    } else if (item.status === 'CRITICO') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
      statusCell.font = { color: { argb: 'FFEA580C' }, bold: true };
    } else if (item.status === 'ATENCAO') {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
      statusCell.font = { color: { argb: 'FFD97706' }, bold: true };
    } else {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
      statusCell.font = { color: { argb: 'FF16A34A' } };
    }
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(6).alignment = { horizontal: 'center' };
  });

  // Summary row
  const summaryRow = ws.addRow([]);
  const total = expiringItems.length;
  const expirados = expiringItems.filter(i => i.status === 'EXPIRADO').length;
  const criticos = expiringItems.filter(i => i.status === 'CRITICO').length;
  const atencao = expiringItems.filter(i => i.status === 'ATENCAO').length;
  const ok = expiringItems.filter(i => i.status === 'OK').length;
  
  const statsRow = ws.addRow([
    'RESUMO',
    '',
    '',
    '',
    `Total: ${total} | Expirados: ${expirados} | Críticos (≤30d): ${criticos} | Atenção (≤90d): ${atencao} | OK: ${ok}`,
    '',
  ]);
  statsRow.font = { bold: true, size: 10 };

  // Column widths
  ws.columns = [
    { width: 30 }, // Artigo
    { width: 20 }, // Referência
    { width: 8 },  // Qtd
    { width: 18 }, // Validade
    { width: 18 }, // Dias
    { width: 14 }, // Estado
  ];

  // Print setup
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    horizontalCentered: true,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };
}

function addSubstitutedArticlesSheet(ws: ExcelJS.Worksheet, articles: QuadroSubstitutedArticle[]) {
  // Title
  const titleRow = ws.addRow(['ARTIGOS SUBSTITUÍDOS NA INSPEÇÃO']);
  titleRow.font = { bold: true, size: 13 };
  ws.addRow([]);

  // Headers
  const headers = ['Artigo', 'Referência', 'Qtd', 'Validade (MM-AAAA)'];
  const headerRow = ws.addRow(headers);
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // Data rows
  articles.forEach((article) => {
    const row = ws.addRow([
      article.label,
      article.reference,
      article.quantity,
      article.validity,
    ]);
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).alignment = { horizontal: 'center' };
  });

  // Summary row
  const summaryRow = ws.addRow([]);
  const totalQty = articles.reduce((sum, a) => sum + a.quantity, 0);
  const statsRow = ws.addRow([
    'RESUMO',
    '',
    '',
    '',
    `Artigos: ${articles.length} | Qtd. Total: ${totalQty}`,
  ]);
  statsRow.font = { bold: true, size: 10 };

  // Column widths
  ws.columns = [
    { width: 32 }, // Artigo
    { width: 24 }, // Referência
    { width: 8 },  // Qtd
    { width: 18 }, // Validade
  ];

  // Print setup
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    horizontalCentered: true,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };
}
