import prisma from "@/lib/prisma";
import { parseFlexibleDate } from "@/lib/agenda-sync";
import { stockItemSupportsValidity } from "@/lib/stock-validity";

export type OrdemServicoStatus = "pendente" | "agendada" | "confirmada" | "em_progresso" | "pausada" | "concluida" | "cancelada";
export type OrdemServicoTipo = "inspecao" | "manutencao" | "reparacao" | "fato_imersao" | "colete" | "outro";
export type OrdemServicoPrioridade = "baixa" | "normal" | "alta" | "critica";
export type QueueWorkflowStatus = "aguardar" | "agendada" | "progresso" | "a_secar" | "finalizada";
export type OrdemWorkflowStatus =
  | "entrada_estacao"
  | "triagem"
  | "inspecao_em_curso"
  | "aguarda_pecas"
  | "aguarda_decisao"
  | "orcamento_em_preparacao"
  | "em_execucao"
  | "a_secar"
  | "pronta_para_fecho"
  | "concluida"
  | "cancelada";

export type OrdemServicoMeta = {
  workflowStatus?: OrdemWorkflowStatus;
  workflowTransitions?: Array<{
    id?: string;
    at?: string;
    from?: OrdemWorkflowStatus | null;
    to?: OrdemWorkflowStatus;
    origin?: string;
    message?: string;
    user?: string;
  }>;
  timeEntries?: Array<{
    id?: string;
    tecnico?: string;
    startedAt?: string;
    endedAt?: string | null;
    durationMinutes?: number;
    notes?: string;
  }>;
  materials?: Array<{
    id?: string;
    stockId?: number;
    referencia?: string;
    descricao?: string;
    quantidadePrevista?: number;
    quantidadeUsada?: number;
    precoUnitario?: number;
    disponibilidade?: number;
    reservado?: boolean;
    consumido?: boolean;
  }>;
  checklistItems?: Array<{
    id?: string;
    phase?: "pre" | "intervencao" | "validacao" | string;
    label?: string;
    done?: boolean;
    updatedAt?: string;
    updatedBy?: string;
  }>;
  logs?: Array<{
    id?: string;
    at?: string;
    type?: string;
    message?: string;
    user?: string;
  }>;
  grupoNumeroOrdem?: string;
  origem?: string;
  queueId?: number;
  shipId?: number;
  shipName?: string;
  linhas?: Array<{
    referencia?: string;
    descricao?: string;
    quantidade?: number;
    unitPrice?: number;
    total?: number;
    source?: string;
  }>;
  totais?: Record<string, number>;
  observacao?: string;
  /** Tipo de equipamento alvo da OS (além da jangada primária) */
  equipamentoTipo?: "jangada" | "colete" | "fato_imersao" | "outro";
  equipamentoId?: number;
  equipamentoSerial?: string;
  equipamentoLabel?: string;
  /** Checklist / leak test snapshot para fatos de imersão */
  fatoImersaoChecklist?: Record<string, string>;
  fatoImersaoLeak?: {
    metodo?: string;
    pressaoInicial?: string;
    pressaoFinal?: string;
    deltaP?: string;
    unidade?: string;
    resultado?: string;
    reTest?: string;
    zonasFuga?: string[];
  };
  fatoImersaoBER?: { codigo?: string; motivo?: string };
  faturaId?: number;
  faturaNumero?: string;
  faturaEmitidaEm?: string;
  faturaEmitidaPor?: string;
  pagamentoStatus?: string;
};

type WorkflowTransitionMeta = {
  workflowStatus?: OrdemWorkflowStatus;
  workflowTransitions?: Array<{
    id?: string;
    at?: string;
    from?: OrdemWorkflowStatus | null;
    to?: OrdemWorkflowStatus;
    origin?: string;
    message?: string;
    user?: string;
  }>;
};

export type OrdemServicoJangadaContext = {
  id: number;
  serviceStationId: number | null;
  serial: string;
  brand: string;
  model: string;
  owner: string;
  shipId: number | null;
  shipNameManual: string | null;
  numeroObra: string | null;
  dataInspecao: string | null;
  dataProxInspecao: string | null;
};

export function normalizeUniquePositiveInts(values: Array<unknown>) {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.floor(value))
    )
  );
}

export function normalizeOrdemStatus(value: unknown): OrdemServicoStatus {
  const v = String(value || "").trim().toLowerCase();
  if (v === "agendada") return "agendada";
  if (v === "confirmada") return "confirmada";
  if (v === "em_progresso" || v === "progresso" || v === "em progresso" || v === "em_curso" || v === "em curso") return "em_progresso";
  if (v === "pausada") return "pausada";
  if (v === "concluida" || v === "concluída" || v === "finalizada") return "concluida";
  if (v === "cancelada") return "cancelada";
  return "pendente";
}

