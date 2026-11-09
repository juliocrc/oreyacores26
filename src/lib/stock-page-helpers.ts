import { STOCK_LIST_COLUMNS, type StockListColumnKey } from "@/types/stock-page";
import type { ItemStock, StockCatalogKind } from "@/types/stock-page";
import { isServiceResourceReference } from "@/lib/stock-reference-rules";

export function isPhysicalStockItem(item: { referencia?: string | null }): boolean {
  return !isServiceResourceReference(item.referencia);
}

export function matchesStockCatalogKind(item: { referencia?: string | null }, kind: StockCatalogKind): boolean {
  return kind === "all" || isPhysicalStockItem(item) === (kind === "parts");
}

export function isLowPhysicalStock(item: Pick<ItemStock, "referencia" | "quantidade" | "quantidadeMinima">): boolean {
  return isPhysicalStockItem(item) && item.quantidadeMinima != null && item.quantidade <= item.quantidadeMinima;
}

export function buildDefaultStockListColumns(): Record<StockListColumnKey, boolean> {
  return STOCK_LIST_COLUMNS.reduce((acc, col) => {
    acc[col.key] = true;
    return acc;
  }, {} as Record<StockListColumnKey, boolean>);
}

export function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function parseMonthYearToDate(value?: string): Date | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const mmYyyy = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYyyy) {
    const month = Number(mmYyyy[1]);
    const year = Number(mmYyyy[2]);
    if (month >= 1 && month <= 12) {
      return new Date(year, month, 0);
    }
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function normalizeStockLabelText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
