import prisma from "@/lib/prisma";
import { certificateItemHasManagedValidity } from "@/lib/certificate-validity";
import { stockItemSupportsValidity } from "@/lib/stock-validity";
import { getMandatoryPackItemsForRaft, type MandatoryPackItem } from "@/modules/rafts/mandatoryPack";

export type StockNeedsScope = "all" | "jangadas-ocean" | "";

export type MonthlyNeed = {
  month: string;
  quantidade: number;
  qty: number;
  jangadas?: Array<{
    id: number;
    serial: string;
    brand?: string | null;
    model?: string | null;
    owner?: string | null;
  }>;
};

export type StockMatched = {
  id: number;
  ref: string;
  desc: string;
  qty: number;
};

export type NeedRow = {
  referencia: string;
  nome: string;
  categoria: string;
  seccao: string;
  fornecedor: string;
  stockAtual: number;
  stockMinimo: number;
  necessidade30d: number;
  necessidade60d: number;
  necessidade90d: number;
  necessidade12m: number;
  saldoProjetado30d: number;
  saldoProjetado90d: number;
  saldoProjetado12m: number;
  suficiente: boolean;
  reorderQty: number;
  safetyBuffer: number;
  orderLimitDate: string;
  avgPrice: number;
  consumoHistorico90d: number;
  consumoMedioMensal: number;
  demandaAjustada90d: number;
  mensal: MonthlyNeed[];
  jangadasCount: number;
  jangadasAfetadas: string[];
  stockMatched: StockMatched[];
  stockId: number | null;
  hasValidity: boolean;
};

export type StockNeedById = {
  stockId: number;
  referencia: string;
  nome: string;
  stockAtual: number;
  necessidade12m: number;
  saldoProjetado12m: number;
  mensal: MonthlyNeed[];
  matchedBy: "referencia" | "nome" | null;
};

export type StockNeedsSummary = {
  totalRaftsAnalyzed: number;
  expiringRafts30d: number;
  expiringRafts60d: number;
  expiringRafts90d: number;
  expiringRafts12m: number;
  artigosComValidadeAte12Meses: number;
  artigosVencidos: number;
  quantidadeTotalNecessaria12m: number;
  jangadasAfetadas: number;
  totalItemsTracked: number;
  itemsInAlert: number;
  totalReorderCost: number;
  coveragePercent: number;
  cilindrosNecessarios30d: number;
  cilindrosCheiosDisponiveis30d: number;
  necessidadesMensaisTotais: MonthlyNeed[];
};

export type StockNeedsResult = {
  generatedAt: string;
  summary: StockNeedsSummary;
  needs: NeedRow[];
  stockNeeds: StockNeedById[];
  suggestions: Array<{
    reference: string;
    label: string;
    category: string;
    projectedDemand90d: number;
    demandByWindow: Record<string, number>;
    monthBreakdown: Array<{ month: string; qty: number; quantidade: number }>;
    stockAvailable: number;
    stockQty: number;
    stockMinQty: number;
    reorderQty: number;
    safetyBuffer: number;
    orderLimitDate: string;
    supplier: string;
    avgPrice: number;
    raftCount: number;
    raftSerials: string[];
    stockMatched: StockMatched[];
    consumoHistorico90d: number;
    demandaAjustada90d: number;
  }>;
  upcomingRafts30d: Array<{
    id: number;
    serial: string;
    brand?: string | null;
    model?: string | null;
    owner?: string | null;
    packType?: string | null;
    dataProxInspecao?: string | null;
    daysUntil?: number | null;
  }>;
};

type StockRecord = {
  id: number;
  descricao: string;
  referencia: string;
  quantidade: number;
  quantidadeMinima?: number | null;
  categoria?: string | null;
  testeHidraulico?: string | null;
  estadoCargaCilindro?: string | null;
  precoVenda?: number | null;
  estadoArtigo?: string | null;
};

  type DemandEntry = {
  reference: string;
  label: string;
  category: string;
  section: string;
  supplier: string;
  byWindow: Record<string, number>;
  byMonth: Map<string, number>;
  monthRafts: Map<string, Map<number, { id: number; serial: string; brand?: string | null; model?: string | null; owner?: string | null }>>;
  raftSerials: Set<string>;
  raftIds: Set<number>;
  hasValidity?: boolean;
};