export function normalizeOrdemTipo(value: unknown): OrdemServicoTipo {
  const v = String(value || "").trim().toLowerCase();
  if (v === "fato_imersao" || v === "fato-imersao" || v === "imersao") return "fato_imersao";
  if (v === "colete" || v === "coletes") return "colete";
  if (v === "manutencao" || v === "manutenção") return "manutencao";
  if (v === "reparacao" || v === "reparação") return "reparacao";
  if (v === "outro") return "outro";
  return "inspecao";
}

export function normalizeOrdemPrioridade(value: unknown): OrdemServicoPrioridade {
  const v = String(value || "").trim().toLowerCase();
  if (v === "baixa") return "baixa";
  if (v === "alta") return "alta";
  if (v === "critica" || v === "crítica") return "critica";
  return "normal";
}

export function normalizeWorkflowStatus(value: unknown): OrdemWorkflowStatus | null {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return null;
  if (v === "entrada_estacao" || v === "entrada estação" || v === "entrada-estacao") return "entrada_estacao";
  if (v === "triagem") return "triagem";
  if (v === "inspecao_em_curso" || v === "inspeção_em_curso" || v === "inspecao em curso" || v === "inspeção em curso") return "inspecao_em_curso";
  if (v === "aguarda_pecas" || v === "aguarda peças" || v === "aguardar_material" || v === "aguardar material" || v === "sem_stock" || v === "sem stock") return "aguarda_pecas";
  if (v === "aguarda_decisao" || v === "aguarda decisão" || v === "aguarda decisao") return "aguarda_decisao";
  if (v === "orcamento_em_preparacao" || v === "orçamento_em_preparação" || v === "orcamento em preparacao" || v === "orçamento em preparação") return "orcamento_em_preparacao";
  if (v === "em_execucao" || v === "em execução" || v === "em execucao") return "em_execucao";
  if (v === "a_secar") return "a_secar";
  if (v === "pronta_para_fecho" || v === "pronta para fecho") return "pronta_para_fecho";
  if (v === "concluida" || v === "concluída") return "concluida";
  if (v === "cancelada") return "cancelada";
  return null;
}

export function mapQueueStatusToWorkflowStatus(value: unknown): OrdemWorkflowStatus | null {
  const v = String(value || "").trim().toLowerCase();
  if (v === "agendada") return "triagem";
  if (v === "progresso") return "inspecao_em_curso";
  if (v === "a_secar") return "a_secar";
  if (v === "finalizada") return "aguarda_decisao";
  if (v === "aguardar") return "entrada_estacao";
  return normalizeWorkflowStatus(value);
}

export function normalizeQueueWorkflowStatus(value: unknown): QueueWorkflowStatus {
  const v = String(value || "").trim().toLowerCase();
  if (v === "agendada") return "agendada";
  if (v === "progresso") return "progresso";
  if (v === "a_secar") return "a_secar";
  if (v === "finalizada") return "finalizada";
  return "aguardar";
}

const SIMPLE_QUEUE_FLOW: QueueWorkflowStatus[] = ["aguardar", "agendada", "progresso", "a_secar", "finalizada"];

export function getAllowedQueueWorkflowTransitions(fromValue: unknown) {
  const from = normalizeQueueWorkflowStatus(fromValue);
  const index = SIMPLE_QUEUE_FLOW.indexOf(from);
  if (index < 0) return [from] as QueueWorkflowStatus[];

  const allowed = new Set<QueueWorkflowStatus>([from]);
  if (index + 1 < SIMPLE_QUEUE_FLOW.length) allowed.add(SIMPLE_QUEUE_FLOW[index + 1]);
  if (index - 1 >= 0) allowed.add(SIMPLE_QUEUE_FLOW[index - 1]);

  return Array.from(allowed);
}

export function canTransitionQueueWorkflowStatus(fromValue: unknown, toValue: unknown) {
  const to = normalizeQueueWorkflowStatus(toValue);
  return getAllowedQueueWorkflowTransitions(fromValue).includes(to);
}

export function mapOrderStatusToWorkflowStatus(value: unknown): OrdemWorkflowStatus | null {
  const v = normalizeOrdemStatus(value);
  if (v === "agendada") return "orcamento_em_preparacao";
  if (v === "confirmada") return "pronta_para_fecho";
  if (v === "em_progresso") return "em_execucao";
  if (v === "pausada") return "a_secar";
  if (v === "concluida") return "concluida";
  if (v === "cancelada") return "cancelada";
  return "orcamento_em_preparacao";
}

