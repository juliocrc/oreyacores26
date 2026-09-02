"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { useAgendaStore } from "@/lib/store/useAgendaStore";
import AgendaHeader from "@/modules/Agenda/AgendaHeader";
import AgendaSidebar from "@/modules/Agenda/AgendaSidebar";
import AgendaModals from "@/modules/Agenda/AgendaModals";
import AgendaBoard from "@/modules/Agenda/AgendaBoard";
import {
  getInspectionDefaults,
  normalizeInspectionType,
  normalizeEventStatus,
  EVENT_STATUS_LABELS,
  EVENT_STATUS_COLORS,
  type AgendaApiEvent,
  type AgendaApiPayload,
  type InspectionType,
} from "@/types/agenda";
import {
  AZORES_TECHNICIANS,
  MAX_DAILY_SCHEDULED_EVENTS,
  MAX_ACTIVE_RAFTS_PER_TECHNICIAN,
  normalizeTechnicianName,
} from "@/lib/agenda-technicians";
import type {
  InspectionEvent,
  InspectionCalendarProps,
  CalendarMutationPayload,
  AgendaMetrics,
  AgendaExportRow,
  AgendaRaft,
  PanelRaft,
  NavioItem,
} from "@/types/agenda-page";
import {
  normalizeText,
  parseAgendaDateFlexible,
  isWithinNextDays,
  hasGiTest,
  normalizeList,
  isSameCalendarDay,
  getMinutesOfDay,
  setMinutesOfDay,
  isDuringLunchBreak,
  computeOperationalEnd,
  LUNCH_START_MINUTES,
  LUNCH_END_MINUTES,
} from "@/lib/agenda-page-helpers";

const InspectionCalendar = dynamic<InspectionCalendarProps>(() => import("../../modules/Calendar"), {
  ssr: false,
  loading: () => (
    <div className="bg-white border border-gray-200 rounded-xl p-6 text-gray-600">
      A carregar calendário...
    </div>
  ),
});

const AGENDA_REFRESH_EVENT = "agenda:refresh";

function AgendaPage() {
  // ...existing code...
  // (Move all hooks, functions, and logic here)
  // ...existing code...

  // Hydration-safe: ensure all logic is client-side only
  // (Pattern: navios/jangadas pages)
  const raftsRef = useRef<AgendaRaft[]>([]);
  const naviosByIdRef = useRef<Record<number, string>>({});
  const [rafts, setRafts] = useState<AgendaRaft[]>([]);
  const [events, setEvents] = useState<InspectionEvent[]>([]);
  const [externalDragEvent, setExternalDragEvent] = useState<InspectionEvent | null>(null);
  const [serviceStationRafts, setServiceStationRafts] = useState<PanelRaft[]>([]);
  const [metrics, setMetrics] = useState<AgendaMetrics | null>(null);
  const [conflictCount, setConflictCount] = useState(0);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineStartDate, setTimelineStartDate] = useState<Date>(new Date());
  const [syncingGoogleCalendar, setSyncingGoogleCalendar] = useState(false);
  const [lastGoogleSync, setLastGoogleSync] = useState<string>("");
  const { 
    viewMode, setViewMode, 
    showAdvancedPanels, setShowAdvancedPanels, 
    listSearch, setListSearch, 
    quickScheduleTarget, setQuickScheduleTarget, 
    quickScheduleDateTime, setQuickScheduleDateTime, 
    quickScheduleResponsavel, setQuickScheduleResponsavel, 
    exportingFormat, setExportingFormat 
  } = useAgendaStore();

  const reloadAgendaDataRef = useRef<(() => Promise<void>) | null>(null);
  const MAX_SIMULTANEOUS_INSPECTIONS = 6;
  const MAX_PAUSED_INSPECTIONS = 3;

  const countScheduledEventsForDay = (targetDate: Date, excludeId?: string | number) => {
    return events.filter((ev) => {
      const persisted = /^\d+$/.test(String(ev.id));
      const st = normalizeEventStatus(ev.status);
      if (!persisted) return false;
      if (!(st === "scheduled" || st === "confirmed")) return false;
      if (excludeId !== undefined && String(ev.id) === String(excludeId)) return false;
      return isSameCalendarDay(new Date(ev.start), targetDate);
    }).length;
  };

  const countTechnicianActiveForDay = (targetDate: Date, responsavelRaw?: string, excludeId?: string | number) => {
    const responsavel = normalizeTechnicianName(responsavelRaw).trim().toLowerCase();
    if (!responsavel) return 0;

    return events.filter((ev) => {
      const persisted = /^\d+$/.test(String(ev.id));
      const st = normalizeEventStatus(ev.status);
      if (!persisted) return false;
      if (!(st === "scheduled" || st === "confirmed" || st === "in_progress" || st === "testing")) return false;
      if (excludeId !== undefined && String(ev.id) === String(excludeId)) return false;
      if (normalizeTechnicianName(ev.responsavel).trim().toLowerCase() !== responsavel) return false;
      return isSameCalendarDay(new Date(ev.start), targetDate);
    }).length;
  };

  const countPausedEventsForDay = (targetDate: Date, excludeId?: string | number) => {
    return events.filter((ev) => {
      const persisted = /^\d+$/.test(String(ev.id));
      const st = normalizeEventStatus(ev.status);
      if (!persisted) return false;
      if (st !== "paused") return false;
      if (excludeId !== undefined && String(ev.id) === String(excludeId)) return false;
      return isSameCalendarDay(new Date(ev.start), targetDate);
    }).length;
  };

  const suggestBestTechnician = (targetDate: Date, excludeId?: string | number) => {
    const ranked = AZORES_TECHNICIANS
      .map((tech) => {
        const name = normalizeTechnicianName(tech.name);
        const load = countTechnicianActiveForDay(targetDate, name, excludeId);
        return { name, load };
      })
      .filter((item) => item.load < MAX_ACTIVE_RAFTS_PER_TECHNICIAN)
      .sort((a, b) => a.load - b.load || a.name.localeCompare(b.name, 'pt'));

    return ranked[0]?.name || '';
  };

  const getEventTiming = (event: Partial<InspectionEvent>) => {
    const inspectionType = normalizeInspectionType(event.inspectionType);
    const defaults = getInspectionDefaults(inspectionType);
    return {
      inspectionType,
      durationMinutes: Number(event.durationMinutes ?? defaults.durationMinutes),
      bufferBeforeMinutes: Number(event.bufferBeforeMinutes ?? defaults.bufferBeforeMinutes),
      bufferAfterMinutes: Number(event.bufferAfterMinutes ?? defaults.bufferAfterMinutes),
    };
  };

  const refreshOperationalPanels = () => {
    fetch("/api/agenda/metrics")
      .then(r => r.ok ? r.json() : null)
      .then((data: AgendaMetrics | null) => { if (data) setMetrics(data); })
      .catch(() => {});
    fetch("/api/agenda/conflicts")
      .then(r => r.ok ? r.json() : null)
      .then((data: { total: number; conflicts: any[] } | null) => { 
        if (data) {
          setConflictCount(data.total); 
          setConflicts(data.conflicts || []);
        }
      })
      .catch(() => {});
  };

  const triggerAgendaReload = () => {
    void reloadAgendaDataRef.current?.();
    refreshOperationalPanels();
  };

  const handleSyncGoogleCalendar = async () => {
    if (syncingGoogleCalendar) return;
    setSyncingGoogleCalendar(true);
    try {
      const res = await fetch("/api/google-calendar/sync", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error || "Google Calendar não está configurado neste ambiente.");
        return;
      }
      setLastGoogleSync(data?.summary || "Sincronizado.");
      alert(data?.summary || "Sincronizado com o Google Calendar com sucesso!");
    } catch {
      alert("Google Calendar não está configurado neste ambiente.");
    } finally {
      setSyncingGoogleCalendar(false);
    }
  };

  // ...existing code...
  // (All other functions and logic remain here)

  function getRaftLabel(raft: AgendaRaft | null | undefined, fallbackSerial: string) {
    if (!raft) return fallbackSerial || "—";
    if (raft.model && raft.model.trim()) return `${raft.model} (${raft.serial})`;
    return raft.serial || fallbackSerial || "—";
  }


  // Agrega todas as jangadas do navio no título
  function buildAgendaTitle(prefix: string, raftLabel: string, shipLabel: string, raftSerial?: string) {
    // Busca todas as jangadas do navio
    let jangadas = raftsRef.current.filter(r => {
      if (!raftSerial) return false;
      if (r.shipNameManual?.trim() === shipLabel) return true;
      if (r.shipId && naviosByIdRef.current[r.shipId] === shipLabel) return true;
      return false;
    }).map(r => r.serial).filter(Boolean);
    jangadas = Array.from(new Set(jangadas));
    const jangadaStr = jangadas.length > 1 ? `(${jangadas.join(", ")})` : raftLabel;
    return `Navio: ${shipLabel} ${jangadas.length > 1 ? jangadaStr : ''} • Jangada: ${raftLabel} • ${prefix}`;
  }

  async function safeReadJson(response: Response) {
    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();

    if (!rawText) return [];

    if (contentType.includes("application/json")) {
      return JSON.parse(rawText);
    }

    if (rawText.trim().startsWith("<")) {
      throw new Error(`Resposta inválida da API (${response.status}).`);
    }

    return JSON.parse(rawText);
  }

