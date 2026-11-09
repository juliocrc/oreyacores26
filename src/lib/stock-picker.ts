import { normalizeText } from "@/lib/text-normalization";
import { getLocalDateKey, parseMonthYearValue, toMonthYearString } from "@/lib/date-utils";
import { getValidityCoverageStatus } from "@/lib/stock-validity";
import { isServiceResourceReference } from '@/lib/stock-reference-rules';

/**
 * Forma mínima de um artigo de stock usada pelos seletores de artigos.
 * `GlobalStockItem` (wizard) e o `StockItem` da ficha da jangada são
 * estruturalmente compatíveis com este tipo.
 */
export type StockPickerItem = {
  id: number;
  referencia?: string | null;
  descricao?: string | null;
  codigoFabricante?: string | null;
  codigoBarras?: string | null;
  validade?: string | null;
  lote?: string | null;
  quantidade?: number | null;
  quantidadeReservada?: number | null;
  stationId?: number | null;
  categoria?: string | null;
  foto?: string | null;
  localizacao?: string | null;
};

export type StockSelectionOptions = {
  requiredQuantity?: number;
  showValidade?: boolean;
  nextInspection?: string | null;
  allowDeficit?: boolean;
};

export function getStockSelectionError(item: StockPickerItem, { requiredQuantity = 1, showValidade = false, nextInspection, allowDeficit = false }: StockSelectionOptions = {}): string | null {
  const available = getAvailableStock(item);
  if (!Number.isFinite(requiredQuantity) || requiredQuantity <= 0) return 'Indique uma quantidade valida superior a zero.';
  if (isServiceResourceReference(item.referencia)) return null;
  if (available < requiredQuantity && !allowDeficit) return `Stock insuficiente nesta linha: disponivel ${available}, necessita ${requiredQuantity}. Reduza a quantidade ou escolha explicitamente outra linha com stock suficiente.`;
  if (!showValidade) return null;
  const status = getValidityCoverageStatus(item.validade, nextInspection || getLocalDateKey());
  if (nextInspection && status === 'pending') return 'Validade em falta/invalida ou proxima inspecao invalida. Confirme a data real ou escolha outra linha.';
  if (status === 'replace') return nextInspection
    ? 'Validade insuficiente: deve cobrir ate a proxima inspecao, inclusive. Escolha outra linha ou registe a excecao no artigo sem declarar conformidade.'
    : 'Artigo expirado. Escolha uma linha com validade suficiente.';
  return null;
}

export function sortStockCandidates<T extends StockPickerItem>(items: T[], options: StockSelectionOptions = {}): T[] {
  if (!options.showValidade) return items;
  const month = (item: T) => {
    const date = parseMonthYearValue(item.validade);
    return date ? date.year * 12 + date.month : Infinity;
  };
  return [...items].sort((a, b) => Number(Boolean(getStockSelectionError(a, options))) - Number(Boolean(getStockSelectionError(b, options))) || month(a) - month(b));
}

export function stockFilterText(item: StockPickerItem): string {
  return normalizeText(
    `${item.referencia ?? ""} ${item.descricao ?? ""} ${item.codigoFabricante ?? ""} ${item.codigoBarras ?? ""} ${item.lote ?? ""} ${item.categoria ?? ""}`,
  );
}

/** Filtra artigos por referência/descrição/fabricante/categoria (sem acentos). */
export function filterStockItems<T extends StockPickerItem>(items: T[], query: string): T[] {
  const q = normalizeText(query);
  if (!q) return items;
  const barcodeMatches = items.filter(item => normalizeText(item.codigoBarras || '') === q);
  if (barcodeMatches.length) return barcodeMatches;
  return items.filter((item) => q.split(/\s+/).every((term) => stockFilterText(item).includes(term)));
}

export function getAvailableStock(item: StockPickerItem): number {
  return Math.max(0, (Number(item.quantidade) || 0) - (Number(item.quantidadeReservada) || 0));
}

/** The caller supplies station-scoped, article-eligible rows. Never collapse by reference. */
export function getReplacementStockItems<T extends StockPickerItem>(items: T[], query = "", allowDeficit = false): T[] {
  const eligible = (item: T) => !isServiceResourceReference(item.referencia) && (allowDeficit || getAvailableStock(item) > 0);
  const available = items.filter(eligible);
  const code = normalizeText(query);
  const barcodeMatches = items.filter(item => code && normalizeText(item.codigoBarras || '') === code);
  // Even an exhausted exact barcode must not fall through to a different batch.
  if (barcodeMatches.length > 0) return barcodeMatches.filter(eligible);
  const references = new Set(items.filter(item => code && (
    normalizeText(item.referencia || '') === code
  )).map(item => normalizeText(item.referencia || '')).filter(Boolean));
  if (references.size > 0) return available.filter(item => references.has(normalizeText(item.referencia || '')));
  return filterStockItems(available, query);
}