export function mapWorkflowStatusToQueueStatus(value: unknown) {
  const workflow = normalizeWorkflowStatus(value);
  if (!workflow) return "aguardar";
  if (workflow === "triagem") return "agendada";
  if (workflow === "inspecao_em_curso" || workflow === "em_execucao" || workflow === "aguarda_pecas") return "progresso";
  if (workflow === "a_secar") return "a_secar";
  if (workflow === "aguarda_decisao" || workflow === "orcamento_em_preparacao" || workflow === "pronta_para_fecho" || workflow === "concluida" || workflow === "cancelada") {
    return "finalizada";
  }
  return "aguardar";
}

export function mapWorkflowStatusToOrderStatus(value: unknown): OrdemServicoStatus {
  const workflow = normalizeWorkflowStatus(value);
  if (!workflow) return "pendente";
  if (workflow === "triagem") return "agendada";
  if (workflow === "inspecao_em_curso" || workflow === "em_execucao") return "em_progresso";
  if (workflow === "aguarda_pecas") return "pausada";
  if (workflow === "a_secar") return "pausada";
  if (workflow === "pronta_para_fecho") return "confirmada";
  if (workflow === "concluida") return "concluida";
  if (workflow === "cancelada") return "cancelada";
  return "pendente";
}

export function resolveWorkflowStatus(params: {
  meta?: Partial<OrdemServicoMeta> | null;
  queueStatus?: unknown;
  orderStatus?: unknown;
}) {
  return (
    normalizeWorkflowStatus(params.meta?.workflowStatus) ||
    mapQueueStatusToWorkflowStatus(params.queueStatus) ||
    mapOrderStatusToWorkflowStatus(params.orderStatus) ||
    null
  );
}

export function appendWorkflowTransition<T extends object>(
  meta: T,
  to: OrdemWorkflowStatus,
  entry: {
    at?: string;
    origin?: string;
    message?: string;
    user?: string;
    force?: boolean;
  } = {}
) {
  const workflowMeta = meta as T & WorkflowTransitionMeta;
  const from = normalizeWorkflowStatus(workflowMeta.workflowStatus);
  if (!entry?.force && from === to) {
    return {
      ...meta,
      workflowStatus: to,
    } as T & WorkflowTransitionMeta;
  }

  const existing = Array.isArray(workflowMeta.workflowTransitions) ? workflowMeta.workflowTransitions : [];
  const transition = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: entry?.at || new Date().toISOString(),
    from,
    to,
    origin: entry?.origin || "system",
    message: entry?.message || `Workflow alterado para ${to}.`,
    user: entry?.user || "sistema",
  };

  return {
    ...meta,
    workflowStatus: to,
    workflowTransitions: [...existing, transition].slice(-200),
  } as T & WorkflowTransitionMeta;
}

export function mapQueueStatusToOrderStatus(value: unknown): OrdemServicoStatus {
  return mapWorkflowStatusToOrderStatus(mapQueueStatusToWorkflowStatus(value));
}

export function parseOrdemServicoMeta(raw?: string | null): OrdemServicoMeta {
  const text = String(raw || "").trim();
  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return parsed as OrdemServicoMeta;
    }
  } catch {
    return { observacao: text };
  }

  return {};
}

export function toOrdemServicoMetaJson(meta: OrdemServicoMeta) {
  return JSON.stringify(meta || {});
}

export function appendOrdemServicoLog(meta: OrdemServicoMeta, entry: {
  type: string;
  message: string;
  user?: string;
  at?: string;
}) {
  const existing = Array.isArray(meta.logs) ? meta.logs : [];
  const logEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: entry.at || new Date().toISOString(),
    type: entry.type,
    message: entry.message,
    user: entry.user || "sistema",
  };

  return {
    ...meta,
    logs: [...existing, logEntry].slice(-200),
  } satisfies OrdemServicoMeta;
}

export function buildNumeroOrdem(base: string, index: number, total: number) {
  const normalizedBase = String(base || "").trim();
  if (!normalizedBase) return "";
  if (total <= 1) return normalizedBase;
  return `${normalizedBase}-${String(index + 1).padStart(2, "0")}`;
}

function isNumeroOrdemPrefix(value: string) {
  return /^FO10\d{2}$/i.test(String(value || "").trim());
}

export function buildNumeroOrdemPrefix(referenceDate?: Date | string | null) {
  const fallbackYear = new Date().getFullYear();
  const parsed = referenceDate instanceof Date
    ? referenceDate
    : (referenceDate ? new Date(referenceDate) : new Date());

  const resolvedYear = Number.isNaN(parsed.getTime()) ? fallbackYear : parsed.getFullYear();
  return `FO10${String(resolvedYear).slice(-2)}`.toUpperCase();
}

