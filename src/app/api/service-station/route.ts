import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { resolveActiveServiceStationId } from "@/lib/station-selection";
import { logAuditoria } from "@/lib/auditoria";
import { syncNextInspectionAgenda } from "@/lib/agenda-sync";
import { clearEntregaAgendaEvent, syncEntregaAgendaEvent } from "@/lib/agenda-entrega";
import { APP_CONFIG } from "@/lib/app-config";
import { notifyJangadaEnviada, notifyJangadaRececionada, notifyJangadaProntaEntrega, tryNotifySms } from "@/lib/notify-jangada-sms";
import {
  appendWorkflowTransition,
  ensureOrderForServiceStation,
  canTransitionQueueWorkflowStatus,
  mapWorkflowStatusToOrderStatus,
  mapWorkflowStatusToQueueStatus,
  mapQueueStatusToWorkflowStatus,
  parseOrdemServicoMeta,
  resolveWorkflowStatus,
  toOrdemServicoMetaJson,
  type OrdemWorkflowStatus,
  generateNumeroOrdem,
  appendOrdemServicoLog,
  syncPedidoAssistenciaFromOrdem,
  type OrdemServicoMeta,
} from "@/lib/ordens-servico";

type QueueStatus = "aguardar" | "agendada" | "progresso" | "a_secar" | "finalizada";
type DeliveryMethod = "cliente" | "transitario" | "navio";
type SaoMiguelPortCall =
  | "Rabo de Peixe"
  | "Ponta Delgada"
  | "Porto Formoso"
  | "Vila Franca do Campo"
  | "Ribeira Quente"
  | "Lagoa";

const DELIVERY_METHODS = new Set<DeliveryMethod>(["cliente", "transitario", "navio"]);
const SAO_MIGUEL_PORT_CALLS = new Set<SaoMiguelPortCall>([
  "Rabo de Peixe",
  "Ponta Delgada",
  "Porto Formoso",
  "Vila Franca do Campo",
  "Ribeira Quente",
  "Lagoa",
]);

type QueueMeta = {
  tecnico?: string;
  observacao?: string;
  scheduledAt?: string;
  startedAt?: string;
  finishedAt?: string;
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
  arrivedViaForwarder?: boolean;
  arrivalDate?: string;
  readyForDelivery?: boolean;
  deliveryMethod?: DeliveryMethod;
  saoMiguelPortCall?: SaoMiguelPortCall;
  deliveredAt?: string;
  transitario?: string;
  trackingCode?: string;
  smsNotifications?: Array<{ type: string; ativo: string; phone: string; status: string; error?: string }>;
};

function normalizeStatus(value: unknown): QueueStatus {
  const v = String(value || "").trim().toLowerCase();
  if (v === "agendada") return "agendada";
  if (v === "progresso") return "progresso";
  if (v === "a_secar") return "a_secar";
  if (v === "finalizada") return "finalizada";
  return "aguardar";
}

const QUEUE_STATUS_RANK: Record<QueueStatus, number> = {
  aguardar: 0,
  agendada: 1,
  progresso: 2,
  a_secar: 3,
  finalizada: 4,
};

function queueStatusRank(value: unknown): number {
  return QUEUE_STATUS_RANK[normalizeStatus(value)] ?? 0;
}

function parseBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "sim", "yes", "y"].includes(raw)) return true;
  if (["0", "false", "nao", "não", "no", "n"].includes(raw)) return false;
  return fallback;
}

function normalizeDeliveryMethod(value: unknown): DeliveryMethod | undefined {
  const normalized = String(value || "").trim().toLowerCase() as DeliveryMethod;
  if (!normalized || !DELIVERY_METHODS.has(normalized)) return undefined;
  return normalized;
}

function normalizeSaoMiguelPortCall(value: unknown): SaoMiguelPortCall | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;

  const exactMatch = Array.from(SAO_MIGUEL_PORT_CALLS).find((item) => item.toLowerCase() === raw.toLowerCase());
  return exactMatch;
}

function parseQueueMeta(raw?: string | null): QueueMeta {
  const text = String(raw || "").trim();
  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      const data = parsed as Record<string, unknown>;
      return {
        tecnico: typeof data.tecnico === "string" ? data.tecnico : undefined,
        observacao: typeof data.observacao === "string" ? data.observacao : undefined,
        scheduledAt: typeof data.scheduledAt === "string" ? data.scheduledAt : undefined,
        startedAt: typeof data.startedAt === "string" ? data.startedAt : undefined,
        finishedAt: typeof data.finishedAt === "string" ? data.finishedAt : undefined,
        workflowStatus: data.workflowStatus as OrdemWorkflowStatus | undefined,
        workflowTransitions: Array.isArray(data.workflowTransitions) ? data.workflowTransitions : undefined,
        arrivedViaForwarder: parseBoolean(data.arrivedViaForwarder, false),
        arrivalDate: typeof data.arrivalDate === "string" ? data.arrivalDate : undefined,
        readyForDelivery: parseBoolean(data.readyForDelivery, false),
        deliveryMethod: normalizeDeliveryMethod(data.deliveryMethod),
        saoMiguelPortCall: normalizeSaoMiguelPortCall(data.saoMiguelPortCall),
        deliveredAt: typeof data.deliveredAt === "string" ? data.deliveredAt : undefined,
        transitario: typeof data.transitario === "string" ? data.transitario : undefined,
        trackingCode: typeof data.trackingCode === "string" ? data.trackingCode : undefined,
        smsNotifications: Array.isArray(data.smsNotifications) ? data.smsNotifications : undefined,
      };
    }
  } catch {
    // legado: string simples de observação
  }

  return { observacao: text };
}

