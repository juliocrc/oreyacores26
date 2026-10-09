import prisma from "@/lib/prisma";
import { appendWorkflowTransition, mapQueueStatusToWorkflowStatus } from "@/lib/ordens-servico";

export type InspectionQueuePhase = "start" | "finish";

type QueueMeta = Record<string, unknown>;

function parseMeta(raw?: string | null): QueueMeta {
  const text = String(raw || "").trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as QueueMeta;
    }
  } catch {
    // Legado: `observacoes` era texto simples.
    return { observacao: text };
  }
  return {};
}

function isDelivered(meta: QueueMeta) {
  return Boolean(meta.deliveredAt);
}

const STATUS_RANK: Record<string, number> = {
  aguardar: 0,
  agendada: 1,
  progresso: 2,
  a_secar: 3,
  finalizada: 4,
};

function rank(status: unknown) {
  return STATUS_RANK[String(status || "").trim().toLowerCase()] ?? 0;
}

/**
 * Mantém a fila da estação de serviço alinhada com a checklist de inspeção:
 *
 * - `start`   → a jangada passa a "Em inspeção" (`progresso`).
 * - `finish`  → a jangada passa a "Prontas para entrega" (`finalizada`).
 *
 * Reutiliza a entrada ativa (não entregue) da jangada para nunca criar uma
 * segunda linha no quadro. Só cria uma entrada nova quando a jangada ainda não
 * está rececionada e tem estação de serviço associada.
 */
export async function syncServiceStationQueueForInspection(params: {
  jangadaId: number;
  phase: InspectionQueuePhase;
  serviceStationId?: number | null;
  tecnico?: string | null;
  mensagem?: string | null;
}): Promise<number | null> {
  const jangadaId = Number(params.jangadaId);
  if (!Number.isFinite(jangadaId) || jangadaId <= 0) return null;

  const targetStatus = params.phase === "finish" ? "finalizada" : "progresso";
  const nowIso = new Date().toISOString();

  const rows = await prisma.serviceStationQueue.findMany({
    where: { jangadaId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });

  let target = rows.find((row) => !isDelivered(parseMeta(row.observacoes))) || null;

  let created = false;
  if (!target) {
    let serviceStationId = Number(params.serviceStationId) || null;
    if (!serviceStationId) {
      const jangada = await prisma.jangada.findUnique({
        where: { id: jangadaId },
        select: { serviceStationId: true },
      });
      serviceStationId = jangada?.serviceStationId ?? null;
    }
    if (!serviceStationId) return null;

    target = await prisma.serviceStationQueue.create({
      data: {
        jangadaId,
        serviceStationId,
        status: targetStatus,
        observacoes: JSON.stringify({}),
      },
    });
    created = true;
  }

  // Nunca recuar o estado: se a jangada já está mais avançada no fluxo
  // (ex.: a secar ou pronta para entrega), o início de uma checklist não a faz
  // voltar atrás.
  if (!created && rank(target.status) > rank(targetStatus)) {
    return target.id;
  }

  const previousMeta = parseMeta(target.observacoes);
  const workflowStatus =
    mapQueueStatusToWorkflowStatus(targetStatus) || "inspecao_em_curso";

  const nextMeta = appendWorkflowTransition(
    {
      ...previousMeta,
      ...(params.tecnico ? { tecnico: params.tecnico } : {}),
      ...(params.phase === "finish"
        ? { finishedAt: nowIso, readyForDelivery: true }
        : { startedAt: previousMeta.startedAt || nowIso }),
    },
    workflowStatus,
    {
      origin: "inspecao_checklist",
      at: nowIso,
      user: params.tecnico || "sistema",
      message:
        params.mensagem ||
        (params.phase === "finish"
          ? "Inspeção finalizada; jangada pronta para entrega."
          : "Inspeção iniciada; trabalho em curso."),
    },
  );

  await prisma.serviceStationQueue.update({
    where: { id: target.id },
    data: {
      status: targetStatus,
      observacoes: JSON.stringify(nextMeta),
    },
  });

  return target.id;
}