export async function generateNumeroOrdem(prefixOrDate?: string | Date | null) {
  const rawValue = typeof prefixOrDate === "string" ? prefixOrDate.trim() : prefixOrDate;
  const normalizedPrefix = typeof rawValue === "string" && isNumeroOrdemPrefix(rawValue)
    ? rawValue.toUpperCase()
    : buildNumeroOrdemPrefix(rawValue instanceof Date ? rawValue : rawValue || null);

  const existing = await prisma.ordemServico.findMany({
    where: { numeroOrdem: { startsWith: normalizedPrefix } },
    select: { numeroOrdem: true },
  });

  const maxSequence = existing.reduce((max, row) => {
    const numero = String(row.numeroOrdem || "").trim().toUpperCase();
    if (!numero.startsWith(normalizedPrefix)) return max;
    const suffix = numero.slice(normalizedPrefix.length);
    if (!/^\d{5}$/.test(suffix)) return max;
    return Math.max(max, Number(suffix));
  }, 0);

  return `${normalizedPrefix}${String(maxSequence + 1).padStart(5, "0")}`;
}

export async function generateOSNumeroOrdem(referenceDate?: Date | string | null) {
  const fallbackYear = new Date().getFullYear();
  const parsed = referenceDate instanceof Date
    ? referenceDate
    : (referenceDate ? new Date(referenceDate) : new Date());

  const resolvedYear = Number.isNaN(parsed.getTime()) ? fallbackYear : parsed.getFullYear();
  const prefix = `OS-${resolvedYear}-`;

  const existing = await prisma.ordemServico.findMany({
    where: { numeroOrdem: { startsWith: prefix } },
    select: { numeroOrdem: true },
  });

  const maxSequence = existing.reduce((max, row) => {
    const numero = String(row.numeroOrdem || "").trim().toUpperCase();
    if (!numero.startsWith(prefix)) return max;
    const suffix = numero.slice(prefix.length);
    if (!/^\d{4}$/.test(suffix)) return max;
    return Math.max(max, Number(suffix));
  }, 0);

  return `${prefix}${String(maxSequence + 1).padStart(4, "0")}`;
}

function buildDocumentoPrefix(tipo: string, referenceDate?: Date | string | null) {
  const fallbackYear = new Date().getFullYear();
  const parsed = referenceDate instanceof Date
    ? referenceDate
    : (referenceDate ? new Date(referenceDate) : new Date());
  const resolvedYear = Number.isNaN(parsed.getTime()) ? fallbackYear : parsed.getFullYear();
  return `${tipo}-${resolvedYear}-`;
}

export function buildNumeroFaturaPrefix(referenceDate?: Date | string | null) {
  return buildDocumentoPrefix("FAT", referenceDate);
}

export function buildNumeroNotaCreditoPrefix(referenceDate?: Date | string | null) {
  return buildDocumentoPrefix("NC", referenceDate);
}

export function buildNumeroReciboPrefix(referenceDate?: Date | string | null) {
  return buildDocumentoPrefix("REC", referenceDate);
}

async function proximoNumeroSequencial(prefix: string, obterExistentes: () => Promise<string[]>) {
  const existing = await obterExistentes();

  const maxSequence = existing.reduce((max, numero) => {
    const normalized = String(numero || "").trim().toUpperCase();
    if (!normalized.startsWith(prefix)) return max;
    const suffix = normalized.slice(prefix.length);
    if (!/^\d{5}$/.test(suffix)) return max;
    return Math.max(max, Number(suffix));
  }, 0);

  return `${prefix}${String(maxSequence + 1).padStart(5, "0")}`;
}

export async function generateNumeroFatura(referenceDate?: Date | string | null) {
  const prefix = buildNumeroFaturaPrefix(referenceDate);
  return proximoNumeroSequencial(prefix, async () => {
    const existing = await prisma.fatura.findMany({
      where: { numeroFatura: { startsWith: prefix } },
      select: { numeroFatura: true },
    });
    return existing.map((row) => row.numeroFatura);
  });
}

export async function generateNumeroNotaCredito(referenceDate?: Date | string | null) {
  const prefix = buildNumeroNotaCreditoPrefix(referenceDate);
  return proximoNumeroSequencial(prefix, async () => {
    const existing = await prisma.notaCredito.findMany({
      where: { numeroNotaCredito: { startsWith: prefix } },
      select: { numeroNotaCredito: true },
    });
    return existing.map((row) => row.numeroNotaCredito);
  });
}

export async function generateNumeroRecibo(referenceDate?: Date | string | null) {
  const prefix = buildNumeroReciboPrefix(referenceDate);
  return proximoNumeroSequencial(prefix, async () => {
    const existing = await prisma.recibo.findMany({
      where: { numeroRecibo: { startsWith: prefix } },
      select: { numeroRecibo: true },
    });
    return existing.map((row) => row.numeroRecibo);
  });
}

