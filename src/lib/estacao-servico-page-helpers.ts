import type { QueueStatus, RaftOption, ServiceStationQueueItem } from "@/types/estacao-servico-page";
import { STATUS_BADGE_CLASSES, STATUS_LABELS } from "@/types/estacao-servico-page";

export function normalizeSearchText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function getRaftShipLabel(raft: Partial<RaftOption>) {
  return raft.linkedShipName || raft.shipNameManual || raft.owner || "Sem navio";
}

export function getRaftDisplayLabel(raft: Partial<RaftOption>) {
  return `${raft.serial || "Sem serial"} · ${getRaftShipLabel(raft)} · ${`${raft.brand || ""} ${raft.model || ""}`.trim() || "Modelo não definido"}`;
}

export function isToday(value?: string | null) {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const now = new Date();
  return parsed.getDate() === now.getDate() && parsed.getMonth() === now.getMonth() && parsed.getFullYear() === now.getFullYear();
}

export function daysUntil(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startTarget = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return Math.round((startTarget.getTime() - startToday.getTime()) / (1000 * 60 * 60 * 24));
}

export function getExpectedDeliveryTone(value?: string | null) {
  const diff = daysUntil(value);
  if (diff === null) return "text-slate-500";
  if (diff < 0) return "text-rose-700";
  if (diff <= 3) return "text-amber-700";
  return "text-emerald-700";
}

export function getExpectedDeliveryMeta(value?: string | null) {
  const diff = daysUntil(value);

  if (diff === null) {
    return {
      label: "Sem prazo",
      className: "border-slate-200 bg-slate-100 text-slate-600",
    };
  }

  if (diff < 0) {
    return {
      label: `${Math.abs(diff)}d em atraso`,
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  if (diff === 0) {
    return {
      label: "Entrega hoje",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  if (diff <= 3) {
    return {
      label: `${diff}d restantes`,
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: `${diff}d restantes`,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
}

export function getBoardStatusPresentation(item: ServiceStationQueueItem) {
  if (item.delivered) {
    return {
      label: "Entregue",
      className: "border-violet-200 bg-violet-100 text-violet-700",
    };
  }

  return {
    label: STATUS_LABELS[item.status],
    className: STATUS_BADGE_CLASSES[item.status],
  };
}

export function getNextStatusAction(status: QueueStatus) {
  if (status === "aguardar") return { next: "agendada" as const, label: "Agendar" };
  if (status === "agendada") return { next: "progresso" as const, label: "Iniciar" };
  // Etapa de secagem removida: de "Em inspeção" passa-se já a "Pronta para
  // entrega". O ramo `a_secar` mantém-se apenas para registos legados.
  if (status === "progresso") return { next: "finalizada" as const, label: "Concluir inspeção" };
  if (status === "a_secar") return { next: "finalizada" as const, label: "Concluir inspeção" };
  return null;
}

export function getPreviousStatusAction(status: QueueStatus) {
  if (status === "agendada") return { prev: "aguardar" as const, label: "Voltar a aguardar" };
  if (status === "progresso") return { prev: "agendada" as const, label: "Voltar a agendada" };
  if (status === "a_secar") return { prev: "progresso" as const, label: "Voltar à inspeção" };
  if (status === "finalizada") return { prev: "progresso" as const, label: "Reabrir trabalho" };
  return null;
}

export async function safeJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return [] as T;
  return JSON.parse(text) as T;
}