const LEAD_TIME_DAYS = 15;
const SAFETY_RATIO = 0.15;
const HIST_BLEND = 0.35;

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function normalizeRef(value?: string | null): string {
  return String(value || "").trim().toUpperCase();
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(base: Date, months: number) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

function parseDate(input: Date | string | null | undefined): Date | null {
  if (!input) return null;
  const date = input instanceof Date ? input : new Date(String(input).trim());
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseValidadeString(validadeStr: string): Date | null {
  if (!validadeStr) return null;
  const raw = String(validadeStr).trim();
  const mmYyyy = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYyyy) {
    const month = parseInt(mmYyyy[1], 10);
    const year = parseInt(mmYyyy[2], 10);
    if (month >= 1 && month <= 12) return new Date(year, month, 0);
  }
  const mmYy = raw.match(/^(\d{1,2})\/(\d{2})$/);
  if (mmYy) {
    const month = parseInt(mmYy[1], 10);
    const year = 2000 + parseInt(mmYy[2], 10);
    if (month >= 1 && month <= 12) return new Date(year, month, 0);
  }
  return parseDate(raw);
}

function daysUntil(dateStr: string | null | undefined, now: Date): number | null {
  const d = parseDate(dateStr);
  if (!d) return null;
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - base.getTime()) / 86400000);
}

function resolveSupplierForItem(item: MandatoryPackItem): string {
  return "Armazém Central (Estação de Serviço de Lisboa)";
}

function isCylinderLike(record: Pick<StockRecord, "descricao" | "referencia" | "categoria">) {
  const haystack = normalizeText([record.descricao, record.referencia, record.categoria].filter(Boolean).join(" "));
  return /(CILINDR|CO2|N2|BOTTLE|GARRAFA)/.test(haystack);
}

function isHydraulicTestValidForWindow(dateText: string | null | undefined, days: number, now: Date) {
  const parsed = parseDate(dateText);
  if (!parsed) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + days);
  return parsed >= today && parsed >= limit;
}

function toMonthly(month: string, quantidade: number, jangadas?: MonthlyNeed["jangadas"]): MonthlyNeed {
  return { month, quantidade, qty: quantidade, jangadas };
}

async function fetchStockRaw(stockScope: string): Promise<StockRecord[]> {
  try {
    const where: Record<string, unknown> = {};
    if (stockScope === "jangadas-ocean") {
      where.OR = [
        { associavelJangada: true },
        {
          AND: [
            { aplicavelMarcaJangada: { contains: "ocean safety" } },
            { codigoFabricante: { not: null } },
            { codigoFabricante: { not: "" } },
          ],
        },
      ];
    }

    return (await prisma.stock.findMany({
      where,
      select: {
        id: true,
        descricao: true,
        referencia: true,
        quantidade: true,
        categoria: true,
        testeHidraulico: true,
        estadoCargaCilindro: true,
        quantidadeMinima: true,
        precoVenda: true,
        estadoArtigo: true,
      },
    })) as StockRecord[];
  } catch {
    return [];
  }
}

async function fetchCertificadosValidades() {
  try {
    const validades = await prisma.certificadoValidade.findMany({
      include: {
        certificado: {
          include: {
            jangadasAtivas: {
              select: { id: true, serial: true, brand: true, model: true, owner: true },
            },
          },
        },
      },
    });
    return validades.map((v: any) => ({
      id: v.id,
      item: v.item,
      validade: v.validade,
      certificadoId: v.certificadoId,
      jangadas: v.certificado.jangadasAtivas || [],
    }));
  } catch {
    return [];
  }
}

async function fetchConsumoHistorico90d(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const movimentos = await prisma.movimentacaoStock.findMany({
      where: { createdAt: { gte: since }, tipo: "saida" },
      select: {
        quantidade: true,
        stock: { select: { referencia: true } },
      },
    });
    for (const m of movimentos) {
      const ref = normalizeRef(m.stock?.referencia);
      if (!ref) continue;
      map.set(ref, (map.get(ref) || 0) + Math.abs(Number(m.quantidade) || 0));
    }
  } catch {
    // ignore
  }
  return map;
}

