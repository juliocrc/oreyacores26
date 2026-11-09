import { isServiceResourceReference } from "./stock-reference-rules";

export type ShelfStockItem = {
  id: number;
  foto?: string | null;
  nome?: string;
  descricao?: string;
  referencia?: string | null;
  lote?: string | null;
  quantidade?: number | null;
  quantidadeReservada?: number | null;
  unit?: string | null;
  localizacao?: string | null;
  categoria?: string | null;
};

const naturalOrder = new Intl.Collator("pt", { numeric: true, sensitivity: "base" });
const numberFormat = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 6 });

function searchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function availableShelfQuantity(item: ShelfStockItem) {
  const qty = Number.isFinite(item.quantidade) ? item.quantidade! : 0;
  const reserved = Number.isFinite(item.quantidadeReservada) ? item.quantidadeReservada! : 0;
  return Math.max(0, qty - Math.max(0, reserved));
}

export function formatShelfAvailability(totals: Array<{ unit: string; quantity: number }>) {
  return totals.map(({ unit, quantity }) => `${numberFormat.format(quantity)} ${unit}`).join(" · ");
}

/** Display only: keep recorded locations distinct; never infer a physical shelf. */
export function buildShelfView(items: ShelfStockItem[], query = "") {
  const terms = searchText(query).trim().split(/\s+/).filter(Boolean);
  const buckets = new Map<string, ShelfStockItem[]>();
  for (const item of items) {
    if (isServiceResourceReference(item.referencia)) continue;
    const haystack = searchText([item.nome, item.descricao, item.referencia, item.lote, item.localizacao, item.categoria].filter(Boolean).join(" "));
    if (!terms.every(term => haystack.includes(term))) continue;
    const location = item.localizacao?.trim() || "";
    const bucket = buckets.get(location) || [];
    bucket.push(item);
    buckets.set(location, bucket);
  }
  return [...buckets].sort(([a], [b]) => {
    if (!a) return 1;
    if (!b) return -1;
    return naturalOrder.compare(a, b) || a.localeCompare(b);
  }).map(([location, rows]) => {
    const totals = new Map<string, number>();
    for (const item of rows) {
      const unit = item.unit?.trim() || "unidade não indicada";
      totals.set(unit, (totals.get(unit) || 0) + availableShelfQuantity(item));
    }
    return {
      location,
      label: location || "Sem localização",
      items: [...rows].sort((a, b) => naturalOrder.compare(a.referencia || a.nome || a.descricao || "", b.referencia || b.nome || b.descricao || "") || naturalOrder.compare(a.lote || "", b.lote || "") || a.id - b.id),
      productCount: new Set(rows.map(item => item.referencia?.trim() || `#${item.id}`)).size,
      availability: [...totals].sort(([a], [b]) => naturalOrder.compare(a, b)).map(([unit, quantity]) => ({ unit, quantity })),
    };
  });
}
