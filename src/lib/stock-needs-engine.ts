import prisma from "@/lib/prisma";
import { certificateItemHasManagedValidity, normalizeCertificateItemName } from "@/lib/certificate-validity";
import { stockItemSupportsValidity } from "@/lib/stock-validity";
import { resolveMandatoryPackItemsForRaftAsync } from "@/lib/custom-pack-types";
import { type MandatoryPackItem } from "@/modules/rafts/mandatoryPack";

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
  unidade: string;
  vencido: boolean;
  validade: string | null;
  lote: string | null;
  localizacao: string | null;
};

export type NeedRow = {
  referencia: string;
  nome: string;
  categoria: string;
  seccao: string;
  fornecedor: string;
  unidade: string;
  stockAtual: number;
  stockVencido: number;
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
  leadTimeDias: number;
  avgPrice: number;
  /** Verdadeiro quando nenhum registo de stock tem preco de compra: o custo e desconhecido. */
  semPrecoCompra: boolean;
  consumoHistorico90d: number;
  consumoMedioMensal: number;
  consumoMedioDiario: number;
  coberturaDias: number | null;
  dataPrevistaRutura: string | null;
  fatorSazonal: number;
  demandaSazonal90d: number;
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
  /** Artigos rastreados sem qualquer preco de compra: custo desconhecido. */
  itensSemPrecoCompra: number;
  coveragePercent: number;
  cilindrosNecessarios30d: number;
  cilindrosCheiosDisponiveis30d: number;
  /**
   * Soma simples por mês. ATENÇÃO: mistura unidades diferentes (o `Stock.unit`
   * pode ser "un", "kg", "L", "m"). Serve apenas para comparação relativa entre
   * meses do mesmo conjunto — nunca para encomenda. Para valores de encomenda
   * use `necessidadesMensaisTotaisPorUnidade`.
   */
  necessidadesMensaisTotais: MonthlyNeed[];
  /** Totais mensais agrupados por unidade — valores comparáveis e encomendáveis. */
  necessidadesMensaisTotaisPorUnidade: Array<{
    month: string;
    totais: Array<{ unidade: string; quantidade: number }>;
  }>;
  unidadesPresentes: string[];
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
    leadTimeDias: number;
    supplier: string;
    avgPrice: number;
    /** Verdadeiro quando nenhum registo de stock tem preco de compra: o custo e desconhecido. */
    semPrecoCompra: boolean;
    raftCount: number;
    raftSerials: string[];
    stockMatched: StockMatched[];
    consumoHistorico90d: number;
    consumoMedioDiario: number;
    coberturaDias: number | null;
    dataPrevistaRutura: string | null;
    fatorSazonal: number;
    demandaSazonal90d: number;
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
  quantidadeReservada?: number | null;
  quantidadeMinima?: number | null;
  leadTimeDias?: number | null;
  categoria?: string | null;
  testeHidraulico?: string | null;
  estadoCargaCilindro?: string | null;
  precoVenda?: number | null;
  precoCompra?: number | null;
  estadoArtigo?: string | null;
  lote?: string | null;
  validade?: string | null;
  localizacao?: string | null;
  unit?: string | null;
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

const DEFAULT_LEAD_TIME_DAYS = 15;
const SAFETY_RATIO = 0.15;
const SAFETY_Z = 1.65; // nível de serviço ~95%
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

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
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

  // YYYY-MM: ultimo dia do mes (mesmo criterio de toStorageValidade).
  const yyyymm = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (yyyymm) {
    const year = parseInt(yyyymm[1], 10);
    const month = parseInt(yyyymm[2], 10);
    if (month >= 1 && month <= 12) return new Date(year, month, 0);
  }

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

/**
 * Unidade de venda do artigo. Normaliza para uma escala comum para que
 * "UN", "un", "Un" e null caiam todos em "un" — caso contrário os totais
 * mensais ficam repartidos por grafias equivalentes.
 */
const UNIDADES_CANONICAS: Record<string, string> = {
  un: "un",
  unid: "un",
  unidade: "un",
  unidades: "un",
  pc: "un",
  peca: "un",
  kg: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogramas: "kg",
  g: "g",
  gr: "g",
  l: "L",
  lt: "L",
  litro: "L",
  litros: "L",
  m: "m",
  metro: "m",
  metros: "m",
  mm: "mm",
  cm: "cm",
  cx: "cx",
  caixa: "cx",
  caixas: "cx",
  roll: "roll",
  rolo: "roll",
  pack: "pack",
  packs: "pack",
};

function normalizeUnidade(value: string | null | undefined): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "un";
  return UNIDADES_CANONICAS[raw] || raw;
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

function resolveLeadTimeDays(matched: StockRecord[]): number {
  const times = matched
    .map((s) => Number(s.leadTimeDias) || 0)
    .filter((d) => d > 0);
  return times.length ? Math.max(...times) : DEFAULT_LEAD_TIME_DAYS;
}

function monthlyStdDev(values: number[]): number {
  const numeric = values.filter((v) => Number.isFinite(v) && v >= 0);
  if (numeric.length < 2) return 0;
  const mean = numeric.reduce((a, b) => a + b, 0) / numeric.length;
  const variance =
    numeric.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numeric.length;
  return Math.sqrt(variance);
}

function computeSafetyStock(avgMonthlyDemand: number, monthlyConsumption: number[], leadDays: number): number {
  const leadMonths = Math.max(1, (leadDays || DEFAULT_LEAD_TIME_DAYS) / 30);
  const stdDev = monthlyStdDev(monthlyConsumption);
  // Stock de segurança = z × σ × √(lead time em meses), quando há histórico de consumo
  if (stdDev > 0 && avgMonthlyDemand > 0) {
    return Math.ceil(SAFETY_Z * stdDev * Math.sqrt(leadMonths));
  }
  // Sem histórico, usa razão simples sobre a procura média mensal projetada
  return Math.ceil(avgMonthlyDemand * leadMonths * SAFETY_RATIO);
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
    // O motor de necessidades resolve a procura dos packs contra o inventário
    // completo: restringir a associavelJangada=true exclui consumíveis que são
    // repostos nas jangadas (rações 30202084, kits de reparação, água, pilhas...),
    // deixando as necessidades sem stock correspondente (stock:0 matched:empty).
    // O scope "jangadas-ocean" continua a aplicar-se ao catálogo visível (fetchItens).
    void stockScope;
    return (await prisma.stock.findMany({
      select: {
        id: true,
        descricao: true,
        referencia: true,
        quantidade: true,
        quantidadeReservada: true,
        categoria: true,
        testeHidraulico: true,
        estadoCargaCilindro: true,
        quantidadeMinima: true,
        leadTimeDias: true,
            precoVenda: true,
            precoCompra: true,
        estadoArtigo: true,
        lote: true,
        validade: true,
        localizacao: true,
        unit: true,
      },
    })) as StockRecord[];
  } catch {
    return [];
  }
}