/** Rótulo padrão de uma opção do seletor: `REF - Descrição (Val: MM/AAAA) (Qtd: N)`. */
export function formatStockOptionLabel(
  item: StockPickerItem,
  options: { showValidade?: boolean; showQuantity?: boolean } = {},
): string {
  const { showValidade = false, showQuantity = true } = options;
  const base = [item.referencia, item.descricao].filter(Boolean).join(" - ") || `#${item.id}`;
  if (isServiceResourceReference(item.referencia)) return `${base} (Recurso - sem controlo de stock)`;
  const tail: string[] = [];
  if (showValidade) {
    tail.push(`(Lote: ${item.lote || "N/D"})`);
    const validity = toMonthYearString(item.validade);
    tail.push(validity ? `(Val: ${validity})` : '(Validade: N/D)');
  }
  if (showQuantity) {
    const available = getAvailableStock(item);
    tail.push(available > 0 ? `(Qtd: ${available})` : "(Sem Stock)");
  }
  tail.push(`(Localizacao: ${item.localizacao || 'N/D'})`);
  return [base, ...tail].filter(Boolean).join(" ");
}

function stockHaystack(item: StockPickerItem): string {
  return normalizeText(`${item.categoria ?? ""} ${item.descricao ?? ""} ${item.referencia ?? ""}`);
}

const COMPONENT_CATEGORY_TOKENS = [
  "valv",
  "cilindro",
  "mangueira",
  "componente",
  "bexiga",
  "gasket",
  "op_head",
  "bobbin",
  "tubo",
  "cabeca",
  "disparo",
];
const COMPONENT_DESC_TOKENS = [
  "valvula",
  "valve",
  "hose",
  "mangueira",
  "operating head",
  "op head",
  "cabeca",
  "disparo",
  "firing",
  "cylinder",
  "cilindro",
  "o-ring",
  "gasket",
  "vedante",
  "tubo",
];

export function isComponentStockItem(item: StockPickerItem): boolean {
  const cat = normalizeText(item.categoria ?? "");
  const hay = stockHaystack(item);
  return (
    COMPONENT_CATEGORY_TOKENS.some((token) => cat.includes(token)) ||
    COMPONENT_DESC_TOKENS.some((token) => hay.includes(token))
  );
}

const HRU_TOKENS = ["hru", "libertador", "hydrostatic", "hidrostat"];
const LIGHT_TOKENS = ["luz", "light", "bateria", "batery", "battery", "lithium", "litio", "pilha"];
const CLOSURE_TOKEN_ON_CATEGORY = ["contentor", "cinta", "cintas", "fecho", "acessorio", "diversos"];
const CLOSURE_TOKENS = [
  "cinta",
  "strap",
  "autocolante",
  "selo",
  "fita",
  "saco",
  "vacuo",
  "anilha",
  "etiqueta",
  "vedante",
  "protec",
  "fecho",
  "contentor",
  "cintagem",
  "correia",
];

export function isHruStockItem(item: StockPickerItem): boolean {
  const hay = stockHaystack(item);
  return HRU_TOKENS.some((token) => hay.includes(token));
}

export function isLightStockItem(item: StockPickerItem): boolean {
  const hay = stockHaystack(item);
  return LIGHT_TOKENS.some((token) => hay.includes(token));
}

export function isClosureStockItem(item: StockPickerItem): boolean {
  const hay = normalizeText(`${item.referencia ?? ""} ${item.descricao ?? ""}`);
  const cat = normalizeText(item.categoria ?? "");
  if (cat && CLOSURE_TOKEN_ON_CATEGORY.some((token) => cat.includes(token))) {
    return true;
  }
  return CLOSURE_TOKENS.some((token) => hay.includes(token));
}

export function isVacuumBagStockItem(item: StockPickerItem): boolean {
  const hay = normalizeText(`${item.referencia ?? ""} ${item.descricao ?? ""}`);
  return hay.includes("vacuo") || hay.includes("vacuum") || hay.includes("vacio");
}

export function isStrapStockItem(item: StockPickerItem): boolean {
  if (isVacuumBagStockItem(item)) return false;
  const hay = stockHaystack(item).replace(/[_-]/g, " ");
  return /\b(cintas?|straps?|cintagem|correias?)\b/.test(hay);
}