function buildStockIndexes(stockItems: StockRecord[]) {
  const byRef = new Map<string, StockRecord[]>();
  for (const s of stockItems) {
    const ref = normalizeRef(s.referencia);
    if (!ref) continue;
    const list = byRef.get(ref) || [];
    list.push(s);
    byRef.set(ref, list);
  }
  return { byRef };
}

function findStockForDemand(
  stockItems: StockRecord[],
  byRef: Map<string, StockRecord[]>,
  demand: DemandEntry
): { matched: StockRecord[]; matchedBy: "referencia" | "nome" | null } {
  if (demand.reference) {
    const exact = byRef.get(normalizeRef(demand.reference)) || [];
    if (exact.length) return { matched: exact, matchedBy: "referencia" };
  }

  const tokens = demand.label
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3);
  if (!tokens.length) return { matched: [], matchedBy: null };

  const scored = stockItems
    .map((s) => {
      const desc = (s.descricao || "").toLowerCase();
      const hits = tokens.filter((t) => desc.includes(t)).length;
      return { s, hits };
    })
    .filter((x) => x.hits >= Math.min(2, tokens.length))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 8)
    .map((x) => x.s);

  return { matched: scored, matchedBy: scored.length ? "nome" : null };
}

export async function computeStockNeeds(options?: {
  stockScope?: StockNeedsScope | string;
}): Promise<StockNeedsResult> {
  const stockScope = String(options?.stockScope || "").trim().toLowerCase();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const in12Months = addMonths(now, 12);

  const [stockRaw, allRafts, certificadosWithValidades, consumoMap] = await Promise.all([
    fetchStockRaw(stockScope),
    prisma.jangada.findMany({
      select: {
        id: true,
        serial: true,
        brand: true,
        model: true,
        capacity: true,
        packType: true,
        owner: true,
        dataProxInspecao: true,
      },
    }),
    fetchCertificadosValidades(),
    fetchConsumoHistorico90d(),
  ]);

  const stockItems = stockRaw.map((s) => ({
    ...s,
    referencia: normalizeRef(s.referencia),
  }));
  const { byRef } = buildStockIndexes(stockItems);

  const allRaftsWithDays = allRafts
    .map((r) => ({ ...r, inspectionDays: daysUntil(r.dataProxInspecao, now) }))
    .filter((r) => r.inspectionDays !== null && r.inspectionDays! >= 0);

  const within30d = allRaftsWithDays.filter((r) => r.inspectionDays! <= 30);
  const within60d = allRaftsWithDays.filter((r) => r.inspectionDays! <= 60);
  const within90d = allRaftsWithDays.filter((r) => r.inspectionDays! <= 90);
  const within12m = allRaftsWithDays.filter((r) => r.inspectionDays! <= 365);

  const demandMap = new Map<string, DemandEntry>();

  for (const raft of within12m) {
    let items: MandatoryPackItem[] = [];
    try {
      items = getMandatoryPackItemsForRaft({
        brand: raft.brand,
        model: raft.model,
        packType: raft.packType,
        capacity: raft.capacity,
      });
    } catch {
      continue;
    }
    if (!items.length) continue;

    const days = raft.inspectionDays!;
    const inspectionDate = parseDate(raft.dataProxInspecao);
    const mk = inspectionDate ? monthKey(inspectionDate) : null;

    for (const item of items) {
      if (item.optional) continue;
      const primaryRef = item.reference || item.stockReferences[0] || "";
      const key = primaryRef ? `ref:${normalizeRef(primaryRef)}` : `name:${item.checklistName}`;
      const itemHasValidity =
        certificateItemHasManagedValidity(item.label) ||
        certificateItemHasManagedValidity(item.checklistName) ||
        stockItemSupportsValidity({
          nome: item.label,
          descricao: item.label,
          categoria: item.category,
          referencia: primaryRef,
        });

      let entry = demandMap.get(key);
      if (!entry) {
        entry = {
          reference: primaryRef,
          label: item.label,
          category: item.category,
          section: item.section,
          supplier: resolveSupplierForItem(item),
          byWindow: { "30d": 0, "60d": 0, "90d": 0, "12m": 0 },
          byMonth: new Map(),
          monthRafts: new Map(),
          raftSerials: new Set(),
          raftIds: new Set(),
          hasValidity: itemHasValidity,
        } as DemandEntry & { hasValidity: boolean };
        demandMap.set(key, entry);
      } else if (itemHasValidity) {
        (entry as DemandEntry & { hasValidity?: boolean }).hasValidity = true;
      }

      const qty = Number(item.quantity) || 0;
      if (days <= 30) entry.byWindow["30d"] += qty;
      if (days <= 60) entry.byWindow["60d"] += qty;
      if (days <= 90) entry.byWindow["90d"] += qty;
      entry.byWindow["12m"] += qty;
      entry.raftSerials.add(raft.serial);
      entry.raftIds.add(raft.id);

      // Necessidades mensais: só artigos com validade gerida
      if (mk && itemHasValidity) {
        entry.byMonth.set(mk, (entry.byMonth.get(mk) || 0) + qty);
        if (!entry.monthRafts.has(mk)) entry.monthRafts.set(mk, new Map());
        entry.monthRafts.get(mk)!.set(raft.id, {
          id: raft.id,
          serial: raft.serial,
          brand: raft.brand,
          model: raft.model,
          owner: raft.owner,
        });
      }
    }
  }

  const earliest90 = [...within90d].sort((a, b) => (a.inspectionDays || 999) - (b.inspectionDays || 999))[0];

  const needs: NeedRow[] = Array.from(demandMap.values()).map((demand) => {
    const { matched, matchedBy } = findStockForDemand(stockItems, byRef, demand);
    const stockAvailable = matched.reduce((acc, s) => acc + (Number(s.quantidade) || 0), 0);
    const minQty = Math.max(...matched.map((s) => Number(s.quantidadeMinima) || 0), 0);
    const avgPrice = matched.length
      ? matched.reduce((acc, s) => acc + (Number(s.precoVenda) || 0), 0) / matched.length
      : 0;

    const demand30d = demand.byWindow["30d"] || 0;
    const demand60d = demand.byWindow["60d"] || 0;
    const demand90d = demand.byWindow["90d"] || 0;
    const demand12m = demand.byWindow["12m"] || 0;

    const refKey = normalizeRef(matched[0]?.referencia || demand.reference);
    const consumoHistorico90d = consumoMap.get(refKey) || 0;
    const consumoMedioMensal = consumoHistorico90d / 3;
    const demandaAjustada90d = Math.ceil(
      demand90d * (1 - HIST_BLEND) + Math.max(consumoHistorico90d, demand90d * 0.25) * HIST_BLEND
    );

    const planningDemand = Math.max(demandaAjustada90d, minQty > 0 && stockAvailable <= minQty ? minQty : 0);
    const isLow = stockAvailable < planningDemand || (minQty > 0 && stockAvailable <= minQty);
    const safetyBuffer = Math.ceil(planningDemand * SAFETY_RATIO);
    const reorderQty = isLow ? Math.max(0, planningDemand - stockAvailable + safetyBuffer) : 0;

    let orderLimitDate = "";
    if (reorderQty > 0) {
      if (earliest90?.dataProxInspecao) {
        const inspDate = parseDate(earliest90.dataProxInspecao)!;
        inspDate.setDate(inspDate.getDate() - LEAD_TIME_DAYS);
        orderLimitDate = inspDate.toISOString().slice(0, 10);
      } else {
        const limit = new Date(now);
        limit.setDate(limit.getDate() + 30);
        orderLimitDate = limit.toISOString().slice(0, 10);
      }
    }

    const mensal = Array.from(demand.byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, qty]) =>
        toMonthly(
          month,
          qty,
          Array.from(demand.monthRafts.get(month)?.values() || []).sort((a, b) =>
            a.serial.localeCompare(b.serial, "pt")
          )
        )
      );

    return {
      referencia: matched[0]?.referencia || demand.reference,
      nome: demand.label,
      categoria: demand.category,
      seccao: demand.section,
      fornecedor: demand.supplier,
      stockAtual: stockAvailable,
      stockMinimo: minQty,
      necessidade30d: demand30d,
      necessidade60d: demand60d,
      necessidade90d: demand90d,
      necessidade12m: demand12m,
      saldoProjetado30d: stockAvailable - demand30d,
      saldoProjetado90d: stockAvailable - demand90d,
      saldoProjetado12m: stockAvailable - demand12m,
      suficiente: !isLow,
      reorderQty,
      safetyBuffer,
      orderLimitDate,
      avgPrice,
      consumoHistorico90d,
      consumoMedioMensal: Math.round(consumoMedioMensal * 10) / 10,
      demandaAjustada90d,
      mensal,
      jangadasCount: demand.raftSerials.size,
      jangadasAfetadas: Array.from(demand.raftSerials).sort(),
      stockMatched: matched.map((s) => ({
        id: s.id,
        ref: s.referencia,
        desc: s.descricao,
        qty: s.quantidade,
      })),
      stockId: matched[0]?.id ?? null,
      hasValidity: Boolean(demand.hasValidity) || matched.some((s) =>
        stockItemSupportsValidity({
          nome: s.descricao,
          descricao: s.descricao,
          categoria: s.categoria,
          referencia: s.referencia,
        })
      ),
      // internal for stockNeeds mapping
      ...({ _matchedBy: matchedBy } as any),
    };
  });

  needs.sort((a, b) => {
    if (a.suficiente !== b.suficiente) return a.suficiente ? 1 : -1;
    if (b.reorderQty !== a.reorderQty) return b.reorderQty - a.reorderQty;
    return b.necessidade90d - a.necessidade90d;
  });

  // Per-stock-id rows for catalogue / home
  const stockNeedsMap = new Map<number, StockNeedById>();
  for (const need of needs as Array<NeedRow & { _matchedBy?: "referencia" | "nome" | null }>) {
    const targets = need.stockMatched.length
      ? need.stockMatched
      : need.stockId
        ? [{ id: need.stockId, ref: need.referencia, desc: need.nome, qty: need.stockAtual }]
        : [];
    if (!targets.length) continue;

    const primary = targets[0];
    const existing = stockNeedsMap.get(primary.id);
    if (!existing) {
      stockNeedsMap.set(primary.id, {
        stockId: primary.id,
        referencia: primary.ref || need.referencia,
        nome: need.nome,
        stockAtual: need.stockAtual,
        necessidade12m: need.necessidade12m,
        saldoProjetado12m: need.saldoProjetado12m,
        mensal: need.mensal,
        matchedBy: need._matchedBy || (primary.ref ? "referencia" : "nome"),
      });
    } else {
      existing.necessidade12m += need.necessidade12m;
      existing.saldoProjetado12m = existing.stockAtual - existing.necessidade12m;
      const monthMap = new Map(existing.mensal.map((m) => [m.month, m.quantidade]));
      for (const m of need.mensal) {
        monthMap.set(m.month, (monthMap.get(m.month) || 0) + m.quantidade);
      }
      existing.mensal = Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, quantidade]) => toMonthly(month, quantidade));
    }
  }
  const stockNeeds = Array.from(stockNeedsMap.values()).sort(
    (a, b) => a.saldoProjetado12m - b.saldoProjetado12m
  );

  // Certificate validity
  const within12MonthsCerts = certificadosWithValidades.filter((v) => {
    if (!certificateItemHasManagedValidity(v.item)) return false;
    const d = parseValidadeString(v.validade);
    return d ? d <= in12Months : false;
  });
  const expired = within12MonthsCerts.filter((v) => {
    const d = parseValidadeString(v.validade);
    return d ? d < now : false;
  });

  const monthlyTotalsMap = new Map<string, number>();
  for (const need of needs) {
    if (!need.hasValidity) continue;
    for (const m of need.mensal) {
      monthlyTotalsMap.set(m.month, (monthlyTotalsMap.get(m.month) || 0) + m.quantidade);
    }
  }
  for (const v of within12MonthsCerts) {
    const d = parseValidadeString(v.validade);
    if (!d) continue;
    const effectiveDate = d < now ? now : d;
    const mk = monthKey(effectiveDate);
    // only count cert lines separately in summary.artigos — monthly pack demand already in needs
    void mk;
  }

  const cilindrosNecessarios30d = within30d.length;
  const cilindrosCheiosDisponiveis30d = stockItems
    .filter((s) => isCylinderLike(s))
    .filter((s) => String(s.estadoCargaCilindro || "").trim().toUpperCase() === "CHEIO")
    .filter((s) => isHydraulicTestValidForWindow(s.testeHidraulico, 30, now))
    .reduce((acc, s) => acc + Number(s.quantidade || 0), 0);

  const totalCost = needs.reduce((acc, n) => acc + n.reorderQty * n.avgPrice, 0);
  const alertCount = needs.filter((n) => !n.suficiente).length;
  const quantidadeTotalNecessaria12m = needs.reduce((acc, n) => acc + n.necessidade12m, 0);
  const jangadasAfetadas = new Set(needs.flatMap((n) => n.jangadasAfetadas)).size;
  const coveragePercent = needs.length
    ? Math.round(((needs.length - alertCount) / needs.length) * 100)
    : 100;

  const suggestions = needs.map((n) => ({
    reference: n.referencia,
    label: n.nome,
    category: n.categoria,
    projectedDemand90d: n.necessidade90d,
    demandByWindow: {
      "30d": n.necessidade30d,
      "60d": n.necessidade60d,
      "90d": n.necessidade90d,
      "12m": n.necessidade12m,
    },
    monthBreakdown: n.mensal.map((m) => ({ month: m.month, qty: m.qty, quantidade: m.quantidade })),
    stockAvailable: n.stockAtual,
    stockQty: n.stockMatched[0]?.qty ?? n.stockAtual,
    stockMinQty: n.stockMinimo,
    reorderQty: n.reorderQty,
    safetyBuffer: n.safetyBuffer,
    orderLimitDate: n.orderLimitDate,
    supplier: n.fornecedor,
    avgPrice: n.avgPrice,
    raftCount: n.jangadasCount,
    raftSerials: n.jangadasAfetadas,
    stockMatched: n.stockMatched,
    consumoHistorico90d: n.consumoHistorico90d,
    demandaAjustada90d: n.demandaAjustada90d,
  }));

  // strip internal fields
  const cleanNeeds: NeedRow[] = needs
    .filter((n) => n.hasValidity)
    .map((n) => {
      const { _matchedBy, ...rest } = n as NeedRow & { _matchedBy?: unknown };
      void _matchedBy;
      return rest;
    });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalRaftsAnalyzed: allRafts.length,
      expiringRafts30d: within30d.length,
      expiringRafts60d: within60d.length,
      expiringRafts90d: within90d.length,
      expiringRafts12m: within12m.length,
      artigosComValidadeAte12Meses: within12MonthsCerts.length,
      artigosVencidos: expired.length,
      quantidadeTotalNecessaria12m,
      jangadasAfetadas,
      totalItemsTracked: cleanNeeds.length,
      itemsInAlert: alertCount,
      totalReorderCost: totalCost,
      coveragePercent,
      cilindrosNecessarios30d,
      cilindrosCheiosDisponiveis30d,
      necessidadesMensaisTotais: Array.from(monthlyTotalsMap.entries())
        .map(([month, quantidade]) => toMonthly(month, quantidade))
        .sort((a, b) => a.month.localeCompare(b.month)),
    },
    needs: cleanNeeds,
    stockNeeds,
    suggestions,
    upcomingRafts30d: within30d.map((r) => ({
      id: r.id,
      serial: r.serial,
      brand: r.brand,
      model: r.model,
      owner: r.owner,
      packType: r.packType,
      dataProxInspecao: r.dataProxInspecao,
      daysUntil: r.inspectionDays,
    })),
  };
}
