import { normalizeText } from "@/lib/text-normalization";
import { toMonthYearString } from "@/lib/date-utils";

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
  validade?: string | null;
  lote?: string | null;
  quantidade?: number | null;
  categoria?: string | null;
  foto?: string | null;
};

export function stockFilterText(item: StockPickerItem): string {
  return normalizeText(
    `${item.referencia ?? ""} ${item.descricao ?? ""} ${item.codigoFabricante ?? ""} ${item.categoria ?? ""}`,
  );
}

/** Filtra artigos por referência/descrição/fabricante/categoria (sem acentos). */
export function filterStockItems<T extends StockPickerItem>(items: T[], query: string): T[] {
  const q = normalizeText(query);
  if (!q) return items;
  return items.filter((item) => stockFilterText(item).includes(q));
}

/** Rótulo padrão de uma opção do seletor: `REF - Descrição (Val: MM/AAAA) (Qtd: N)`. */
export function formatStockOptionLabel(
  item: StockPickerItem,
  options: { showValidade?: boolean; showQuantity?: boolean } = {},
): string {
  const { showValidade = false, showQuantity = true } = options;
  const base = [item.referencia, item.descricao].filter(Boolean).join(" - ") || `#${item.id}`;
  const tail: string[] = [];
  if (showValidade && item.validade) {
    tail.push(`(Val: ${toMonthYearString(item.validade)})`);
  }
  if (showQuantity) {
    tail.push(Number(item.quantidade ?? 0) > 0 ? `(Qtd: ${item.quantidade})` : "(Sem Stock)");
  }
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

const HRU_TOKENS = ["hru", "libertador", "hydrostatic", "hidrostat", "hammar"];
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
