import { getLocalDateKey, parseFlexibleDate } from '@/lib/date-utils';
import { canonicalizeRaftBrand, canonicalizeRaftModel, normalizeUpperText } from '@/lib/text-normalization';

export type BrandRaftStatistics = {
  brand: string;
  count: number;
  models: { model: string; capacity: number | null; count: number }[];
};

export function buildBrandRaftStatistics(rafts: {
  brand: string | null; model: string | null; capacity: number | null;
  packType?: string | null; serial?: string | null;
}[]): BrandRaftStatistics[] {
  const brands = new Map<string, BrandRaftStatistics>();
  for (const raft of rafts) {
    // Match the legacy ALMAR identity used by the raft read/write routes.
    const legacyAlmar = normalizeUpperText(raft.model) === 'ALMAR';
    const brand = (legacyAlmar ? 'ALMAR' : canonicalizeRaftBrand(raft.brand)) || 'Marca desconhecida';
    const model = (legacyAlmar ? 'STD' : canonicalizeRaftModel(raft.model, brand, raft.packType, raft.serial)) || 'Modelo desconhecido';
    const capacity = raft.capacity !== null && Number.isInteger(raft.capacity) && raft.capacity > 0 ? raft.capacity : null;
    let entry = brands.get(brand);
    if (!entry) {
      entry = { brand, count: 0, models: [] };
      brands.set(brand, entry);
    }
    entry.count++;
    const row = entry.models.find(row => row.model === model && row.capacity === capacity);
    if (row) row.count++;
    else entry.models.push({ model, capacity, count: 1 });
  }
  for (const entry of brands.values()) {
    entry.models.sort((a, b) => a.model.localeCompare(b.model, 'pt-PT', { numeric: true })
      || (a.capacity ?? Infinity) - (b.capacity ?? Infinity));
  }
  return [...brands.values()].sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand, 'pt-PT'));
}

export function normalizeStatisticState(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function classifyInspectionStatus(value: unknown) {
  const state = normalizeStatisticState(value);
  if (['concluida', 'concluido', 'completed'].includes(state)) return 'completed';
  if (['draft', 'rascunho'].includes(state)) return 'draft';
  if (['condenada', 'condenado'].includes(state)) return 'condemned';
  return 'other';
}

export function classifyTestResult(value: unknown): 'pass' | 'fail' | 'na' {
  const state = normalizeStatisticState(value);
  if (['pass', 'passed', 'passou', 'aprovou', 'aprovado', 'aprovada', 'sim', 'ok'].includes(state)) return 'pass';
  if (['fail', 'failed', 'reprovou', 'reprovado', 'reprovada', 'nao', 'nao ok', 'not ok'].includes(state)) return 'fail';
  return 'na';
}

export function buildMonthlyTrend(dates: (string | null)[], now = new Date()) {
  const [year, month] = getLocalDateKey(now).split('-').map(Number);
  const trend = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 12 + i, 1));
    return { month: date.toISOString().slice(0, 7), count: 0 };
  });
  const buckets = new Map(trend.map(row => [row.month, row]));
  for (const value of dates) {
    const date = parseFlexibleDate(value && /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value);
    if (!date) continue;
    const bucket = buckets.get(getLocalDateKey(date).slice(0, 7));
    if (bucket) bucket.count++;
  }
  return trend;
}

export function testPercentages(stats: { pass: number; fail: number; na: number }) {
  const total = stats.pass + stats.fail;
  return { total, passPct: total ? Math.round(stats.pass / total * 100) : 0,
    failPct: total ? Math.round(stats.fail / total * 100) : 0 };
}