// Utility: format date for display
const formatDate = (value?: string | null) => {
  const date = parseAgendaDateFlexible(value);
  if (!date) return "—";
  return date.toLocaleDateString("pt-PT");
};

  const formatMonthLabel = (date: Date) => {
    return date.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
  };

  const agendaPanels = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const nextMonthDate = new Date(currentYear, currentMonth + 1, 1);
    const nextMonth = nextMonthDate.getMonth();
    const nextMonthYear = nextMonthDate.getFullYear();

    const normalized = rafts
      .map((raft) => {
        const dueDate = parseAgendaDateFlexible(raft.dataProxInspecao);
        const inspectionDate = parseAgendaDateFlexible(raft.dataInspecao);
        const hasHydraulicTestSoon = isWithinNextDays(raft.cylinderDataProxTeste, 30);
        const needsGiTestSoon = hasGiTest(raft);
        return {
          ...raft,
          dueDate,
          inspectionDate,
          hasHydraulicTestSoon,
          needsGiTestSoon,
          expiryFlag: hasHydraulicTestSoon ? "hidraulico" : (needsGiTestSoon ? "gi" : "normal"),
          shipName:
            raft.shipNameManual?.trim() ||
            (raft.shipId ? naviosByIdRef.current[raft.shipId] : "") ||
            "Sem navio",
          label: raft.model?.trim() ? `${raft.model} (${raft.serial})` : raft.serial,
        };
      })
      .filter((raft) => raft.dueDate);

    const expiringNext30Days = normalized
      .filter((raft) => raft.dueDate && isWithinNextDays(raft.dataProxInspecao, 30))
      .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());

    const expiringCurrentMonth = normalized
      .filter(
        (raft) =>
          raft.dueDate!.getMonth() === currentMonth &&
          raft.dueDate!.getFullYear() === currentYear
      )
      .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());

    const expiringNextMonth = normalized
      .filter(
        (raft) =>
          raft.dueDate!.getMonth() === nextMonth &&
          raft.dueDate!.getFullYear() === nextMonthYear
      )
      .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());

    const expiredWithoutInspection = normalized
      .filter((raft) => {
        if (!raft.dueDate) return false;
        const isExpired = raft.dueDate.getTime() < now.getTime();
        const hasNoInspection = !raft.inspectionDate;
        const inspectedBeforeDueDate = raft.inspectionDate
          ? raft.inspectionDate.getTime() < raft.dueDate.getTime()
          : false;
        return isExpired && (hasNoInspection || inspectedBeforeDueDate);
      })
      .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());

    const expiringByDay: Record<string, { label: string; shipName: string; expiryFlag: string }[]> = {};
    normalized.forEach((raft) => {
      if (!raft.dueDate) return;
      const d = raft.dueDate;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!expiringByDay[key]) expiringByDay[key] = [];
      expiringByDay[key].push({ label: raft.label, shipName: raft.shipName, expiryFlag: raft.expiryFlag });
    });

    return {
      currentMonthLabel: formatMonthLabel(new Date(currentYear, currentMonth, 1)),
      nextMonthLabel: formatMonthLabel(nextMonthDate),
      expiringNext30Days,
      expiringCurrentMonth,
      expiringNextMonth,
      expiredWithoutInspection,
      expiringByDay,
    };
  }, [rafts]);

  const unscheduledExpiring = useMemo(() => {
    const scheduledSerials = new Set(
      events
        .filter(ev => /^\d+$/.test(String(ev.id)) && ['scheduled', 'confirmed'].includes(normalizeEventStatus(ev.status)))
        .map(ev => ev.raftSerial)
    );
    return agendaPanels.expiringNext30Days.filter(raft => !scheduledSerials.has(raft.serial));
  }, [events, agendaPanels.expiringNext30Days]);

  const unscheduledServiceStation = useMemo(() => {
    const scheduledSerials = new Set(
      events
        .filter(ev => /^\d+$/.test(String(ev.id)) && ['scheduled', 'confirmed'].includes(normalizeEventStatus(ev.status)))
        .map(ev => ev.raftSerial)
    );
    return serviceStationRafts.filter(raft => !scheduledSerials.has(raft.serial));
  }, [events, serviceStationRafts]);

  const unscheduledExpired = useMemo(() => {
    const scheduledSerials = new Set(
      events
        .filter(ev => /^\d+$/.test(String(ev.id)) && ['scheduled', 'confirmed'].includes(normalizeEventStatus(ev.status)))
        .map(ev => ev.raftSerial)
    );
    return agendaPanels.expiredWithoutInspection.filter(raft => !scheduledSerials.has(raft.serial));
  }, [events, agendaPanels.expiredWithoutInspection]);

  const persistedListEvents = useMemo(() => {
    const term = normalizeText(listSearch);
    const rows = events
      .filter(ev => /^\d+$/.test(String(ev.id)))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    if (!term) return rows;

    return rows.filter((ev) => {
      const shipMatch = String(ev.title || '').match(/Navio:\s*(.*?)\s*•/);
      const ship = shipMatch?.[1]?.trim() || '';
      const haystack = normalizeText(`${ev.raftSerial} ${ship} ${ev.responsavel || ''} ${ev.inspectionType || ''} ${EVENT_STATUS_LABELS[normalizeEventStatus(ev.status)]}`);
      return haystack.includes(term);
    });
  }, [events, listSearch]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const resolveShipName = (raft: AgendaRaft | null | undefined) => {
        if (!raft) return "—";
        if (raft.shipNameManual && raft.shipNameManual.trim()) return raft.shipNameManual.trim();
        if (raft.shipId && naviosByIdRef.current[raft.shipId]) return naviosByIdRef.current[raft.shipId];
        return "—";
      };

      const buildScheduledEvents = (agendaUpdates: AgendaApiEvent[]) => {
        return agendaUpdates
          .filter((ev) => !ev.deleted)
          .map((ev) => {
            const raftSerial = ev.raftSerial || ev.title?.split("(")[1]?.replace(")", "") || "";
            const parsedDate = ev?.date ? new Date(ev.date) : null;
            if (!parsedDate || Number.isNaN(parsedDate.getTime())) return null;
            const raft = raftsRef.current.find((item) => item.serial === raftSerial);
            const raftLabel = getRaftLabel(raft, raftSerial);
            const shipLabel = resolveShipName(raft);
            const normalizedId =
              ev?.id !== undefined && ev?.id !== null && String(ev.id).trim() !== ""
                ? String(ev.id)
                : `agenda-${raftSerial || "sem-serial"}-${parsedDate.toISOString()}`;

            let dur = Number(ev.durationMinutes);
            if (Number.isNaN(dur) || dur <= 0) dur = 210;
            const endDate = new Date(parsedDate.getTime() + (dur * 60 * 1000));
            if (Number.isNaN(endDate.getTime())) return null;

            return {
              id: normalizedId,
              title: ev.type === "ausencia" || ev.type === "expiracao"
                ? ev.title
                : buildAgendaTitle(ev.type === "Entrega" ? "Entrega" : "Inspeção", raftLabel, shipLabel),
              start: parsedDate,
              end: endDate,
              raftSerial,
              status: normalizeEventStatus(ev.status),
              responsavel: ev.responsavel || "",
              inspectionType: normalizeInspectionType(ev.inspectionType),
              type: ev.type || "",
              durationMinutes: dur,
              bufferBeforeMinutes: Number(ev.bufferBeforeMinutes || 15),
              bufferAfterMinutes: Number(ev.bufferAfterMinutes || 15),
            } as InspectionEvent;
          })
          .filter((ev): ev is InspectionEvent => Boolean(ev));
      };

      const syncCalendarEvents = async (fallbackAgendaUpdates?: AgendaApiEvent[]) => {
        let agendaSource = normalizeList<AgendaApiEvent>(fallbackAgendaUpdates);
        try {
          const agendaRes = await fetch("/api/agenda");
          if (agendaRes.ok) {
            const agendaData = await safeReadJson(agendaRes);
            agendaSource = normalizeList<AgendaApiEvent>(agendaData);
          }
        } catch {
          // Mantém fallback recebido por socket.
        }

        const scheduledEvents = buildScheduledEvents(agendaSource);
        setEvents(scheduledEvents);
      };

      const reloadAgendaData = async () => {
        const [raftsRes, naviosRes, agendaRes, stationRes] = await Promise.all([
          fetch("/api/jangadas?scope=all"),
          fetch("/api/navios"),
          fetch("/api/agenda"),
          fetch("/api/service-station"),
        ]);

        if (!raftsRes.ok) {
          const text = await raftsRes.text().catch(() => "");
          console.error(`[Agenda] /api/jangadas failed: ${raftsRes.status} ${text}`);
        }
        if (!naviosRes.ok) {
          const text = await naviosRes.text().catch(() => "");
          console.error(`[Agenda] /api/navios failed: ${naviosRes.status} ${text}`);
        }
        if (!agendaRes.ok) {
          const text = await agendaRes.text().catch(() => "");
          console.error(`[Agenda] /api/agenda failed: ${agendaRes.status} ${text}`);
        }
        if (!stationRes.ok) {
          const text = await stationRes.text().catch(() => "");
          console.error(`[Agenda] /api/service-station failed: ${stationRes.status} ${text}`);
        }

        const raftsData = raftsRes.ok ? await safeReadJson(raftsRes) : [];
        const naviosData = naviosRes.ok ? await safeReadJson(naviosRes) : [];
        const agendaData = agendaRes.ok ? await safeReadJson(agendaRes) : [];
        const stationData = stationRes.ok ? await safeReadJson(stationRes) : [];

        const dbRafts = normalizeList<AgendaRaft>(raftsData);
        const dbNavios = normalizeList<NavioItem>(naviosData);
        const dbStation = normalizeList<any>(stationData);

        raftsRef.current = dbRafts;
        naviosByIdRef.current = dbNavios.reduce<Record<number, string>>((acc, navio) => {
          if (navio?.id) acc[navio.id] = navio.nome;
          return acc;
        }, {});

        setRafts(dbRafts);
        setServiceStationRafts(
          dbStation
            .filter((item: any) => !item.delivered && item.raftId)
            .map((item: any) => ({
              id: item.raftId,
              serial: item.serial || "",
              label: item.model && item.model.trim() ? `${item.model} (${item.serial || item.raftId})` : (item.serial || String(item.raftId)),
              shipName: item.shipName || "Sem navio",
              receivedAt: item.receivedAt || item.arrivalDate || null,
              dataProxInspecao: item.expectedDeliveryDate || null,
            }))
            .sort((a: PanelRaft, b: PanelRaft) => new Date(b.receivedAt || 0).getTime() - new Date(a.receivedAt || 0).getTime())
        );
        await syncCalendarEvents(normalizeList<AgendaApiEvent>(agendaData));
      };

      reloadAgendaDataRef.current = reloadAgendaData;

        reloadAgendaData()
        .catch((e) => {
          console.error("[Agenda] reloadAgendaData error:", e);
        });

      refreshOperationalPanels();

        const handleAgendaRefresh = () => {
          void reloadAgendaData();
          refreshOperationalPanels();
        };

        const handleVisibilityRefresh = () => {
          if (document.visibilityState === "visible") {
            handleAgendaRefresh();
          }
        };

        const refreshInterval = window.setInterval(() => {
          if (document.visibilityState === "visible") {
            handleAgendaRefresh();
          }
        }, 60000);

        window.addEventListener(AGENDA_REFRESH_EVENT, handleAgendaRefresh as EventListener);
        window.addEventListener("focus", handleAgendaRefresh);
        document.addEventListener("visibilitychange", handleVisibilityRefresh);

      return () => {
          window.clearInterval(refreshInterval);
          window.removeEventListener(AGENDA_REFRESH_EVENT, handleAgendaRefresh as EventListener);
          window.removeEventListener("focus", handleAgendaRefresh);
          document.removeEventListener("visibilitychange", handleVisibilityRefresh);
      };
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshOperationalPanels();
    }, 250);
    return () => clearTimeout(timer);
  }, [events]);

  function handleSchedule(event: InspectionEvent) {
    const raft = raftsRef.current.find((item) => item.serial === event.raftSerial);
    const raftLabel = getRaftLabel(raft, event.raftSerial);
    const shipLabel = raft?.shipNameManual?.trim()
      ? raft.shipNameManual.trim()
      : raft?.shipId && naviosByIdRef.current[raft.shipId]
        ? naviosByIdRef.current[raft.shipId]
        : "—";

    // Sincronizar com Prisma via API
    const isUpdate = /^\d+$/.test(String(event.id));
    const payload: AgendaApiPayload = {
      id: event.id,
      title: buildAgendaTitle("Inspeção", raftLabel, shipLabel),
      date: event.start.toISOString(),
      raftSerial: event.raftSerial,
      responsavel: normalizeTechnicianName(event.responsavel) || "",
      status: isUpdate ? (event.status || 'scheduled') : 'scheduled',
      inspectionType: getEventTiming(event).inspectionType,
      durationMinutes: getEventTiming(event).durationMinutes,
      bufferBeforeMinutes: getEventTiming(event).bufferBeforeMinutes,
      bufferAfterMinutes: getEventTiming(event).bufferAfterMinutes,
    };

    const timing = getEventTiming(event);
    const eventEnd = computeOperationalEnd(event.start, timing.durationMinutes);

    const scheduledCountForDay = countScheduledEventsForDay(event.start, isUpdate ? event.id : undefined);
    if (scheduledCountForDay >= MAX_DAILY_SCHEDULED_EVENTS) {
      alert(`Este dia já tem o máximo de ${MAX_DAILY_SCHEDULED_EVENTS} agendamentos (${AZORES_TECHNICIANS.length} técnicos × ${MAX_ACTIVE_RAFTS_PER_TECHNICIAN}). Escolha outro dia.`);
      return;
    }

    // 1. Permitir só um agendamento por jangada
    const sameJangada = events.find((ev) => {
      const persisted = /^\d+$/.test(String(ev.id));
      const st = normalizeEventStatus(ev.status);
      if (!persisted) return false;
      if (!(st === "scheduled" || st === "confirmed")) return false;
      if (isUpdate && String(ev.id) === String(event.id)) return false;
      return ev.raftSerial === event.raftSerial && new Date(ev.start).toDateString() === event.start.toDateString();
    });
    if (sameJangada) {
      alert('Já existe um agendamento para esta jangada neste dia.');
      return;
    }

    // 2. Limitar capacidade operacional simultânea
    const isOverlapping = (a: { start: Date; end: Date }, b: { start: Date; end: Date }) =>
      a.start < b.end && b.start < a.end;
    const eventWindowStart = new Date(event.start.getTime() - timing.bufferBeforeMinutes * 60 * 1000);
    const eventWindowEnd = new Date(eventEnd.getTime() + timing.bufferAfterMinutes * 60 * 1000);
    const overlapping = events.filter((ev) => {
      const persisted = /^\d+$/.test(String(ev.id));
      const st = normalizeEventStatus(ev.status);
      if (!persisted) return false;
      if (!(st === "scheduled" || st === "confirmed" || st === "in_progress" || st === "testing")) return false;
      if (isUpdate && String(ev.id) === String(event.id)) return false;
      const evTiming = getEventTiming(ev);
      const evStart = new Date(ev.start);
      const evEnd = new Date(ev.end);
      const evWindowStart = new Date(evStart.getTime() - evTiming.bufferBeforeMinutes * 60 * 1000);
      const evWindowEnd = new Date(evEnd.getTime() + evTiming.bufferAfterMinutes * 60 * 1000);
      return isOverlapping(
        { start: eventWindowStart, end: eventWindowEnd },
        { start: evWindowStart, end: evWindowEnd }
      );
    });
    if (overlapping.length >= MAX_SIMULTANEOUS_INSPECTIONS) {
      alert(`A agenda operacional já está no limite de ${MAX_SIMULTANEOUS_INSPECTIONS} jangadas em simultâneo.`);
      return;
    }

    if (normalizeEventStatus(event.status) === 'paused') {
      const pausedCount = countPausedEventsForDay(event.start, isUpdate ? event.id : undefined);
      if (pausedCount >= MAX_PAUSED_INSPECTIONS) {
        alert(`A agenda operacional já tem ${MAX_PAUSED_INSPECTIONS} jangadas em pausa.`);
        return;
      }
    }

    const responsavel = normalizeTechnicianName(event.responsavel).trim().toLowerCase();
    if (responsavel) {
      const overlappingByResponsavel = overlapping.filter((ev) => normalizeTechnicianName(ev.responsavel).trim().toLowerCase() === responsavel);
      if (overlappingByResponsavel.length >= MAX_ACTIVE_RAFTS_PER_TECHNICIAN) {
        alert(`Este responsável já está no limite de ${MAX_ACTIVE_RAFTS_PER_TECHNICIAN} inspeções sobrepostas nesta janela operacional.`);
        return;
      }

      const technicianActiveCount = countTechnicianActiveForDay(event.start, responsavel, isUpdate ? event.id : undefined);
      if (technicianActiveCount >= MAX_ACTIVE_RAFTS_PER_TECHNICIAN) {
        alert(`Este responsável já tem ${MAX_ACTIVE_RAFTS_PER_TECHNICIAN} jangadas ativas neste dia. Se uma estiver a secar/aguardar, muda o estado e agenda outra.`);
        return;
      }
    }

    // 3. Cor verde ao agendar
    if (!isUpdate) event.status = 'scheduled'; // preserve status on updates
    event.color = 'green';
    event.end = eventEnd;
    event.inspectionType = timing.inspectionType;
    event.durationMinutes = timing.durationMinutes;
    event.bufferBeforeMinutes = timing.bufferBeforeMinutes;
    event.bufferAfterMinutes = timing.bufferAfterMinutes;

    // 4. Agrega jangadas no nome do navio
    event.title = buildAgendaTitle("Inspeção", raftLabel, shipLabel, event.raftSerial);
    // Se for novo, POST. Se for edição, PUT.
    const method = isUpdate ? 'PUT' : 'POST';
    fetch('/api/agenda', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Falha ao guardar agendamento");
        }
        return safeReadJson(res);
      })
      .then((data: AgendaApiEvent) => {
        const normalizedSaved = {
          ...data,
          id: data?.id ?? event.id,
          title: payload.title,
          date: data?.date ?? event.start.toISOString(),
          raftSerial: payload.raftSerial,
          responsavel: payload.responsavel,
          inspectionType: payload.inspectionType,
          durationMinutes: payload.durationMinutes,
          bufferBeforeMinutes: payload.bufferBeforeMinutes,
          bufferAfterMinutes: payload.bufferAfterMinutes,
        };
        const persistedId = normalizedSaved?.id ? String(normalizedSaved.id) : String(event.id);
        const persistedStart = normalizedSaved?.date ? new Date(normalizedSaved.date) : event.start;
        const persistedDuration = Number(normalizedSaved?.durationMinutes || timing.durationMinutes || 210);
        const persistedEnd = new Date(persistedStart.getTime() + persistedDuration * 60 * 1000);
        setEvents(evts => [
          ...evts.filter(e => !(e.id === event.id || e.id === persistedId)),
          {
            ...event,
            id: persistedId,
            start: persistedStart,
            end: persistedEnd,
            status: normalizeEventStatus(String(normalizedSaved?.status || payload.status || event.status || 'scheduled')),
            title: buildAgendaTitle("Inspeção", raftLabel, shipLabel, event.raftSerial),
            inspectionType: normalizeInspectionType(normalizedSaved?.inspectionType),
            durationMinutes: persistedDuration,
            bufferBeforeMinutes: Number(normalizedSaved?.bufferBeforeMinutes || timing.bufferBeforeMinutes || 15),
            bufferAfterMinutes: Number(normalizedSaved?.bufferAfterMinutes || timing.bufferAfterMinutes || 15),
          }
        ]);
        triggerAgendaReload();
      })
      .catch((error) => {
        console.error("Erro ao guardar agendamento:", error);
        const message = error instanceof Error ? error.message : "Não foi possível guardar o agendamento.";
        alert(message);
      });
  }

  function handleEventDropOrResize(payload: CalendarMutationPayload) {
    const moved = payload?.event;
    if (!moved) return;

    if (String(moved.id).startsWith("expiracao-")) {
      triggerAgendaReload();
      return;
    }

    if (String(moved.id).startsWith("ausencia-")) {
      alert("Não é possível alterar a data ou responsável da ausência/férias a partir do calendário. Altere na página de Técnicos.");
      triggerAgendaReload();
      return;
    }

    const movedStatus = normalizeEventStatus(moved.status);
    if (!(movedStatus === 'scheduled' || movedStatus === 'confirmed')) return;

    const nextStart = payload?.start ? new Date(payload.start) : new Date(moved.start);
    const timing = getEventTiming(moved);
    const nextEnd = payload?.end ? new Date(payload.end) : computeOperationalEnd(nextStart, timing.durationMinutes);

    const raft = raftsRef.current.find((item) => item.serial === moved.raftSerial);
    const raftLabel = getRaftLabel(raft, moved.raftSerial);
    const shipLabel = raft?.shipNameManual?.trim()
      ? raft.shipNameManual.trim()
      : raft?.shipId && naviosByIdRef.current[raft.shipId]
        ? naviosByIdRef.current[raft.shipId]
        : "—";

    let nextResponsavel = moved.responsavel || "";
    if ((payload as any).resourceId !== undefined) {
      nextResponsavel = (payload as any).resourceId === 'Sem Responsável' ? '' : (payload as any).resourceId;
    }

    const updatedEvent: InspectionEvent = {
      ...moved,
      start: nextStart,
      end: nextEnd,
      status: movedStatus,
      responsavel: nextResponsavel,
      title: buildAgendaTitle("Inspeção", raftLabel, shipLabel, moved.raftSerial),
    };

    setEvents(evts => [
      ...evts.filter(e => String(e.id) !== String(updatedEvent.id)),
      updatedEvent
    ]);

    const scheduledCountForDay = countScheduledEventsForDay(nextStart, updatedEvent.id);
    if (scheduledCountForDay >= MAX_DAILY_SCHEDULED_EVENTS) {
      alert(`Este dia já tem o máximo de ${MAX_DAILY_SCHEDULED_EVENTS} agendamentos (${AZORES_TECHNICIANS.length} técnicos × ${MAX_ACTIVE_RAFTS_PER_TECHNICIAN}). Escolha outro dia.`);
      return;
    }

    const technicianActiveCount = countTechnicianActiveForDay(nextStart, normalizeTechnicianName(updatedEvent.responsavel), updatedEvent.id);
    if (technicianActiveCount >= MAX_ACTIVE_RAFTS_PER_TECHNICIAN) {
      alert(`Este responsável já tem ${MAX_ACTIVE_RAFTS_PER_TECHNICIAN} jangadas ativas neste dia. Se uma estiver a secar/aguardar, muda o estado e agenda outra.`);
      return;
    }

    const method = /^\d+$/.test(String(updatedEvent.id)) ? 'PUT' : 'POST';
    const requestPayload: AgendaApiPayload = {
      id: updatedEvent.id,
      title: updatedEvent.title,
      date: updatedEvent.start.toISOString(),
      raftSerial: updatedEvent.raftSerial,
      responsavel: normalizeTechnicianName(updatedEvent.responsavel) || "",
      status: updatedEvent.status || 'scheduled',
      inspectionType: timing.inspectionType,
      durationMinutes: Math.max(60, Math.round((nextEnd.getTime() - nextStart.getTime()) / 60000)),
      bufferBeforeMinutes: timing.bufferBeforeMinutes,
      bufferAfterMinutes: timing.bufferAfterMinutes,
    };

    fetch('/api/agenda', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || 'Falha ao atualizar agendamento');
        }
        return safeReadJson(res);
      })
      .then((data: AgendaApiEvent) => {
        const normalizedSaved = {
          ...data,
          id: data?.id ?? updatedEvent.id,
          title: requestPayload.title,
          date: data?.date ?? updatedEvent.start.toISOString(),
          raftSerial: requestPayload.raftSerial,
          responsavel: requestPayload.responsavel,
          inspectionType: requestPayload.inspectionType,
          durationMinutes: requestPayload.durationMinutes,
          bufferBeforeMinutes: requestPayload.bufferBeforeMinutes,
          bufferAfterMinutes: requestPayload.bufferAfterMinutes,
        };

        const persistedId = normalizedSaved?.id ? String(normalizedSaved.id) : String(updatedEvent.id);
        const persistedStart = normalizedSaved?.date ? new Date(normalizedSaved.date) : updatedEvent.start;
        const persistedDuration = Number(normalizedSaved?.durationMinutes || requestPayload.durationMinutes || 210);
        const persistedEnd = new Date(persistedStart.getTime() + persistedDuration * 60 * 1000);

        setEvents((prev) => [
          ...prev.filter((ev) => !(ev.id === updatedEvent.id || ev.id === persistedId)),
          {
            ...updatedEvent,
            id: persistedId,
            start: persistedStart,
            end: persistedEnd,
            status: normalizeEventStatus(String(normalizedSaved?.status || requestPayload.status || updatedEvent.status || 'scheduled')),
            inspectionType: normalizeInspectionType(normalizedSaved?.inspectionType),
            durationMinutes: persistedDuration,
            bufferBeforeMinutes: Number(normalizedSaved?.bufferBeforeMinutes || requestPayload.bufferBeforeMinutes || 15),
            bufferAfterMinutes: Number(normalizedSaved?.bufferAfterMinutes || requestPayload.bufferAfterMinutes || 15),
          },
        ]);
        triggerAgendaReload();
      })
      .catch((error) => {
        console.error('Erro ao mover agendamento:', error);
        const message = error instanceof Error ? error.message : 'Não foi possível mover o agendamento.';
        alert(message);
      });
  }

  function handleDeleteEvent(event: InspectionEvent) {
    if (!/^\d+$/.test(String(event.id))) return;
    fetch('/api/agenda', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(event.id) })
    })
    .then(async (res) => {
      if (!res.ok) throw new Error('Falha ao desmarcar');
      return res.json();
    })
    .then(() => {
      setEvents(prev => prev.filter(e => String(e.id) !== String(event.id)));
      triggerAgendaReload();
    })
    .catch(err => alert(err.message));
  }

  function handleBoardStatusChange(event: InspectionEvent, newStatus: string) {
    if (!/^\d+$/.test(String(event.id))) return;
    
    const requestPayload: AgendaApiPayload = {
      id: event.id,
      title: event.title,
      date: event.start.toISOString(),
      raftSerial: event.raftSerial,
      responsavel: normalizeTechnicianName(event.responsavel) || "",
      status: newStatus,
      inspectionType: event.inspectionType,
      durationMinutes: event.durationMinutes,
      bufferBeforeMinutes: event.bufferBeforeMinutes,
      bufferAfterMinutes: event.bufferAfterMinutes,
    };

    // Optimistic update
    setEvents(evts => evts.map(e => String(e.id) === String(event.id) ? { ...e, status: newStatus } : e));

    fetch('/api/agenda', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
    })
    .then(async res => {
       if (!res.ok) throw new Error('Falha ao atualizar estado no Quadro');
       return res.json();
    })
    .then(() => {
       triggerAgendaReload();
    })
    .catch(err => {
      alert(err.message);
      // Revert if error
      setEvents(evts => evts.map(e => String(e.id) === String(event.id) ? { ...e, status: event.status } : e));
    });
  }

  function buildDragEventFromRaft(raft: PanelRaft, panelPrefix: string): InspectionEvent {
    const dueDate = raft?.dueDate instanceof Date ? raft.dueDate : new Date();
    const inspectionType: InspectionType = raft?.expiryFlag === "hidraulico"
      ? "hidraulico"
      : raft?.expiryFlag === "gi"
        ? "anual_gi"
        : "anual";
    const defaults = getInspectionDefaults(inspectionType);
    const start = new Date(dueDate);
    start.setHours(9, 0, 0, 0);
    const end = computeOperationalEnd(start, defaults.durationMinutes);

    return {
      id: `drag-${raft?.serial || 'raft'}-${Date.now()}`,
      title: buildAgendaTitle(panelPrefix, raft?.label || raft?.serial || "—", raft?.shipName || "—"),
      start,
      end,
      raftSerial: raft?.serial || "",
      status: "alert",
      inspectionType,
      durationMinutes: defaults.durationMinutes,
      bufferBeforeMinutes: defaults.bufferBeforeMinutes,
      bufferAfterMinutes: defaults.bufferAfterMinutes,
    };
  }

  function handlePanelDragStart(raft: PanelRaft, panelPrefix: string) {
    setExternalDragEvent(buildDragEventFromRaft(raft, panelPrefix));
  }

  function toDatetimeLocal(date: Date | null | undefined): string {
    const now = new Date();
    const d = date && !Number.isNaN(new Date(date).getTime()) ? new Date(date) : new Date(now);
    if (d <= now) { d.setFullYear(now.getFullYear(), now.getMonth(), now.getDate() + 1); }
    d.setHours(9, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
  }

  function getShipNameFromEventTitle(title: string): string {
    const shipMatch = String(title || '').match(/Navio:\s*(.*?)\s*•/);
    return shipMatch?.[1]?.trim() || '—';
  }

  function getPersistedAgendaRows(): AgendaExportRow[] {
    return events
      .filter((ev) => /^\d+$/.test(String(ev.id)))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .map((ev) => ({
        id: String(ev.id),
        data: new Date(ev.start).toLocaleDateString('pt-PT'),
        hora: new Date(ev.start).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
        estado: EVENT_STATUS_LABELS[normalizeEventStatus(ev.status)],
        jangada: ev.raftSerial,
        navio: getShipNameFromEventTitle(ev.title),
        tipo: ev.inspectionType || 'outro',
        responsavel: ev.responsavel || '—',
        duracao: ev.durationMinutes ?? null,
      }));
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleExportCSV() {
    try {
      setExportingFormat('csv');
      const header = ['ID', 'Data', 'Hora', 'Estado', 'Jangada', 'Navio', 'Tipo', 'Responsável', 'Duração (min)'];
      const rows = getPersistedAgendaRows().map((row) => [
        row.id,
        row.data,
        row.hora,
        row.estado,
        row.jangada,
        row.navio,
        row.tipo,
        row.responsavel,
        String(row.duracao ?? ''),
      ]);
      const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      downloadBlob(blob, `agenda-${new Date().toISOString().slice(0, 10)}.csv`);
    } finally {
      setExportingFormat(null);
    }
  }

  async function handleExportExcel() {
    const rows = getPersistedAgendaRows();
    if (rows.length === 0) {
      alert('Não existem agendamentos persistidos para exportar.');
      return;
    }

    try {
      setExportingFormat('excel');
      const { Workbook } = await import('exceljs');
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet('Agenda');

      worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Data', key: 'data', width: 14 },
        { header: 'Hora', key: 'hora', width: 10 },
        { header: 'Estado', key: 'estado', width: 18 },
        { header: 'Jangada', key: 'jangada', width: 20 },
        { header: 'Navio', key: 'navio', width: 28 },
        { header: 'Tipo', key: 'tipo', width: 16 },
        { header: 'Responsável', key: 'responsavel', width: 24 },
        { header: 'Duração (min)', key: 'duracao', width: 16 },
      ];

      const titleRow = worksheet.addRow(['Agenda de Inspeções']);
      titleRow.font = { bold: true, size: 16 };
      worksheet.mergeCells(`A${titleRow.number}:I${titleRow.number}`);

      const metaRow = worksheet.addRow([`Exportado em ${new Date().toLocaleString('pt-PT')}`]);
      metaRow.font = { italic: true, color: { argb: 'FF6B7280' } };
      worksheet.mergeCells(`A${metaRow.number}:I${metaRow.number}`);
      worksheet.addRow([]);

      const headerRow = worksheet.addRow(worksheet.columns.map((column) => column.header));
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

      rows.forEach((row) => worksheet.addRow(row));

      worksheet.views = [{ state: 'frozen', ySplit: 4 }];
      worksheet.autoFilter = {
        from: { row: headerRow.number, column: 1 },
        to: { row: headerRow.number, column: 9 },
      };

      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle', horizontal: rowNumber === headerRow.number ? 'center' : 'left' };
          if (rowNumber > headerRow.number && rowNumber % 2 === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
          }
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      downloadBlob(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `agenda-${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch (error) {
      console.error('Erro ao exportar Excel da agenda:', error);
      alert('Não foi possível exportar a agenda para Excel.');
    } finally {
      setExportingFormat(null);
    }
  }

  async function handleExportPDF() {
    const rows = getPersistedAgendaRows();
    if (rows.length === 0) {
      alert('Não existem agendamentos persistidos para exportar.');
      return;
    }

    try {
      setExportingFormat('pdf');
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);

      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(16);
      doc.text('Agenda de Inspeções', 14, 16);
      doc.setFontSize(10);
      doc.text(`Exportado em ${new Date().toLocaleString('pt-PT')}`, 14, 23);

      autoTable(doc, {
        startY: 30,
        head: [[ 'ID', 'Data', 'Hora', 'Estado', 'Jangada', 'Navio', 'Tipo', 'Responsável', 'Duração (min)' ]],
        body: rows.map((row) => [
          row.id,
          row.data,
          row.hora,
          row.estado,
          row.jangada,
          row.navio,
          row.tipo,
          row.responsavel,
          row.duracao ?? '—',
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [79, 70, 229] },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        margin: { top: 30, right: 10, bottom: 12, left: 10 },
      });

      doc.save(`agenda-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error('Erro ao exportar PDF da agenda:', error);
      alert('Não foi possível exportar a agenda para PDF.');
    } finally {
      setExportingFormat(null);
    }
  }

  function handleQuickSchedule() {
    if (!quickScheduleTarget || !quickScheduleDateTime) return;
    const start = new Date(quickScheduleDateTime);
    if (Number.isNaN(start.getTime())) return;
    const suggestedResponsavel = suggestBestTechnician(start);
    const resolvedResponsavel = normalizeTechnicianName(quickScheduleResponsavel) || suggestedResponsavel;
    const inspectionType: InspectionType =
      quickScheduleTarget.expiryFlag === 'hidraulico' ? 'hidraulico'
      : quickScheduleTarget.expiryFlag === 'gi' ? 'anual_gi'
      : 'anual';
    const defaults = getInspectionDefaults(inspectionType);
    const event: InspectionEvent = {
      id: `quick-${quickScheduleTarget.serial}-${Date.now()}`,
      title: buildAgendaTitle("Inspeção", quickScheduleTarget.label, quickScheduleTarget.shipName, quickScheduleTarget.serial),
      start,
      end: computeOperationalEnd(start, defaults.durationMinutes),
      raftSerial: quickScheduleTarget.serial,
      status: 'alert',
      responsavel: resolvedResponsavel,
      inspectionType,
      durationMinutes: defaults.durationMinutes,
      bufferBeforeMinutes: defaults.bufferBeforeMinutes,
      bufferAfterMinutes: defaults.bufferAfterMinutes,
    };
    handleSchedule(event);
    setQuickScheduleTarget(null);
    setQuickScheduleDateTime('');
    setQuickScheduleResponsavel('');
  }

  async function handleDesmarcarTodos() {
    if (!window.confirm("Tens a certeza que queres cancelar TODOS os agendamentos activos? Os registos ficam com estado 'Cancelado' para histórico.")) return;
    try {
      const res = await fetch("/api/agenda", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteAll: true }),
      });
      if (!res.ok) throw new Error("Falha na resposta do servidor");
      setEvents(prev => prev.map(ev =>
        /^\d+$/.test(String(ev.id)) && ['scheduled', 'confirmed'].includes(normalizeEventStatus(ev.status))
          ? { ...ev, status: 'cancelled' }
          : ev
      ));
      refreshOperationalPanels();
    } catch {
      alert("Não foi possível cancelar os agendamentos. Tenta novamente.");
    }
  }

  return (
    <div className="p-6">
      <AgendaHeader 
        handleExportCSV={handleExportCSV}
        handleExportExcel={handleExportExcel}
        handleExportPDF={handleExportPDF}
        handleDesmarcarTodos={handleDesmarcarTodos}
        handleSyncGoogleCalendar={handleSyncGoogleCalendar}
        syncingGoogleCalendar={syncingGoogleCalendar}
        lastGoogleSync={lastGoogleSync}
      />

      {/* Alert: rafts expiring in 30 days without a schedule */}
      {unscheduledExpiring.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <span className="text-amber-500 text-xl mt-0.5">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              {unscheduledExpiring.length} jangada{unscheduledExpiring.length !== 1 ? 's' : ''} com validade a expirar nos próximos 30 dias sem agendamento
            </p>
            <p className="text-xs text-amber-700 mt-0.5 truncate">
              {unscheduledExpiring.slice(0, 6).map(r => r.label).join(' · ')}
              {unscheduledExpiring.length > 6 ? ` · +${unscheduledExpiring.length - 6} mais` : ''}
            </p>
          </div>
        </div>
      )}

      {/* KPI cards */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-col gap-1">
            <p className="text-xs text-gray-500 font-medium">Total agendamentos</p>
            <p className="text-2xl font-bold text-gray-900">{metrics.total}</p>
          </div>
          <div className="bg-white rounded-xl border border-sky-200 p-3 flex flex-col gap-1">
            <p className="text-xs text-sky-600 font-medium">Próximos 7 dias</p>
            <p className="text-2xl font-bold text-sky-700">{metrics.upcomingNext7Days}</p>
          </div>
          <div className="bg-white rounded-xl border border-red-200 p-3 flex flex-col gap-1">
            <p className="text-xs text-red-600 font-medium">Em atraso</p>
            <p className="text-2xl font-bold text-red-700">{metrics.overdueCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-green-200 p-3 flex flex-col gap-1">
            <p className="text-xs text-green-700 font-medium">Taxa de conclusão</p>
            <p className="text-2xl font-bold text-green-700">{metrics.completionRate}%</p>
          </div>
          <div className="bg-white rounded-xl border border-violet-200 p-3 flex flex-col gap-1">
            <p className="text-xs text-violet-600 font-medium">Duração média</p>
            <p className="text-2xl font-bold text-violet-700">{metrics.averageDuration}&thinsp;min</p>
          </div>
          <div className={`bg-white rounded-xl border p-3 flex flex-col gap-1 ${conflictCount > 0 ? 'border-orange-300' : 'border-gray-200'}`}>
            <p className={`text-xs font-medium ${conflictCount > 0 ? 'text-orange-600' : 'text-gray-500'}`}>Conflitos</p>
            <p className={`text-2xl font-bold ${conflictCount > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{conflictCount}</p>
          </div>
        </div>
      )}

      {/* Status distribution pills */}
      {metrics && Object.keys(metrics.byStatus).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {(Object.entries(metrics.byStatus) as [string, number][]).map(([st, count]) => {
            const key = normalizeEventStatus(st);
            const c = EVENT_STATUS_COLORS[key];
            return (
              <span key={st} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
                {EVENT_STATUS_LABELS[key]} · {count}
              </span>
            );
          })}
        </div>
      )}

      {conflictCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span>Alerta de Conflitos na Agenda ({conflictCount})</span>
          </h3>
          <ul className="space-y-1.5 text-xs text-amber-800 list-disc list-inside">
            {conflicts.map((c, i) => (
              <li key={i}>{c.description}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8">
          {viewMode === 'calendar' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-gray-200">
                <div className="text-sm text-gray-700">
                  <span className="font-semibold text-indigo-700">Modo de visualização:</span> {showTimeline ? "Linha de Tempo / Planeamento Gantt" : "Calendário Operacional"}
                </div>
                <button
                  type="button"
                  onClick={() => setShowTimeline(prev => !prev)}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  {showTimeline ? "🔍 Ver Calendário" : "📅 Ver Linha de Tempo / Gantt"}
                </button>
              </div>

              {showTimeline ? (
                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-150 pb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">Linha de Tempo dos Técnicos (Vista Gantt)</h3>
                      <p className="text-xs text-slate-500">Distribuição semanal de carga horária, agendamentos e férias/ausências.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const prev = new Date(timelineStartDate);
                          prev.setDate(prev.getDate() - 7);
                          setTimelineStartDate(prev);
                        }}
                        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        ◀ Anterior
                      </button>
                      <button
                        type="button"
                        onClick={() => setTimelineStartDate(new Date())}
                        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Hoje
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = new Date(timelineStartDate);
                          next.setDate(next.getDate() + 7);
                          setTimelineStartDate(next);
                        }}
                        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Seguinte ▶
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {AZORES_TECHNICIANS.map((tech) => {
                      const techEvents = events.filter(e => e.responsavel && e.responsavel.toLowerCase().includes(tech.name.toLowerCase()));
                      
                      // Calculate load for the visible 7 days
                      let totalVisibleEvents = 0;
                      for (let i = 0; i < 7; i++) {
                        const checkDay = new Date(timelineStartDate);
                        checkDay.setDate(checkDay.getDate() + i);
                        const checkDayStr = checkDay.toISOString().slice(0, 10);
                        totalVisibleEvents += techEvents.filter(e => {
                          const evDate = e.start instanceof Date ? e.start : new Date(e.start);
                          return evDate.toISOString().slice(0, 10) === checkDayStr;
                        }).length;
                      }

                      const loadLabel = totalVisibleEvents === 0 
                        ? "Livre" 
                        : totalVisibleEvents < 3 
                          ? "Moderada" 
                          : "Elevada";
                      
                      const loadColorClass = totalVisibleEvents === 0 
                        ? "bg-slate-100 text-slate-700" 
                        : totalVisibleEvents < 3 
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                          : "bg-rose-50 text-rose-700 border border-rose-100";

                      return (
                        <div key={tech.id} className="border-b border-slate-100 pb-5 last:border-0 last:pb-0">
                          <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
                            <div>
                              <span className="font-bold text-slate-800 text-sm">{tech.name}</span>
                              <span className="text-xs text-slate-500 ml-1.5">({tech.role})</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${loadColorClass}`}>
                                Carga: {loadLabel} ({totalVisibleEvents} OTs)
                              </span>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-7 gap-2">
                            {Array.from({ length: 7 }).map((_, i) => {
                              const day = new Date(timelineStartDate);
                              day.setDate(day.getDate() + i);
                              const dayStr = day.toISOString().slice(0, 10);
                              
                              const dayEvents = techEvents.filter(e => {
                                const evDate = e.start instanceof Date ? e.start : new Date(e.start);
                                return evDate.toISOString().slice(0, 10) === dayStr;
                              });
                              const hasAbsence = conflicts.some(c => c.type === 'technician_absence' && c.date === dayStr && c.description.includes(tech.name));
                              const hasIslandConflict = conflicts.some(c => c.type === 'island_travel' && c.date === dayStr && c.description.includes(tech.name));
                              
                              return (
                                <div key={i} className={`rounded-xl border p-2 min-h-[100px] flex flex-col justify-between transition-all duration-200 hover:shadow-sm ${
                                  hasAbsence 
                                    ? 'bg-rose-50/70 border-rose-200 text-rose-800' 
                                    : hasIslandConflict
                                      ? 'bg-amber-50/70 border-amber-200 text-amber-800'
                                      : dayEvents.length > 0 
                                        ? 'bg-indigo-50/40 border-indigo-200 text-indigo-900' 
                                        : 'bg-slate-50/50 border-slate-200 text-slate-500'
                                }`}>
                                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 border-b border-slate-200/50 pb-1 mb-1">
                                    {day.toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric' })}
                                  </div>
                                  <div className="flex-1 space-y-1">
                                    {hasAbsence ? (
                                      <div className="text-[10px] font-bold text-rose-700 leading-tight">🏖️ Ausente</div>
                                    ) : hasIslandConflict ? (
                                      <div className="text-[10px] font-bold text-amber-700 leading-tight">✈️ Viagem</div>
                                    ) : dayEvents.length > 0 ? (
                                      dayEvents.slice(0, 3).map((de, idx) => {
                                        const eventTime = de.start instanceof Date 
                                          ? de.start.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
                                          : new Date(de.start).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
                                        
                                        const parts = de.title.split(' • ');
                                        const ship = parts[0]?.replace('Navio:', '').trim() || 'Sem Navio';
                                        
                                        return (
                                          <div 
                                            key={idx} 
                                            className="group relative cursor-pointer text-[9px] bg-white border border-indigo-200 rounded-md px-1.5 py-1 font-medium shadow-sm hover:border-indigo-400 transition-colors"
                                          >
                                            <div className="font-bold truncate text-slate-700">{ship}</div>
                                            <div className="text-[8px] text-indigo-600 font-semibold">{eventTime}</div>
                                            
                                            {/* Beautiful CSS Tooltip on Hover */}
                                            <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-xl z-50 w-56 space-y-1 pointer-events-none">
                                              <div className="font-bold border-b border-slate-700 pb-1 mb-1">{ship}</div>
                                              <div><span className="text-slate-400">Modelo:</span> {de.title.split(' • ')[1]?.replace('Jangada:', '').trim() || de.raftSerial}</div>
                                              <div><span className="text-slate-400">Hora:</span> {eventTime}</div>
                                              <div>
                                                <span className="text-slate-400">Estado:</span>{" "}
                                                <span className={`capitalize font-bold ${de.status === 'aprovada' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                  {de.status}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })
                                    ) : (
                                      <div className="text-[9px] text-slate-400 italic">Disponível</div>
                                    )}
                                    {dayEvents.length > 3 && (
                                      <div className="text-[8px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-md py-0.5 text-center mt-1">
                                        +{dayEvents.length - 3} mais
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <InspectionCalendar
                  events={events}
                  onSchedule={handleSchedule}
                  onEventDrop={handleEventDropOrResize}
                  onEventResize={handleEventDropOrResize}
                  externalDragEvent={externalDragEvent}
                  onExternalEventConsumed={() => setExternalDragEvent(null)}
                  expiringByDay={agendaPanels.expiringByDay}
                  onDeleteEvent={handleDeleteEvent}
                />
              )}
            </div>
          ) : viewMode === 'list' ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Todos os agendamentos</h2>
                <span className="text-xs text-gray-500">{persistedListEvents.length} registos</span>
              </div>
              <div className="px-4 py-3 border-b border-gray-100 bg-white">
                <input
                  type="text"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder="Pesquisar por jangada, navio, responsável, tipo ou estado..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Data</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Hora</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Estado</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Jangada</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Navio</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Tipo</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Responsável</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Dur.</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {persistedListEvents.map(ev => {
                        const st = normalizeEventStatus(ev.status);
                        const c = EVENT_STATUS_COLORS[st];
                        const shipMatch = String(ev.title || '').match(/Navio:\s*(.*?)\s*•/);
                        const ship = shipMatch?.[1]?.trim() || '—';
                        return (
                          <tr key={String(ev.id)} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{new Date(ev.start).toLocaleDateString('pt-PT')}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{new Date(ev.start).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="px-3 py-2">
                              <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
                                {EVENT_STATUS_LABELS[st]}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-medium text-gray-900">{ev.raftSerial}</td>
                            <td className="px-3 py-2 text-gray-600">{ship}</td>
                            <td className="px-3 py-2 text-gray-500">{ev.inspectionType || 'outro'}</td>
                            <td className="px-3 py-2 text-gray-500">{ev.responsavel || '—'}</td>
                            <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{ev.durationMinutes ? `${ev.durationMinutes}m` : '—'}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => {
                                  if (window.confirm("Deseja desmarcar este agendamento?")) {
                                    handleDeleteEvent(ev);
                                  }
                                }}
                                className="text-red-600 hover:text-red-800 font-semibold text-xs transition-colors"
                              >
                                Desmarcar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    {persistedListEvents.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 italic">Sem agendamentos.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <AgendaBoard events={events} onStatusChange={handleBoardStatusChange} />
          )}
        </div>
        <aside className="xl:col-span-4 space-y-4 xl:order-first">
          {/* Service Station Queue Panel */}
          <div className="bg-white rounded-xl border border-indigo-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
                <span>🏭</span> Na Estação de Serviço
              </h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                {unscheduledServiceStation.length}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-2">Jangadas recebidas para inspeção</p>
            <ul className="space-y-2 max-h-56 overflow-auto">
              {unscheduledServiceStation.map((raft) => (
                <li
                  key={`station-${raft.id ?? raft.serial}`}
                  className="bg-white p-3 rounded-xl shadow-sm border border-indigo-100 cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5 transition-all relative overflow-hidden"
                  draggable
                  onDragStart={() => handlePanelDragStart(raft, "Estação de Serviço")}
                  onDragEnd={() => setExternalDragEvent(null)}
                  title="Arraste para o calendário para agendar"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-400" />
                  <div className="pl-1">
                    <p className="text-sm font-bold truncate leading-tight mb-1 text-indigo-900">{raft.shipName}</p>
                    <p className="text-xs font-mono text-indigo-800 mb-1">{raft.label}</p>
                    <p className="text-xs text-indigo-700">Recebida: {formatDate(raft.receivedAt)}</p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-indigo-50">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-800">
                        Recebida
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const suggestedDate = toDatetimeLocal(raft.dueDate || new Date());
                          const suggestedTech = suggestBestTechnician(new Date(suggestedDate));
                          setQuickScheduleTarget({ serial: raft.serial, label: raft.label, shipName: raft.shipName, expiryFlag: 'normal', dataProxInspecao: raft.dataProxInspecao, dueDate: raft.dueDate });
                          setQuickScheduleDateTime(suggestedDate);
                          setQuickScheduleResponsavel(suggestedTech || '');
                        }}
                        className="text-xs px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold transition-colors"
                      >Agendar</button>
                    </div>
                  </div>
                </li>
              ))}
              {unscheduledServiceStation.length === 0 && (
                <li className="text-sm text-gray-500 italic">Nenhuma jangada na estação de serviço por agendar.</li>
              )}
            </ul>
          </div>

          <div className="bg-white rounded-xl border border-blue-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-blue-900">Caducam nos próximos 30 dias</h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                {agendaPanels.expiringNext30Days.length}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-2">Azul: GI test • Vermelho: teste hidráulico do cilindro</p>
            <ul className="space-y-2 max-h-56 overflow-auto">
              {agendaPanels.expiringNext30Days.map((raft) => {
                const isHydraulic = raft.expiryFlag === "hidraulico";
                const isGi = raft.expiryFlag === "gi";
                const liClass = isHydraulic
                  ? "bg-white p-3 rounded-xl shadow-sm border border-red-200 cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5 transition-all relative overflow-hidden"
                  : isGi
                    ? "bg-white p-3 rounded-xl shadow-sm border border-blue-200 cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5 transition-all relative overflow-hidden"
                    : "bg-white p-3 rounded-xl shadow-sm border border-slate-200 cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5 transition-all relative overflow-hidden";
                const titleClass = isHydraulic ? "text-red-900" : isGi ? "text-blue-900" : "text-slate-800";
                const metaClass = isHydraulic ? "text-red-700" : isGi ? "text-blue-700" : "text-slate-500";
                const barColor = isHydraulic ? "#fca5a5" : isGi ? "#93c5fd" : "#cbd5e1";

                return (
                  <li
                    key={`next30-${raft.id ?? raft.serial}`}
                    className={liClass}
                    draggable
                    onDragStart={() => handlePanelDragStart(raft, "Próxima inspeção")}
                    onDragEnd={() => setExternalDragEvent(null)}
                    title="Arraste para o calendário para agendar"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: barColor }} />
                    <div className="pl-1">
                      <p className={`text-sm font-bold truncate leading-tight mb-1 ${titleClass}`}>{raft.shipName}</p>
                      <p className={`text-xs font-mono mb-1 ${metaClass}`}>{raft.label}</p>
                      <p className={`text-xs ${metaClass}`}>Prox: {formatDate(raft.dataProxInspecao)}</p>
                      {isHydraulic && <p className="text-xs font-semibold text-red-600 mt-1">⚠ Cilindro Hidráulico</p>}
                      {!isHydraulic && isGi && <p className="text-xs font-semibold text-blue-600 mt-1">ℹ GI test</p>}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-50">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold ${isHydraulic ? 'bg-red-100 text-red-700' : isGi ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>
                          {isHydraulic ? '🔴 4h' : isGi ? '🔵 5h' : '🟢 2h'}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const suggestedDate = toDatetimeLocal(raft.dueDate);
                            const suggestedTech = suggestBestTechnician(new Date(suggestedDate));
                            setQuickScheduleTarget({ serial: raft.serial, label: raft.label, shipName: raft.shipName, expiryFlag: raft.expiryFlag, dataProxInspecao: raft.dataProxInspecao, dueDate: raft.dueDate });
                            setQuickScheduleDateTime(suggestedDate);
                            setQuickScheduleResponsavel(suggestedTech || '');
                          }}
                          className="text-xs px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold transition-colors"
                        >Agendar</button>
                      </div>
                    </div>
                  </li>
                );
              })}
              {agendaPanels.expiringNext30Days.length === 0 && (
                <li className="text-sm text-gray-500 italic">Sem jangadas a caducar nos próximos 30 dias.</li>
              )}
            </ul>
          </div>

          {showAdvancedPanels && (
            <>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-gray-900">Caducam no mês atual</h2>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    {agendaPanels.expiringCurrentMonth.length}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-3">{agendaPanels.currentMonthLabel}</p>
                <ul className="space-y-2 max-h-56 overflow-auto">
                  {agendaPanels.expiringCurrentMonth.map((raft) => (
                    <li
                      key={`cur-${raft.id ?? raft.serial}`}
                      className="rounded-md border border-gray-100 bg-gray-50 p-2 cursor-grab active:cursor-grabbing"
                      draggable
                      onDragStart={() => handlePanelDragStart(raft, "Próxima inspeção")}
                      onDragEnd={() => setExternalDragEvent(null)}
                      title="Arraste para o calendário para agendar"
                    >
                      <p className="text-sm font-medium text-gray-900">{raft.shipName}</p>
                      <p className="text-xs text-gray-600">Jangada: {raft.label}</p>
                      <p className="text-xs text-gray-500">Data de inspeção: {formatDate(raft.dataInspecao)}</p>
                      <p className="text-xs text-gray-500">Próxima inspeção: {formatDate(raft.dataProxInspecao)}</p>
                      <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${raft.expiryFlag === 'hidraulico' ? 'bg-red-100 text-red-700' : raft.expiryFlag === 'gi' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {raft.expiryFlag === 'hidraulico' ? '🔴 Hidráulico · 4h' : raft.expiryFlag === 'gi' ? '🔵 Anual + GI (FS/NAP) · 5h' : '🟢 Anual · 2h'}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const suggestedDate = toDatetimeLocal(raft.dueDate);
                          const suggestedTech = suggestBestTechnician(new Date(suggestedDate));
                          setQuickScheduleTarget({ serial: raft.serial, label: raft.label, shipName: raft.shipName, expiryFlag: raft.expiryFlag, dataProxInspecao: raft.dataProxInspecao, dueDate: raft.dueDate });
                          setQuickScheduleDateTime(suggestedDate);
                          setQuickScheduleResponsavel(suggestedTech || '');
                        }}
                        className="mt-2 w-full text-xs px-2 py-1 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium transition-colors"
                      >Agendar</button>
                    </li>
                  ))}
                  {agendaPanels.expiringCurrentMonth.length === 0 && (
                    <li className="text-sm text-gray-500 italic">Sem jangadas a caducar neste mês.</li>
                  )}
                </ul>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-gray-900">Caducam no próximo mês</h2>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                    {agendaPanels.expiringNextMonth.length}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-3">{agendaPanels.nextMonthLabel}</p>
                <ul className="space-y-2 max-h-56 overflow-auto">
                  {agendaPanels.expiringNextMonth.map((raft) => (
                    <li
                      key={`next-${raft.id ?? raft.serial}`}
                      className="rounded-md border border-gray-100 bg-gray-50 p-2 cursor-grab active:cursor-grabbing"
                      draggable
                      onDragStart={() => handlePanelDragStart(raft, "Próxima inspeção")}
                      onDragEnd={() => setExternalDragEvent(null)}
                      title="Arraste para o calendário para agendar"
                    >
                      <p className="text-sm font-medium text-gray-900">{raft.shipName}</p>
                      <p className="text-xs text-gray-600">Jangada: {raft.label}</p>
                      <p className="text-xs text-gray-500">Data de inspeção: {formatDate(raft.dataInspecao)}</p>
                      <p className="text-xs text-gray-500">Próxima inspeção: {formatDate(raft.dataProxInspecao)}</p>
                      <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${raft.expiryFlag === 'hidraulico' ? 'bg-red-100 text-red-700' : raft.expiryFlag === 'gi' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {raft.expiryFlag === 'hidraulico' ? '🔴 Hidráulico · 4h' : raft.expiryFlag === 'gi' ? '🔵 Anual + GI (FS/NAP) · 5h' : '🟢 Anual · 2h'}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const suggestedDate = toDatetimeLocal(raft.dueDate);
                          const suggestedTech = suggestBestTechnician(new Date(suggestedDate));
                          setQuickScheduleTarget({ serial: raft.serial, label: raft.label, shipName: raft.shipName, expiryFlag: raft.expiryFlag, dataProxInspecao: raft.dataProxInspecao, dueDate: raft.dueDate });
                          setQuickScheduleDateTime(suggestedDate);
                          setQuickScheduleResponsavel(suggestedTech || '');
                        }}
                        className="mt-2 w-full text-xs px-2 py-1 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium transition-colors"
                      >Agendar</button>
                    </li>
                  ))}
                  {agendaPanels.expiringNextMonth.length === 0 && (
                    <li className="text-sm text-gray-500 italic">Sem jangadas a caducar no próximo mês.</li>
                  )}
                </ul>
              </div>
            </>
          )}
          <div className="bg-white rounded-xl border border-red-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-red-900">Caducadas sem inspeção</h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                {agendaPanels.expiredWithoutInspection.filter(r => !events.some(e => e.raftSerial === r.serial && ['scheduled', 'confirmed'].includes(normalizeEventStatus(e.status)))).length}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-3">Jangadas com validade ultrapassada e sem inspeção válida</p>
            <ul className="space-y-2 max-h-64 overflow-auto">
              {agendaPanels.expiredWithoutInspection.filter(r => !events.some(e => e.raftSerial === r.serial && ['scheduled', 'confirmed'].includes(normalizeEventStatus(e.status)))).map((raft) => (
                <li
                  key={`exp-${raft.id ?? raft.serial}`}
                  className="bg-white p-3 rounded-xl shadow-sm border border-red-200 cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5 transition-all relative overflow-hidden"
                  draggable
                  onDragStart={() => handlePanelDragStart(raft, "Caducada")}
                  onDragEnd={() => setExternalDragEvent(null)}
                  title="Arraste para o calendário para agendar"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-400" />
                  <div className="pl-1">
                    <p className="text-sm font-bold truncate leading-tight mb-1 text-red-900">{raft.shipName}</p>
                    <p className="text-xs font-mono text-red-800 mb-1">{raft.label}</p>
                    <p className="text-xs text-red-700">Prox: {formatDate(raft.dataProxInspecao)}</p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-red-50">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-800">
                        Expirada
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const suggestedDate = toDatetimeLocal(raft.dueDate);
                          const suggestedTech = suggestBestTechnician(new Date(suggestedDate));
                          setQuickScheduleTarget({ serial: raft.serial, label: raft.label, shipName: raft.shipName, expiryFlag: raft.expiryFlag, dataProxInspecao: raft.dataProxInspecao, dueDate: raft.dueDate });
                          setQuickScheduleDateTime(suggestedDate);
                          setQuickScheduleResponsavel(suggestedTech || '');
                        }}
                        className="text-xs px-3 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 font-semibold transition-colors"
                      >Agendar</button>
                    </div>
                  </div>
                </li>
              ))}
              {agendaPanels.expiredWithoutInspection.filter(r => !events.some(e => e.raftSerial === r.serial && ['scheduled', 'confirmed'].includes(normalizeEventStatus(e.status)))).length === 0 && (
                <li className="text-sm text-gray-500 italic">Sem jangadas caducadas pendentes de inspeção.</li>
              )}
            </ul>
          </div>
        </aside>
      </div>

      <AgendaModals handleQuickSchedule={handleQuickSchedule} />
    </div>
  );
}

export default AgendaPage;
