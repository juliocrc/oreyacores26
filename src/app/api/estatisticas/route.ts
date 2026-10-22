import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import {
  ACTIVE_SERVICE_STATION_COOKIE,
  resolveActiveServiceStationIdFromCookie,
} from "@/lib/station-selection";
import {
  activeStationIsAlcantarilha,
  SOUTH_REGION_ILHA_VALUES,
} from "@/lib/alcantarilha-scope";

export const maxDuration = 60;

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }
  return undefined;
}

const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const ACORES_NINE_ISLANDS = [
  "Terceira",
  "Graciosa",
  "São Jorge",
  "Pico",
  "Faial",
  "São Miguel",
  "Santa Maria",
  "Flores",
  "Corvo",
] as const;

type AcoresIsland = (typeof ACORES_NINE_ISLANDS)[number];

const ISLAND_KEYWORDS: Array<{ island: AcoresIsland; keywords: string[] }> = [
  { island: "Corvo", keywords: ["corvo", "vila do corvo"] },
  { island: "Flores", keywords: ["flores", "santa cruz das flores", "lajes das flores"] },
  { island: "Faial", keywords: ["faial", "horta"] },
  { island: "Pico", keywords: ["pico", "madalena", "sao roque do pico", "lajes do pico"] },
  { island: "São Jorge", keywords: ["sao jorge", "s. jorge", "velas", "calheta"] },
  { island: "Graciosa", keywords: ["graciosa", "santa cruz da graciosa"] },
  { island: "Terceira", keywords: ["terceira", "angra do heroismo", "praia da vitoria"] },
  { island: "São Miguel", keywords: ["sao miguel", "s. miguel", "ponta delgada", "ribeira grande", "vila franca do campo", "nordeste", "povoacao", "lagoa"] },
  { island: "Santa Maria", keywords: ["santa maria", "vila do porto"] },
];

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function resolveIsland(value: string | null | undefined): AcoresIsland {
  const normalized = normalizeText(value);
  if (!normalized || ["n/a", "nd", "n/d", "na"].includes(normalized)) return "São Miguel";
  for (const entry of ISLAND_KEYWORDS) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) return entry.island;
  }
  return "São Miguel";
}

