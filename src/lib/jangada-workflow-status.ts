import prisma from "@/lib/prisma";

export type JangadaWorkflowState =
  | "SEM_ESTADO"
  | "RECEIONADA"
  | "EM_INSPECAO"
  | "FINALIZADA"
  | "OUTRO";

export type JangadaWorkflowStatus = {
  state: JangadaWorkflowState;
  labelPt: string;
  dataHora?: Date | null;
  queueStatus?: string | null;
  hasActiveQueue: boolean;
};

function parseMeta(raw?: string | null): Record<string, unknown> {
  const text = String(raw || "").trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Legacy: plain text
    return { observacao: text };
  }
  return {};
}

function isDelivered(meta: Record<string, unknown>) {
  return Boolean(meta.deliveredAt) || Boolean(meta.entregue);
}

export async function getJangadaWorkflowStatus(jangadaId: number): Promise<JangadaWorkflowStatus> {
  const rows = await prisma.serviceStationQueue.findMany({
    where: { jangadaId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }, { createdAt: "desc" }],
  });

  if (!rows || rows.length === 0) {
    return {
      state: "SEM_ESTADO",
      labelPt: "Sem estado na estação",
      dataHora: null,
      queueStatus: null,
      hasActiveQueue: false,
    };
  }

  const active = rows.find((row) => !isDelivered(parseMeta(row.observacoes))) || null;

  if (!active) {
    // All delivered/finalized; show last one as finalizada
    const last = rows[0];
    const meta = parseMeta(last.observacoes);
    const finishedAt = meta.finishedAt ? new Date(String(meta.finishedAt)) : null;
    const dataHora = finishedAt || last.updatedAt || last.createdAt;
    return {
      state: "FINALIZADA",
      labelPt: "Pronta para entrega",
      dataHora: dataHora ? new Date(dataHora) : null,
      queueStatus: last.status || null,
      hasActiveQueue: false,
    };
  }

  const meta = parseMeta(active.observacoes);
  const status = String(active.status || "").trim().toLowerCase();
  const startedAt = meta.startedAt ? new Date(String(meta.startedAt)) : null;

  if (status === "progresso" || startedAt) {
    return {
      state: "EM_INSPECAO",
      labelPt: "Em inspeção",
      dataHora: startedAt || active.updatedAt || active.createdAt,
      queueStatus: active.status || null,
      hasActiveQueue: true,
    };
  }

  if (status === "a_secar" || status === "finalizada" || status === "pronta" || status === "pronta_entrega" || status === "entregue") {
    return {
      state: "FINALIZADA",
      labelPt: "Pronta para entrega",
      dataHora: startedAt || active.updatedAt || active.createdAt,
      queueStatus: active.status || null,
      hasActiveQueue: true,
    };
  }

  // aguardar, agendada, em_espera etc
  return {
    state: "RECEIONADA",
    labelPt: "Rececionada na estação",
    dataHora: active.dataChegada ? new Date(active.dataChegada) : (active.createdAt || active.updatedAt),
    queueStatus: active.status || null,
    hasActiveQueue: true,
  };
}