type ValidadeJangadaRef = { id: number; serial: string; brand: string | null; model: string | null; owner: string | null };

type LinhaValidade = {
  id: number;
  item: string;
  validade: string;
  certificadoId: number | null;
  jangadas: ValidadeJangadaRef[];
  origem: "certificado" | "artigoJangada";
  /** Unidades fisicas nesta linha. Um ArtigoJangada pode valer 150 unidades. */
  quantidade: number;
};

/**
 * Converte uma data gravada pelo Prisma em "YYYY-MM-DD".
 *
 * Usa os componentes UTC de proposito: os valores foram gravados a partir de
 * datas locais e aparecem ora como 00:00Z ora como 01:00Z, conforme a hora de
 * verao. Ler o mesmo instante em hora local (Acores UTC-1) devolveria o dia
 * anterior, fazendo o artigo parecer expirado ate um mes antes do prazo.
 */
function toIsoDateFromDb(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
  }
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : raw;
}

async function fetchCertificadosValidades(): Promise<LinhaValidade[]> {
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
      jangadas: v.certificado?.jangadasAtivas || [],
      origem: "certificado" as const,
      // CertificadoValidade nao tem campo de quantidade: cada linha e um item.
      quantidade: 1,
    }));
  } catch {
    return [];
  }
}

/**
 * Validades reais do equipamento a bordo de cada jangada.
 *
 * A tabela CertificadoValidade so e escrita pelos seeds, portanto o relatorio
 * de vencimentos a 12 meses ficaria permanentemente vazio. Os ArtigoJangada
 * guardam exatamente o pacote de emergencia do certificado (fachos, paraquedas,
 * pilhas, primeiros socorros) com as datas reais, e sao a fonte de verdade.
 */