function toMetaJson(meta: QueueMeta) {
  return JSON.stringify({
    tecnico: meta.tecnico || "",
    observacao: meta.observacao || "",
    scheduledAt: meta.scheduledAt || "",
    startedAt: meta.startedAt || "",
    finishedAt: meta.finishedAt || "",
    workflowStatus: meta.workflowStatus || "",
    workflowTransitions: Array.isArray(meta.workflowTransitions) ? meta.workflowTransitions : [],
    arrivedViaForwarder: Boolean(meta.arrivedViaForwarder),
    arrivalDate: meta.arrivalDate || "",
    readyForDelivery: Boolean(meta.readyForDelivery),
    deliveryMethod: meta.deliveryMethod || "",
    saoMiguelPortCall: meta.saoMiguelPortCall || "",
    deliveredAt: meta.deliveredAt || "",
    transitario: meta.transitario || "",
    trackingCode: meta.trackingCode || "",
    smsNotifications: Array.isArray(meta.smsNotifications) ? meta.smsNotifications : [],
  });
}

function normalizeStationText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

async function isAcoresServiceStation(serviceStationId: number | null) {
  if (!serviceStationId || serviceStationId <= 0) return false;

  const station = await prisma.serviceStation.findUnique({
    where: { id: serviceStationId },
    select: { codigo: true, nome: true },
  });

  if (!station) return false;

  const code = normalizeStationText(station.codigo);
  const name = normalizeStationText(station.nome);
  return code === "acores" || name === "acores";
}

async function resolveJangadaIdFromBody(body: Record<string, unknown>) {
  const directRaftId = Number(body?.raftId);
  if (Number.isFinite(directRaftId) && directRaftId > 0) return directRaftId;

  const serial = String(body?.serial || "").trim();
  if (!serial) return null;

  const raft = await prisma.jangada.findFirst({
    where: { serial: { equals: serial } },
    select: { id: true },
  });

  return raft?.id ?? null;
}

function isQueueRowDelivered(row: { observacoes?: string | null }) {
  return Boolean(parseQueueMeta(row?.observacoes).deliveredAt);
}

