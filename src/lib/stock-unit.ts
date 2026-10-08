import { normalizeText } from "@/lib/text-normalization";

export const STOCK_UNIT_OPTIONS = [
  "un",
  "L",
  "mL",
  "KG",
  "g",
  "cx",
  "comp",
  "m",
  "m2",
  "par",
  "pct",
] as const;

export type StockUnitOption = (typeof STOCK_UNIT_OPTIONS)[number];

export const DEFAULT_STOCK_UNIT = "un";

const UNIT_ALIASES: Record<string, StockUnitOption> = {
  un: "un",
  und: "un",
  unidade: "un",
  unidades: "un",
  unity: "un",
  pc: "un",
  peca: "un",
  pecas: "un",
  unidade1: "un",
  l: "L",
  litro: "L",
  litros: "L",
  litre: "L",
  litres: "L",
  ml: "mL",
  mililitro: "mL",
  mililitros: "mL",
  kg: "KG",
  quilo: "KG",
  quilos: "KG",
  kilo: "KG",
  kilos: "KG",
  g: "g",
  gr: "g",
  grama: "g",
  gramas: "g",
  cx: "cx",
  caixa: "cx",
  caixas: "cx",
  box: "cx",
  comp: "comp",
  comprimido: "comp",
  comprimidos: "comp",
  tab: "comp",
  tablet: "comp",
  tablets: "comp",
  m2: "m2",
  metro: "m",
  metros: "m",
  mt: "m",
  par: "par",
  pares: "par",
  pct: "pct",
  percentagem: "pct",
  porcentaje: "pct",
  percent: "pct",
};

const CONTAINER_WORDS = [
  "saco",
  "sacos",
  "saquinho",
  "embalagem",
  "pacote",
  "pack",
  "garrafa",
  "garrafas",
  "bilha",
  "bilhas",
  "balde",
  "baldes",
  "caixa",
  "caixas",
  "cx",
  "blister",
  "blisters",
  "tubo",
  "tubos",
  "rolo",
  "rolos",
  "frasco",
  "frascos",
  "lata",
  "latas",
  "pote",
  "potes",
  "cartao",
  "kit",
  "kits",
  "sistema",
  "equipamento",
];

const BULK_MEASURE_PATTERNS: Array<{ pattern: RegExp; unit: StockUnitOption }> = [
  { pattern: /(^|[^a-z0-9])ml([^a-z0-9]|$)/, unit: "mL" },
  { pattern: /(^|[^a-z0-9])litros?([^a-z0-9]|$)/, unit: "L" },
  { pattern: /(^|[^a-z0-9])(kg|kilos?|quilos?)([^a-z0-9]|$)/, unit: "KG" },
  { pattern: /(^|[^a-z0-9])gramas?([^a-z0-9]|$)/, unit: "g" },
];

export function normalizeStockUnit(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const key = normalizeText(raw).replace(/\s+/g, " ");
  if (!key) return null;

  const alias = UNIT_ALIASES[key];
  if (alias) return alias;

  const compact = key.replace(/\s+/g, "");
  const compactAlias = UNIT_ALIASES[compact];
  if (compactAlias) return compactAlias;

  if (raw.length > 12) return null;
  return raw;
}

export function isKnownStockUnit(value: unknown): boolean {
  const normalized = normalizeStockUnit(value);
  return normalized != null && (STOCK_UNIT_OPTIONS as readonly string[]).includes(normalized);
}

export function inferStockUnitSuggestion(...sources: unknown[]): StockUnitOption {
  const text = normalizeText(sources.filter(Boolean).join(" "));
  if (!text) return DEFAULT_STOCK_UNIT;

  const isContainer = CONTAINER_WORDS.some((word) => text.includes(word));
  if (isContainer) return DEFAULT_STOCK_UNIT;

  if (/comprimidos?|tablets?|blister/.test(text)) return "comp";
  if (/caixas?/.test(text)) return "cx";

  for (const { pattern, unit } of BULK_MEASURE_PATTERNS) {
    if (pattern.test(text)) return unit;
  }

  return DEFAULT_STOCK_UNIT;
}
