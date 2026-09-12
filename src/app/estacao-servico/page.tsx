"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useRef } from "react";
import { Suspense } from "react";
import { FileText, MessageSquare, MessageCircle, Settings, History } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDate, formatDateTimeShort, toLocalISO } from "@/lib/date-utils";
import type {
  ActiveStationPayload,
  QueueStatus,
  ServiceStationQueueItem,
  RaftOption,
  TecnicoOption,
  TecnicosPayload,
} from "@/types/estacao-servico-page";
import {
  DELIVERY_METHOD_LABELS,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  BOARD_COLUMNS,
} from "@/types/estacao-servico-page";
import {
  normalizeSearchText,
  getRaftShipLabel,
  getRaftDisplayLabel,
  daysUntil,
  isToday,
  getExpectedDeliveryTone,
  getExpectedDeliveryMeta,
  getBoardStatusPresentation,
  getNextStatusAction,
  getPreviousStatusAction,
  safeJson,
} from "@/lib/estacao-servico-page-helpers";
import type { SmsConfig } from "@/lib/sms-config";
import { getTestRecommendations } from "@/modules/rafts/testRules";

function KpiCard({
  title,
  value,
  helper,
  tone,
}: {
  title: string;
  value: string | number;
  helper: string;
  tone: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
      <p className="mt-2 text-xs text-slate-600">{helper}</p>
    </div>
  );
}

type JangadaHistoricoPayload = {
  jangada: {
    id: number;
    serial: string;
    brand?: string | null;
    model?: string | null;
    shipNameManual?: string | null;
    owner?: string | null;
  };
  rececoes: Array<{
    queueId: number;
    status: string;
    deliveredAt: string | null;
    dataChegada: string;
    dataPrevistaEntrega: string | null;
    estacao: string | null;
  }>;
  inspecoes: Array<{
    id: number;
    certificadoNumero: string;
    dataInspecao: string;
    dataProxInspecao: string | null;
    status: string;
    navioNome: string;
  }>;
};

const HISTORICO_QUEUE_LABELS: Record<string, string> = {
  aguardar: "Aguardar inspeção",
  agendada: "Agendada",
  progresso: "Em inspeção",
  a_secar: "Secagem",
  finalizada: "Pronta para entrega",
  Aguardando: "Aguardar inspeção",
  EmInspecao: "Em inspeção",
  Concluida: "Pronta para entrega",
  Entregue: "Entregue",
};

function formatQueueStatusLabel(raw: string) {
  return HISTORICO_QUEUE_LABELS[raw] || raw || "—";
}

export default function EstacaoServicoPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500">A carregar estação de serviço...</div>}>
      <EstacaoServicoContent />
    </Suspense>
  );
}

function EstacaoServicoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [loading, setLoading] = useState(true);
  const [savingStation, setSavingStation] = useState(false);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueSaving, setQueueSaving] = useState(false);
  const [tecnicosLoading, setTecnicosLoading] = useState(false);
  const [data, setData] = useState<ActiveStationPayload | null>(null);
  const [queueItems, setQueueItems] = useState<ServiceStationQueueItem[]>([]);
  const [rafts, setRafts] = useState<RaftOption[]>([]);
  const [tecnicos, setTecnicos] = useState<TecnicoOption[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [raftsSearch, setRaftsSearch] = useState("");
  const [raftQuickSearch, setRaftQuickSearch] = useState("");
  const [serialQuick, setSerialQuick] = useState("");
  const [reportMonth, setReportMonth] = useState(() => new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(() => new Date().getFullYear());
  const [reportLoading, setReportLoading] = useState(false);
  const [boardSearch, setBoardSearch] = useState("");
  const [boardTecnicoFilter, setBoardTecnicoFilter] = useState("todos");
  const [boardOnlyUrgent, setBoardOnlyUrgent] = useState(false);
  const [boardOnlyReady, setBoardOnlyReady] = useState(false);
  const [selectedRaftId, setSelectedRaftId] = useState("");
  const serialQuickRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "/" || e.key === "F2") && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        serialQuickRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  const [entryTecnico, setEntryTecnico] = useState("");
  const [entryObservacao, setEntryObservacao] = useState("");
  const [entryExpectedDeliveryDate, setEntryExpectedDeliveryDate] = useState("");
  const [activeTab, setActiveTab] = useState<"board" | "table" | "list">("board");
  const [isReceptionModalOpen, setIsReceptionModalOpen] = useState(false);
  const [draggedQueueId, setDraggedQueueId] = useState<number | null>(null);

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [schedulingItem, setSchedulingItem] = useState<ServiceStationQueueItem | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTecnico, setScheduleTecnico] = useState("");
  const [scheduleNote, setScheduleNote] = useState("");

  const [historicoItem, setHistoricoItem] = useState<ServiceStationQueueItem | null>(null);
  const [historicoData, setHistoricoData] = useState<JangadaHistoricoPayload | null>(null);
  const [historicoLoading, setHistoricoLoading] = useState(false);

  const [smsConfig, setSmsConfig] = useState<SmsConfig | null>(null);
  const [smsConfigOpen, setSmsConfigOpen] = useState(false);
  const [smsBusyRaftId, setSmsBusyRaftId] = useState<number | null>(null);
  const [smsDraft, setSmsDraft] = useState<SmsConfig | null>(null);
  const [smsHistoryRaftId, setSmsHistoryRaftId] = useState<number | null>(null);
  const [lembreteModal, setLembreteModal] = useState<{
    raftId: number;
    serial: string;
    name: string;
    phone: string;
    message: string;
    dataProxInspecao?: string | null;
  } | null>(null);
  const [lembreteText, setLembreteText] = useState("");
  const [lembreteChannel, setLembreteChannel] = useState<"sms" | "whatsapp">("sms");
  const [lembreteSending, setLembreteSending] = useState(false);
  const [lembreteLoading, setLembreteLoading] = useState(false);

  const handleOpenScheduleModal = (item: ServiceStationQueueItem) => {
    setSchedulingItem(item);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const localISOTime = toLocalISO(tomorrow);
    
    setScheduleDate(localISOTime);
    setScheduleTecnico(item.tecnico || "");
    setScheduleNote(item.observacao || "");
    setIsScheduleModalOpen(true);
  };

  const handleSaveSchedule = async () => {
    if (!schedulingItem) return;
    setQueueSaving(true);
    setError("");
    setSuccess("");

    try {
      const parsedDate = new Date(scheduleDate);
      if (isNaN(parsedDate.getTime())) {
        throw new Error("Por favor, introduza uma data e hora válidas.");
      }

      // 1. Grava o agendamento na API da Agenda/Calendário
      const agendaPayload = {
        title: `Inspeção: ${schedulingItem.shipName || "Jangada"} - ${schedulingItem.serial}`,
        raftSerial: schedulingItem.serial,
        date: parsedDate.toISOString(),
        responsavel: scheduleTecnico || "Operador",
        status: "scheduled",
        type: "Inspeção",
        inspectionType: "outro"
      };

      const agendaRes = await fetch("/api/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agendaPayload)
      });

      if (!agendaRes.ok) {
        const errorJson = await agendaRes.json().catch(() => ({}));
        throw new Error(errorJson.error || "Erro ao criar agendamento na agenda.");
      }

      // 2. Transita o estado na fila da estação de serviço
      const queueBody = {
        id: schedulingItem.queueId,
        status: "agendada",
        tecnico: scheduleTecnico || undefined,
        observacao: scheduleNote || undefined,
        scheduledAt: parsedDate.toISOString(),
        expectedDeliveryDate: parsedDate.toISOString()
      };

      const queueRes = await fetch("/api/service-station", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queueBody)
      });

      if (!queueRes.ok) {
        const errorJson = await queueRes.json().catch(() => ({}));
        throw new Error(errorJson.error || "Erro ao atualizar a fila da estação de serviço.");
      }

      setIsScheduleModalOpen(false);
      setSchedulingItem(null);
      setSuccess("Inspeção agendada com sucesso!");
      await loadStationQueueAndRafts();
    } catch (err: any) {
      setError(err?.message || "Erro ao agendar.");
    } finally {
      setQueueSaving(false);
    }
  };

  const fetchActiveStation = async () => {
    const res = await fetch("/api/active-service-station", { cache: "no-store" });
    if (!res.ok) {
      const payload = await safeJson<{ error?: string }>(res).catch(() => null);
      throw new Error(payload?.error || "Falha ao ler estação ativa.");
    }
    const payload = await safeJson<ActiveStationPayload>(res);
    setData(payload);
    return payload;
  };

  const loadStationQueueAndRafts = async () => {
    setQueueLoading(true);
    try {
      const [queueRes, raftsRes, smsConfigRes] = await Promise.all([
        fetch("/api/service-station", { cache: "no-store" }),
        fetch("/api/jangadas?scope=all", { cache: "no-store" }),
        fetch("/api/service-station/sms/config", { cache: "no-store" }),
      ]);

      if (!queueRes.ok) {
        const payload = await safeJson<{ error?: string }>(queueRes).catch(() => null);
        throw new Error(payload?.error || "Falha ao carregar a fila da estação.");
      }

      if (!raftsRes.ok) {
        const payload = await safeJson<{ error?: string }>(raftsRes).catch(() => null);
        throw new Error(payload?.error || "Falha ao carregar jangadas.");
      }

      const queuePayload = await safeJson<ServiceStationQueueItem[]>(queueRes);
      const raftsPayload = await safeJson<RaftOption[]>(raftsRes);
      setQueueItems(Array.isArray(queuePayload) ? queuePayload : []);
      setRafts(Array.isArray(raftsPayload) ? raftsPayload : []);
      if (smsConfigRes.ok) {
        const smsPayload = await safeJson<{ config?: SmsConfig }>(smsConfigRes).catch(() => null);
        if (smsPayload?.config) setSmsConfig(smsPayload.config);
      }
    } catch (err: any) {
      setError(err?.message || "Não foi possível carregar os dados da estação.");
    } finally {
      setQueueLoading(false);
    }
  };

  const handleOpenLembrete = async (item: ServiceStationQueueItem) => {
    setError("");
    setSuccess("");
    setLembreteLoading(true);
    setLembreteSending(false);
    setLembreteChannel("sms");
    try {
      const res = await fetch(
        `/api/service-station/sms/lembrete?raftId=${item.raftId}&dataProxInspecao=${encodeURIComponent(item.dataProxInspecao || "")}`,
        { cache: "no-store" },
      );
      const payload = await safeJson<{ ok?: boolean; error?: string; message?: string; name?: string; phone?: string; serial?: string }>(res).catch(() => ({} as { ok?: boolean; error?: string; message?: string; name?: string; phone?: string; serial?: string }));
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || "Não foi possível preparar o lembrete.");
      }
      setLembreteModal({ raftId: item.raftId, serial: payload.serial || "", name: payload.name || "", phone: payload.phone || "", message: payload.message || "", dataProxInspecao: item.dataProxInspecao || null });
      setLembreteText(payload.message || "");
    } catch (err: any) {
      setError(err?.message || "Não foi possível preparar o lembrete.");
    } finally {
      setLembreteLoading(false);
    }
  };

  const handleSendLembrete = async (channel: "sms" | "whatsapp") => {
    if (!lembreteModal) return;
    setLembreteChannel(channel);
    setLembreteSending(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/service-station/sms/lembrete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raftId: lembreteModal.raftId,
          channel,
          dataProxInspecao: lembreteModal.dataProxInspecao || null,
          text: lembreteText.trim() || undefined,
        }),
      });
      const payload = await safeJson<{ ok?: boolean; error?: string; url?: string; message?: string }>(res).catch(() => ({} as { ok?: boolean; error?: string; url?: string; message?: string }));
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || "Falha ao enviar o lembrete.");
      }
      if (channel === "whatsapp" && payload.url) {
        const win = window.open(payload.url, "_blank", "noopener,noreferrer");
        if (!win) {
          window.location.href = payload.url;
        }
        setSuccess("Mensagem WhatsApp aberta para enviar ao cliente.");
      } else {
        setSuccess("Lembrete SMS enviado ao cliente.");
      }
      setLembreteModal(null);
      await loadStationQueueAndRafts();
    } catch (err: any) {
      setError(err?.message || "Não foi possível enviar o lembrete.");
    } finally {
      setLembreteSending(false);
    }
  };

  const handleSaveSmsConfig = async (next: SmsConfig) => {
    try {
      const res = await fetch("/api/service-station/sms/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const payload = await safeJson<{ config?: SmsConfig; error?: string }>(res).catch(() => ({} as { config?: SmsConfig; error?: string }));
      if (!res.ok || !payload?.config) {
        throw new Error(payload?.error || "Falha ao guardar configuração SMS.");
      }
      setSmsConfig(payload.config);
      setSmsConfigOpen(false);
      setSuccess("Configuração SMS guardada.");
    } catch (err: any) {
      setError(err?.message || "Não foi possível guardar a configuração SMS.");
    }
  };

  const lembreteDueItems = useMemo(() => {
    const days = smsConfig?.lembreteValidadeDias ?? 7;
    return queueItems
      .filter((item) => !item.delivered && item.dataProxInspecao && smsConfig?.enabled.lembrete_validade !== false)
      .map((item) => {
        const diff = daysUntil(item.dataProxInspecao);
        return { item, diff };
      })
      .filter(({ diff }) => diff !== null && diff >= 0 && diff <= days)
      .filter(({ item }) => !(item.smsNotifications || []).some((log) => log.type === "lembrete_validade" && log.status === "sent"))
      .sort((a, b) => (a.diff ?? 0) - (b.diff ?? 0));
  }, [queueItems, smsConfig]);

  const loadTecnicos = async () => {
    setTecnicosLoading(true);
    try {
      const res = await fetch("/api/tecnicos?includeInactive=false", { cache: "no-store" });
      if (!res.ok) {
        const payload = await safeJson<{ error?: string }>(res).catch(() => null);
        throw new Error(payload?.error || "Falha ao carregar técnicos.");
      }

      const payload = await safeJson<TecnicosPayload>(res);
      const unique = new Map<number, TecnicoOption>();

      const pushTech = (tech?: TecnicoOption | null) => {
        if (!tech?.id || !tech?.nome) return;
        unique.set(tech.id, tech);
      };

      if (payload.activeStationId) {
        payload.stations.find((station) => station.id === payload.activeStationId)?.tecnicos.forEach(pushTech);
      } else {
        payload.stations.forEach((station) => station.tecnicos.forEach(pushTech));
        (payload.unassigned || []).forEach(pushTech);
      }

      setTecnicos(
        Array.from(unique.values()).sort((a, b) =>
          String(a.nome || "").localeCompare(String(b.nome || ""), "pt", { sensitivity: "base" }),
        ),
      );
    } catch (err: any) {
      setError(err?.message || "Não foi possível carregar técnicos.");
    } finally {
      setTecnicosLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        setLoading(true);
        await Promise.all([fetchActiveStation(), loadStationQueueAndRafts(), loadTecnicos()]);
      } catch (err: any) {
        if (active) setError(err?.message || "Falha ao carregar a estação de serviço.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const handleSelectStation = async (stationId: number | null) => {
    setSavingStation(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/active-service-station", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationId }),
      });

      if (!res.ok) {
        const payload = await safeJson<{ error?: string }>(res).catch(() => null);
        throw new Error(payload?.error || "Erro ao selecionar a estação.");
      }

      await Promise.all([fetchActiveStation(), loadStationQueueAndRafts(), loadTecnicos()]);
      setSuccess(stationId ? "Estação ativa atualizada." : "Visão global ativada.");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Não foi possível trocar a estação.");
    } finally {
      setSavingStation(false);
    }
  };

  const queueByRaftId = useMemo(() => {
    const activeQueue = new Map<number, ServiceStationQueueItem>();
    for (const item of queueItems) {
      if (!item.delivered) {
        activeQueue.set(item.raftId, item);
      }
    }
    return activeQueue;
  }, [queueItems]);

  const activeQueueCount = useMemo(
    () => queueItems.filter((item) => !item.delivered).length,
    [queueItems],
  );

  const availableRafts = useMemo(() => {
    return rafts
      .sort((a, b) => getRaftDisplayLabel(a).localeCompare(getRaftDisplayLabel(b), "pt", { sensitivity: "base" }));
  }, [rafts]);

  const selectedRaft = useMemo(
    () => availableRafts.find((raft) => String(raft.id) === String(selectedRaftId)) || null,
    [availableRafts, selectedRaftId],
  );

  const filteredAvailableRafts = useMemo(() => {
    const term = normalizeSearchText(raftQuickSearch);
    if (!term) return availableRafts;

    return availableRafts
      .filter((raft) => {
        const serial = normalizeSearchText(raft.serial);
        const ship = normalizeSearchText(getRaftShipLabel(raft));
        const brandModel = normalizeSearchText(`${raft.brand || ""} ${raft.model || ""}`);
        const owner = normalizeSearchText(raft.owner);
        return serial.includes(term) || ship.includes(term) || brandModel.includes(term) || owner.includes(term);
      })
      .sort((a, b) => getRaftDisplayLabel(a).localeCompare(getRaftDisplayLabel(b), "pt", { sensitivity: "base" }));
  }, [availableRafts, raftQuickSearch]);

  const filteredRafts = useMemo(() => {
    const term = normalizeSearchText(raftsSearch);
    const visible = rafts;
    if (!term) return visible;

    return visible.filter((raft) => {
      const serial = normalizeSearchText(raft.serial);
      const ship = normalizeSearchText(getRaftShipLabel(raft));
      const brandModel = normalizeSearchText(`${raft.brand || ""} ${raft.model || ""}`);
      const station = normalizeSearchText(raft.serviceStation?.nome || "");
      return serial.includes(term) || ship.includes(term) || brandModel.includes(term) || station.includes(term);
    });
  }, [rafts, raftsSearch]);

  const filteredQueueItems = useMemo(() => {
    const term = normalizeSearchText(boardSearch);

    return queueItems.filter((item) => {
      if (boardTecnicoFilter !== "todos" && normalizeSearchText(item.tecnico) !== normalizeSearchText(boardTecnicoFilter)) {
        return false;
      }

      if (boardOnlyUrgent && ((daysUntil(item.expectedDeliveryDate) ?? 999) > 3 || item.delivered)) {
        return false;
      }

      if (boardOnlyReady && !(item.readyForDelivery || item.status === "finalizada")) {
        return false;
      }

      if (!term) return true;

      const haystack = [
        item.serial,
        item.shipName,
        item.model,
        item.tecnico,
        item.observacao,
        STATUS_LABELS[item.status],
      ]
        .map((value) => normalizeSearchText(value))
        .join(" ");

      return haystack.includes(term);
    });
  }, [boardOnlyReady, boardOnlyUrgent, boardSearch, boardTecnicoFilter, queueItems]);

  const boardFilterIsActive = Boolean(boardSearch || boardTecnicoFilter !== "todos" || boardOnlyUrgent || boardOnlyReady);

  useEffect(() => {
    if (!selectedRaftId) return;
    if (!availableRafts.some((raft) => String(raft.id) === String(selectedRaftId))) {
      setSelectedRaftId("");
    }
  }, [availableRafts, selectedRaftId]);

  const boardItems = useMemo(() => {
    return BOARD_COLUMNS.map((column) => ({
      ...column,
      items: filteredQueueItems.filter((item) => {
        if (column.status === "entregues") {
          return item.delivered;
        }

        if (item.delivered) {
          return false;
        }

        if (column.status === "progresso") {
          return item.status === "progresso" || item.status === "a_secar";
        }

        return item.status === column.status;
      }),
    }));
  }, [filteredQueueItems]);

  const waitingInspectionCount = useMemo(
    () => queueItems.filter((item) => item.status === "aguardar").length,
    [queueItems],
  );
  const scheduledCount = useMemo(
    () => queueItems.filter((item) => item.status === "agendada").length,
    [queueItems],
  );
  const runningCount = useMemo(
    () => queueItems.filter((item) => item.status === "progresso" || item.status === "a_secar").length,
    [queueItems],
  );
  const completedCount = useMemo(
    () => queueItems.filter((item) => !item.delivered && item.status === "finalizada").length,
    [queueItems],
  );
  const deliveredCount = useMemo(
    () => queueItems.filter((item) => item.delivered).length,
    [queueItems],
  );
  const todayReceiptsCount = useMemo(
    () => queueItems.filter((item) => isToday(item.receivedAt)).length,
    [queueItems],
  );
  const urgentDeliveryCount = useMemo(
    () => queueItems.filter((item) => !item.delivered && (daysUntil(item.expectedDeliveryDate) ?? 999) <= 3).length,
    [queueItems],
  );
  const overdueDeliveryCount = useMemo(
    () => queueItems.filter((item) => !item.delivered && (daysUntil(item.expectedDeliveryDate) ?? 999) < 0).length,
    [queueItems],
  );
  const readyForDeliveryCount = useMemo(
    () => queueItems.filter((item) => !item.delivered && (item.readyForDelivery || item.status === "finalizada")).length,
    [queueItems],
  );

  const canReceiveOnCurrentContext = Boolean(data?.activeStationId || data?.activeStation || !data?.canViewAllStations);

  const handlePickRaft = (raft: RaftOption) => {
    setSelectedRaftId(String(raft.id));
    setRaftQuickSearch(getRaftDisplayLabel(raft));
  };

  const clearSelectedRaft = () => {
    setSelectedRaftId("");
    setRaftQuickSearch("");
  };

  const handleAddToQueue = async () => {
    const raftId = Number(selectedRaftId);
    if (!raftId || Number.isNaN(raftId)) return;

    setQueueSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/service-station", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raftId,
          status: "aguardar",
          tecnico: entryTecnico || undefined,
          observacao: entryObservacao || undefined,
          expectedDeliveryDate: entryExpectedDeliveryDate || undefined,
        }),
      });

      if (!res.ok) {
        const payload = await safeJson<{ error?: string }>(res).catch(() => null);
        throw new Error(payload?.error || "Falha ao rececionar jangada.");
      }

      clearSelectedRaft();
      setEntryTecnico("");
      setEntryObservacao("");
      setEntryExpectedDeliveryDate("");
      setIsReceptionModalOpen(false);
      await loadStationQueueAndRafts();
      setSuccess("Jangada rececionada com sucesso.");
    } catch (err: any) {
      setError(err?.message || "Não foi possível rececionar a jangada.");
    } finally {
      setQueueSaving(false);
    }
  };

  const handleUpdateQueueStatus = async (item: ServiceStationQueueItem, nextStatus: QueueStatus) => {
    if (item.status === nextStatus) return;

    setQueueSaving(true);
    setError("");
    setSuccess("");

    try {
      const nowIso = new Date().toISOString();
      const body: Record<string, unknown> = { id: item.queueId, status: nextStatus };

      if (nextStatus === "agendada" && !item.scheduledAt) body.scheduledAt = nowIso;
      if (nextStatus === "progresso" && !item.startedAt) body.startedAt = nowIso;
      if (nextStatus === "finalizada") body.finishedAt = nowIso;

      const res = await fetch("/api/service-station", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = await safeJson<{ error?: string }>(res).catch(() => null);
        throw new Error(payload?.error || "Falha ao atualizar estado.");
      }

      await loadStationQueueAndRafts();
      setSuccess(`Estado atualizado para ${STATUS_LABELS[nextStatus].toLowerCase()}.`);
    } catch (err: any) {
      setError(err?.message || "Não foi possível atualizar o estado.");
    } finally {
      setQueueSaving(false);
    }
  };

  const handleOpenHistorico = async (item: ServiceStationQueueItem) => {
    setHistoricoItem(item);
    setHistoricoData(null);
    setHistoricoLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/jangadas/${item.raftId}/historico`, { cache: "no-store" });
      if (!res.ok) {
        const payload = await safeJson<{ error?: string }>(res).catch(() => null);
        throw new Error(payload?.error || "Falha ao carregar o histórico.");
      }
      setHistoricoData(await safeJson<JangadaHistoricoPayload>(res));
    } catch (err: any) {
      setError(err?.message || "Não foi possível carregar o histórico.");
    } finally {
      setHistoricoLoading(false);
    }
  };

  const handleExportRelatorioMensal = async () => {
    setReportLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/service-station/relatorio-mensal?year=${reportYear}&month=${reportMonth}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        const payload = await safeJson<{ error?: string }>(res).catch(() => null);
        throw new Error(payload?.error || "Falha ao gerar o relatório mensal.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `relatorio-estacao-${reportYear}-${String(reportMonth).padStart(2, "0")}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setSuccess("Relatório mensal gerado com sucesso.");
    } catch (err: any) {
      setError(err?.message || "Não foi possível gerar o relatório mensal.");
    } finally {
      setReportLoading(false);
    }
  };

  const handleRemoveFromQueue = async (queueId: number) => {
    setQueueSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/service-station?id=${queueId}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = await safeJson<{ error?: string }>(res).catch(() => null);
        throw new Error(payload?.error || "Falha ao remover entrada.");
      }

      await loadStationQueueAndRafts();
      setSuccess("Entrada removida da estação.");
    } catch (err: any) {
      setError(err?.message || "Não foi possível remover a entrada.");
    } finally {
      setQueueSaving(false);
    }
  };

  const handleDrop = async (e: React.DragEvent, status: QueueStatus) => {
    e.preventDefault();
    if (!draggedQueueId) return;
    const item = queueItems.find(q => q.queueId === draggedQueueId);
    if (item && item.status !== status && !item.delivered) {
      await handleUpdateQueueStatus(item, status);
    }
    setDraggedQueueId(null);
  };

  const selectedStationTitle = data?.activeStation
    ? `${data.activeStation.codigo} · ${data.activeStation.nome}`
    : data?.canViewAllStations
      ? "Vista global · todas as estações"
      : "Estação ativa";

  const backTarget = callbackUrl && callbackUrl !== "/estacao-servico" ? callbackUrl : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="app-hero-panel mb-6 overflow-hidden rounded-3xl text-white">
          <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.9fr)] lg:px-8 lg:py-8">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/90">
                <span>Estação de Serviço</span>
                <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] normal-case tracking-normal text-white">
                  {data?.profile?.label || "Operação ativa"}
                </span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Receção, bancada e saída sem perder o fio à meada</h1>
              <p className="mt-3 max-w-3xl text-sm text-sky-50 sm:text-base">
                O fluxo ficou mais direto: selecionar estação, encontrar jangada pelo navio, rececionar em segundos e mover o trabalho pelo quadro.
                Menos tabela de castigo, mais cockpit operacional.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="app-hero-card rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-wide text-sky-50">Fila ativa</p>
                  <p className="mt-1 text-3xl font-bold">{activeQueueCount}</p>
                  <p className="mt-1 text-xs text-sky-50/90">Entradas em trabalho, sem misturar histórico já entregue.</p>
                </div>
                <div className="app-hero-card rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-wide text-sky-50">A aguardar inspeção</p>
                  <p className="mt-1 text-3xl font-bold">{waitingInspectionCount}</p>
                  <p className="mt-1 text-xs text-sky-50/90">Fila pronta para entrar em ação.</p>
                </div>
                <div className="app-hero-card rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-wide text-sky-50">Jangadas registadas</p>
                  <p className="mt-1 text-3xl font-bold">{availableRafts.length}</p>
                  <p className="mt-1 text-xs text-sky-50/90">Total na base de dados para receção na estação.</p>
                </div>
              </div>
            </div>

            <div className="app-hero-card rounded-3xl p-5">
              <p className="text-sm font-semibold text-white">Pulso rápido</p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="app-hero-card-soft rounded-2xl px-4 py-3">
                  <p className="text-sky-50">Estação ativa</p>
                  <p className="mt-1 text-base font-semibold text-white">{selectedStationTitle}</p>
                  <p className="mt-1 text-xs text-sky-50/80">{data?.activeStation?.localizacao || (data?.canViewAllStations ? "Visão transversal" : "Sem localização definida")}</p>
                </div>
                <div className="app-hero-card-soft rounded-2xl px-4 py-3">
                  <p className="text-sky-50">Receções hoje</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{todayReceiptsCount}</p>
                  <p className="mt-1 text-xs text-sky-50/80">Movimento registado no dia atual.</p>
                </div>
                <div className="app-hero-card-soft rounded-2xl px-4 py-3">
                  <p className="text-sky-50">Entregas urgentes</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{urgentDeliveryCount}</p>
                  <p className="mt-1 text-xs text-sky-50/80">Saída prevista até 3 dias.</p>
                </div>
                <div className="app-hero-card-soft rounded-2xl px-4 py-3">
                  <p className="text-sky-50">Prontas para entrega</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{readyForDeliveryCount}</p>
                  <p className="mt-1 text-xs text-sky-50/80">Sinalizadas na componente logística.</p>
                </div>
                <div className="app-hero-card-soft rounded-2xl px-4 py-3">
                  <p className="text-sky-50">Entregues</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{deliveredCount}</p>
                  <p className="mt-1 text-xs text-sky-50/80">Saída confirmada com data real de fecho.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {(overdueDeliveryCount > 0 || urgentDeliveryCount > 0) && (
          <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              <div>
                <h4 className="text-xs font-black text-amber-900 uppercase tracking-wide">Alertas de SLA (Prazos de Entrega)</h4>
                <p className="text-xs text-amber-800 mt-0.5">
                  {overdueDeliveryCount > 0 ? `${overdueDeliveryCount} ordem(ns) em ATRASO` : ""}
                  {overdueDeliveryCount > 0 && urgentDeliveryCount > 0 ? " · " : ""}
                  {urgentDeliveryCount > 0 ? `${urgentDeliveryCount} com SLA apertado (≤ 3 dias)` : ""}
                </p>
              </div>
            </div>
            <button
              onClick={() => setBoardOnlyUrgent(true)}
              className="rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition"
            >
              Ver apenas urgentes / atrasadas
            </button>
          </div>
        )}

        {error ? (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
        ) : null}
        {success ? (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>
        ) : null}

        {lembreteDueItems.length > 0 ? (
          <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-amber-900">
                  {lembreteDueItems.length} jangada{lembreteDueItems.length !== 1 ? "s" : ""} com inspeção a expirar nos próximos dias — avisar cliente
                </p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Cliente e transportador informados por SMS/WhatsApp antes do fim da validade.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { if (lembreteDueItems[0]) void handleOpenLembrete(lembreteDueItems[0].item); }}
                className="rounded-lg border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-200"
              >
                Avisar agora
              </button>
              <button
                type="button"
                onClick={() => { if (smsConfig) setSmsDraft(smsConfig); setSmsConfigOpen(true); }}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
              >
                Configurar SMS
              </button>
            </div>
          </div>
        ) : null}

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <KpiCard title="A aguardar" value={waitingInspectionCount} helper="Receções ainda sem arranque." tone="border-slate-200 bg-white" />
          <KpiCard title="Agendadas" value={scheduledCount} helper="Com plano de trabalho definido." tone="border-blue-200 bg-blue-50" />
          <KpiCard title="Em curso" value={runningCount} helper="Inspeção ativa, incluindo secagem interna." tone="border-amber-200 bg-amber-50" />
          <KpiCard title="Prontas para entrega" value={completedCount} helper="Inspeção concluída e à espera de saída." tone="border-emerald-200 bg-emerald-50" />
          <KpiCard title="Entregues" value={deliveredCount} helper="Fecho confirmado na logística." tone="border-violet-200 bg-violet-50" />
          <KpiCard title="Técnicos disponíveis" value={tecnicos.length} helper="Lista carregada para atribuição rápida." tone="border-violet-200 bg-violet-50" />
        </div>

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Contexto operacional</h2>
              <p className="mt-1 text-sm text-slate-500">Troca de estação sem sair do cockpit. Porque abrir outro ecrã para isto seria só cardio digital.</p>
            </div>
            {backTarget ? (
              <button
                type="button"
                onClick={() => router.push(backTarget)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Voltar
              </button>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {data?.canViewAllStations ? (
              <button
                type="button"
                disabled={savingStation}
                onClick={() => void handleSelectStation(null)}
                className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                  data.activeStationId === null
                    ? "border border-blue-600 bg-blue-600 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                } ${savingStation ? "opacity-50" : ""}`}
              >
                Todas as estações
              </button>
            ) : null}

            {(data?.availableStations || []).map((station) => {
              const active = data?.activeStationId === station.id;
              return (
                <button
                  key={station.id}
                  type="button"
                  disabled={savingStation}
                  onClick={() => void handleSelectStation(station.id)}
                  className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                    active
                      ? "border border-emerald-600 bg-emerald-600 text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  } ${savingStation ? "opacity-50" : ""}`}
                >
                  {station.codigo} · {station.nome}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => { if (smsConfig) setSmsDraft(smsConfig); setSmsConfigOpen(true); }}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Settings size={15} className={smsConfig?.enabled.lembrete_validade !== false ? "text-indigo-500" : "text-slate-400"} />
              SMS
            </button>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <button
            onClick={() => setActiveTab("board")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === "board" ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Quadro Kanban
          </button>
          <button
            onClick={() => setActiveTab("table")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === "table" ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Tabela Operacional
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === "list" ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Lista Global
          </button>
          <button
            onClick={() => setIsReceptionModalOpen(true)}
            className="rounded-xl bg-indigo-600 px-6 py-2 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 transition"
          >
            + Rececionar Jangada
          </button>
          <div className="relative">
            <input
              ref={serialQuickRef}
              value={serialQuick}
              onChange={(e) => {
                const raw = e.target.value;
                setSerialQuick(raw);
                const match = rafts.find((raft) => String(raft.serial || "").toLowerCase() === String(raw || "").trim().toLowerCase());
                if (match) {
                  handlePickRaft(match);
                  setIsReceptionModalOpen(true);
                }
              }}
              placeholder="Receção rápida por S/N... (Atalho: /)"
              title="Prima / ou F2 para focar rapidamente"
              className="w-52 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="relative flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-1.5 py-0.5">
            <select
              value={reportMonth}
              onChange={(e) => setReportMonth(Number(e.target.value))}
              title="Mês"
              className="rounded-lg border-0 bg-transparent px-1 py-1 text-sm font-semibold text-slate-700 outline-none"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
              ))}
            </select>
            <select
              value={reportYear}
              onChange={(e) => setReportYear(Number(e.target.value))}
              title="Ano"
              className="rounded-lg border-0 bg-transparent px-1 py-1 text-sm font-semibold text-slate-700 outline-none"
            >
              {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              onClick={() => void handleExportRelatorioMensal()}
              disabled={reportLoading}
              className="rounded-xl bg-violet-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-violet-700 transition disabled:opacity-50"
            >
              {reportLoading ? "A gerar..." : "Relatório Mensal"}
            </button>
          </div>
        </div>

        {activeTab === "board" && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Quadro por estados</h2>
              <p className="mt-1 text-sm text-slate-500">Fluxo alinhado com agenda, logística e ficha da jangada: execução, pronta para entrega e fecho entregue em pista separada.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {boardFilterIsActive ? (
                <button
                  type="button"
                  onClick={() => {
                    setBoardSearch("");
                    setBoardTecnicoFilter("todos");
                    setBoardOnlyUrgent(false);
                    setBoardOnlyReady(false);
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Limpar filtros
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void loadStationQueueAndRafts()}
                disabled={queueLoading || queueSaving}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Atualizar quadro
              </button>
            </div>
          </div>

          <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[minmax(0,1.2fr)_220px_auto_auto]">
            <input
              value={boardSearch}
              onChange={(event) => setBoardSearch(event.target.value)}
              placeholder="Filtrar quadro por serial, navio, modelo, técnico ou nota..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            />

            <select
              value={boardTecnicoFilter}
              onChange={(event) => setBoardTecnicoFilter(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="todos">Todos os técnicos</option>
              {tecnicos.map((tecnico) => (
                <option key={tecnico.id} value={tecnico.nome}>
                  {tecnico.nome}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setBoardOnlyUrgent((value) => !value)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                boardOnlyUrgent
                  ? "border-rose-300 bg-rose-50 text-rose-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Só SLA crítico
            </button>

            <button
              type="button"
              onClick={() => setBoardOnlyReady((value) => !value)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                boardOnlyReady
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Só prontas a entregar
            </button>
          </div>

          <div className="mb-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 font-semibold text-slate-700">
              {filteredQueueItems.length} item(ns) no quadro filtrado
            </span>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 font-semibold text-rose-700">
              {overdueDeliveryCount} em atraso
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-700">
              {urgentDeliveryCount} com SLA ≤ 3 dias
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
              {readyForDeliveryCount} prontas para entrega
            </span>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 font-semibold text-violet-700">
              {deliveredCount} entregues
            </span>
          </div>

          {queueLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              A carregar quadro operacional...
            </div>
          ) : filteredQueueItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              Nenhum item corresponde aos filtros atuais.
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-5">
              {boardItems.map((column) => (
                <div key={column.status} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3 transition-colors duration-200 hover:bg-slate-100" onDragOver={(e) => e.preventDefault()} onDrop={(e) => void handleDrop(e, column.status as QueueStatus)}>
                  <div className={`rounded-2xl bg-gradient-to-r px-4 py-4 text-white ${column.accent}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{column.title}</p>
                        <p className="mt-1 text-xs text-white/80">{column.description}</p>
                      </div>
                      <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
                        {column.items.length}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 space-y-3">
                    {column.items.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-5 text-center text-xs text-slate-500">
                        Sem itens nesta etapa.
                      </div>
                    ) : (
                      column.items.map((item) => {
                        const nextAction = item.delivered ? null : getNextStatusAction(item.status);
                        const prevAction = item.delivered ? null : getPreviousStatusAction(item.status);
                        const deliveryMeta = getExpectedDeliveryMeta(item.expectedDeliveryDate);
                        const statusPresentation = getBoardStatusPresentation(item);
                        return (
                          <div 
                            key={item.queueId} 
                            draggable={!item.delivered}
                            onDragStart={() => setDraggedQueueId(item.queueId)}
                            onDragEnd={() => setDraggedQueueId(null)}
                            className={`rounded-2xl border p-3 shadow-sm transition hover:shadow-md ${!item.delivered ? "cursor-grab active:cursor-grabbing" : ""} ${
                              (daysUntil(item.expectedDeliveryDate) ?? 999) < 0 && !item.delivered 
                                ? "border-rose-400 bg-rose-50/80 animate-pulse" 
                                : "border-slate-200 bg-white"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-slate-900">{item.serial}</p>
                                <p className="mt-1 text-sm text-slate-700 line-clamp-2">{item.shipName || "Sem navio"}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${statusPresentation.className}`}>
                                  {statusPresentation.label}
                                </span>
                                {item.raftId ? (
                                  <Link
                                    href={`/jangadas/${item.raftId}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-50"
                                  >
                                    <FileText size={10} />
                                    Ver ficha
                                  </Link>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-3 grid gap-2 text-[11px] text-slate-500 sm:grid-cols-2">
                              <div className="rounded-xl bg-slate-50 px-2.5 py-2">
                                <p className="font-semibold uppercase tracking-wide text-slate-400">Modelo</p>
                                <p className="mt-1 text-slate-700">{item.model || "—"}</p>
                              </div>
                              <div className="rounded-xl bg-slate-50 px-2.5 py-2">
                                <p className="font-semibold uppercase tracking-wide text-slate-400">Técnico</p>
                                <p className="mt-1 text-slate-700">{item.tecnico || "—"}</p>
                              </div>
                              <div className="rounded-xl bg-slate-50 px-2.5 py-2 sm:col-span-2">
                                <p className="font-semibold uppercase tracking-wide text-slate-400">Receção</p>
                                <p className="mt-1 text-slate-700">{formatDateTimeShort(item.receivedAt)}</p>
                              </div>
                            </div>

                            {!item.delivered && (() => {
                              const diff = daysUntil(item.expectedDeliveryDate);
                              if (diff === null) return null;
                              if (diff < 0) {
                                return (
                                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">
                                    ⚠ Em atraso há {Math.abs(diff)} dia(s) — prazo de entrega {item.expectedDeliveryDate ? formatDate(item.expectedDeliveryDate) : ""} ultrapassado.
                                  </div>
                                );
                              }
                              if (diff === 0) {
                                return (
                                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                                    Entrega prevista para hoje.
                                  </div>
                                );
                              }
                              if (diff <= 3) {
                                return (
                                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                                    SLA apertado: {diff} dia(s) restantes até à entrega prevista ({item.expectedDeliveryDate ? formatDate(item.expectedDeliveryDate) : ""}).
                                  </div>
                                );
                              }
                              return null;
                            })()}

                            {!item.delivered && (() => {
                              if (!item.dataProxInspecao) return null;
                              const inspDiff = daysUntil(item.dataProxInspecao);
                              if (inspDiff === null) return null;
                              if (inspDiff < 0) {
                                return (
                                  <div className="mt-3 rounded-xl border border-violet-300 bg-violet-50 px-3 py-2 text-[11px] font-semibold text-violet-700">
                                    Vistoria expirada há {Math.abs(inspDiff)} dia(s) — próxima inspeção {formatDate(item.dataProxInspecao)}.
                                  </div>
                                );
                              }
                              if (inspDiff <= 30) {
                                return (
                                  <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] font-semibold text-violet-700">
                                    Vistoria a expirar em {inspDiff} dia(s) — próxima inspeção {formatDate(item.dataProxInspecao)}.
                                  </div>
                                );
                              }
                              return null;
                            })()}

                            {!item.delivered && (() => {
                              const giRec = getTestRecommendations({
                                brand: (item.model || "").split(" ")[0] || "",
                                model: (item.model || "").split(" ").slice(1).join(" ") || "",
                                launchType: item.launchType || "",
                                dataFabrico: item.dataFabrico || "",
                                inspectionDate: item.dataInspecao || new Date().toISOString().slice(0, 10),
                              }).find((r) => r.testId === "testeGI");
                              if (!giRec || (giRec.status !== "required" && giRec.status !== "overdue")) return null;
                              if (giRec.status === "overdue") {
                                return (
                                  <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">
                                    GI (Insuflação por Gás) em atraso — efetuar o teste de GI ({giRec.nextGiYear || ""}).
                                  </div>
                                );
                              }
                              return (
                                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                                    GI (Insuflação por Gás) obrigatório este ano ({giRec.nextGiYear || ""}) — verificar antes da entrega.
                                </div>
                              );
                            })()}

                            {!item.delivered && (() => {
                              const days = smsConfig?.lembreteValidadeDias ?? 7;
                              if (!item.dataProxInspecao) return null;
                              const diff = daysUntil(item.dataProxInspecao);
                              if (diff === null || diff < 0 || diff > days) return null;
                              if (smsConfig?.enabled.lembrete_validade === false) return null;
                              const alreadySent = (item.smsNotifications || []).some(
                                (log) => log.type === "lembrete_validade" && log.status === "sent",
                              );
                              const pending = (item.smsNotifications || []).some(
                                (log) => log.type === "lembrete_validade" && log.status === "pending",
                              );
                              return (
                                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-[11px] font-semibold text-amber-800">
                                      Inspeção expira em {diff === 0 ? "hoje" : `${diff} dia(s)`} — avisar cliente
                                    </span>
                                    <span className="flex gap-1.5">
                                      <button
                                        type="button"
                                        disabled={smsBusyRaftId === item.raftId || alreadySent || lembreteLoading}
                                        onClick={() => void handleOpenLembrete(item)}
                                        title={alreadySent ? "Lembrete já enviado" : "Abrir pré-visualização e enviar lembrete"}
                                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition disabled:opacity-50 ${
                                          alreadySent
                                            ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
                                            : "border border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                                        }`}
                                      >
                                        <MessageSquare size={12} />
                                        {alreadySent
                                          ? "SMS enviado"
                                          : lembreteLoading && smsBusyRaftId === item.raftId
                                            ? "A preparar..."
                                            : "Avisar Cliente"}
                                      </button>
                                    </span>
                                  </div>
                                  {pending ? (
                                    <p className="mt-1 text-[10px] text-amber-700">Lembrete pendente de confirmação na configuração.</p>
                                  ) : null}
                                </div>
                              );
                            })()}

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setSmsHistoryRaftId((cur) => (cur === item.raftId ? null : item.raftId))
                                }
                                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition ${
                                  smsHistoryRaftId === item.raftId
                                    ? "border-slate-400 bg-slate-100 text-slate-800"
                                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                <History size={12} />
                                Histórico ({item.smsNotifications?.length || 0})
                              </button>
                              {smsHistoryRaftId === item.raftId ? (
                                <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2">
                                  {(item.smsNotifications || []).length === 0 ? (
                                    <p className="px-1 py-1 text-[11px] text-slate-500">Sem notificações registadas.</p>
                                  ) : (
                                    <ul className="divide-y divide-slate-200">
                                      {[...(item.smsNotifications || [])]
                                        .slice()
                                        .reverse()
                                        .map((n, i) => (
                                          <li key={i} className="flex flex-col gap-0.5 py-1.5 px-1">
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="text-[11px] font-semibold text-slate-700">
                                                {n.type.replace(/_/g, " ")}
                                              </span>
                                              <span
                                                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                                                  n.status === "sent"
                                                    ? "bg-emerald-100 text-emerald-700"
                                                    : n.status === "error"
                                                      ? "bg-rose-100 text-rose-700"
                                                      : n.status === "pending"
                                                        ? "bg-amber-100 text-amber-700"
                                                        : "bg-slate-100 text-slate-500"
                                                }`}
                                              >
                                                {n.status}
                                              </span>
                                            </div>
                                            <span className="text-[10px] text-slate-500">{n.phone} · {formatDateTimeShort(n.ativo)}</span>
                                            {n.error ? <span className="text-[10px] text-rose-600">{n.error}</span> : null}
                                          </li>
                                        ))}
                                    </ul>
                                  )}
                                </div>
                              ) : null}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              {item.deliveredAt ? (
                                <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700">
                                  Entregue em {formatDate(item.deliveredAt)}
                                </span>
                              ) : (
                                <>
                                  <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${deliveryMeta.className}`}>
                                    {deliveryMeta.label}
                                  </span>
                                  {item.expectedDeliveryDate ? (
                                    <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${getExpectedDeliveryTone(item.expectedDeliveryDate)} border-current/10 bg-white`}>
                                      {formatDate(item.expectedDeliveryDate)}
                                    </span>
                                  ) : null}
                                </>
                              )}
                              {item.arrivedViaForwarder ? (
                                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                  Transitário
                                </span>
                              ) : null}
                              {item.notifiedLastAt ? (
                                <span
                                  className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700"
                                  title={`Cliente notificado por SMS em ${formatDate(item.notifiedLastAt)}`}
                                >
                                  ✓ Notificado {formatDate(item.notifiedLastAt)}
                                </span>
                              ) : null}
                              {(() => {
                                const lastLog = (item.smsNotifications || []).slice().reverse().find((log) => log.status !== "pending");
                                if (!lastLog || lastLog.status !== "error") return null;
                                return (
                                  <span
                                    className="rounded-full border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700"
                                    title={`SMS ${lastLog.type} falhou: ${lastLog.error || "erro desconhecido"} (${formatDate(lastLog.ativo)})`}
                                  >
                                    ⚠ SMS falhou {formatDate(lastLog.ativo)}
                                  </span>
                                );
                              })()}
                              {item.readyForDelivery ? (
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                                  Pronta para entrega
                                </span>
                              ) : null}
                              {item.deliveryMethod ? (
                                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-700">
                                  {DELIVERY_METHOD_LABELS[item.deliveryMethod]}
                                </span>
                              ) : null}
                            </div>

                            {item.observacao ? (
                              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                {item.observacao}
                              </div>
                            ) : null}

                            {item.status === "a_secar" && !item.delivered ? (
                              <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-medium text-cyan-800">
                                Subfase operacional: secagem em curso, mantida dentro de <span className="font-semibold">Em inspeção</span> para não partir o fluxo do quadro.
                              </div>
                            ) : null}

                            <div className="mt-4 flex flex-wrap gap-2">
                              {prevAction ? (
                                <button
                                  type="button"
                                  onClick={() => void handleUpdateQueueStatus(item, prevAction.prev)}
                                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  {prevAction.label}
                                </button>
                              ) : null}
                              {nextAction ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (nextAction.next === "agendada") {
                                      handleOpenScheduleModal(item);
                                    } else {
                                      void handleUpdateQueueStatus(item, nextAction.next);
                                    }
                                  }}
                                  className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                                >
                                  {nextAction.label}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => void handleRemoveFromQueue(item.queueId)}
                                className="rounded-lg border border-rose-300 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                              >
                                Remover
                              </button>
                              <button
                                type="button"
                                disabled={historicoLoading}
                                onClick={() => void handleOpenHistorico(item)}
                                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                Histórico
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {activeTab === "table" && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Tabela operacional detalhada</h2>
              <p className="mt-1 text-sm text-slate-500">Mantida para leitura densa, export mental e conferência rápida por quem gosta de linhas alinhadas. Os clássicos nunca morrem.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{queueItems.length} registo(s)</span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Serial</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Navio</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Modelo</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Técnico</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Receção</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Entrega</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredQueueItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">Sem registos operacionais para os filtros atuais.</td>
                  </tr>
                ) : (
                  filteredQueueItems.map((item) => (
                    <tr key={`table-${item.queueId}`} className="hover:bg-slate-50/80">
                      <td className="px-3 py-3 font-semibold text-slate-900">{item.serial}</td>
                      <td className="px-3 py-3 text-slate-700">{item.shipName || "Sem navio"}</td>
                      <td className="px-3 py-3 text-slate-700">{item.model || "—"}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${STATUS_BADGE_CLASSES[item.status]}`}>
                          {STATUS_LABELS[item.status]}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{item.tecnico || "—"}</td>
                      <td className="px-3 py-3 text-slate-600">{formatDateTimeShort(item.receivedAt)}</td>
                      <td className={`px-3 py-3 ${getExpectedDeliveryTone(item.expectedDeliveryDate)}`}>{formatDate(item.expectedDeliveryDate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {activeTab === "list" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Lista global de jangadas</h2>
              <p className="mt-1 text-sm text-slate-500">Pesquisa por navio, serial, marca, modelo ou estação. A visão completa continua aqui, só mais legível.</p>
            </div>
            <div className="w-full sm:w-80">
              <input
                value={raftsSearch}
                onChange={(event) => setRaftsSearch(event.target.value)}
                placeholder="Pesquisar jangadas..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mb-3 text-xs text-slate-500">
            {filteredRafts.length} de {rafts.length} jangada(s)
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Serial</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Navio</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Marca / Modelo</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Estação</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredRafts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-500">Sem resultados para este filtro.</td>
                  </tr>
                ) : (
                  filteredRafts.map((raft) => (
                    <tr key={raft.id} className="hover:bg-slate-50/80">
                      <td className="px-3 py-3 font-semibold text-slate-900">{raft.serial || "—"}</td>
                      <td className="px-3 py-3 text-slate-700">{getRaftShipLabel(raft)}</td>
                      <td className="px-3 py-3 text-slate-700">{`${raft.brand || ""} ${raft.model || ""}`.trim() || "—"}</td>
                      <td className="px-3 py-3 text-slate-700">{raft.serviceStation?.nome || "Sem estação"}</td>
                      <td className="px-3 py-3 text-slate-600">{raft.status || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>

      {isReceptionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-5xl my-8 bg-slate-50 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center border-b border-slate-200 bg-white px-6 py-4 shrink-0">
              <h2 className="text-xl font-bold text-slate-800">Rececionar Jangada</h2>
              <button onClick={() => setIsReceptionModalOpen(false)} className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full w-8 h-8 flex items-center justify-center transition">✕</button>
            </div>
            <div className="p-6 overflow-y-auto">
        <div className="mb-6 grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Receção rápida</h2>
                <p className="mt-1 text-sm text-slate-500">A pesquisa inline usa navio, serial, marca e modelo. O objetivo é escolher sem abrir uma novela modal.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {availableRafts.length} jangadas registadas
              </span>
            </div>

            {!canReceiveOnCurrentContext ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                Seleciona uma estação específica para rececionar jangadas. Em vista global a API protege-te de fazer magia indevida.
              </div>
            ) : null}

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Procurar jangada</label>
                <input
                  value={raftQuickSearch}
                  onChange={(event) => {
                    setRaftQuickSearch(event.target.value);
                    if (selectedRaftId) setSelectedRaftId("");
                  }}
                  placeholder="Escreve o navio, serial, marca, modelo ou proprietário..."
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />

                <p className="mt-2 text-xs text-slate-500">
                  {filteredAvailableRafts.length} jangada(s) encontrada(s) para receção rápida.
                </p>

                <div className="mt-3 max-h-[28rem] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2">
                  {filteredAvailableRafts.length === 0 ? (
                    <div className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-500">
                      Nenhuma jangada disponível para este filtro.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredAvailableRafts.map((raft) => {
                        const isSelected = String(raft.id) === String(selectedRaftId);
                        return (
                          <button
                            key={raft.id}
                            type="button"
                            onClick={() => handlePickRaft(raft)}
                            className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                              isSelected
                                ? "border-blue-500 bg-blue-50 shadow-sm"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">{raft.serial || "Sem serial"}</p>
                                  <p className="mt-1 text-sm text-slate-700">{getRaftShipLabel(raft)}</p>
                                  <p className="mt-1 text-xs text-slate-500">{`${raft.brand || ""} ${raft.model || ""}`.trim() || "Modelo não definido"}</p>
                                </div>
                                <div className="text-right text-xs text-slate-500">
                                  {raft.capacity ? <p>{raft.capacity} pax</p> : null}
                                  {raft.serviceStation?.nome ? <p>{raft.serviceStation.nome}</p> : null}
                                </div>
                              </div>
                              {queueByRaftId.has(raft.id) && (
                                <span className="mt-2 inline-block rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                  Já na estação
                                </span>
                              )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seleção</p>
                {selectedRaft ? (
                  <>
                    <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                      <p className="text-lg font-bold text-slate-900">{selectedRaft.serial}</p>
                      <p className="mt-1 text-sm text-slate-700">{getRaftShipLabel(selectedRaft)}</p>
                      <p className="mt-1 text-xs text-slate-500">{`${selectedRaft.brand || ""} ${selectedRaft.model || ""}`.trim() || "Modelo não definido"}</p>
                    </div>
                    {queueByRaftId.has(selectedRaft.id) && (
                      <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Esta jangada já está na fila ativa da estação. Rececionar novamente criaria uma entrada duplicada.
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={clearSelectedRaft}
                      className="mt-3 text-xs font-semibold text-slate-600 underline underline-offset-2"
                    >
                      Limpar seleção
                    </button>
                  </>
                ) : (
                  <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                    Escolhe uma jangada acima para preencher a receção.
                  </div>
                )}

                <div className="mt-4 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Técnico</label>
                    <select
                      value={entryTecnico}
                      onChange={(event) => setEntryTecnico(event.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      disabled={tecnicosLoading}
                    >
                      <option value="">{tecnicosLoading ? "A carregar técnicos..." : "Selecionar técnico..."}</option>
                      {tecnicos.map((tecnico) => (
                        <option key={tecnico.id} value={tecnico.nome}>
                          {tecnico.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Entrega prevista</label>
                    <input
                      type="date"
                      value={entryExpectedDeliveryDate}
                      onChange={(event) => setEntryExpectedDeliveryDate(event.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Observação</label>
                    <textarea
                      value={entryObservacao}
                      onChange={(event) => setEntryObservacao(event.target.value)}
                      rows={4}
                      placeholder="Notas rápidas para a equipa..."
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleAddToQueue()}
                    disabled={!selectedRaftId || queueSaving || !canReceiveOnCurrentContext || (selectedRaft ? queueByRaftId.has(selectedRaft.id) : false)}
                    className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {queueSaving ? "A rececionar..." : (selectedRaft && queueByRaftId.has(selectedRaft.id) ? "Já na estação" : "Rececionar jangada")}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Foco imediato</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
                <p className="font-semibold">A aguardar inspeção</p>
                <p className="mt-1 text-xs">{waitingInspectionCount} jangada(s) já rececionada(s) e à espera de começar.</p>
              </div>
              <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-cyan-900">
                <p className="font-semibold">Em execução</p>
                <p className="mt-1 text-xs">{runningCount} jangada(s) em inspeção ativa, incluindo secagem quando aplicável.</p>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900">
                <p className="font-semibold">SLA apertado</p>
                <p className="mt-1 text-xs">{urgentDeliveryCount} com entrega prevista em 3 dias ou menos, incluindo {overdueDeliveryCount} em atraso.</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
                <p className="font-semibold">Prontas para entrega</p>
                <p className="mt-1 text-xs">{readyForDeliveryCount} sinalizadas na componente logística.</p>
              </div>
              <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-violet-900">
                <p className="font-semibold">Entregues</p>
                <p className="mt-1 text-xs">{deliveredCount} com entrega registada e já fora da fila ativa.</p>
              </div>
            </div>
          </div>
        </div>

            </div>
          </div>
        </div>
      )}

      {isScheduleModalOpen && schedulingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-200 bg-white px-6 py-4">
              <h2 className="text-lg font-bold text-slate-800">Agendar Inspeção</h2>
              <button 
                onClick={() => {
                  setIsScheduleModalOpen(false);
                  setSchedulingItem(null);
                }} 
                className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full w-8 h-8 flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs text-slate-600">
                <p><b>Jangada:</b> {schedulingItem.model} ({schedulingItem.serial})</p>
                <p><b>Navio:</b> {schedulingItem.shipName}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Data / Hora de Início</label>
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Técnico Responsável</label>
                <select
                  value={scheduleTecnico}
                  onChange={(e) => setScheduleTecnico(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Escolher técnico...</option>
                  {tecnicos.map((tecnico) => (
                    <option key={tecnico.id} value={tecnico.nome}>
                      {tecnico.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Notas / Observações</label>
                <textarea
                  value={scheduleNote}
                  onChange={(e) => setScheduleNote(e.target.value)}
                  placeholder="Instruções ou observações adicionais..."
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setIsScheduleModalOpen(false);
                  setSchedulingItem(null);
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSaveSchedule()}
                disabled={queueSaving}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {queueSaving ? "A agendar..." : "Gravar Agendamento"}
              </button>
            </div>
          </div>
        </div>
      )}

      {historicoItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center border-b border-slate-200 bg-white px-6 py-4 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Histórico da Jangada</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {historicoItem.serial} · {historicoItem.shipName || "Sem navio"}
                </p>
              </div>
              <button
                onClick={() => setHistoricoItem(null)}
                className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full w-8 h-8 flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              {historicoLoading ? (
                <div className="py-12 text-center text-sm text-slate-500">A carregar histórico...</div>
              ) : !historicoData ? (
                <div className="py-12 text-center text-sm text-slate-500">Sem dados disponíveis.</div>
              ) : (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">{historicoData.jangada.serial}</span>
                    {" "}· {historicoData.jangada.brand || ""} {historicoData.jangada.model || ""}
                    {historicoData.jangada.owner ? ` · Armador: ${historicoData.jangada.owner}` : ""}
                  </div>

                  <section>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-700">Receções</h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">{historicoData.rececoes.length}</span>
                    </div>
                    {historicoData.rececoes.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-xs text-slate-500">Sem receções registadas.</div>
                    ) : (
                      <div className="space-y-2">
                        {historicoData.rececoes.map((rececao) => (
                          <div key={rececao.queueId} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-slate-800">{formatDate(rececao.dataChegada)}</span>
                              <div className="flex flex-wrap gap-1.5">
                                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                  {formatQueueStatusLabel(rececao.status)}
                                </span>
                                {rececao.deliveredAt ? (
                                  <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                                    Entregue {formatDate(rececao.deliveredAt)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500">
                              {rececao.estacao ? <span>Estação: <b className="text-slate-700">{rececao.estacao}</b></span> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-700">Inspeções / certificados</h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">{historicoData.inspecoes.length}</span>
                    </div>
                    {historicoData.inspecoes.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-xs text-slate-500">Sem inspeções registadas.</div>
                    ) : (
                      <div className="space-y-2">
                        {historicoData.inspecoes.map((inspecao) => (
                          <div key={inspecao.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-slate-800">{inspecao.certificadoNumero}</span>
                              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                {inspecao.status || "—"}
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500">
                              <span>Inspeção: <b className="text-slate-700">{formatDate(inspecao.dataInspecao)}</b></span>
                              {inspecao.dataProxInspecao ? <span>Próxima: <b className="text-slate-700">{formatDate(inspecao.dataProxInspecao)}</b></span> : null}
                              {inspecao.navioNome ? <span>Navio: <b className="text-slate-700">{inspecao.navioNome}</b></span> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setHistoricoItem(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {smsConfigOpen && smsConfig ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setSmsConfigOpen(false)}>
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Settings size={16} className="text-indigo-500" /> Configuração de SMS ao cliente
              </h3>
              <button type="button" onClick={() => setSmsConfigOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">✕</button>
            </div>

            <div className="space-y-5 px-6 py-5 max-h-[70vh] overflow-auto">
              <div>
                <p className="mb-2 text-xs font-semibold text-slate-600">Lembrete de validade</p>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={smsDraft?.enabled.lembrete_validade !== false}
                      onChange={(e) => setSmsDraft({ ...smsDraft!, enabled: { ...smsDraft!.enabled, lembrete_validade: e.target.checked } })}
                    />
                    Lembrete por SMS/WhatsApp ativo
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    Enviar antes de
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={smsDraft?.lembreteValidadeDias ?? 7}
                      onChange={(e) => setSmsDraft({ ...smsDraft!, lembreteValidadeDias: Number(e.target.value) })}
                      className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                    />
                    dias
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-600">Notificações automáticas</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["rececionada", "Quando rececionada na estação"],
                      ["pronta_entrega", "Quando pronta para entrega"],
                      ["enviada", "Quando enviada (regresso)"],
                    ] as Array<["rececionada" | "pronta_entrega" | "enviada", string]>
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={smsDraft?.enabled[key] !== false}
                        onChange={(e) => setSmsDraft({ ...smsDraft!, enabled: { ...smsDraft!.enabled, [key]: e.target.checked } })}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={smsDraft?.requerConfirmacao === true}
                  onChange={(e) => setSmsDraft({ ...smsDraft!, requerConfirmacao: e.target.checked })}
                />
                Exigir confirmação do operador antes de enviar
              </label>

              <div className="space-y-4">
                <p className="text-xs font-semibold text-slate-600">Textos das mensagens</p>
                {(
                  [
                    ["rececionada", "Rececionada"],
                    ["pronta_entrega", "Pronta para entrega"],
                    ["enviada", "Enviada"],
                    ["lembrete_validade", "Lembrete de validade"],
                  ] as Array<[keyof SmsConfig["texts"], string]>
                ).map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-slate-500">{label}</span>
                    <textarea
                      value={smsDraft?.texts[key] || ""}
                      onChange={(e) => setSmsDraft({ ...smsDraft!, texts: { ...smsDraft!.texts, [key]: e.target.value } })}
                      rows={3}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700 focus:border-indigo-400 focus:outline-none"
                      placeholder="Use {cliente}, {serial}, {data}, {transitario}, {tracking}"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setSmsConfigOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => smsDraft && void handleSaveSmsConfig(smsDraft)}
                className="rounded-xl border border-indigo-600 bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {lembreteModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setLembreteModal(null)}>
          <div
            className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-sm font-bold text-slate-800">Avisar Cliente — Lembrete de Inspeção</h3>
              <button
                type="button"
                onClick={() => setLembreteModal(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 p-6">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">{lembreteModal.serial}</span>
                  <span className="text-slate-500">{lembreteModal.name}</span>
                </div>
                <div className="mt-1 text-slate-500">Telemóvel: <b className="text-slate-700">{lembreteModal.phone}</b></div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-600">Mensagem (podes editar)</label>
                <textarea
                  value={lembreteText}
                  onChange={(e) => setLembreteText(e.target.value)}
                  rows={6}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setLembreteChannel("sms")}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    lembreteChannel === "sms"
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <MessageSquare size={14} /> Enviar SMS
                </button>
                <button
                  type="button"
                  onClick={() => setLembreteChannel("whatsapp")}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    lembreteChannel === "whatsapp"
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <MessageCircle size={14} /> Abrir WhatsApp
                </button>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setLembreteModal(null)}
                  disabled={lembreteSending}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleSendLembrete(lembreteChannel)}
                  disabled={lembreteSending || !lembreteText.trim()}
                  className={`rounded-xl border px-4 py-2 text-xs font-semibold text-white transition ${
                    lembreteChannel === "sms"
                      ? "border-indigo-600 bg-indigo-600 hover:bg-indigo-700"
                      : "border-emerald-600 bg-emerald-600 hover:bg-emerald-700"
                  } disabled:opacity-50`}
                >
                  {lembreteSending ? "A enviar..." : lembreteChannel === "sms" ? "Enviar SMS" : "Abrir no WhatsApp"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
