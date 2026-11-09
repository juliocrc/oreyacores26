import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { parseJulinhoIntent, type JulinhoQueryTopic } from "./julinho-intents";
import { askJulinhoLlm } from "./julinho-llm";

export type JulinhoStationWhere = {
  serviceStationId?: number | { in: number[] };
};

export type JulinhoAction = {
  type: "navigate";
  href: string;
  label: string;
};

export type JulinhoAnswer = {
  reply: string;
  action?: JulinhoAction;
  context?: { kind: "jangada" | "stock-item"; term: string };
};

export type JulinhoScope = {
  where: JulinhoStationWhere;
  stationName?: string | null;
  pathname?: string | null;
};

const CLOSED_ORDER_STATUSES = ["concluida", "cancelada", "faturada", "fechada"];
const MAX_ROWS = 5000;

function parseLooseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const pt = /^(\d{2})[/-](\d{2})[/-](\d{4})/.exec(text);
  if (pt) return new Date(Date.UTC(Number(pt[3]), Number(pt[2]) - 1, Number(pt[1])));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatJulinhoDate(value: string | Date | null | undefined): string {
  const date = parseLooseDate(value);
  if (!date) return "sem data";
  return [
    String(date.getUTCDate()).padStart(2, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    date.getUTCFullYear(),
  ].join("/");
}

function todayUtc(): number {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysFromToday(value: string | Date | null | undefined): number | null {
  const date = parseLooseDate(value);
  if (!date) return null;
  return Math.round((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - todayUtc()) / 86_400_000);
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 20) return "Boa tarde";
  return "Boa noite";
}

function joinList(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

function euro(value: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(value || 0);
}

function qt(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function stationPrefix(scope: JulinhoScope): string {
  return scope.stationName ? `${scope.stationName}: ` : "";
}

function invoiceScope(scope: JulinhoScope): Prisma.FaturaWhereInput {
  const station = scope.where.serviceStationId;
  const base: Prisma.FaturaWhereInput = { cancelada: false, pagamentoStatus: "Vencido" };
  if (station === undefined) return base;
  return { ...base, cliente: typeof station === "number" ? { serviceStationId: station } : { serviceStationId: station } };
}

function searchVariants(term: string): string[] {
  return Array.from(new Set([term, term.toUpperCase(), term.toLowerCase()]));
}

export type JulinhoSummaryCounts = {
  rafts: number;
  ships: number;
  clients: number;
  dueSoon: number;
  overdue: number;
  openOrders: number;
  lowStock: number;
  overdueInvoices: number;
};

export function describeSummary(scope: JulinhoScope, counts: JulinhoSummaryCounts): string {
  const parts = [
    qt(counts.rafts, "jangada", "jangadas"),
    qt(counts.ships, "navio", "navios"),
    qt(counts.clients, "cliente", "clientes"),
  ];
  const due = counts.overdue > 0
    ? `${qt(counts.dueSoon, "jangada", "jangadas")} com inspeção nos próximos 30 dias, ${counts.overdue} já ${counts.overdue === 1 ? "está vencida" : "estão vencidas"}`
    : `${qt(counts.dueSoon, "jangada", "jangadas")} com inspeção nos próximos 30 dias`;
  return `${greeting()}. ${stationPrefix(scope)}há ${joinList(parts)}. ${due}. ` +
    `${qt(counts.openOrders, "ordem de serviço aberta", "ordens de serviço abertas")}, ` +
    `${qt(counts.lowStock, "artigo abaixo do mínimo", "artigos abaixo do mínimo")} e ` +
    `${qt(counts.overdueInvoices, "fatura vencida", "faturas vencidas")}.`;
}

async function summaryAnswer(scope: JulinhoScope): Promise<JulinhoAnswer> {
  const [raftRows, ships, clients, openOrders, stockRows, overdueInvoices] = await Promise.all([
    prisma.jangada.findMany({
      where: scope.where,
      select: { dataProxInspecao: true },
      take: MAX_ROWS,
    }),
    prisma.navio.count({ where: scope.where }),
    prisma.cliente.count({ where: scope.where }),
    prisma.ordemServico.count({ where: { ...scope.where, status: { notIn: CLOSED_ORDER_STATUSES } } }),
    prisma.stock.findMany({
      where: scope.where,
      select: { quantidade: true, quantidadeMinima: true },
      take: MAX_ROWS,
    }),
    prisma.fatura.count({ where: invoiceScope(scope) }),
  ]);

  let dueSoon = 0;
  let overdue = 0;
  for (const row of raftRows) {
    const days = daysFromToday(row.dataProxInspecao);
    if (days === null) continue;
    if (days < 0) overdue += 1;
    if (days <= 30) dueSoon += 1;
  }

  const lowStock = stockRows.filter((row) => {
    const minimum = row.quantidadeMinima ?? 0;
    return minimum > 0 ? row.quantidade <= minimum : row.quantidade <= 0;
  }).length;

  return {
    reply: describeSummary(scope, {
      rafts: raftRows.length,
      ships,
      clients,
      dueSoon,
      overdue,
      openOrders,
      lowStock,
      overdueInvoices,
    }),
    action: { type: "navigate", href: "/", label: "Painel" },
  };
}

async function inspectionsAnswer(scope: JulinhoScope): Promise<JulinhoAnswer> {
  const rows = await prisma.jangada.findMany({
    where: scope.where,
    select: { id: true, serial: true, owner: true, dataProxInspecao: true },
    take: MAX_ROWS + 1,
  });

  if (rows.length > MAX_ROWS) return { reply: "Há demasiadas jangadas para calcular as próximas inspeções com segurança. Consulte a lista de jangadas.", action: { type: "navigate", href: "/jangadas", label: "Jangadas" } };
  const due = rows
    .map((row) => ({ ...row, days: daysFromToday(row.dataProxInspecao) }))
    .filter((row): row is typeof row & { days: number } => row.days !== null && row.days <= 30)
    .sort((a, b) => a.days - b.days);

  if (due.length === 0) {
    return { reply: "Não há jangadas com inspeção marcada nos próximos 30 dias.", action: { type: "navigate", href: "/jangadas", label: "Jangadas" } };
  }

  const overdue = due.filter((row) => row.days < 0).length;
  const highlights = due.slice(0, 5).map((row) =>
    `${row.serial}${row.owner ? ` (${row.owner})` : ""}, ${formatJulinhoDate(row.dataProxInspecao)}`);
  const extra = due.length > highlights.length ? ` e mais ${due.length - highlights.length}` : "";
  const overdueText = overdue > 0 ? ` ${overdue} já ${overdue === 1 ? "está vencida" : "estão vencidas"}.` : "";

  return {
    reply: `Há ${qt(due.length, "jangada", "jangadas")} com inspeção até 30 dias.${overdueText} ` +
      `Mais urgentes: ${joinList(highlights)}${extra}.`,
    action: { type: "navigate", href: "/jangadas?exp30=1", label: "Jangadas a expirar" },
  };
}

async function inspectionsWeekAnswer(scope: JulinhoScope, periodType = "week"): Promise<JulinhoAnswer> {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Azores", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => Number(parts.find(item => item.type === type)?.value);
  const today = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  const currentMonday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * 86400000);
  const monday = periodType === "today" ? today : periodType === "tomorrow" ? new Date(today.getTime() + 86400000) : periodType === "next-week" ? new Date(currentMonday.getTime() + 7 * 86400000) : currentMonday;
  const sunday = new Date(monday.getTime() + (periodType === "today" || periodType === "tomorrow" ? 0 : 6) * 86400000);
  const rows = await prisma.jangada.findMany({ where: scope.where, select: { serial: true, owner: true, dataProxInspecao: true }, take: MAX_ROWS + 1 });
  if (rows.length > MAX_ROWS) return { reply: "Há demasiadas jangadas para calcular esta semana com segurança. Consulte os filtros da lista de jangadas." };
  const matches = rows.map(row => ({ ...row, date: parseLooseDate(row.dataProxInspecao) }))
    .filter((row): row is typeof row & { date: Date } => !!row.date && (periodType === "overdue" ? row.date < today : row.date >= monday && row.date < new Date(sunday.getTime() + 86400000)))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const period = periodType === "overdue" ? `antes de ${formatJulinhoDate(today)} (horário dos Açores)` : monday.getTime() === sunday.getTime() ? `${formatJulinhoDate(monday)} (horário dos Açores)` : `${formatJulinhoDate(monday)} a ${formatJulinhoDate(sunday)} (horário dos Açores)`;
  const label = periodType === "overdue" ? "datas vencidas" : periodType === "today" ? "hoje" : periodType === "tomorrow" ? "amanhã" : periodType === "next-week" ? "a próxima semana" : "esta semana";
  if (!matches.length) return { reply: `Não encontrei jangadas com próxima inspeção registada para ${label}, ${period}.` };
  const list = matches.slice(0, 5).map(row => `${row.serial}, ${formatJulinhoDate(row.date)}`);
  return { reply: `Para ${label}, ${period}, há ${qt(matches.length, "jangada com próxima inspeção registada", "jangadas com próxima inspeção registada")}: ${joinList(list)}${matches.length > list.length ? ` e mais ${matches.length - list.length}` : ""}.` };
}

async function waitingRaftsAnswer(scope: JulinhoScope): Promise<JulinhoAnswer> {
  const rows = await prisma.serviceStationQueue.findMany({
    where: scope.where,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: { jangadaId: true, status: true, jangada: { select: { serial: true } } },
    take: MAX_ROWS + 1,
  });
  if (rows.length > MAX_ROWS) return { reply: "Há demasiados registos na fila para responder com segurança. Consulte a estação de serviço." };
  const latest = new Map<number, typeof rows[number]>();
  for (const row of rows) if (!latest.has(row.jangadaId)) latest.set(row.jangadaId, row);
  const waiting = [...latest.values()].filter(row => ["aguardar", "aguardando"].includes(row.status.trim().toLowerCase()));
  if (!waiting.length) return { reply: "Não encontrei jangadas com estado 'aguardar' na fila da estação selecionada." };
  const list = waiting.slice(0, 5).map(row => row.jangada.serial);
  return { reply: `Na fila da estação selecionada, ${qt(waiting.length, "jangada tem", "jangadas têm")} estado 'aguardar': ${joinList(list)}${waiting.length > list.length ? ` e mais ${waiting.length - list.length}` : ""}. Confirme a receção e o estado na estação de serviço.` };
}

async function certificateAnswer(scope: JulinhoScope, number: string): Promise<JulinhoAnswer> {
  const variants = [...new Set([number, number.toUpperCase(), number.toLowerCase()])];
  const inspections = await prisma.inspecao.findMany({
    where: { certificadoNumero: { in: variants } }, select: { jangadaId: true }, take: 20,
  });
  const ids = inspections.map(item => item.jangadaId).filter((id): id is number => id != null);
  const rows = await prisma.jangada.findMany({
    where: { ...scope.where, OR: [
      { ultimoCertificadoNumero: { in: variants } },
      { certificadoExternoNumero: { in: variants } },
      { certificadoNumeroOriginal: { in: variants } },
      { certificadosExtraidos: { some: { certificadoNumero: { in: variants } } } },
      ...(ids.length ? [{ id: { in: ids } }] : []),
    ] },
    select: { serial: true, owner: true, shipNameManual: true }, take: 6,
  });
  if (!rows.length) return { reply: `Não encontrei o certificado ${number} associado a uma jangada acessível. Confirme o número e consulte a ficha ou a equipa.` };
  if (rows.length > 1) return { reply: `O certificado ${number} aparece associado a várias jangadas (${rows.slice(0, 5).map(row => row.serial).join(", ")}). Confirme a ficha antes de identificar o proprietário.` };
  const raft = rows[0];
  return { reply: `O certificado ${number} está associado à jangada ${raft.serial}. ${raft.owner ? `O armador atualmente registado na ficha é ${raft.owner}.` : "A ficha não indica um armador."} A titularidade na data do certificado deve ser confirmada no documento.` };
}

async function stockLowAnswer(scope: JulinhoScope): Promise<JulinhoAnswer> {
  const rows = await prisma.stock.findMany({
    where: scope.where,
    select: { referencia: true, descricao: true, quantidade: true, quantidadeMinima: true },
    take: MAX_ROWS + 1,
  });

  if (rows.length > MAX_ROWS) return { reply: "Há demasiados registos para calcular o stock em falta com segurança. Consulte a lista de stock.", action: { type: "navigate", href: "/stock", label: "Stock" } };
  const low = rows
    .filter((row) => {
      const minimum = row.quantidadeMinima ?? 0;
      return minimum > 0 ? row.quantidade <= minimum : row.quantidade <= 0;
    })
    .sort((a, b) => {
      const aRatio = a.quantidade / Math.max(1, a.quantidadeMinima ?? 1);
      const bRatio = b.quantidade / Math.max(1, b.quantidadeMinima ?? 1);
      return aRatio - bRatio;
    });

  if (low.length === 0) {
    return { reply: "Não há artigos de stock abaixo do mínimo.", action: { type: "navigate", href: "/stock", label: "Stock" } };
  }

  const highlights = low.slice(0, 5).map((row) =>
    `${row.referencia}${row.descricao ? ` (${row.descricao})` : ""}: ${row.quantidade} de ${row.quantidadeMinima ?? 0}`);
  const extra = low.length > highlights.length ? ` e mais ${low.length - highlights.length}` : "";

  return {
    reply: `${qt(low.length, "artigo está", "artigos estão")} no ou abaixo do mínimo. ${joinList(highlights)}${extra}.`,
    action: { type: "navigate", href: "/stock", label: "Stock" },
  };
}

async function workOrdersAnswer(scope: JulinhoScope): Promise<JulinhoAnswer> {
  const where: Prisma.OrdemServicoWhereInput = { ...scope.where, status: { notIn: CLOSED_ORDER_STATUSES } };
  const [count, rows] = await Promise.all([
    prisma.ordemServico.count({ where }),
    prisma.ordemServico.findMany({
      where,
      select: { numeroOrdem: true, status: true, cliente: { select: { nome: true } } },
      orderBy: { dataAbertura: "desc" },
      take: 5,
    }),
  ]);

  if (count === 0) {
    return { reply: "Não há ordens de serviço abertas.", action: { type: "navigate", href: "/ordens-servico", label: "Ordens de Serviço" } };
  }

  const highlights = rows.map((row) =>
    `${row.numeroOrdem}${row.cliente?.nome ? ` (${row.cliente.nome})` : ""}`);
  return {
    reply: `Há ${qt(count, "ordem de serviço aberta", "ordens de serviço abertas")}. Mais recentes: ${joinList(highlights)}.`,
    action: { type: "navigate", href: "/ordens-servico", label: "Ordens de Serviço" },
  };
}

async function invoicesAnswer(scope: JulinhoScope): Promise<JulinhoAnswer> {
  const where = invoiceScope(scope);
  const aggregate = await prisma.fatura.aggregate({
    where,
    _count: { _all: true },
    _sum: { valorTotal: true },
  });

  const count = aggregate._count._all;
  if (count === 0) {
    return { reply: "Não há faturas vencidas.", action: { type: "navigate", href: "/cobrancas", label: "Cobranças" } };
  }

  return {
    reply: `Há ${qt(count, "fatura vencida", "faturas vencidas")}, no valor total de ${euro(aggregate._sum.valorTotal ?? 0)}.`,
    action: { type: "navigate", href: "/cobrancas", label: "Cobranças" },
  };
}

async function countAnswer(scope: JulinhoScope, term?: string): Promise<JulinhoAnswer> {
  const entity = String(term ?? "").toLowerCase();
  if (entity === "jangada") {
    const count = await prisma.jangada.count({ where: scope.where });
    return { reply: `Há ${qt(count, "jangada", "jangadas")} na estação.`, action: { type: "navigate", href: "/jangadas", label: "Jangadas" } };
  }
  if (entity === "navio") {
    const count = await prisma.navio.count({ where: scope.where });
    return { reply: `Há ${qt(count, "navio registado", "navios registados")}.`, action: { type: "navigate", href: "/navios", label: "Navios" } };
  }
  if (entity === "cliente") {
    const count = await prisma.cliente.count({ where: scope.where });
    return { reply: `Há ${qt(count, "cliente registado", "clientes registados")}.`, action: { type: "navigate", href: "/clientes", label: "Clientes" } };
  }
  if (entity === "stock") {
    const count = await prisma.stock.count({ where: scope.where });
    return { reply: `Há ${qt(count, "referência em stock", "referências em stock")}.`, action: { type: "navigate", href: "/stock", label: "Stock" } };
  }
  return { reply: "Não sei quantos. Diz, por exemplo: quantas jangadas." };
}

async function jangadaAnswer(scope: JulinhoScope, term: string): Promise<JulinhoAnswer> {
  const numeric = /^\d+$/.test(term) ? Number(term) : null;
  const variants = searchVariants(term);
  const rows = await prisma.jangada.findMany({
    where: {
      ...scope.where,
      OR: [
        ...(numeric !== null ? [{ id: numeric }, { serial: term }] : []),
        ...variants.flatMap((value) => [
          { serial: { contains: value } },
          { owner: { contains: value } },
          { shipNameManual: { contains: value } },
        ]),
      ],
    },
    select: {
      id: true,
      serial: true,
      brand: true,
      model: true,
      owner: true,
      shipId: true,
      shipNameManual: true,
      dataInspecao: true,
      dataProxInspecao: true,
      ultimoCertificadoNumero: true,
      capacity: true,
      packType: true,
    },
    take: 6,
  });

  if (rows.length === 0) {
    return { reply: `Não encontrei nenhuma jangada para "${term}".` };
  }

  if (rows.length > 1) {
    const list = joinList(rows.slice(0, 5).map((row) => row.serial));
    return {
      reply: `Encontrei ${rows.length === 6 ? "pelo menos 6" : rows.length} jangadas: ${list}. Diz o número de série completo.`,
      action: { type: "navigate", href: `/jangadas?pesquisa=${encodeURIComponent(term)}`, label: "Jangadas" },
    };
  }

  const raft = rows[0];
  let shipName = raft.shipNameManual;
  if (!shipName && raft.shipId) {
    const ship = await prisma.navio.findFirst({ where: { ...scope.where, id: raft.shipId }, select: { nome: true } });
    shipName = ship?.nome ?? null;
  }

  const details = [
    `Jangada ${raft.serial}`,
    [raft.brand, raft.model].filter(Boolean).join(" "),
    raft.owner ? `proprietário ${raft.owner}` : null,
    shipName ? `navio ${shipName}` : null,
    raft.capacity != null ? `lotação ${raft.capacity} pessoas` : null,
    raft.packType ? `pack ${raft.packType}` : null,
    raft.ultimoCertificadoNumero ? `último certificado registado ${raft.ultimoCertificadoNumero}` : null,
    `última inspeção ${formatJulinhoDate(raft.dataInspecao)}`,
    `próxima ${formatJulinhoDate(raft.dataProxInspecao)}`,
  ].filter(Boolean).join(", ");

  return {
    reply: `${details}.`,
    context: { kind: "jangada", term },
    action: { type: "navigate", href: `/jangadas/${raft.id}`, label: `Jangada ${raft.serial}` },
  };
}

async function navioAnswer(scope: JulinhoScope, term: string): Promise<JulinhoAnswer> {
  const variants = searchVariants(term);
  const rows = await prisma.navio.findMany({
    where: {
      ...scope.where,
      OR: variants.flatMap((value) => [
          { nome: { contains: value } },
          { matricula: { contains: value } },
          { mmsi: { contains: value } },
          { imo: { contains: value } },
          { callSignal: { contains: value } },
      ]),
    },
    select: {
      id: true,
      nome: true,
      matricula: true,
      mmsi: true,
      imo: true,
      callSignal: true,
      bandeira: true,
      portoRegisto: true,
      tipoNavio: true,
    },
    take: 6,
  });

  if (rows.length === 0) return { reply: `Não encontrei nenhum navio para "${term}".` };

  if (rows.length > 1) {
    return {
      reply: `Encontrei ${rows.length} navios: ${joinList(rows.slice(0, 5).map((row) => `${row.nome} (${row.matricula})`))}. Sê mais específico.`,
      action: { type: "navigate", href: `/navios?nome=${encodeURIComponent(term)}`, label: "Navios" },
    };
  }

  const ship = rows[0];
  return {
    reply: [
      `Navio ${ship.nome}`,
      ship.matricula ? `matrícula ${ship.matricula}` : null,
      ship.imo ? `IMO ${ship.imo}` : null,
      ship.mmsi ? `MMSI ${ship.mmsi}` : null,
      ship.callSignal ? `indicativo ${ship.callSignal}` : null,
      ship.bandeira ? `bandeira ${ship.bandeira}` : null,
      ship.portoRegisto ? `porto de registo ${ship.portoRegisto}` : null,
      ship.tipoNavio ? `tipo ${ship.tipoNavio}` : null,
    ].filter(Boolean).join(', ') + '. Dados da ficha registada; não são posição em tempo real.',
    action: { type: "navigate", href: `/navios/${ship.id}`, label: ship.nome },
  };
}

async function clienteAnswer(scope: JulinhoScope, term: string): Promise<JulinhoAnswer> {
  const variants = searchVariants(term);
  const rows = await prisma.cliente.findMany({
    where: {
      ...scope.where,
      OR: variants.flatMap((value) => [
        { nome: { contains: value } },
        { nif: { contains: value } },
        { numeroCliente: { contains: value } },
      ]),
    },
    select: {
      id: true,
      nome: true,
      nif: true,
      numeroCliente: true,
      _count: { select: { navios: true, faturas: true } },
    },
    take: 6,
  });

  if (rows.length === 0) return { reply: `Não encontrei nenhum cliente para "${term}".` };

  if (rows.length > 1) {
    return {
      reply: `Encontrei ${rows.length} clientes: ${joinList(rows.slice(0, 5).map((row) => row.nome))}. Sê mais específico.`,
      action: { type: "navigate", href: "/clientes", label: "Clientes" },
    };
  }

  const client = rows[0];
  return {
    reply: `Cliente ${client.nome}${client.numeroCliente ? `, número ${client.numeroCliente}` : ""}` +
      `${client.nif ? `, NIF ${client.nif}` : ""}. ${qt(client._count.navios, "navio", "navios")} e ` +
      `${qt(client._count.faturas, "fatura", "faturas")}.`,
    action: { type: "navigate", href: `/clientes/${client.id}`, label: client.nome },
  };
}

async function stockItemAnswer(scope: JulinhoScope, term: string): Promise<JulinhoAnswer> {
  const variants = searchVariants(term);
  const rows = await prisma.stock.findMany({
    where: {
      ...scope.where,
      OR: variants.flatMap((value) => [
        { referencia: { contains: value } },
        { descricao: { contains: value } },
        { codigoBarras: { contains: value } },
        { codigoFabricante: { contains: value } },
      ]),
    },
    select: {
      id: true,
      referencia: true,
      descricao: true,
      quantidade: true,
      quantidadeMinima: true,
      validade: true,
      localizacao: true,
    },
    take: 6,
  });

  if (rows.length === 0) return { reply: `Não encontrei nenhum artigo para "${term}".` };

  if (rows.length > 1) {
    return {
      reply: `Encontrei ${rows.length === 6 ? "pelo menos 6" : rows.length} registos de stock: ${joinList(rows.slice(0, 5).map((row) => row.referencia))}. Podem existir vários lotes; consulta o stock para escolher o registo correto.`,
      action: { type: "navigate", href: "/stock", label: "Stock" },
    };
  }

  const item = rows[0];
  const minimum = item.quantidadeMinima ?? 0;
  const state = item.quantidade <= 0 ? "sem stock disponível" : minimum > 0 && item.quantidade <= minimum ? "no ou abaixo do mínimo" : "disponível";
  return {
    reply: `Artigo ${item.referencia} (${item.descricao}): ${qt(item.quantidade, "unidade", "unidades")}, ${state}. ` +
      `Validade ${formatJulinhoDate(item.validade)}${item.localizacao ? `, localização ${item.localizacao}` : ""}.`,
    context: { kind: "stock-item", term },
    action: { type: "navigate", href: `/stock/${item.id}`, label: item.referencia },
  };
}

function helpAnswer(): JulinhoAnswer {
  return {
    reply: "Podes pedir: resumo da estação, próximas inspeções, stock em falta, ordens abertas, faturas em atraso, " +
      "ou abrir jangadas, navios, clientes, stock, agenda e faturação. Também podes dizer o número de uma jangada.",
  };
}

const TOPIC_HANDLERS: Partial<Record<JulinhoQueryTopic, (scope: JulinhoScope, term: string) => Promise<JulinhoAnswer>>> = {
  jangada: jangadaAnswer,
  navio: navioAnswer,
  cliente: clienteAnswer,
  "stock-item": stockItemAnswer,
};

export async function answerJulinho(input: string, scope: JulinhoScope): Promise<JulinhoAnswer> {
  const intent = parseJulinhoIntent(input);

  switch (intent.kind) {
    case "greeting":
      return {
        reply: `${greeting()}! Sou a Julia, a assistente da Orey Tecnica- Serviços Navais, Lda. Podes pedir "resumo da estação" ou "ajuda".`,
      };
    case "thanks":
      return { reply: "Sempre às ordens." };
    case "identity":
      return { reply: "Sou a Julia, a assistente de voz da Orey Tecnica- Serviços Navais, Lda. Consulto dados da estação e ajudo a navegar na aplicação." };
    case "help":
      return helpAnswer();
    case "navigate":
      return { reply: `A abrir ${intent.label}.`, action: { type: "navigate", href: intent.href, label: intent.label } };
    case "query": {
      if (intent.topic === "summary") return summaryAnswer(scope);
      if (intent.topic === "inspections") return inspectionsAnswer(scope);
      if (intent.topic === "inspections-week") return inspectionsWeekAnswer(scope);
      if (intent.topic === "inspections-period" && ["next-week", "today", "tomorrow", "overdue"].includes(intent.term || "")) return inspectionsWeekAnswer(scope, intent.term);
      if (intent.topic === "station-waiting") return waitingRaftsAnswer(scope);
      if (intent.topic === "certificate" && intent.term) return certificateAnswer(scope, intent.term);
      if (intent.topic === "stock-low") return stockLowAnswer(scope);
      if (intent.topic === "work-orders") return workOrdersAnswer(scope);
      if (intent.topic === "invoices") return invoicesAnswer(scope);
      if (intent.topic === "count") return countAnswer(scope, intent.term);

      const handler = TOPIC_HANDLERS[intent.topic];
      if (handler && intent.term) return handler(scope, intent.term);
      return helpAnswer();
    }
    default:
      break;
  }

  const unknown = String(input ?? "").trim();
  if (/\b(?:recebid[oa]s?|rececao|recebidas)\b/i.test(unknown)) return { reply: "Pretende saber quais as jangadas recebidas na estação? Indique também o período, por exemplo, hoje ou esta semana." };
  if (/\b(?:vence|vencem|vencimento)\b/i.test(unknown) && /\b(?:essa|esta) semana\b/i.test(unknown)) return { reply: "O que pretende verificar: inspeções de jangadas, certificados ou outro tipo de validade?" };
  if (unknown) {
    const llmReply = await askJulinhoLlm(unknown, {
      stationName: scope.stationName,
      pathname: scope.pathname,
    });
    if (llmReply) return { reply: llmReply };
  }

  return {
    reply: "Ainda não percebi esse pedido. Diz \"ajuda\" para ver o que consigo fazer.",
  };
}