export async function ensureClienteNumero(clienteId: number) {
  if (!clienteId || !Number.isFinite(Number(clienteId))) return null;

  const cliente = await prisma.cliente.findUnique({
    where: { id: Number(clienteId) },
    select: { id: true, numeroCliente: true },
  });
  if (!cliente) return null;

  if (cliente.numeroCliente && String(cliente.numeroCliente).trim()) {
    return cliente.numeroCliente.trim();
  }

  const generated = `CLI-${String(cliente.id).padStart(5, "0")}`;
  await prisma.cliente.update({
    where: { id: cliente.id },
    data: { numeroCliente: generated },
  });
  return generated;
}

export async function resolveClienteIdForJangada(jangadaId: number) {
  const raft = await prisma.jangada.findUnique({
    where: { id: jangadaId },
    select: { shipId: true },
  });

  if (!raft?.shipId) return null;

  return resolveClienteIdForShipId(raft.shipId);
}

export async function resolveClienteIdForShipId(shipId?: number | null) {
  if (!shipId || !Number.isFinite(Number(shipId))) return null;

  const ship = await prisma.navio.findUnique({
    where: { id: shipId },
    select: { clienteId: true },
  });

  return ship?.clienteId ?? null;
}

export async function getJangadasContextByIds(jangadaIds: number[]) {
  const uniqueIds = normalizeUniquePositiveInts(jangadaIds);
  if (uniqueIds.length === 0) return [] as OrdemServicoJangadaContext[];

  const rows = await prisma.jangada.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      serviceStationId: true,
      serial: true,
      brand: true,
      model: true,
      owner: true,
      shipId: true,
      shipNameManual: true,
      numeroObra: true,
      dataInspecao: true,
      dataProxInspecao: true,
    },
  });

  const byId = new Map(rows.map((row) => [row.id, row]));
  return uniqueIds.map((id) => byId.get(id)).filter(Boolean) as OrdemServicoJangadaContext[];
}

export async function resolveOrderJangadasContext(jangadaIds: number[]) {
  const jangadas = await getJangadasContextByIds(jangadaIds);
  const uniqueIds = normalizeUniquePositiveInts(jangadaIds);

  if (jangadas.length !== uniqueIds.length) {
    throw new Error("Uma ou mais jangadas não foram encontradas.");
  }

  const shipIds = Array.from(new Set(jangadas.map((jangada) => jangada.shipId).filter((shipId) => Number.isFinite(Number(shipId)))));
  if (shipIds.length > 1) {
    throw new Error("Todas as jangadas da ordem de serviço têm de pertencer ao mesmo navio.");
  }

  const stationIds = Array.from(
    new Set(
      jangadas
        .map((jangada) => jangada.serviceStationId)
        .filter((stationId) => Number.isFinite(Number(stationId)) && Number(stationId) > 0)
        .map((stationId) => Number(stationId))
    )
  );
  if (stationIds.length > 1) {
    throw new Error("Todas as jangadas da ordem de serviço têm de pertencer à mesma estação de serviço.");
  }

  return {
    jangadas,
    primaryJangadaId: jangadas[0]?.id ?? null,
    shipId: shipIds.length === 1 ? Number(shipIds[0]) : null,
    serviceStationId: stationIds.length === 1 ? stationIds[0] : null,
    shipName: jangadas[0]?.shipNameManual || jangadas[0]?.owner || null,
  };
}

export async function replaceOrdemServicoJangadas(
  tx: typeof prisma,
  ordemServicoId: number,
  jangadaIds: number[]
) {
  const context = await getJangadasContextByIds(jangadaIds);
  const uniqueIds = normalizeUniquePositiveInts(jangadaIds);

  if (context.length !== uniqueIds.length) {
    throw new Error("Uma ou mais jangadas não foram encontradas.");
  }

  const shipIds = Array.from(new Set(context.map((jangada) => jangada.shipId).filter((shipId) => Number.isFinite(Number(shipId)))));
  if (shipIds.length > 1) {
    throw new Error("Todas as jangadas da ordem de serviço têm de pertencer ao mesmo navio.");
  }

  const stationIds = Array.from(
    new Set(
      context
        .map((jangada) => jangada.serviceStationId)
        .filter((stationId) => Number.isFinite(Number(stationId)) && Number(stationId) > 0)
        .map((stationId) => Number(stationId))
    )
  );
  if (stationIds.length > 1) {
    throw new Error("Todas as jangadas da ordem de serviço têm de pertencer à mesma estação de serviço.");
  }

  const existing = await (tx as any).ordemServicoJangada.findMany({
    where: { ordemServicoId },
    select: { jangadaId: true },
  });
  const existingIds = new Set<number>(existing.map((row: { jangadaId: number }) => row.jangadaId));
  const nextIds = new Set<number>(uniqueIds);

  const toDelete = Array.from(existingIds).filter((jangadaId) => !nextIds.has(jangadaId));
  const toCreate = uniqueIds.filter((jangadaId) => !existingIds.has(jangadaId));

  if (toDelete.length > 0) {
    await (tx as any).ordemServicoJangada.deleteMany({
      where: {
        ordemServicoId,
        jangadaId: { in: toDelete },
      },
    });
  }

  if (toCreate.length > 0) {
    await (tx as any).ordemServicoJangada.createMany({
      data: toCreate.map((jangadaId) => ({ ordemServicoId, jangadaId })),
      skipDuplicates: true,
    });
  }

  return {
    jangadas: context,
    primaryJangadaId: uniqueIds[0] ?? null,
    shipId: shipIds.length === 1 ? Number(shipIds[0]) : null,
    serviceStationId: stationIds.length === 1 ? stationIds[0] : null,
    shipName: context[0]?.shipNameManual || context[0]?.owner || null,
  };
}