async function fetchArtigosJangadaValidade(): Promise<LinhaValidade[]> {
  try {
    const jangadas = await prisma.jangada.findMany({
      select: {
        id: true,
        serial: true,
        brand: true,
        model: true,
        owner: true,
        artigos: {
          where: { validade: { not: null } },
          select: { id: true, name: true, validade: true, quantidade: true },
        },
      },
    });

    const linhas: LinhaValidade[] = [];
    for (const j of jangadas) {
      const ref: ValidadeJangadaRef = {
        id: j.id,
        serial: j.serial,
        brand: j.brand,
        model: j.model,
        owner: j.owner,
      };
      for (const a of j.artigos) {
        const validade = toIsoDateFromDb(a.validade);
        if (!validade || !a.name) continue;
        linhas.push({
          id: a.id,
          item: a.name,
          validade,
          certificadoId: null,
          jangadas: [ref],
          origem: "artigoJangada",
          quantidade: Number(a.quantidade) || 0,
        });
      }
    }
    return linhas;
  } catch {
    return [];
  }
}

type ConsumoItem = { total: number; meses: number[] };
type ConsumoHistorico = Map<string, ConsumoItem>;

async function fetchConsumoHistorico90d(): Promise<ConsumoHistorico> {
  const map = new Map<string, Map<string, number>>();
  try {
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const movimentos = await prisma.movimentacaoStock.findMany({
      where: { createdAt: { gte: since }, tipo: "saida" },
      select: {
        quantidade: true,
        createdAt: true,
        stock: { select: { referencia: true } },
      },
    });
    for (const m of movimentos) {
      const ref = normalizeRef(m.stock?.referencia);
      if (!ref) continue;
      const qty = Math.abs(Number(m.quantidade) || 0);
      const mk = monthKey(m.createdAt);
      const byMonth = map.get(ref) || new Map<string, number>();
      byMonth.set(mk, (byMonth.get(mk) || 0) + qty);
      map.set(ref, byMonth);
    }
  } catch {
    // ignore
  }
  const result = new Map<string, ConsumoItem>();
  for (const [ref, byMonth] of map) {
    const meses = Array.from(byMonth.values());
    result.set(ref, {
      total: meses.reduce((a, b) => a + b, 0),
      meses: meses.sort((a, b) => b - a),
    });
  }
  return result;
}

type ConsumoSazonal = {
  /** Quantidade consumida por mês do calendário (índice 0 = janeiro). */
  porMesCalendario: number[];
  /** Meses do calendário com pelo menos um movimento. */
  mesesComDados: number;
  /** Consumo médio por dia no período analisado. */
  mediaDiaria: number;
  total: number;
};

/**
 * Consumo histórico alargado (por omissão 24 meses) para detetar sazonalidade.
 * Distinto do consumo de 90 dias usado no ajuste histórico imediato.
 */
async function fetchConsumoSeasonal(days = 730): Promise<Map<string, ConsumoSazonal>> {
  const map = new Map<string, ConsumoSazonal>();
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const movimentos = await prisma.movimentacaoStock.findMany({
      where: { createdAt: { gte: since }, tipo: "saida" },
      select: { quantidade: true, createdAt: true, stock: { select: { referencia: true } } },
    });
    const refs = new Set<string>();
    for (const m of movimentos) {
      const ref = normalizeRef(m.stock?.referencia);
      if (!ref) continue;
      const qty = Math.abs(Number(m.quantidade) || 0);
      if (!qty) continue;
      const entry = map.get(ref) || { porMesCalendario: new Array(12).fill(0), mesesComDados: 0, mediaDiaria: 0, total: 0 };
      const mesCal = m.createdAt.getMonth();
      const chave = `${m.createdAt.getFullYear()}-${mesCal}`;
      if (!refs.has(`${ref}|${chave}`)) {
        refs.add(`${ref}|${chave}`);
        entry.mesesComDados += 1;
      }
      entry.porMesCalendario[mesCal] += qty;
      entry.total += qty;
      map.set(ref, entry);
    }
    for (const entry of map.values()) {
      entry.mediaDiaria = entry.total / Math.max(1, days);
    }
  } catch {
    // ignore
  }
  return map;
}

