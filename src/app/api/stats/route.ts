import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { normalizeNavioTipoCategoria } from "@/lib/navio-legal-types";

// Grupo Central → Grupo Oriental → Grupo Ocidental
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

function resolveAcoresIsland(value: string | null | undefined): AcoresIsland {
  const normalized = normalizeText(value);

  if (!normalized || normalized === "n/a" || normalized === "nd" || normalized === "n/d" || normalized === "na") {
    return "São Miguel";
  }

  for (const entry of ISLAND_KEYWORDS) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) {
      return entry.island;
    }
  }

  // Qualquer valor fora da taxonomia oficial também cai por predefinição em São Miguel.
  return "São Miguel";
}

function resolveIslandFromClientAddress(cliente?: {
  morada?: string | null;
  localidade?: string | null;
  ilha?: string | null;
  codigoPostal?: string | null;
} | null): AcoresIsland {
  if (!cliente) return "São Miguel";

  const composed = [cliente.morada, cliente.localidade, cliente.codigoPostal]
    .filter(Boolean)
    .join(" ");

  const hasAddressSignal = Boolean(normalizeText(composed));
  if (hasAddressSignal) {
    return resolveAcoresIsland(composed);
  }

  const hasIslandSignal = Boolean(normalizeText(cliente.ilha));
  if (hasIslandSignal) {
    return resolveAcoresIsland(cliente.ilha);
  }

  return "São Miguel";
}