export async function ensureOrderForServiceStation(params: {
  jangadaId: number;
  queueId?: number;
  status?: unknown;
  workflowStatus?: unknown;
  tecnicoResponsavel?: string;
  observacao?: string;
  expectedDeliveryDate?: string | Date | null;
}) {
  const jangadaContext = await resolveOrderJangadasContext([params.jangadaId]);
  const shipId = jangadaContext.shipId;
  const active = shipId
    ? await prisma.ordemServico.findFirst({
        where: {
          shipId,
          serviceStationId: jangadaContext.serviceStationId,
          status: { notIn: ["concluida", "cancelada"] },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      })
    : await prisma.ordemServico.findFirst({
        where: {
          OR: [
            { jangadaId: params.jangadaId },
            { ordemJangadas: { some: { jangadaId: params.jangadaId } } },
          ],
          serviceStationId: jangadaContext.serviceStationId,
          status: { notIn: ["concluida", "cancelada"] },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      });

  const clienteId = shipId ? await resolveClienteIdForShipId(shipId) : await resolveClienteIdForJangada(params.jangadaId);
  const nextWorkflowStatus = normalizeWorkflowStatus(params.workflowStatus) || mapQueueStatusToWorkflowStatus(params.status) || "entrada_estacao";
  const nextStatus = mapWorkflowStatusToOrderStatus(nextWorkflowStatus);
  const expectedDate = params.expectedDeliveryDate
    ? parseFlexibleDate(typeof params.expectedDeliveryDate === "string" ? params.expectedDeliveryDate : params.expectedDeliveryDate.toISOString())
    : null;

  if (active) {
    const meta = parseOrdemServicoMeta(active.metadados);
    let finalNumeroOrdem = active.numeroOrdem;
    let transitionMessage = "";
    if (active.numeroOrdem.startsWith("OS-") && nextStatus === "em_progresso") {
      finalNumeroOrdem = await generateNumeroOrdem(active.dataPrevista || expectedDate || new Date());
      transitionMessage = `Número de ordem convertido de ${active.numeroOrdem} para ${finalNumeroOrdem} devido ao início da inspeção.`;
    }

    const updated = await prisma.$transaction(async (tx) => {
      await replaceOrdemServicoJangadas(tx as typeof prisma, active.id, [
        params.jangadaId,
        ...(active.jangadaId != null ? [active.jangadaId] : []),
        ...(((await (tx as any).ordemServicoJangada.findMany({
          where: { ordemServicoId: active.id },
          select: { jangadaId: true },
        })) as Array<{ jangadaId: number }>).map((row) => row.jangadaId)),
      ]);

      let nextMeta: any = {
        ...meta,
        origem: meta.origem || "service_station",
        queueId: params.queueId || meta.queueId,
        shipId: shipId ?? meta.shipId,
        shipName: jangadaContext.shipName || meta.shipName,
        observacao: params.observacao || meta.observacao,
      };

      nextMeta = appendWorkflowTransition(nextMeta, nextWorkflowStatus, {
        origin: "queue",
        message: transitionMessage
          ? `${transitionMessage} (Workflow atualizado a partir da estação para ${nextWorkflowStatus}.)`
          : `Workflow atualizado a partir da estação para ${nextWorkflowStatus}.`,
        user: params.tecnicoResponsavel || "sistema",
      });

      if (transitionMessage) {
        nextMeta = appendOrdemServicoLog(nextMeta, {
          type: "STATUS",
          message: transitionMessage,
          user: "sistema",
        });

        await (tx as any).ordemServicoLog.create({
          data: {
            ordemServicoId: active.id,
            type: "STATUS",
            message: transitionMessage,
            user: "sistema",
          },
        });
      }

      return tx.ordemServico.update({
        where: { id: active.id },
        data: {
          numeroOrdem: finalNumeroOrdem,
          status: nextStatus,
          serviceStationId: jangadaContext.serviceStationId,
          tecnicoResponsavel: params.tecnicoResponsavel || active.tecnicoResponsavel,
          dataPrevista: expectedDate || active.dataPrevista,
          dataPlaneadaFim: expectedDate || active.dataPlaneadaFim,
          dataInicio: nextStatus === "em_progresso" ? active.dataInicio || new Date() : active.dataInicio,
          dataConclusao: nextStatus === "concluida" ? new Date() : active.dataConclusao,
          shipId: shipId ?? active.shipId,
          metadados: toOrdemServicoMetaJson(nextMeta),
        },
      });
    });
    await syncPedidoAssistenciaFromOrdem(updated.id);
    return updated;
  }

  const numeroOrdem = nextStatus === "em_progresso"
    ? await generateNumeroOrdem(expectedDate || new Date())
    : await generateOSNumeroOrdem(expectedDate || new Date());
  return prisma.$transaction(async (tx) => {
    const created = await tx.ordemServico.create({
      data: {
        numeroOrdem,
        serviceStationId: jangadaContext.serviceStationId,
        jangadaId: params.jangadaId,
        shipId,
        clienteId,
        tipo: "inspecao",
        prioridade: "normal",
        status: nextStatus,
        tecnicoResponsavel: params.tecnicoResponsavel || null,
        descricao: params.observacao || null,
        dataPrevista: expectedDate,
        dataPlaneadaFim: expectedDate,
        dataInicio: nextStatus === "em_progresso" ? new Date() : null,
        dataConclusao: nextStatus === "concluida" ? new Date() : null,
        metadados: toOrdemServicoMetaJson({
          ...appendWorkflowTransition({
            origem: "service_station",
            queueId: params.queueId,
            shipId: shipId ?? undefined,
            shipName: jangadaContext.shipName ?? undefined,
            observacao: params.observacao,
          }, nextWorkflowStatus, {
            origin: "queue",
            message: `OT criada a partir da estação com workflow ${nextWorkflowStatus}.`,
            user: params.tecnicoResponsavel || "sistema",
          }),
        }),
      },
    });

    await (tx as any).ordemServicoJangada.create({
      data: {
        ordemServicoId: created.id,
        jangadaId: params.jangadaId,
      },
    });

    await syncPedidoAssistenciaFromOrdem(created.id);
    return created;
  });
}

export async function syncPedidoAssistenciaFromOrdem(ordemId: number) {
  try {
    const ordem = await prisma.ordemServico.findUnique({
      where: { id: ordemId },
      select: { id: true, pedidoAssistenciaId: true, status: true },
    });
    if (!ordem?.pedidoAssistenciaId) return;
    const finalStatus = String(ordem.status || "");
    if (finalStatus !== "concluida" && finalStatus !== "cancelada") return;
    await prisma.pedidoAssistencia.update({
      where: { id: ordem.pedidoAssistenciaId },
      data: { estado: finalStatus === "cancelada" ? "arquivado" : "concluido" },
    });
  } catch (error) {
    console.error("[syncPedidoAssistenciaFromOrdem]", error);
  }
}

export async function autoGenerateDraftMaterialsForJangadas(
  jangadaIds: number[],
  tipo: string
): Promise<{
  materials: NonNullable<OrdemServicoMeta["materials"]>;
  valorPecas: number;
}> {
  if (!jangadaIds || jangadaIds.length === 0) {
    return { materials: [], valorPecas: 0 };
  }

  try {
    const jangadas = await prisma.jangada.findMany({
      where: { id: { in: jangadaIds } },
      include: {
        artigos: true,
      },
    });

    if (!jangadas || jangadas.length === 0) {
      return { materials: [], valorPecas: 0 };
    }

    const serviceRefs = ["L-JD", "L-FS", "L-NAP", "L-GI", "L-TH", "L-CO2"];
    const artigoStockIds = jangadas.flatMap((j) =>
      Array.isArray(j.artigos) ? j.artigos.map((a) => a.stockId).filter(Boolean) : []
    ) as number[];

    const stockItems = await prisma.stock.findMany({
      where: {
        OR: [
          { referencia: { in: serviceRefs } },
          ...(artigoStockIds.length > 0 ? [{ id: { in: artigoStockIds } }] : []),
        ],
      },
      select: {
        id: true,
        referencia: true,
        descricao: true,
        precoVenda: true,
        quantidade: true,
      },
    });

    const stockMapByRef = new Map(stockItems.map((s) => [s.referencia, s]));
    const stockMapById = new Map(stockItems.map((s) => [s.id, s]));

    const materials: NonNullable<OrdemServicoMeta["materials"]> = [];

    const { getContainerClosureMatchBundle } = require("@/modules/rafts/containerClosureStraps");

    const now = new Date();
    const expirationThreshold = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

    for (const j of jangadas) {
      // A) Serviço L-JD (Inspeção de Jangada)
      const stockLJD = stockMapByRef.get("L-JD");
      materials.push({
        id: `auto-ljd-${j.id}`,
        stockId: stockLJD?.id,
        referencia: "L-JD",
        descricao: stockLJD?.descricao || `Inspeção de Jangada (${j.brand || ""} ${j.model || ""} ${j.serial || ""})`.trim(),
        quantidadePrevista: 1,
        quantidadeUsada: 1,
        precoUnitario: stockLJD?.precoVenda ?? 180,
        disponibilidade: stockLJD?.quantidade ?? 0,
        reservado: false,
        consumido: false,
      });

      // B) Cintas de fecho
      try {
        const bundle = getContainerClosureMatchBundle({
          brand: j.brand,
          model: j.model,
          containerModel: j.containerModel,
          capacity: j.capacity,
          launchType: j.launchType,
          packType: j.packType,
          maxStowageHeight: j.maxStowageHeight,
        });

        if (bundle && bundle.exactMatches && bundle.exactMatches.length > 0) {
          const match = bundle.exactMatches[0];
          const strapRef = String(match.stockReference || "").split("/")[0].trim();
          if (strapRef) {
            let strapStock = stockMapByRef.get(strapRef);
            if (!strapStock) {
              strapStock =
                (await prisma.stock.findFirst({
                  where: { referencia: strapRef },
                  select: { id: true, referencia: true, descricao: true, precoVenda: true, quantidade: true },
                })) || undefined;
            }
            materials.push({
              id: `auto-strap-${j.id}-${strapRef}`,
              stockId: strapStock?.id,
              referencia: strapRef,
              descricao: strapStock?.descricao || match.description || "Cinta de Fecho do Contentor",
              quantidadePrevista: match.strapQuantity || 1,
              quantidadeUsada: match.strapQuantity || 1,
              precoUnitario: strapStock?.precoVenda ?? 0,
              disponibilidade: strapStock?.quantidade ?? 0,
              reservado: false,
              consumido: false,
            });
          }
        }
      } catch {
        // Ignorar se não encontrar cinta
      }

      // C) Artigos da jangada prestes a expirar
      if (Array.isArray(j.artigos)) {
        for (const artigo of j.artigos) {
          let isExpiring = false;
          if (artigo.validade) {
            const valDate = new Date(artigo.validade);
            if (!isNaN(valDate.getTime()) && valDate <= expirationThreshold) {
              isExpiring = true;
            }
          } else {
            isExpiring = stockItemSupportsValidity({
              nome: artigo.name,
              referencia: artigo.referencia,
              codigoFabricante: artigo.codigoFabricante,
            });
          }

          if (isExpiring) {
            let stock = artigo.stockId ? stockMapById.get(artigo.stockId) : undefined;
            if (!stock && artigo.referencia) {
              stock = stockMapByRef.get(artigo.referencia);
            }
            if (!stock && artigo.name) {
              stock = stockItems.find(
                (s) => String(s.descricao || "").toLowerCase() === String(artigo.name || "").toLowerCase()
              );
            }

            materials.push({
              id: `auto-artigo-${j.id}-${artigo.id}`,
              stockId: stock?.id || artigo.stockId || undefined,
              referencia: artigo.referencia || stock?.referencia || "SEM-REF",
              descricao: artigo.name || stock?.descricao || "Artigo Substituição",
              quantidadePrevista: artigo.quantidade || 1,
              quantidadeUsada: artigo.quantidade || 1,
              precoUnitario: stock?.precoVenda ?? 0,
              disponibilidade: stock?.quantidade ?? 0,
              reservado: false,
              consumido: false,
            });
          }
        }
      }
    }

    const uniqueMaterialsMap = new Map<string, (typeof materials)[0]>();
    for (const mat of materials) {
      if (!uniqueMaterialsMap.has(mat.id!)) {
        uniqueMaterialsMap.set(mat.id!, mat);
      }
    }

    const finalMaterials = Array.from(uniqueMaterialsMap.values());

    const valorPecas = finalMaterials.reduce(
      (acc, item) => acc + (item.quantidadePrevista || 1) * (item.precoUnitario || 0),
      0
    );

    return { materials: finalMaterials, valorPecas };
  } catch (err) {
    console.error("[autoGenerateDraftMaterialsForJangadas]", err);
    return { materials: [], valorPecas: 0 };
  }
}