function parseFlexibleDate(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value || "").trim();
  if (!raw) return null;
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;
  const pt = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (pt) {
    const day = Number(pt[1]);
    const month = Number(pt[2]);
    const year = Number(pt[3]);
    const parsed = new Date(year, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const monthYear = raw.match(/^(\d{1,2})[/-](\d{4})$/);
  if (monthYear) {
    const month = Number(monthYear[1]);
    const year = Number(monthYear[2]);
    const parsed = new Date(year, month, 0);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

type Bucket = { key: string; label: string; year: number; month: number };

function makeBucket(d: Date): Bucket {
  return {
    key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    label: `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
    year: d.getFullYear(),
    month: d.getMonth() + 1,
  };
}

function buildMonthBucketsBetween(start: Date, end: Date): Bucket[] {
  const buckets: Bucket[] = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last && buckets.length < 120) {
    buckets.push(makeBucket(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  if (buckets.length === 0) buckets.push(makeBucket(last));
  return buckets;
}

function parseDayStart(value: string | null): Date | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDayEnd(value: string | null): Date | null {
  const start = parseDayStart(value);
  if (!start) return null;
  return new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
}

function bucketKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function topEntries(map: Map<string, number>, limit?: number) {
  const arr = Array.from(map.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);
  return typeof limit === "number" ? arr.slice(0, limit) : arr;
}

function monthSeries(items: Array<Date | null>, periodStart: Date, periodEnd: Date) {
  const buckets = buildMonthBucketsBetween(periodStart, periodEnd);
  const counts = new Map(buckets.map((b) => [b.key, 0]));
  for (const date of items) {
    if (!date) continue;
    const key = bucketKeyOf(date);
    if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return buckets.map((b) => ({ label: b.label, total: counts.get(b.key) || 0 }));
}

function countByField<T>(items: T[], getter: (item: T) => string | null | undefined, fallback: string) {
  return topEntries(
    items.reduce((map, item) => {
      const key = getter(item) || fallback;
      return map.set(key, (map.get(key) || 0) + 1);
    }, new Map<string, number>()),
  );
}

function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dailyCounts(items: Array<Date | null>) {
  const counts = new Map<string, number>();
  for (const date of items) {
    if (!date) continue;
    const key = dayKeyOf(date);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([date, total]) => ({ date, label: `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(2, 4)}`, total }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function GET(request: Request) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }

    const activeStationId = resolveActiveServiceStationIdFromCookie(
      readCookie(request, ACTIVE_SERVICE_STATION_COOKIE),
      access,
    );
    const isAlcantarilha = await activeStationIsAlcantarilha(activeStationId);
    const activeStation = activeStationId
      ? await prisma.serviceStation.findUnique({
          where: { id: activeStationId },
          select: { id: true, codigo: true, nome: true },
        })
      : null;

    const { searchParams } = new URL(request.url);
    const rangeStart = parseDayStart(searchParams.get("from"));
    const rangeEnd = parseDayEnd(searchParams.get("to"));
    const hasRange = !!(rangeStart || rangeEnd);
    const inRange = (date: Date | null): boolean => {
      if (!hasRange) return true;
      if (!date) return false;
      if (rangeStart && date < rangeStart) return false;
      if (rangeEnd && date > rangeEnd) return false;
      return true;
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const periodEnd = rangeEnd ?? now;
    const periodStart = rangeStart ?? new Date(periodEnd.getFullYear(), periodEnd.getMonth() - 23, 1);
    const movWindowStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth() - 11, 1);
    const movStart = periodStart > movWindowStart ? periodStart : movWindowStart;
    const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in60 = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
    const in90 = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

    let [
      jangadas,
      navios,
      clienteTotal,
      clientesSemContactoCnt,
      coletes,
      epirbs,
      fatos,
      extintores,
      stock,
      inspecoes,
      ordensServico,
      faturas,
      movimentacoes,
      servicos,
      certificadosValidade,
      artigosSubstituidosRaw,
    ] = await Promise.all([
      prisma.jangada.findMany({
        select: {
          id: true,
          serviceStationId: true,
          serial: true,
          brand: true,
          model: true,
          capacity: true,
          packType: true,
          shipId: true,
          dataProxInspecao: true,
          dataInspecao: true,
          dataFabrico: true,
          artigos: { select: { validade: true } },
        },
      }),
      (async () => {
        const base = await prisma.navio.findMany({
          select: {
            id: true,
            serviceStationId: true,
            ilha: true,
            clienteId: true,
            tipoNavio: true,
          },
        });
        const clienteIds = [...new Set(base.map((n) => n.clienteId).filter((v): v is number => v != null))];
        const clienteById = new Map(
          clienteIds.length
            ? (await prisma.cliente.findMany({
                where: { id: { in: clienteIds } },
                select: { id: true, ilha: true, morada: true, localidade: true, codigoPostal: true },
              })).map((c) => [c.id, c] as const)
            : [],
        );
        return base.map((n) => ({
          id: n.id,
          serviceStationId: n.serviceStationId,
          clienteId: n.clienteId,
          ilha: n.ilha,
          tipoNavio: n.tipoNavio,
          cliente: n.clienteId ? clienteById.get(n.clienteId) ?? null : null,
        }));
      })(),
      prisma.cliente.count(),
      prisma.cliente.count({
        where: { OR: [{ email: null }, { email: "" }, { telefone: null, telmovel: null }] },
      }),
      prisma.colete.findMany({ select: { id: true, estado: true, marca: true, modelo: true, dataProxInspecao: true, dataInspecao: true, shipId: true } }),
      prisma.epirb.findMany({ select: { id: true, estado: true, dataProxInspecao: true, shipId: true } }),
      prisma.fatoImersao.findMany({ select: { id: true, estado: true, dataProxInspecao: true, shipId: true } }),
      prisma.extintor.findMany({ select: { id: true, estado: true, dataProxRecarga: true, dataProxTesteHidraulico: true, shipId: true } }),
      prisma.stock.findMany({
        select: {
          id: true,
          serviceStationId: true,
          categoria: true,
          estadoArtigo: true,
          quantidade: true,
          quantidadeMinima: true,
          quantidadeReservada: true,
          precoCompra: true,
          precoVenda: true,
          validade: true,
        },
      }),
      prisma.inspecao.findMany({
        select: { id: true, dataInspecao: true, dataProxInspecao: true, status: true, navioId: true, jangadaId: true, coleteId: true },
      }),
      prisma.ordemServico.findMany({
        select: {
          id: true,
          serviceStationId: true,
          status: true,
          tipo: true,
          prioridade: true,
          dataAbertura: true,
          dataConclusao: true,
          dataPrevista: true,
          valorTotal: true,
          isPesca: true,
          tecnicoId: true,
          tecnico: { select: { nome: true } },
          serviceStation: { select: { codigo: true, nome: true } },
        },
      }),
      prisma.fatura.findMany({
        select: {
          id: true,
          dataEmissao: true,
          valorSubtotal: true,
          valorIva: true,
          valorTotal: true,
          isIsentoIva: true,
          pagamentoStatus: true,
          cancelada: true,
          clienteId: true,
          cliente: { select: { nome: true } },
          ordemServicos: { select: { ordemServicoId: true } },
        },
      }),
      prisma.movimentacaoStock.findMany({
        select: { id: true, stockId: true, tipo: true, quantidade: true, createdAt: true },
      }),
      prisma.serviceStation.findMany({ select: { id: true, codigo: true, nome: true } }),
      prisma.certificadoValidade.findMany({
        select: { validade: true, certificado: { select: { raftSerial: true } } },
      }),
      prisma.artigoJangada.findMany({
        where: { inspecaoId: { not: null } },
        select: {
          inspecaoId: true,
          name: true,
          referencia: true,
          quantidade: true,
          inspecao: { select: { dataInspecao: true } },
        },
      }),
    ]);

    // ── Âmbito por estação ativa ──
    // Alcantarilha trabalha os navios da região Sul (ilha = "Sul") e tudo o
    // que está ligado a esses navios. Sem estação ativa mantém-se a visão global.
    if (activeStationId) {
      const scopedNavios = navios.filter((navio) => {
        if (navio.serviceStationId === activeStationId) return true;
        return isAlcantarilha && SOUTH_REGION_ILHA_VALUES.includes(navio.ilha || "");
      });
      const scopedShipIds = new Set(scopedNavios.map((navio) => navio.id));

      const scopedJangadas = jangadas.filter(
        (jangada) =>
          jangada.serviceStationId === activeStationId ||
          (jangada.shipId != null && scopedShipIds.has(jangada.shipId)),
      );
      const scopedJangadaIds = new Set(scopedJangadas.map((jangada) => jangada.id));
      const scopedJangadaSerials = new Set(
        scopedJangadas.map((jangada) => String(jangada.serial || "").trim()).filter(Boolean),
      );

      navios = scopedNavios;
      jangadas = scopedJangadas;

      coletes = coletes.filter((colete) => colete.shipId != null && scopedShipIds.has(colete.shipId));
      epirbs = epirbs.filter((epirb) => epirb.shipId != null && scopedShipIds.has(epirb.shipId));
      fatos = fatos.filter((fato) => fato.shipId != null && scopedShipIds.has(fato.shipId));
      extintores = extintores.filter(
        (extintor) => extintor.shipId != null && scopedShipIds.has(extintor.shipId),
      );

      const scopedColeteIds = new Set(coletes.map((colete) => colete.id));
      inspecoes = inspecoes.filter(
        (inspecao) =>
          (inspecao.jangadaId != null && scopedJangadaIds.has(inspecao.jangadaId)) ||
          (inspecao.navioId != null && scopedShipIds.has(inspecao.navioId)) ||
          (inspecao.coleteId != null && scopedColeteIds.has(inspecao.coleteId)),
      );
      const scopedInspecaoIds = new Set(inspecoes.map((inspecao) => inspecao.id));

      stock = stock.filter((item) => item.serviceStationId === activeStationId);
      const scopedStockIds = new Set(stock.map((item) => item.id));
      movimentacoes = movimentacoes.filter((movimento) => scopedStockIds.has(movimento.stockId));

      ordensServico = ordensServico.filter(
        (ordem) => ordem.serviceStationId === activeStationId,
      );
      const scopedOrdemIds = new Set(ordensServico.map((ordem) => ordem.id));
      faturas = faturas.filter((fatura) =>
        fatura.ordemServicos.some((link) => scopedOrdemIds.has(link.ordemServicoId)),
      );

      artigosSubstituidosRaw = artigosSubstituidosRaw.filter(
        (artigo) => artigo.inspecaoId != null && scopedInspecaoIds.has(artigo.inspecaoId),
      );
      certificadosValidade = certificadosValidade.filter(
        (item) =>
          item.certificado?.raftSerial != null &&
          scopedJangadaSerials.has(item.certificado.raftSerial),
      );

      servicos = servicos.filter((servico) => servico.id === activeStationId);

      const scopedClienteIds = new Set<number>();
      for (const navio of scopedNavios) {
        if (navio.clienteId != null) scopedClienteIds.add(navio.clienteId);
      }
      const directClients = await prisma.cliente.findMany({
        where: { serviceStationId: activeStationId },
        select: { id: true },
      });
      for (const cliente of directClients) scopedClienteIds.add(cliente.id);
      clienteTotal = scopedClienteIds.size;
      clientesSemContactoCnt = scopedClienteIds.size
        ? await prisma.cliente.count({
            where: {
              id: { in: [...scopedClienteIds] },
              OR: [{ email: null }, { email: "" }, { telefone: null, telmovel: null }],
            },
          })
        : 0;
    }

    // ── Filtro temporal (aplica-se a inspeções, OT, faturação e movimentos) ──
    const inspecoesFiltradas = inspecoes.filter((i) => inRange(parseFlexibleDate(i.dataInspecao)));
    const ordensFiltradas = ordensServico.filter((o) => inRange(o.dataAbertura ? new Date(o.dataAbertura) : null));
    const faturasValidas = faturas.filter(
      (f) => !f.cancelada && inRange(f.dataEmissao ? new Date(f.dataEmissao) : null),
    );
    const movimentacoesFiltradas = movimentacoes.filter(
      (m) => inRange(m.createdAt ? new Date(m.createdAt) : null),
    );

    // ── Jangadas ──────────────────────────────────────────────
    const jangadasPorMarca = topEntries(
      jangadas.reduce((map, j) => map.set(j.brand || "Sem marca", (map.get(j.brand || "Sem marca") || 0) + 1), new Map<string, number>()),
    );
    const jangadasPorModelo = topEntries(
      jangadas.reduce((map, j) => map.set(j.model || "Sem modelo", (map.get(j.model || "Sem modelo") || 0) + 1), new Map<string, number>()),
    );
    const jangadasPorLotacao = Array.from(
      jangadas.reduce((map, j) => map.set(Number(j.capacity || 0), (map.get(Number(j.capacity || 0)) || 0) + 1), new Map<number, number>()),
    )
      .map(([lotacao, total]) => ({ lotacao, total }))
      .sort((a, b) => a.lotacao - b.lotacao);
    const jangadasPorPackType = topEntries(
      jangadas.reduce((map, j) => map.set(j.packType || "Sem pack", (map.get(j.packType || "Sem pack") || 0) + 1), new Map<string, number>()),
    );
    const jangadasPorMarcaModelo = topEntries(
      jangadas.reduce((map, j) => {
        const label = `${j.brand || "Sem marca"} · ${j.model || "Sem modelo"}`;
        return map.set(label, (map.get(label) || 0) + 1);
      }, new Map<string, number>()),
    );

    let conformes = 0;
    let expirarBreve = 0;
    let naoConformes = 0;
    let semArtigos = 0;
    for (const j of jangadas) {
      if (!j.artigos || j.artigos.length === 0) {
        semArtigos++;
        continue;
      }
      let hasExpired = false;
      let hasSoon = false;
      for (const art of j.artigos) {
        const dt = parseFlexibleDate(art.validade);
        if (!dt) continue;
        if (dt < today) hasExpired = true;
        else if (dt <= in90) hasSoon = true;
      }
      if (hasExpired) naoConformes++;
      else if (hasSoon) expirarBreve++;
      else conformes++;
    }

    // Jangadas por ilha (via navio do cliente / navio.ilha)
    const navioById = new Map(navios.map((n) => [n.id, n]));
    const jangadasPorIlhaMap = new Map<AcoresIsland, number>(ACORES_NINE_ISLANDS.map((i) => [i, 0]));
    let jangadasSemNavio = 0;
    for (const j of jangadas) {
      const navio = j.shipId ? navioById.get(j.shipId) : null;
      if (!navio) {
        jangadasSemNavio++;
        continue;
      }
      const addr = [navio.ilha, navio.cliente?.ilha, navio.cliente?.morada, navio.cliente?.localidade, navio.cliente?.codigoPostal]
        .filter(Boolean)
        .join(" ");
      const island = resolveIsland(addr);
      jangadasPorIlhaMap.set(island, (jangadasPorIlhaMap.get(island) || 0) + 1);
    }
    const jangadasPorIlha = ACORES_NINE_ISLANDS.map((ilha) => ({ ilha, total: jangadasPorIlhaMap.get(ilha) || 0 }));

    // Navios por ilha + tipo categoria simples
    const naviosPorIlhaMap = new Map<AcoresIsland, number>(ACORES_NINE_ISLANDS.map((i) => [i, 0]));
    for (const n of navios) {
      const addr = [n.ilha, n.cliente?.ilha, n.cliente?.morada, n.cliente?.localidade].filter(Boolean).join(" ");
      const island = resolveIsland(addr);
      naviosPorIlhaMap.set(island, (naviosPorIlhaMap.get(island) || 0) + 1);
    }
    const naviosPorIlha = ACORES_NINE_ISLANDS.map((ilha) => ({ ilha, total: naviosPorIlhaMap.get(ilha) || 0 }));

    // ── Inspeções ─────────────────────────────────────────────
    const inspecoesPorMes = (() => {
      const buckets = buildMonthBucketsBetween(periodStart, periodEnd);
      const counts = new Map(buckets.map((b) => [b.key, 0]));
      for (const insp of inspecoesFiltradas) {
        const dt = parseFlexibleDate(insp.dataInspecao);
        if (!dt) continue;
        const key = bucketKeyOf(dt);
        if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
      }
      return buckets.map((b) => ({ label: b.label, total: counts.get(b.key) || 0 }));
    })();

    const inspecoesPorAnoMap = new Map<string, number>();
    let inspecoesAnoAtual = 0;
    let inspecoesMesAtual = 0;
    for (const insp of inspecoesFiltradas) {
      const dt = parseFlexibleDate(insp.dataInspecao);
      if (!dt) continue;
      const y = String(dt.getFullYear());
      inspecoesPorAnoMap.set(y, (inspecoesPorAnoMap.get(y) || 0) + 1);
      if (dt.getFullYear() === today.getFullYear()) inspecoesAnoAtual++;
      if (dt.getFullYear() === today.getFullYear() && dt.getMonth() === today.getMonth()) inspecoesMesAtual++;
    }
    const inspecoesPorAno = Array.from(inspecoesPorAnoMap.entries())
      .map(([ano, total]) => ({ ano, total }))
      .sort((a, b) => a.ano.localeCompare(b.ano));

    const inspecoesPorStatus = topEntries(
      inspecoesFiltradas.reduce((map, i) => map.set(i.status || "Sem estado", (map.get(i.status || "Sem estado") || 0) + 1), new Map<string, number>()),
    );

    const inspecoesJangada = inspecoesFiltradas.filter((i) => i.jangadaId != null);
    const inspecoesColete = inspecoesFiltradas.filter((i) => i.coleteId != null && i.jangadaId == null);
    const inspecoesTipo = {
      jangadas: inspecoesJangada.length,
      coletes: inspecoesColete.length,
      outros: inspecoesFiltradas.length - inspecoesJangada.length - inspecoesColete.length,
    };
    const isToday = (date: Date | null) =>
      !!date && date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
    const inspecoesHoje = {
      total: inspecoesFiltradas.filter((i) => isToday(parseFlexibleDate(i.dataInspecao))).length,
      jangadas: inspecoesJangada.filter((i) => isToday(parseFlexibleDate(i.dataInspecao))).length,
      coletes: inspecoesColete.filter((i) => isToday(parseFlexibleDate(i.dataInspecao))).length,
    };

    // Inspeções por dia (dias com mais e menos inspeções)
    const inspecoesPorDia = dailyCounts(inspecoesFiltradas.map((i) => parseFlexibleDate(i.dataInspecao)));
    const inspecoesDiasOrdenados = [...inspecoesPorDia].sort((a, b) => b.total - a.total);
    const inspecoesDiasMais = inspecoesDiasOrdenados.slice(0, 10);
    const inspecoesDiasMenos = [...inspecoesDiasOrdenados].reverse().slice(0, 10);

    // ── Equipamentos inspecionados (jangadas e coletes) ───────
    const jangadaById = new Map(jangadas.map((j) => [j.id, j] as const));
    const coleteById = new Map(coletes.map((c) => [c.id, c] as const));

    const tipoNavioDaJangada = (jangadaId: number | null | undefined) => {
      if (jangadaId == null) return null;
      const j = jangadaById.get(jangadaId);
      if (!j || j.shipId == null) return null;
      return navioById.get(j.shipId)?.tipoNavio ?? null;
    };

    const jangadasInspecionadas = {
      total: inspecoesJangada.length,
      porMes: monthSeries(inspecoesJangada.map((i) => parseFlexibleDate(i.dataInspecao)), periodStart, periodEnd),
      porDia: dailyCounts(inspecoesJangada.map((i) => parseFlexibleDate(i.dataInspecao))),
      porMarca: countByField(inspecoesJangada, (i) => jangadaById.get(i.jangadaId as number)?.brand, "Sem marca"),
      porModelo: countByField(inspecoesJangada, (i) => jangadaById.get(i.jangadaId as number)?.model, "Sem modelo"),
      porTipoNavio: countByField(inspecoesJangada, (i) => tipoNavioDaJangada(i.jangadaId), "Sem navio"),
      porMesDetalhe: buildMonthBucketsBetween(periodStart, periodEnd).map((b) => {
        const items = inspecoesJangada.filter((i) => {
          const dt = parseFlexibleDate(i.dataInspecao);
          return dt ? bucketKeyOf(dt) === b.key : false;
        });
        return {
          key: b.key,
          label: b.label,
          total: items.length,
          porMarca: countByField(items, (i) => jangadaById.get(i.jangadaId as number)?.brand, "Sem marca"),
          porModelo: countByField(items, (i) => jangadaById.get(i.jangadaId as number)?.model, "Sem modelo"),
          porTipoNavio: countByField(items, (i) => tipoNavioDaJangada(i.jangadaId), "Sem navio"),
        };
      }),
    };

    const coletesInspecionados = {
      total: inspecoesColete.length,
      porMes: monthSeries(inspecoesColete.map((i) => parseFlexibleDate(i.dataInspecao)), periodStart, periodEnd),
      porDia: dailyCounts(inspecoesColete.map((i) => parseFlexibleDate(i.dataInspecao))),
      porMarca: countByField(inspecoesColete, (i) => (i.coleteId != null ? coleteById.get(i.coleteId)?.marca : null), "Sem marca"),
      porModelo: countByField(inspecoesColete, (i) => (i.coleteId != null ? coleteById.get(i.coleteId)?.modelo : null), "Sem modelo"),
      porMarcaModelo: (() => {
        const map = new Map<string, number>();
        for (const i of inspecoesColete) {
          const c = i.coleteId != null ? coleteById.get(i.coleteId) : null;
          const label = `${c?.marca || "Sem marca"} · ${c?.modelo || "Sem modelo"}`;
          map.set(label, (map.get(label) || 0) + 1);
        }
        return topEntries(map);
      })(),
    };

    // ── Artigos substituídos ──────────────────────────────────
    const artigosSubstituidosFiltrados = artigosSubstituidosRaw.filter((a) =>
      inRange(parseFlexibleDate(a.inspecao?.dataInspecao)),
    );
    const artigosSubstituidosTotal = artigosSubstituidosFiltrados.reduce(
      (sum, a) => sum + Number(a.quantidade || 0),
      0,
    );
    const artigosSubstituidosPorReferencia = topEntries(
      artigosSubstituidosFiltrados.reduce((map, a) => {
        const label = (a.referencia && a.referencia.trim()) || a.name || "Sem referência";
        return map.set(label, (map.get(label) || 0) + Number(a.quantidade || 0));
      }, new Map<string, number>()),
      15,
    );
    const artigosSubstituidosPorMes = (() => {
      const buckets = buildMonthBucketsBetween(periodStart, periodEnd);
      const totals = new Map(buckets.map((b) => [b.key, 0]));
      for (const a of artigosSubstituidosFiltrados) {
        const dt = parseFlexibleDate(a.inspecao?.dataInspecao);
        if (!dt) continue;
        const key = bucketKeyOf(dt);
        if (totals.has(key)) totals.set(key, (totals.get(key) || 0) + Number(a.quantidade || 0));
      }
      return buckets.map((b) => ({ label: b.label, total: totals.get(b.key) || 0 }));
    })();

    // ── Ordens de serviço ─────────────────────────────────────
    const ordensPorStatus = topEntries(
      ordensFiltradas.reduce((map, o) => map.set(o.status || "sem estado", (map.get(o.status || "sem estado") || 0) + 1), new Map<string, number>()),
    );
    const ordensPorTipo = topEntries(
      ordensFiltradas.reduce((map, o) => map.set(o.tipo || "sem tipo", (map.get(o.tipo || "sem tipo") || 0) + 1), new Map<string, number>()),
    );
    const ordensPorPrioridade = topEntries(
      ordensFiltradas.reduce((map, o) => map.set(o.prioridade || "normal", (map.get(o.prioridade || "normal") || 0) + 1), new Map<string, number>()),
    );

    const ordensPorMes = (() => {
      const buckets = buildMonthBucketsBetween(periodStart, periodEnd);
      const counts = new Map(buckets.map((b) => [b.key, 0]));
      for (const o of ordensFiltradas) {
        const dt = o.dataAbertura ? new Date(o.dataAbertura) : null;
        if (!dt || Number.isNaN(dt.getTime())) continue;
        const key = bucketKeyOf(dt);
        if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
      }
      return buckets.map((b) => ({ label: b.label, total: counts.get(b.key) || 0 }));
    })();

    // Produtividade por técnico
    const tecnicoAgg = new Map<string, { nome: string; total: number; concluidas: number; faturado: number }>();
    for (const o of ordensFiltradas) {
      const nome = o.tecnico?.nome || o.tecnicoId ? (o.tecnico?.nome || `Técnico #${o.tecnicoId}`) : "Sem técnico";
      const entry = tecnicoAgg.get(nome) || { nome, total: 0, concluidas: 0, faturado: 0 };
      entry.total += 1;
      if (String(o.status).toLowerCase().includes("conclu")) entry.concluidas += 1;
      entry.faturado += Number(o.valorTotal || 0);
      tecnicoAgg.set(nome, entry);
    }
    const tecnicos = Array.from(tecnicoAgg.values()).sort((a, b) => b.concluidas - a.total === 0 ? b.total - a.total : b.concluidas - a.concluidas);

    // Ordens por estação de serviço
    const estacaoAgg = new Map<string, { nome: string; total: number; valor: number }>();
    for (const o of ordensFiltradas) {
      const nome = o.serviceStation?.nome || o.serviceStation?.codigo || "Sem estação";
      const entry = estacaoAgg.get(nome) || { nome, total: 0, valor: 0 };
      entry.total += 1;
      entry.valor += Number(o.valorTotal || 0);
      estacaoAgg.set(nome, entry);
    }
    const ordensPorEstacao = Array.from(estacaoAgg.values()).sort((a, b) => b.total - a.total);

    // ── Faturação ─────────────────────────────────────────────
    const faturacaoPorMes = (() => {
      const buckets = buildMonthBucketsBetween(periodStart, periodEnd);
      const totals = new Map(buckets.map((b) => [b.key, 0]));
      for (const f of faturasValidas) {
        const dt = f.dataEmissao ? new Date(f.dataEmissao) : null;
        if (!dt || Number.isNaN(dt.getTime())) continue;
        const key = bucketKeyOf(dt);
        if (totals.has(key)) totals.set(key, (totals.get(key) || 0) + Number(f.valorTotal || 0));
      }
      return buckets.map((b) => ({ label: b.label, total: Number((totals.get(b.key) || 0).toFixed(2)) }));
    })();

    let faturacaoTotal = 0;
    let faturacaoAnoAtual = 0;
    let faturacaoMesAtual = 0;
    let ivaTotal = 0;
    let faturacaoIsenta = 0;
    const pagamentoAgg = new Map<string, { total: number; valor: number }>();
    const clienteFaturacao = new Map<string, { nome: string; total: number; valor: number }>();
    for (const f of faturasValidas) {
      const valor = Number(f.valorTotal || 0);
      faturacaoTotal += valor;
      ivaTotal += Number(f.valorIva || 0);
      if (f.isIsentoIva) faturacaoIsenta += valor;
      const dt = f.dataEmissao ? new Date(f.dataEmissao) : null;
      if (dt && !Number.isNaN(dt.getTime())) {
        if (dt.getFullYear() === today.getFullYear()) faturacaoAnoAtual += valor;
        if (dt.getFullYear() === today.getFullYear() && dt.getMonth() === today.getMonth()) faturacaoMesAtual += valor;
      }
      const status = f.pagamentoStatus || "Pendente";
      const p = pagamentoAgg.get(status) || { total: 0, valor: 0 };
      p.total += 1;
      p.valor += valor;
      pagamentoAgg.set(status, p);

      const cNome = f.cliente?.nome || "Sem cliente";
      const c = clienteFaturacao.get(cNome) || { nome: cNome, total: 0, valor: 0 };
      c.total += 1;
      c.valor += valor;
      clienteFaturacao.set(cNome, c);
    }
    const faturacaoPorPagamento = Array.from(pagamentoAgg.entries())
      .map(([status, v]) => ({ status, total: v.total, valor: Number(v.valor.toFixed(2)) }))
      .sort((a, b) => b.valor - a.valor);
    const topClientesFaturacao = Array.from(clienteFaturacao.values())
      .map((c) => ({ nome: c.nome, total: c.total, valor: Number(c.valor.toFixed(2)) }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);

    const faturacaoPorAnoMap = new Map<string, number>();
    for (const f of faturasValidas) {
      const dt = f.dataEmissao ? new Date(f.dataEmissao) : null;
      if (!dt || Number.isNaN(dt.getTime())) continue;
      const y = String(dt.getFullYear());
      faturacaoPorAnoMap.set(y, (faturacaoPorAnoMap.get(y) || 0) + Number(f.valorTotal || 0));
    }
    const faturacaoPorAno = Array.from(faturacaoPorAnoMap.entries())
      .map(([ano, total]) => ({ ano, total: Number(total.toFixed(2)) }))
      .sort((a, b) => a.ano.localeCompare(b.ano));

    // ── Stock ─────────────────────────────────────────────────
    let valorStockCompra = 0;
    let valorStockVenda = 0;
    let stockEmRutura = 0;
    let stockAbaixoMinimo = 0;
    let stockVencido = 0;
    const stockPorCategoria = new Map<string, { categoria: string; total: number; valorVenda: number }>();
    for (const s of stock) {
      const qtd = Number(s.quantidade || 0);
      valorStockCompra += qtd * Number(s.precoCompra || 0);
      valorStockVenda += qtd * Number(s.precoVenda || 0);
      if (qtd <= 0) stockEmRutura++;
      if (s.quantidadeMinima != null && qtd <= Number(s.quantidadeMinima)) stockAbaixoMinimo++;
      const val = parseFlexibleDate(s.validade);
      if (val && val < today) stockVencido++;
      const cat = s.categoria || "Sem categoria";
      const entry = stockPorCategoria.get(cat) || { categoria: cat, total: 0, valorVenda: 0 };
      entry.total += 1;
      entry.valorVenda += qtd * Number(s.precoVenda || 0);
      stockPorCategoria.set(cat, entry);
    }
    const stockCategorias = Array.from(stockPorCategoria.values())
      .map((c) => ({ ...c, valorVenda: Number(c.valorVenda.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);

    // ── Movimentações de stock ────────────────────────────────
    const movimentosPorMes = (() => {
      const buckets = buildMonthBucketsBetween(movStart, periodEnd);
      const entradas = new Map(buckets.map((b) => [b.key, 0]));
      const saidas = new Map(buckets.map((b) => [b.key, 0]));
      for (const m of movimentacoesFiltradas) {
        const dt = m.createdAt ? new Date(m.createdAt) : null;
        if (!dt || Number.isNaN(dt.getTime())) continue;
        const key = bucketKeyOf(dt);
        if (!entradas.has(key)) continue;
        const q = Math.abs(Number(m.quantidade || 0));
        if (String(m.tipo).toLowerCase().includes("entrada") || String(m.tipo).toLowerCase().includes("compra")) {
          entradas.set(key, (entradas.get(key) || 0) + q);
        } else {
          saidas.set(key, (saidas.get(key) || 0) + q);
        }
      }
      return buckets.map((b) => ({ label: b.label, entradas: entradas.get(b.key) || 0, saidas: saidas.get(b.key) || 0 }));
    })();

    // ── Validades de equipamentos ─────────────────────────────
    const countWithin = (values: Array<string | null>, limit: Date) =>
      values.filter((v) => {
        const dt = parseFlexibleDate(v);
        return !!dt && dt >= today && dt <= limit;
      }).length;

    const coletesProx = coletes.map((c) => c.dataProxInspecao);
    const epirbsProx = epirbs.map((e) => e.dataProxInspecao);
    const fatosProx = fatos.map((f) => f.dataProxInspecao);
    const extintoresRecarga = extintores.map((e) => e.dataProxRecarga);
    const extintoresHidro = extintores.map((e) => e.dataProxTesteHidraulico);

    const validadesEquipamentos = {
      coletes: { total: coletes.length, a30: countWithin(coletesProx, in30), a60: countWithin(coletesProx, in60), a90: countWithin(coletesProx, in90) },
      epirbs: { total: epirbs.length, a30: countWithin(epirbsProx, in30), a60: countWithin(epirbsProx, in60), a90: countWithin(epirbsProx, in90) },
      fatos: { total: fatos.length, a30: countWithin(fatosProx, in30), a60: countWithin(fatosProx, in60), a90: countWithin(fatosProx, in90) },
      extintores: { total: extintores.length, a30: countWithin(extintoresRecarga, in30), a60: countWithin(extintoresRecarga, in60), a90: countWithin(extintoresRecarga, in90) },
      extintoresHidraulico: { total: extintores.length, a30: countWithin(extintoresHidro, in30), a60: countWithin(extintoresHidro, in60), a90: countWithin(extintoresHidro, in90) },
    };

    const certificadosValidades = certificadosValidade.map((c) => c.validade);
    const certificados = {
      total: certificadosValidades.length,
      a30: countWithin(certificadosValidades, in30),
      a60: countWithin(certificadosValidades, in60),
      a90: countWithin(certificadosValidades, in90),
    };

    // Clientes sem contacto
    const clientesSemContacto = clientesSemContactoCnt;

    return NextResponse.json({
      geradoEm: new Date().toISOString(),
      estacao: activeStation,
      periodo: {
        from: rangeStart ? rangeStart.toISOString().slice(0, 10) : null,
        to: rangeEnd ? rangeEnd.toISOString().slice(0, 10) : null,
      },
      geral: {
        jangadas: jangadas.length,
        navios: navios.length,
        clientes: clienteTotal,
        inspecoes: inspecoesFiltradas.length,
        coletes: coletes.length,
        epirbs: epirbs.length,
        fatos: fatos.length,
        extintores: extintores.length,
        stockItens: stock.length,
        ordensServico: ordensFiltradas.length,
        faturaTotal: Number(faturacaoTotal.toFixed(2)),
        servicos: servicos.length,
      },
      jangadas: {
        total: jangadas.length,
        porMarca: jangadasPorMarca,
        porModelo: jangadasPorModelo,
        porMarcaModelo: jangadasPorMarcaModelo,
        porLotacao: jangadasPorLotacao,
        porPackType: jangadasPorPackType,
        porIlha: jangadasPorIlha,
        semNavio: jangadasSemNavio,
        conformidade: { conformes, expirarBreve, naoConformes, semArtigos },
        inspecionadas: jangadasInspecionadas,
      },
      navios: {
        total: navios.length,
        porIlha: naviosPorIlha,
      },
      inspecoes: {
        total: inspecoesFiltradas.length,
        anoAtual: inspecoesAnoAtual,
        mesAtual: inspecoesMesAtual,
        tipo: inspecoesTipo,
        hoje: inspecoesHoje,
        porMes: inspecoesPorMes,
        porAno: inspecoesPorAno,
        porStatus: inspecoesPorStatus,
        porDia: inspecoesPorDia,
        diasMais: inspecoesDiasMais,
        diasMenos: inspecoesDiasMenos,
      },
      ordens: {
        total: ordensFiltradas.length,
        porStatus: ordensPorStatus,
        porTipo: ordensPorTipo,
        porPrioridade: ordensPorPrioridade,
        porMes: ordensPorMes,
        porEstacao: ordensPorEstacao,
        tecnicos,
      },
      faturacao: {
        total: Number(faturacaoTotal.toFixed(2)),
        totalIva: Number(ivaTotal.toFixed(2)),
        isenta: Number(faturacaoIsenta.toFixed(2)),
        anoAtual: Number(faturacaoAnoAtual.toFixed(2)),
        mesAtual: Number(faturacaoMesAtual.toFixed(2)),
        porMes: faturacaoPorMes,
        porAno: faturacaoPorAno,
        porPagamento: faturacaoPorPagamento,
        topClientes: topClientesFaturacao,
      },
      stock: {
        total: stock.length,
        valorCompra: Number(valorStockCompra.toFixed(2)),
        valorVenda: Number(valorStockVenda.toFixed(2)),
        emRutura: stockEmRutura,
        abaixoMinimo: stockAbaixoMinimo,
        vencido: stockVencido,
        porCategoria: stockCategorias,
        movimentos: movimentosPorMes,
      },
      clientes: {
        total: clienteTotal,
        semContacto: clientesSemContacto,
      },
      coletesInspecionados,
      artigos: {
        substituidosTotal: artigosSubstituidosTotal,
        substituidosPorMes: artigosSubstituidosPorMes,
        substituidosPorReferencia: artigosSubstituidosPorReferencia,
      },
      validadesEquipamentos,
      certificados,
    });
  } catch (error) {
    console.error("[GET /api/estatisticas]", error);
    return NextResponse.json({ error: "Erro ao gerar estatísticas" }, { status: 500 });
  }
}