/** Índice sazonal (por mês do calendário) normalizado à média, limitado a [0.5, 2.5]. */
function buildSeasonalFactors(entry: ConsumoSazonal | undefined): number[] {
  const neutro = new Array(12).fill(1);
  if (!entry || entry.total <= 0 || entry.mesesComDados < 6) return neutro;
  const mediaMensal = entry.total / 12;
  if (mediaMensal <= 0) return neutro;
  return entry.porMesCalendario.map((v) => {
    const fator = v / mediaMensal;
    return Math.min(2.5, Math.max(0.5, Math.round(fator * 100) / 100));
  });
}

/** Fator sazonal médio para os próximos `months` meses do calendário. */
function seasonalFactorForWindow(factors: number[], start: Date, months = 3): number {
  let soma = 0;
  for (let i = 0; i < months; i += 1) {
    soma += factors[(start.getMonth() + i) % 12];
  }
  return Math.round((soma / months) * 100) / 100;
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
  const inicioDoDia = now;
  const in12Months = addMonths(now, 12);

  const [stockRaw, allRafts, validadesCertificado, validadesArtigo, consumoMap, consumoSeasonalMap] = await Promise.all([
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
    fetchArtigosJangadaValidade(),
    fetchConsumoHistorico90d(),
    fetchConsumoSeasonal(),
  ]);

  // Duas fontes de vencimento: as linhas do certificado (quando existem) e o
  // equipamento real a bordo das jangadas. A segunda fonte e sempre a mais
  // completa, porque e alimentada pelo wizard de inspecao.
  //
  // Se o mesmo item, na mesma jangada, com a mesma validade existir nas duas
  // fontes, somam-se as unidades em vez de contar a linha duas vezes, e nunca se
  // descarta quantidade: um artigo pode valer 150 unidades.
  const certificatesByKey = new Map<string, LinhaValidade>();
  for (const linha of [...validadesCertificado, ...validadesArtigo]) {
    const chave = [
      normalizeCertificateItemName(linha.item),
      parseValidadeString(linha.validade)?.toISOString() ?? linha.validade,
      linha.jangadas.map((j) => j.id).sort((a, b) => a - b).join("-"),
    ].join("|");
    const existente = certificatesByKey.get(chave);
    if (existente) {
      existente.quantidade += linha.quantidade;
      const vistas = new Set(existente.jangadas.map((j) => j.id));
      for (const j of linha.jangadas) if (!vistas.has(j.id)) existente.jangadas.push(j);
    } else {
      certificatesByKey.set(chave, { ...linha, jangadas: [...linha.jangadas] });
    }
  }
  const certificadosWithValidades = [...certificatesByKey.values()];

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
      const resolved = await resolveMandatoryPackItemsForRaftAsync({
        brand: raft.brand,
        model: raft.model,
        packType: raft.packType,
        capacity: raft.capacity,
      });
      items = resolved.items || [];
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
      const itemHasValidity = stockItemSupportsValidity({
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

    // Lotes expirados não são consumíveis: contam para o relatório de validade
    // mas ficam fora do stock disponível, para não subestimar a reposição.
    const isVencido = (s: StockRecord) => {
      if (!s.validade) return false;
      const d = parseValidadeString(String(s.validade));
      return d ? d.getTime() < inicioDoDia.getTime() : false;
    };
    const livre = (s: StockRecord) => Math.max(0, (Number(s.quantidade) || 0) - (Number(s.quantidadeReservada) || 0));

    const stockVencido = matched.filter(isVencido).reduce((acc, s) => acc + livre(s), 0);
    const stockAvailable = matched
      .filter((s) => !isVencido(s))
      .reduce((acc, s) => acc + livre(s), 0);

    const unidade = normalizeUnidade(matched[0]?.unit);
    const minQty = Math.max(...matched.map((s) => Number(s.quantidadeMinima) || 0), 0);
    // Base de custo: preco de compra. O precoVenda e o preco ao cliente e nao
    // serve para estimar o custo de reposicao.
    // So os registos com preco entram na media: caso contrario os artigos sem
    // preco puxavam a media para baixo e o custo real aparecia understated.
    const registosComPreco = matched.filter((s) => Number(s.precoCompra) > 0);
    const avgPrice = registosComPreco.length
      ? registosComPreco.reduce((acc, s) => acc + Number(s.precoCompra), 0) / registosComPreco.length
      : 0;
    const semPrecoCompra = registosComPreco.length === 0;

    const demand30d = demand.byWindow["30d"] || 0;
    const demand60d = demand.byWindow["60d"] || 0;
    const demand90d = demand.byWindow["90d"] || 0;
    const demand12m = demand.byWindow["12m"] || 0;

    const refKey = normalizeRef(matched[0]?.referencia || demand.reference);
    const consumo = consumoMap.get(refKey);
    const consumoHistorico90d = consumo?.total || 0;
    const consumoMeses = consumo?.meses || [];
    const consumoMedioMensal = consumoHistorico90d / 3;
    const demandaAjustada90d = Math.ceil(
      demand90d * (1 - HIST_BLEND) + Math.max(consumoHistorico90d, demand90d * 0.25) * HIST_BLEND
    );

    // Sazonalidade: índice por mês do calendário calculado a partir do consumo
    // alargado; aplica-se à procura ajustada dos próximos 90 dias.
    const sazonal = consumoSeasonalMap.get(refKey);
    const consumoMedioDiario = sazonal?.mediaDiaria || 0;
    const coberturaDias = consumoMedioDiario > 0 ? Math.floor(stockAvailable / consumoMedioDiario) : null;
    const dataPrevistaRutura =
      coberturaDias != null ? addDays(now, coberturaDias).toISOString().slice(0, 10) : null;
    const seasonalFactors = buildSeasonalFactors(sazonal);
    const fatorSazonal = seasonalFactorForWindow(seasonalFactors, now, 3);
    const demandaSazonal90d = Math.ceil(demandaAjustada90d * fatorSazonal);

    const planningDemand = Math.max(demandaSazonal90d, minQty > 0 && stockAvailable <= minQty ? minQty : 0);
    const isLow = stockAvailable < planningDemand || (minQty > 0 && stockAvailable <= minQty);
    const leadTimeDias = resolveLeadTimeDays(matched);
    const safetyBuffer = computeSafetyStock(planningDemand / 3, consumoMeses, leadTimeDias);
    const reorderQty = isLow ? Math.max(0, planningDemand - stockAvailable + safetyBuffer) : 0;

    let orderLimitDate = "";
    if (reorderQty > 0) {
      if (earliest90?.dataProxInspecao) {
        const inspDate = parseDate(earliest90.dataProxInspecao)!;
        inspDate.setDate(inspDate.getDate() - leadTimeDias);
        orderLimitDate = inspDate.toISOString().slice(0, 10);
      } else {
        const limit = new Date(now);
        limit.setDate(limit.getDate() + leadTimeDias);
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
      unidade,
      stockAtual: stockAvailable,
      stockVencido,
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
      leadTimeDias,
      avgPrice,
      semPrecoCompra,
      consumoHistorico90d,
      consumoMedioMensal: Math.round(consumoMedioMensal * 10) / 10,
      consumoMedioDiario: Math.round(consumoMedioDiario * 100) / 100,
      coberturaDias,
      dataPrevistaRutura,
      fatorSazonal,
      demandaSazonal90d,
      demandaAjustada90d,
      mensal,
      jangadasCount: demand.raftSerials.size,
      jangadasAfetadas: Array.from(demand.raftSerials).sort(),
      stockMatched: matched.map((s) => ({
        id: s.id,
        ref: s.referencia,
        desc: s.descricao,
        qty: livre(s),
        unidade: normalizeUnidade(s.unit),
        vencido: isVencido(s),
        validade: s.validade ?? null,
        lote: s.lote ?? null,
        localizacao: s.localizacao ?? null,
      })),
      stockId: matched[0]?.id ?? null,
      hasValidity: Boolean(demand.hasValidity),
      // internal for stockNeeds mapping
      ...({ _matchedBy: matchedBy } as any),
    };
  });

  needs.sort((a, b) => {
    if (a.suficiente !== b.suficiente) return a.suficiente ? 1 : -1;
    if (b.reorderQty !== a.reorderQty) return b.reorderQty - a.reorderQty;
    return b.necessidade90d - a.necessidade90d;
  });

  // Previsões e necessidades são calculadas apenas para artigos com validade gerida
  const validityNeeds = needs.filter((n) => n.hasValidity);

  // Per-stock-id rows for catalogue / home
  const stockNeedsMap = new Map<number, StockNeedById>();
  for (const need of validityNeeds as Array<NeedRow & { _matchedBy?: "referencia" | "nome" | null }>) {
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

  // Contagem em unidades fisicas, nao em linhas. Uma linha de ArtigoJangada
  // pode valer 150 unidades (rations, Agua), por isso contar linhas
  // subestimava as necessidades por um factor de varios.
  const unidades = (linhas: LinhaValidade[]) =>
    linhas.reduce((total, l) => total + (l.quantidade > 0 ? l.quantidade : 0), 0);
  const unidadesAte12Meses = unidades(within12MonthsCerts);
  const unidadesVencidas = unidades(expired);

  const monthlyTotalsMap = new Map<string, number>();
  // Meses × unidades: é o único agregado com significado físico, porque
  // "un", "kg" e "L" não se somam entre si.
  const monthlyByUnitMap = new Map<string, Map<string, number>>();
  const unidadesPresentes = new Set<string>();

  for (const need of validityNeeds) {
    for (const m of need.mensal) {
      monthlyTotalsMap.set(m.month, (monthlyTotalsMap.get(m.month) || 0) + m.quantidade);

      const unidade = normalizeUnidade(need.unidade);
      unidadesPresentes.add(unidade);
      if (!monthlyByUnitMap.has(m.month)) monthlyByUnitMap.set(m.month, new Map<string, number>());
      const byUnit = monthlyByUnitMap.get(m.month)!;
      byUnit.set(unidade, (byUnit.get(unidade) || 0) + m.quantidade);
    }
  }

  const needsMensaisTotaisPorUnidade = Array.from(monthlyByUnitMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, byUnit]) => ({
      month,
      totais: Array.from(byUnit.entries())
        .map(([unidade, quantidade]) => ({ unidade, quantidade }))
        .sort((a, b) => b.quantidade - a.quantidade),
    }));
  const cilindrosNecessarios30d = within30d.length;
  const cilindrosCheiosDisponiveis30d = stockItems
    .filter((s) => isCylinderLike(s))
    .filter((s) => String(s.estadoCargaCilindro || "").trim().toUpperCase() === "CHEIO")
    .filter((s) => isHydraulicTestValidForWindow(s.testeHidraulico, 30, now))
    .reduce((acc, s) => acc + Number(s.quantidade || 0), 0);

  const totalCost = validityNeeds.reduce((acc, n) => acc + n.reorderQty * n.avgPrice, 0);
  const alertCount = validityNeeds.filter((n) => !n.suficiente).length;
  const quantidadeTotalNecessaria12m = validityNeeds.reduce((acc, n) => acc + n.necessidade12m, 0);
  const jangadasAfetadas = new Set(validityNeeds.flatMap((n) => n.jangadasAfetadas)).size;
  const coveragePercent = validityNeeds.length
    ? Math.round(((validityNeeds.length - alertCount) / validityNeeds.length) * 100)
    : 100;

  const suggestions = validityNeeds.map((n) => ({
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
    leadTimeDias: n.leadTimeDias,
    supplier: n.fornecedor,
      avgPrice: n.avgPrice,
      semPrecoCompra: n.semPrecoCompra,
    raftCount: n.jangadasCount,
    raftSerials: n.jangadasAfetadas,
    stockMatched: n.stockMatched,
    consumoHistorico90d: n.consumoHistorico90d,
    consumoMedioDiario: n.consumoMedioDiario,
    coberturaDias: n.coberturaDias,
    dataPrevistaRutura: n.dataPrevistaRutura,
    fatorSazonal: n.fatorSazonal,
    demandaSazonal90d: n.demandaSazonal90d,
    demandaAjustada90d: n.demandaAjustada90d,
  }));

  // strip internal fields
  const cleanNeeds: NeedRow[] = validityNeeds.map((n) => {
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
      artigosComValidadeAte12Meses: unidadesAte12Meses,
      artigosVencidos: unidadesVencidas,
      quantidadeTotalNecessaria12m,
      jangadasAfetadas,
      totalItemsTracked: cleanNeeds.length,
      itemsInAlert: alertCount,
      totalReorderCost: totalCost,
      itensSemPrecoCompra: validityNeeds.filter((n) => n.semPrecoCompra).length,
      coveragePercent,
      cilindrosNecessarios30d,
      cilindrosCheiosDisponiveis30d,
      necessidadesMensaisTotais: Array.from(monthlyTotalsMap.entries())
        .map(([month, quantidade]) => toMonthly(month, quantidade))
        .sort((a, b) => a.month.localeCompare(b.month)),
      necessidadesMensaisTotaisPorUnidade: needsMensaisTotaisPorUnidade,
      unidadesPresentes: Array.from(unidadesPresentes).sort(),
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