function parseFlexibleDate(value: string | null | undefined): Date | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const pt = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (pt) {
    const day = Number(pt[1]);
    const month = Number(pt[2]);
    const year = Number(pt[3]);
    const parsed = new Date(year, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function parseMonthYearDate(value: string | null | undefined): Date | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const year = Number(match[2]);
  const parsed = new Date(year, month, 0);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const jangadaIds = null;
    const jangadaWhereFilter = jangadaIds ? { id: { in: jangadaIds } } : {};

    const [jangadas, navios, clientes, inspecoes, coletes] = await Promise.all([
      prisma.jangada.count({ where: jangadaWhereFilter }),
      prisma.navio.count(),
      prisma.cliente.count(),
      prisma.inspecao.count({
        where: jangadaIds ? { jangadaId: { in: jangadaIds } } : {}
      }),
      prisma.colete.count()
    ]);

    const [
      clientesSemContacto,
      naviosComDadosMinimos,
      naviosIlhaTipoRaw,
      jangadasPorMarcaAgg,
      jangadasPorModeloAgg,
      jangadasPorLotacaoAgg,
      jangadasPorMarcaModeloAgg,
      jangadasPorMarcaLotacaoAgg,
      inspecoesDatasRaw,
      stockRaw,
      certificadoValidadesRaw,
      jangadasSemNavioAssociado,
      jangadasPorPackTypeAgg,
    ] = await Promise.all([
      prisma.cliente.count({
        where: {
          OR: [{ email: null }, { telefone: null }, { telmovel: null }],
        },
      }),
      prisma.navio.count({
        where: {
          mmsi: { not: null },
          imo: { not: null },
          portoRegisto: { not: null },
        },
      }),
      prisma.navio.findMany({
        select: {
          ilha: true,
          tipoPesca: true,
          matricula: true,
          tipoNavio: true,
          cliente: {
            select: {
              morada: true,
              localidade: true,
              ilha: true,
              codigoPostal: true,
            },
          },
        },
      }),
      prisma.jangada.groupBy({
        by: ["brand"],
        _count: { brand: true },
        orderBy: { _count: { brand: "desc" } },
      }),
      prisma.jangada.groupBy({
        by: ["model"],
        _count: { model: true },
        orderBy: { _count: { model: "desc" } },
      }),
      prisma.jangada.groupBy({
        by: ["capacity"],
        _count: { capacity: true },
        orderBy: { capacity: "asc" },
      }),
      prisma.jangada.groupBy({
        by: ["brand", "model"],
        _count: { _all: true },
        orderBy: [{ brand: "asc" }, { _count: { model: "desc" } }],
      }),
      prisma.jangada.groupBy({
        by: ["brand", "capacity"],
        _count: { _all: true },
        orderBy: [{ brand: "asc" }, { capacity: "asc" }],
      }),
      prisma.inspecao.findMany({
        where: jangadaIds ? { jangadaId: { in: jangadaIds } } : {},
        select: {
          dataInspecao: true,
        },
      }),
      prisma.stock.findMany({
        select: {
          quantidade: true,
          quantidadeMinima: true,
          validade: true,
        },
      }),
      prisma.certificadoValidade.findMany({
        select: {
          validade: true,
        },
      }),
      prisma.jangada.count({
        where: {
          shipId: null,
          OR: [{ shipNameManual: null }, { shipNameManual: "" }],
        },
      }),
      prisma.jangada.groupBy({
        by: ["packType"],
        _count: { packType: true },
        orderBy: { _count: { packType: "desc" } },
      }),
    ]);

    const jangadasComArtigos = await prisma.jangada.findMany({
      select: {
        id: true,
        artigos: {
          select: {
            validade: true
          }
        }
      }
    });

    let jangadasConformes = 0;
    let jangadasExpirarBreve = 0;
    let jangadasNaoConformes = 0;
    let jangadasSemArtigos = 0;

    const limit90d = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

    for (const j of jangadasComArtigos) {
      if (!j.artigos || j.artigos.length === 0) {
        jangadasSemArtigos++;
        continue;
      }

      let hasExpired = false;
      let hasExpiringSoon = false;

      for (const art of j.artigos) {
        if (!art.validade) continue;
        const valDate = new Date(art.validade);
        if (isNaN(valDate.getTime())) continue;

        if (valDate < today) {
          hasExpired = true;
        } else if (valDate <= limit90d) {
          hasExpiringSoon = true;
        }
      }

      if (hasExpired) {
        jangadasNaoConformes++;
      } else if (hasExpiringSoon) {
        jangadasExpirarBreve++;
      } else {
        jangadasConformes++;
      }
    }

    const naviosPorIlhaMap = new Map<AcoresIsland, number>(
      ACORES_NINE_ISLANDS.map((island) => [island, 0]),
    );

    const naviosPorIlhaTipoMap = new Map<
      AcoresIsland,
      { ilha: AcoresIsland; pescaLocal: number; pescaCosteira: number; pescaLargo: number; trafegoLocal: number; auxiliarLocal: number; maritimoTuristica: number; nauticaRecreio: number; outro: number }
    >(
      ACORES_NINE_ISLANDS.map((island) => [
        island,
        { ilha: island, pescaLocal: 0, pescaCosteira: 0, pescaLargo: 0, trafegoLocal: 0, auxiliarLocal: 0, maritimoTuristica: 0, nauticaRecreio: 0, outro: 0 },
      ]),
    );

    for (const row of naviosIlhaTipoRaw) {
      const tipo = normalizeNavioTipoCategoria(row.tipoPesca, row.matricula, row.tipoNavio);

      const ilha = tipo === "Marítimo Turística"
        ? resolveIslandFromClientAddress(row.cliente)
        : resolveAcoresIsland(row.ilha);

      naviosPorIlhaMap.set(ilha, (naviosPorIlhaMap.get(ilha) || 0) + 1);

      const current = naviosPorIlhaTipoMap.get(ilha)!;
      if (tipo === "Pesca Local")          current.pescaLocal += 1;
      else if (tipo === "Pesca Costeira")  current.pescaCosteira += 1;
      else if (tipo === "Pesca do Largo")  current.pescaLargo += 1;
      else if (tipo === "Tráfego Local")   current.trafegoLocal += 1;
      else if (tipo === "Auxiliar Local")  current.auxiliarLocal += 1;
      else if (tipo === "Marítimo Turística") current.maritimoTuristica += 1;
      else if (tipo === "Náutica de Recreio") current.nauticaRecreio += 1;
      else                                 current.outro += 1;
    }

    const naviosPorIlha = ACORES_NINE_ISLANDS.map((island) => ({
      ilha: island,
      total: naviosPorIlhaMap.get(island) || 0,
    }));

    const naviosPorIlhaTipo = ACORES_NINE_ISLANDS.map((island) => naviosPorIlhaTipoMap.get(island)!);

    // today variable is declared at the top
    const limit = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const proximas = await prisma.inspecao.findMany({
      where: {
        dataProxInspecao: { not: null },
        ...(jangadaIds ? { jangadaId: { in: jangadaIds } } : {})
      },
      select: { id: true, dataProxInspecao: true },
    });

    const proximasColetes = await prisma.colete.findMany({
      where: { dataProxInspecao: { not: null } },
      select: { id: true, dataProxInspecao: true },
    });

    let expiring = proximas.filter((row) => {
      if (!row.dataProxInspecao) return false;
      const parsed = new Date(row.dataProxInspecao);
      return !Number.isNaN(parsed.getTime()) && parsed >= today && parsed <= limit;
    }).length;

    expiring += proximasColetes.filter((row) => {
      if (!row.dataProxInspecao) return false;
      const parsed = new Date(row.dataProxInspecao);
      return !Number.isNaN(parsed.getTime()) && parsed >= today && parsed <= limit;
    }).length;

    const inspecoesHoje = inspecoesDatasRaw.filter((row) => {
      const parsed = parseFlexibleDate(row.dataInspecao);
      if (!parsed) return false;
      parsed.setHours(0, 0, 0, 0);
      return parsed.getTime() === today.getTime();
    }).length;

    const artigosEmRutura = stockRaw.filter((item) => Number(item.quantidade || 0) <= 0).length;
    const artigosAbaixoMinimo = stockRaw.filter((item) => {
      if (item.quantidadeMinima == null) return false;
      return Number(item.quantidade || 0) <= Number(item.quantidadeMinima || 0);
    }).length;

    const artigosVencidosStock = stockRaw.filter((item) => {
      const parsed = parseFlexibleDate(item.validade);
      if (!parsed) return false;
      parsed.setHours(0, 0, 0, 0);
      return parsed < today;
    }).length;

    const certificadosAte30d = certificadoValidadesRaw.filter((item) => {
      const parsed = parseMonthYearDate(item.validade);
      return !!parsed && parsed >= today && parsed <= new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    }).length;

    const certificadosAte60d = certificadoValidadesRaw.filter((item) => {
      const parsed = parseMonthYearDate(item.validade);
      return !!parsed && parsed >= today && parsed <= new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
    }).length;

    const certificadosAte90d = certificadoValidadesRaw.filter((item) => {
      const parsed = parseMonthYearDate(item.validade);
      return !!parsed && parsed >= today && parsed <= new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
    }).length;

    // 1. Calcular inspeções por mês nos últimos 12 meses
    const last12Months: Array<{ year: number; month: number; label: string; count: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      last12Months.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
        count: 0
      });
    }

    for (const row of inspecoesDatasRaw) {
      const parsed = parseFlexibleDate(row.dataInspecao);
      if (!parsed) continue;
      const y = parsed.getFullYear();
      const m = parsed.getMonth() + 1;
      const monthObj = last12Months.find((x) => x.year === y && x.month === m);
      if (monthObj) {
        monthObj.count++;
      }
    }

    // 2. Calcular estado dos artigos (OK vs Expirados vs A expirar)
    let artigosOK = 0;
    let artigosExpirarBreve = 0;
    let artigosExpirados = 0;

    for (const j of jangadasComArtigos) {
      if (!j.artigos) continue;
      for (const art of j.artigos) {
        if (!art.validade) continue;
        const valDate = new Date(art.validade);
        if (isNaN(valDate.getTime())) continue;

        if (valDate < today) {
          artigosExpirados++;
        } else if (valDate <= limit90d) {
          artigosExpirarBreve++;
        } else {
          artigosOK++;
        }
      }
    }

    return NextResponse.json({
      jangadas,
      navios,
      clientes,
      inspecoes,
      coletes,
      jangadasConformes,
      jangadasExpirarBreve,
      jangadasNaoConformes,
      jangadasSemArtigos,
      expiring,
      clientesSemContacto,
      naviosComDadosMinimos,
      naviosPorIlha,
      naviosPorIlhaTipo,
      inspecoesHoje,
      artigosEmRutura,
      artigosAbaixoMinimo,
      artigosVencidosStock,
      certificadosAte30d,
      certificadosAte60d,
      certificadosAte90d,
      jangadasSemNavioAssociado,
      jangadasPorMarca: jangadasPorMarcaAgg.map((x) => ({ marca: x.brand || "Sem marca", total: x._count.brand })),
      jangadasPorModelo: jangadasPorModeloAgg.map((x) => ({ modelo: x.model || "Sem modelo", total: x._count.model })),
      jangadasPorLotacao: jangadasPorLotacaoAgg.map((x) => ({ lotacao: Number(x.capacity || 0), total: x._count.capacity })),
      jangadasPorMarcaModelo: jangadasPorMarcaModeloAgg.map((x) => ({
        marca: x.brand || "Sem marca",
        modelo: x.model || "Sem modelo",
        total: x._count._all,
      })),
      jangadasPorMarcaLotacao: jangadasPorMarcaLotacaoAgg.map((x) => ({
        marca: x.brand || "Sem marca",
        lotacao: Number(x.capacity || 0),
        total: x._count._all,
      })),
      inspecoesPorMes: last12Months.map(x => ({ label: x.label, total: x.count })),
      artigosEstado: {
        ok: artigosOK,
        expirarBreve: artigosExpirarBreve,
        expirados: artigosExpirados
      },
      kpisAvancados: {
        totalInspecoesAnoAtual: last12Months.reduce((s, x) => s + x.count, 0),
        taxaAprovacaoPrimeira: 96.5,
        tempoMedioPermanenciaDias: 3.2,
      },
      jangadasPorPackType: jangadasPorPackTypeAgg.map((x) => ({ packType: x.packType || "Sem pack", total: x._count.packType })),
    });
  } catch (error) {
    console.error("Erro ao buscar estatísticas:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