async function resolveQueueTarget(body: Record<string, unknown>) {
  const directId = Number(body?.id);
  if (Number.isFinite(directId) && directId > 0) {
    return prisma.serviceStationQueue.findUnique({ where: { id: directId } });
  }

  const jangadaId = await resolveJangadaIdFromBody(body);
  if (!jangadaId) return null;

  const rows = await prisma.serviceStationQueue.findMany({
    where: { jangadaId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });

  return rows.find((row) => !isQueueRowDelivered(row)) || rows[0] || null;
}

async function listQueue(
  access: NonNullable<Awaited<ReturnType<typeof getAccessContext>>>,
  activeStationId: number | null,
  onlyReceived = false,
) {
  const rows = await prisma.serviceStationQueue.findMany({
    where: activeStationId
      ? { serviceStationId: activeStationId }
      : !access.isAdmin
        ? { serviceStationId: { in: access.allowedStationIds.length ? access.allowedStationIds : [-1] } }
        : undefined,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    include: {
      serviceStation: {
        select: {
          id: true,
          codigo: true,
          nome: true,
        },
      },
      ordemServico: {
        select: {
          id: true,
          numeroOrdem: true,
          status: true,
          orcamentoStatus: true,
          valorPecas: true,
          valorMaoObra: true,
          valorDesconto: true,
          valorTotal: true,
          isIsentoIva: true,
          metadados: true,
        },
      },
    },
  });

  // Filter by reception if requested: only show rafts that have been explicitly received
  // (arrivedViaForwarder=true OR arrivalDate set by user, not just createdAt fallback)
  const filteredRows = onlyReceived
    ? rows.filter((row) => {
        const meta = parseQueueMeta(row.observacoes);
        const hasExplicitArrival = Boolean(meta.arrivedViaForwarder) || 
          (meta.arrivalDate && meta.arrivalDate !== row.dataChegada?.toISOString().slice(0, 10) && meta.arrivalDate !== row.createdAt.toISOString().slice(0, 10));
        return hasExplicitArrival;
      })
    : rows;

  const raftIds = Array.from(new Set(filteredRows.map((r) => r.jangadaId).filter(Boolean)));
  const rafts = raftIds.length
    ? await prisma.jangada.findMany({
        where: { id: { in: raftIds } },
        select: {
          id: true,
          serial: true,
          brand: true,
          model: true,
          shipNameManual: true,
          owner: true,
          dataFabrico: true,
          launchType: true,
          dataInspecao: true,
          dataProxInspecao: true,
          testeGI: true,
        },
      })
    : [];

  const raftById = new Map(rafts.map((r) => [r.id, r]));

  return filteredRows.map((row) => {
    const raft = raftById.get(row.jangadaId);
    const meta = parseQueueMeta(row.observacoes);
    const orderMeta = parseOrdemServicoMeta(row.ordemServico?.metadados);
    const workflowStatus = resolveWorkflowStatus({
      meta: {
        ...orderMeta,
        workflowStatus: meta.workflowStatus || orderMeta.workflowStatus,
      },
      queueStatus: row.status,
      orderStatus: row.ordemServico?.status,
    });

    return {
      queueId: row.id,
      raftId: row.jangadaId,
      serviceStationId: row.serviceStationId,
      serviceStation: row.serviceStation
        ? {
            id: row.serviceStation.id,
            codigo: row.serviceStation.codigo,
            nome: row.serviceStation.nome,
          }
        : null,
      serial: raft?.serial || "",
      model: `${raft?.brand || ""} ${raft?.model || ""}`.trim() || raft?.model || "Modelo não definido",
      shipName: String(raft?.shipNameManual || raft?.owner || "Sem navio"),
      dataFabrico: raft?.dataFabrico || null,
      launchType: raft?.launchType || null,
      dataInspecao: raft?.dataInspecao || null,
      dataProxInspecao: raft?.dataProxInspecao || null,
      testeGI: raft?.testeGI || null,
      tecnico: meta.tecnico || "",
      observacao: meta.observacao || "",
      arrivedViaForwarder: Boolean(meta.arrivedViaForwarder),
      arrivalDate: meta.arrivalDate || (row.dataChegada?.toISOString().slice(0, 10) || ""),
      transitario: meta.transitario || "",
      trackingCode: meta.trackingCode || "",
      smsNotifications: Array.isArray(meta.smsNotifications) ? meta.smsNotifications : [],
      notifiedLastAt: Array.isArray(meta.smsNotifications) && meta.smsNotifications.length
        ? meta.smsNotifications[meta.smsNotifications.length - 1]?.ativo || null
        : null,
      readyForDelivery: Boolean(meta.readyForDelivery),
      deliveryMethod: meta.deliveryMethod || null,
      saoMiguelPortCall: meta.saoMiguelPortCall || null,
      delivered: Boolean(meta.deliveredAt),
      deliveredAt: meta.deliveredAt || null,
      receivedAt: row.dataChegada?.toISOString() || row.createdAt.toISOString(),
      status: normalizeStatus(row.status),
      workflowStatus,
      scheduledAt: meta.scheduledAt || undefined,
      startedAt: meta.startedAt || undefined,
      finishedAt: meta.finishedAt || undefined,
      expectedDeliveryDate: row.dataPrevistaEntrega ? row.dataPrevistaEntrega.toISOString().slice(0, 10) : null,
      ordemServicoId: row.ordemServico?.id || row.ordemServicoId || null,
      numeroOrdem: row.ordemServico?.numeroOrdem || "",
      ordemStatus: row.ordemServico?.status || null,
      orcamentoStatus: row.ordemServico?.orcamentoStatus || "Rascunho",
      valorPecas: Number(row.ordemServico?.valorPecas || 0),
      valorMaoObra: Number(row.ordemServico?.valorMaoObra || 0),
      valorDesconto: Number(row.ordemServico?.valorDesconto || 0),
      valorTotal: Number(row.ordemServico?.valorTotal || 0),
      isIsentoIva: Boolean(row.ordemServico?.isIsentoIva),
      orcamentoLinhas: Array.isArray(orderMeta.linhas) ? orderMeta.linhas : [],
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

export async function GET(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }

    const activeStationId = resolveActiveServiceStationId(req, access);
    const url = new URL(req.url);
    const onlyReceived = url.searchParams.get("received") === "true";
    const items = await listQueue(access, activeStationId, onlyReceived);
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao listar estação de serviço." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const activeStationId = resolveActiveServiceStationId(req, access);
    const jangadaId = await resolveJangadaIdFromBody(body);
    if (!jangadaId) {
      return NextResponse.json({ error: "raftId inválido." }, { status: 400 });
    }

    // A Logística fala com a estação com o seu próprio vocabulário:
    // "recebida" = receção na estação, "expedida" = jangada enviada/entregue.
    const rawStatus = String(body?.status || "").trim().toLowerCase();
    const isExpedicao = ["expedida", "expedicao", "expedição", "enviada", "envio"].includes(rawStatus);
    const isRececao = ["recebida", "rececao", "receção", "receber"].includes(rawStatus);
    const origem = String(body?.origem || body?.origin || "").trim().toLowerCase();

    const requestedWorkflowStatus =
      (isExpedicao
        ? ("aguarda_decisao" as OrdemWorkflowStatus)
        : resolveWorkflowStatus({
            meta: { workflowStatus: body?.workflowStatus as OrdemWorkflowStatus | undefined },
            queueStatus: isRececao ? "aguardar" : body?.status,
          })) || "entrada_estacao";
    const status = normalizeStatus(mapWorkflowStatusToQueueStatus(requestedWorkflowStatus));
    const nowIso = new Date().toISOString();
    const arrivalDate = String(body?.arrivalDate || "").trim() || nowIso.slice(0, 10);
    const meta = appendWorkflowTransition({
      tecnico: String(body?.tecnico || "").trim() || undefined,
      observacao: String(body?.observacao || "").trim() || undefined,
      scheduledAt: status === "agendada" ? String(body?.scheduledAt || nowIso) : undefined,
      startedAt: status === "progresso" ? String(body?.startedAt || nowIso) : undefined,
      finishedAt: status === "finalizada" ? String(body?.finishedAt || nowIso) : undefined,
      arrivedViaForwarder: parseBoolean(body?.arrivedViaForwarder, false),
      arrivalDate,
      readyForDelivery: status === "finalizada" ? true : parseBoolean(body?.readyForDelivery, false),
      deliveryMethod: normalizeDeliveryMethod(body?.deliveryMethod),
      saoMiguelPortCall: normalizeSaoMiguelPortCall(body?.saoMiguelPortCall),
      deliveredAt: isExpedicao
        ? String(body?.deliveredAt || body?.dataEntrega || "").trim() || nowIso
        : undefined,
      transitario: String(body?.transitario || "").trim() || undefined,
      trackingCode: String(body?.trackingCode || "").trim() || undefined,
    }, requestedWorkflowStatus, {
      origin: isExpedicao ? "logistica_expedicao" : "queue",
      message: isExpedicao
        ? "Jangada expedida pela logística."
        : `Entrada criada na estação com workflow ${requestedWorkflowStatus}.`,
      user: String(body?.tecnico || "").trim() || "sistema",
    }) satisfies QueueMeta;

    const expectedDeliveryDateRaw = String(body?.expectedDeliveryDate || "").trim();
    const expectedDeliveryDate = expectedDeliveryDateRaw ? new Date(expectedDeliveryDateRaw) : null;
    const requestedStationId = Number(body?.serviceStationId) || null;
    const requestedStationAllowed =
      requestedStationId !== null &&
      (access.isAdmin || access.allowedStationIds.length === 0 || access.allowedStationIds.includes(requestedStationId));
    const fallbackAllowedStationId = activeStationId || access.stationId || access.allowedStationIds[0] || null;
    const enforcedServiceStationId = requestedStationAllowed && requestedStationId ? requestedStationId : fallbackAllowedStationId;

    if (!enforcedServiceStationId) {
      return NextResponse.json({ error: "Conta sem estação de serviço associada." }, { status: 403 });
    }

    // Regra: a receção de jangadas faz-se apenas pela Logística (/logistica).
    if (status === "aguardar" && !isExpedicao && origem !== "logistica") {
      return NextResponse.json(
        {
          error:
            "A receção de jangadas é feita apenas na Logística. Abra /logistica e use o botão «Receber».",
        },
        { status: 403 },
      );
    }

    if (status === "aguardar" && APP_CONFIG.theme !== 'deluxe') {
      const acoresAllowed = await isAcoresServiceStation(enforcedServiceStationId);
      if (!acoresAllowed) {
        return NextResponse.json(
          { error: "Só é permitido colocar jangadas em 'aguardar inspeção' na estação dos Açores." },
          { status: 403 },
        );
      }
    }

    const existingActiveRow = await prisma.serviceStationQueue.findFirst({
      where: { jangadaId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    const existingActive = existingActiveRow && !isQueueRowDelivered(existingActiveRow) ? existingActiveRow : null;
    const existingMeta = existingActive ? parseQueueMeta(existingActive.observacoes) : null;

    // Nunca recuar o estado de uma entrada já existente (exceto na expedição,
    // que fecha a entrada de qualquer forma). Isto evita duplicar linhas no
    // quadro e rebaixar jangadas que já avançaram no fluxo.
    const nextRowStatus = !existingActive
      ? status
      : isExpedicao || queueStatusRank(status) > queueStatusRank(existingActive.status)
        ? status
        : normalizeStatus(existingActive.status);
    const advanced = !existingActive || nextRowStatus === status;

    const created = existingActive && existingMeta
      ? await prisma.serviceStationQueue.update({
          where: { id: existingActive.id },
          data: {
            status: nextRowStatus,
            serviceStationId: enforcedServiceStationId || existingActive.serviceStationId,
            dataPrevistaEntrega: expectedDeliveryDate ?? existingActive.dataPrevistaEntrega,
            observacoes: toMetaJson({
              ...existingMeta,
              ...meta,
              workflowStatus: advanced ? meta.workflowStatus : existingMeta.workflowStatus,
              workflowTransitions: advanced
                ? meta.workflowTransitions || existingMeta.workflowTransitions
                : existingMeta.workflowTransitions || meta.workflowTransitions,
            }),
          },
        })
      : await prisma.serviceStationQueue.create({
          data: {
            jangadaId,
            status,
            serviceStationId: enforcedServiceStationId,
            dataPrevistaEntrega: expectedDeliveryDate,
            observacoes: toMetaJson(meta),
          },
        });

    const effectiveStatus = nextRowStatus;
    const effectiveWorkflowStatus = advanced && meta.workflowStatus
      ? (meta.workflowStatus as OrdemWorkflowStatus)
      : (existingMeta?.workflowStatus as OrdemWorkflowStatus | undefined) ||
        mapQueueStatusToWorkflowStatus(effectiveStatus) ||
        requestedWorkflowStatus;

    const ordemServico = await ensureOrderForServiceStation({
      jangadaId,
      queueId: created.id,
      status: effectiveStatus,
      workflowStatus: effectiveWorkflowStatus,
      tecnicoResponsavel: meta.tecnico,
      observacao: meta.observacao,
      expectedDeliveryDate,
    });

    if (ordemServico && created.ordemServicoId !== ordemServico.id) {
      await prisma.serviceStationQueue.update({
        where: { id: created.id },
        data: { ordemServicoId: ordemServico.id },
      });
    }

    if (enforcedServiceStationId) {
      const stationIdToApply = enforcedServiceStationId;
      await prisma.jangada.update({
        where: { id: jangadaId },
        data: { serviceStationId: stationIdToApply },
      });

      const orderId = ordemServico?.id || created.ordemServicoId;
      if (orderId) {
        await prisma.ordemServico.update({
          where: { id: orderId },
          data: { serviceStationId: stationIdToApply },
        });
      }
    }

    if (effectiveStatus === "finalizada") {
      await clearEntregaAgendaEvent({ jangadaId });
    } else if (expectedDeliveryDate) {
      await syncEntregaAgendaEvent({ jangadaId, dataPrevistaEntrega: expectedDeliveryDate });
    }

    await logAuditoria({
      tabela: "ServiceStationQueue",
      tipoOperacao: existingActive ? "UPDATE" : "CREATE",
      idRegisto: created.id,
      descricao: isExpedicao
        ? `Expedição registada pela logística (jangadaId=${jangadaId})`
        : existingActive
          ? `Entrada existente consolidada (jangadaId=${jangadaId}, estado=${nextRowStatus})`
          : `Entrada na estação de serviço (jangadaId=${jangadaId})`,
      dadosDepois: created,
    });

    if (!existingActive && parseBoolean(body?.arrivedViaForwarder, false)) {
      await tryNotifySms(() =>
        notifyJangadaRececionada(jangadaId, { expectedDeliveryDate }),
      );
    }

    const all = await listQueue(access, activeStationId);
    const item = all.find((q) => q.queueId === created.id);
    return NextResponse.json(item || null, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao criar entrada na estação." }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const activeStationId = resolveActiveServiceStationId(req, access);
    const before = await resolveQueueTarget(body);
    if (!before) {
      return NextResponse.json({ error: "Entrada não encontrada." }, { status: 404 });
    }

    if (activeStationId && Number(before.serviceStationId || 0) !== Number(activeStationId)) {
      return NextResponse.json({ error: "Sem permissão para atualizar esta estação." }, { status: 403 });
    }

    if (!activeStationId && !access.isAdmin && !access.allowedStationIds.includes(Number(before.serviceStationId || 0))) {
      return NextResponse.json({ error: "Sem permissão para atualizar esta estação." }, { status: 403 });
    }

    const id = before.id;

    const previousMeta = parseQueueMeta(before.observacoes);
    const fallbackAllowedStationId = activeStationId || access.stationId || access.allowedStationIds[0] || null;
    const enforcedServiceStationId = fallbackAllowedStationId;
    const requestedWorkflowStatus = resolveWorkflowStatus({
      meta: {
        workflowStatus: Object.prototype.hasOwnProperty.call(body, "workflowStatus") ? (body?.workflowStatus as OrdemWorkflowStatus | undefined) : previousMeta.workflowStatus,
      },
      queueStatus: Object.prototype.hasOwnProperty.call(body, "status") ? body?.status : before.status,
      orderStatus: before.ordemServicoId ? undefined : null,
    }) || previousMeta.workflowStatus || mapQueueStatusToWorkflowStatus(before.status) || "entrada_estacao";
    const status = normalizeStatus(mapWorkflowStatusToQueueStatus(requestedWorkflowStatus));

    if (!canTransitionQueueWorkflowStatus(before.status, status)) {
      return NextResponse.json(
        {
          error:
            "Transição de estado inválida. Use o fluxo simples: Receção/Aguardar → Agendada → Em inspeção → A secar → Pronta para entrega.",
        },
        { status: 400 },
      );
    }

    if (status === "finalizada" && before.ordemServicoId) {
      const linkedOrder = await prisma.ordemServico.findUnique({
        where: { id: before.ordemServicoId },
        select: { id: true, orcamentoStatus: true },
      });
      if (linkedOrder && String(linkedOrder.orcamentoStatus || "") !== "Aprovado") {
        return NextResponse.json(
          {
            error: "Para marcar como pronta para entrega, o orçamento da OT tem de estar aprovado.",
            details: [`Orçamento atual: ${linkedOrder.orcamentoStatus || "Rascunho"}. Aprova no módulo de Orçamentos (/orcamentos) antes de fechar.`],
          },
          { status: 400 },
        );
      }
    }

    const wasFinalizedBefore = normalizeStatus(before.status) === "finalizada";
    const autoReadyForDelivery = status === "finalizada"
      ? true
      : wasFinalizedBefore
        ? false
        : undefined;

    const wasDeliveredBefore = isQueueRowDelivered(before);
    const hasDeliveredFlag = Object.prototype.hasOwnProperty.call(body, "delivered")
      || Object.prototype.hasOwnProperty.call(body, "deliveredAt");
    const requestedDelivered = Object.prototype.hasOwnProperty.call(body, "delivered")
      ? parseBoolean(body?.delivered, false)
      : Object.prototype.hasOwnProperty.call(body, "deliveredAt")
        ? Boolean(String(body?.deliveredAt || "").trim())
        : wasDeliveredBefore;

    if (requestedDelivered && !wasDeliveredBefore && !wasFinalizedBefore) {
      return NextResponse.json(
        { error: "Só é possível entregar jangadas que estejam em 'Pronta para entrega'." },
        { status: 400 },
      );
    }

    const deliveredAtValue = requestedDelivered
      ? (Object.prototype.hasOwnProperty.call(body, "deliveredAt")
        ? String(body?.deliveredAt || "").trim()
        : "") || previousMeta.deliveredAt || new Date().toISOString()
      : "";

    const nextDeliveryMethod = Object.prototype.hasOwnProperty.call(body, "deliveryMethod")
      ? normalizeDeliveryMethod(body?.deliveryMethod)
      : previousMeta.deliveryMethod;

    const nextMeta = appendWorkflowTransition({
      tecnico: Object.prototype.hasOwnProperty.call(body, "tecnico") ? String(body?.tecnico || "").trim() || undefined : previousMeta.tecnico,
      observacao: Object.prototype.hasOwnProperty.call(body, "observacao") ? String(body?.observacao || "").trim() || undefined : previousMeta.observacao,
      scheduledAt: Object.prototype.hasOwnProperty.call(body, "scheduledAt") ? String(body?.scheduledAt || "").trim() || undefined : previousMeta.scheduledAt,
      startedAt: Object.prototype.hasOwnProperty.call(body, "startedAt") ? String(body?.startedAt || "").trim() || undefined : previousMeta.startedAt,
      finishedAt: Object.prototype.hasOwnProperty.call(body, "finishedAt") ? String(body?.finishedAt || "").trim() || undefined : previousMeta.finishedAt,
      arrivedViaForwarder: Object.prototype.hasOwnProperty.call(body, "arrivedViaForwarder")
        ? parseBoolean(body?.arrivedViaForwarder, false)
        : Boolean(previousMeta.arrivedViaForwarder),
      arrivalDate: Object.prototype.hasOwnProperty.call(body, "arrivalDate")
        ? String(body?.arrivalDate || "").trim() || undefined
        : previousMeta.arrivalDate,
      transitario: Object.prototype.hasOwnProperty.call(body, "transitario")
        ? String(body?.transitario || "").trim() || undefined
        : previousMeta.transitario,
      trackingCode: Object.prototype.hasOwnProperty.call(body, "trackingCode")
        ? String(body?.trackingCode || "").trim() || undefined
        : previousMeta.trackingCode,
      readyForDelivery: Object.prototype.hasOwnProperty.call(body, "readyForDelivery")
        ? parseBoolean(body?.readyForDelivery, false)
        : autoReadyForDelivery ?? Boolean(previousMeta.readyForDelivery),
      deliveryMethod: nextDeliveryMethod,
      saoMiguelPortCall: Object.prototype.hasOwnProperty.call(body, "saoMiguelPortCall")
        ? normalizeSaoMiguelPortCall(body?.saoMiguelPortCall)
        : previousMeta.saoMiguelPortCall,
      deliveredAt: deliveredAtValue || undefined,
      workflowTransitions: previousMeta.workflowTransitions,
      workflowStatus: previousMeta.workflowStatus,
    }, requestedWorkflowStatus, {
      origin: "queue",
      message: hasDeliveredFlag
        ? (requestedDelivered
          ? `Jangada marcada como entregue (${nextDeliveryMethod || "método por definir"}).`
          : "Entrega anulada; jangada voltou a estar pendente de entrega.")
        : `Workflow da estação atualizado para ${requestedWorkflowStatus}.`,
      user: (Object.prototype.hasOwnProperty.call(body, "tecnico") ? String(body?.tecnico || "").trim() : previousMeta.tecnico) || "sistema",
    }) satisfies QueueMeta;

    const expectedDeliveryDate = Object.prototype.hasOwnProperty.call(body, "expectedDeliveryDate")
      ? (String(body?.expectedDeliveryDate || "").trim() ? new Date(String(body?.expectedDeliveryDate)) : null)
      : before.dataPrevistaEntrega;

    if (status === "aguardar" && APP_CONFIG.theme !== 'deluxe') {
      const stationIdForRuleCheck = enforcedServiceStationId || Number(before.serviceStationId || 0) || null;
      const acoresAllowed = await isAcoresServiceStation(stationIdForRuleCheck);
      if (!acoresAllowed) {
        return NextResponse.json(
          { error: "Só é permitido manter/colocar estado 'aguardar inspeção' na estação dos Açores." },
          { status: 403 },
        );
      }
    }

    const updated = await prisma.serviceStationQueue.update({
      where: { id },
      data: {
        status,
        observacoes: toMetaJson(nextMeta),
        dataPrevistaEntrega: expectedDeliveryDate,
        ...(enforcedServiceStationId
          ? { serviceStationId: enforcedServiceStationId }
          : {}),
      },
    });

    const linkedOrderId = updated.ordemServicoId || before.ordemServicoId || null;
    if (linkedOrderId) {
      const beforeOrder = await prisma.ordemServico.findUnique({ where: { id: linkedOrderId } });
      if (beforeOrder) {
        const orderMeta = parseOrdemServicoMeta(beforeOrder.metadados);
        const nextOrderStatus = mapWorkflowStatusToOrderStatus(requestedWorkflowStatus);

        let finalNumeroOrdem = beforeOrder.numeroOrdem;
        let convertedLogMessage = "";
        if (beforeOrder.numeroOrdem.startsWith("OS-") && nextOrderStatus === "em_progresso") {
          finalNumeroOrdem = await generateNumeroOrdem(beforeOrder.dataPrevista || expectedDeliveryDate || new Date());
          convertedLogMessage = `Número de ordem convertido de ${beforeOrder.numeroOrdem} para ${finalNumeroOrdem} devido ao início da inspeção.`;
        }

        let nextOrderMeta: OrdemServicoMeta = appendWorkflowTransition({
          ...orderMeta,
          origem: (orderMeta.origem || "service_station") as string,
          queueId: updated.id,
          observacao: nextMeta.observacao || orderMeta.observacao,
        }, requestedWorkflowStatus, {
          origin: "queue",
          message: convertedLogMessage
            ? `${convertedLogMessage} (Workflow sincronizado a partir da estação para ${requestedWorkflowStatus}.)`
            : `Workflow sincronizado a partir da estação para ${requestedWorkflowStatus}.`,
          user: nextMeta.tecnico || "sistema",
        });

        if (convertedLogMessage) {
          nextOrderMeta = appendOrdemServicoLog(nextOrderMeta, {
            type: "STATUS",
            message: convertedLogMessage,
            user: "sistema",
          });
        }

        await prisma.ordemServico.update({
          where: { id: linkedOrderId },
          data: {
            numeroOrdem: finalNumeroOrdem,
            status: nextOrderStatus,
            ...(enforcedServiceStationId
              ? { serviceStationId: enforcedServiceStationId }
              : {}),
            tecnicoResponsavel: nextMeta.tecnico || beforeOrder.tecnicoResponsavel,
            descricao: nextMeta.observacao || beforeOrder.descricao,
            dataPrevista: expectedDeliveryDate,
            dataInicio: status === "progresso" ? beforeOrder.dataInicio || new Date() : beforeOrder.dataInicio,
            dataConclusao: status === "finalizada" ? beforeOrder.dataConclusao || new Date() : beforeOrder.dataConclusao,
            metadados: toOrdemServicoMetaJson(nextOrderMeta),
          },
        });

        if (convertedLogMessage) {
          await prisma.ordemServicoLog.create({
            data: {
              ordemServicoId: linkedOrderId,
              type: "STATUS",
              message: convertedLogMessage,
              user: "sistema",
            },
          });
        }

        await syncPedidoAssistenciaFromOrdem(linkedOrderId);
      }
    } else {
      const ensuredOrder = await ensureOrderForServiceStation({
        jangadaId: before.jangadaId,
        queueId: updated.id,
        status,
        workflowStatus: requestedWorkflowStatus,
        tecnicoResponsavel: nextMeta.tecnico,
        observacao: nextMeta.observacao,
        expectedDeliveryDate,
      });

      if (ensuredOrder) {
        await prisma.serviceStationQueue.update({
          where: { id: updated.id },
          data: { ordemServicoId: ensuredOrder.id },
        });

        if (enforcedServiceStationId) {
          await prisma.ordemServico.update({
            where: { id: ensuredOrder.id },
            data: { serviceStationId: enforcedServiceStationId },
          });
        }
      }
    }

    if (enforcedServiceStationId) {
      await prisma.jangada.update({
        where: { id: before.jangadaId },
        data: { serviceStationId: enforcedServiceStationId },
      });
    }

    if (requestedDelivered) {
      await clearEntregaAgendaEvent({ jangadaId: before.jangadaId });
    } else if (hasDeliveredFlag && wasDeliveredBefore && expectedDeliveryDate) {
      await syncEntregaAgendaEvent({
        jangadaId: before.jangadaId,
        dataPrevistaEntrega: expectedDeliveryDate,
      });
    } else if (status === "finalizada") {
      await clearEntregaAgendaEvent({ jangadaId: before.jangadaId });
    } else if (expectedDeliveryDate) {
      await syncEntregaAgendaEvent({
        jangadaId: before.jangadaId,
        dataPrevistaEntrega: expectedDeliveryDate,
      });
    }

    if (status === "finalizada" && !wasFinalizedBefore) {
      try {
        await syncNextInspectionAgenda({
          jangadaId: before.jangadaId,
          tecnico: nextMeta.tecnico,
        });
      } catch (agendaError) {
        console.error("Falha ao sincronizar próxima inspeção na agenda:", agendaError);
      }
    }

    await logAuditoria({
      tabela: "ServiceStationQueue",
      tipoOperacao: "UPDATE",
      idRegisto: id,
      descricao: hasDeliveredFlag
        ? `Entrega ${requestedDelivered ? "registada" : "anulada"} na estação de serviço (status=${status})`
        : `Atualização da estação de serviço (status=${status})`,
      dadosAntes: before,
      dadosDepois: updated,
    });

    if (requestedDelivered && !wasDeliveredBefore) {
      await tryNotifySms(() =>
        notifyJangadaEnviada(before.jangadaId, {
          transitario: nextMeta.transitario,
          trackingCode: nextMeta.trackingCode,
        }),
      );
    }

    if (status === "finalizada" && !wasFinalizedBefore) {
      await tryNotifySms(() =>
        notifyJangadaProntaEntrega(before.jangadaId, { transitario: nextMeta.transitario }),
      );
    }

    const all = await listQueue(access, activeStationId);
    const item = all.find((q) => q.queueId === id);
    return NextResponse.json(item || null);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao atualizar estação." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }

    const url = new URL(req.url);
    const activeStationId = resolveActiveServiceStationId(req, access);
    const id = Number(url.searchParams.get("id"));
    const raftId = url.searchParams.get("raftId");
    const serial = url.searchParams.get("serial");
    const before = Number.isFinite(id) && id > 0
      ? await prisma.serviceStationQueue.findUnique({ where: { id } })
      : await resolveQueueTarget({ raftId, serial });
    if (!before) {
      return NextResponse.json({ error: "Entrada não encontrada." }, { status: 404 });
    }

    if (activeStationId && Number(before.serviceStationId || 0) !== Number(activeStationId)) {
      return NextResponse.json({ error: "Sem permissão para remover esta entrada." }, { status: 403 });
    }

    if (!activeStationId && !access.isAdmin && !access.allowedStationIds.includes(Number(before.serviceStationId || 0))) {
      return NextResponse.json({ error: "Sem permissão para remover esta entrada." }, { status: 403 });
    }

    // Uma entrega registada e registo contabilistico: remove-la destroys o
    // historico de entrega e a data de saida. obriga-se a anular a entrega
    // primeiro, que e o unico caminho que preserva o rasto.
    if (isQueueRowDelivered(before)) {
      return NextResponse.json(
        {
          error: "Não é possível remover uma jangada já entregue. Anule primeiro a entrega.",
          delivered: true,
        },
        { status: 409 },
      );
    }

    const targetId = before.id;

    await prisma.serviceStationQueue.delete({ where: { id: targetId } });

    await clearEntregaAgendaEvent({ jangadaId: before.jangadaId });

    await logAuditoria({
      tabela: "ServiceStationQueue",
      tipoOperacao: "DELETE",
      idRegisto: targetId,
      descricao: "Remoção da entrada da estação de serviço",
      dadosAntes: before,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao remover entrada da estação." }, { status: 400 });
  }
}
