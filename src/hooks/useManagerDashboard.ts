"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { JangadaDashboard, FleetSummary, KanbanColumn, AgendaMetrics } from "@/types/dashboard";
import type { AgendaApiEvent, EventStatus } from "@/types/agenda";
import { normalizeEventStatus } from "@/types/agenda";

async function fetchAllJangadas(): Promise<JangadaDashboard[]> {
  const res = await fetch("/api/jangadas?scope=all");
  if (!res.ok) return [];
  return res.json();
}

async function fetchAgenda(): Promise<AgendaApiEvent[]> {
  const res = await fetch("/api/agenda");
  if (!res.ok) return [];
  return res.json();
}

async function fetchAgendaMetrics(): Promise<AgendaMetrics | null> {
  const res = await fetch("/api/agenda/metrics");
  if (!res.ok) return null;
  return res.json();
}

async function fetchCriticalStock(): Promise<{ total: number } | null> {
  const res = await fetch("/api/stock/critical");
  if (!res.ok) return null;
  const data = await res.json();
  const items = Array.isArray(data) ? data : (data?.items ?? []);
  return { total: items.length };
}

// Estados reais da agenda (ver normalizeEventStatus em src/types/agenda.ts).
const COLUMN_STATUSES: Record<string, EventStatus[]> = {
  agendado: ["scheduled", "confirmed"],
  em_inspecao: ["in_progress", "testing", "paused"],
  aguardando_pecas: [],
  pronto: ["completed"],
  certificado: [],
};

export function useManagerDashboard() {
  // Referência temporal estável, fixada na montagem (evita leituras impuras durante o render).
  const [nowDate] = useState(() => new Date());

  const { data: jangadas = [], isLoading: isLoadingJangadas, refetch: refetchJangadas } =
    useQuery<JangadaDashboard[]>({
      queryKey: ["jangadas-all"],
      queryFn: fetchAllJangadas,
      staleTime: 30000,
    });

  const { data: agenda = [], isLoading: isLoadingAgenda } = useQuery<AgendaApiEvent[]>({
    queryKey: ["agenda-all"],
    queryFn: fetchAgenda,
    staleTime: 30000,
  });

  const { data: metrics = null, isLoading: isLoadingMetrics } = useQuery<AgendaMetrics | null>({
    queryKey: ["agenda-metrics"],
    queryFn: fetchAgendaMetrics,
    staleTime: 30000,
  });

  const { data: criticalStock = null } = useQuery<{ total: number } | null>({
    queryKey: ["stock-critical-count"],
    queryFn: fetchCriticalStock,
    staleTime: 60000,
  });

  const isLoading = isLoadingJangadas || isLoadingAgenda || isLoadingMetrics;

  // Índice por serial: a agenda devolve `raftSerial`, não `jangadaId`.
  const serialToJangada = new Map<string, JangadaDashboard>();
  for (const j of jangadas) {
    const key = String(j.serial || "").trim().toUpperCase();
    if (key) serialToJangada.set(key, j);
  }

  // Evento de agenda mais recente por jangada (a API ordena por data descendente).
  const latestEventByJangada = new Map<number, AgendaApiEvent>();
  for (const ev of agenda) {
    const key = String(ev.raftSerial || "").trim().toUpperCase();
    const jangada = key ? serialToJangada.get(key) : undefined;
    if (!jangada || ev.deleted) continue;
    const existing = latestEventByJangada.get(jangada.id);
    if (!existing) latestEventByJangada.set(jangada.id, ev);
  }

  const countByStatus = (statuses: EventStatus[]) =>
    jangadas.filter((j) => {
      const ev = latestEventByJangada.get(j.id);
      return ev ? statuses.includes(normalizeEventStatus(ev.status)) : false;
    });

  const emInspecaoItems = countByStatus(COLUMN_STATUSES.em_inspecao);
  const prontasItems = countByStatus(COLUMN_STATUSES.pronto);

  const certificadas = jangadas.filter(
    (j) => !!j.ultimoCertificadoNumero && !!j.dataProxInspecao && new Date(j.dataProxInspecao) > nowDate,
  ).length;

  const overdueCerts = jangadas.filter(
    (j) => !!j.dataProxInspecao && new Date(j.dataProxInspecao) < nowDate,
  ).length;

  const fleetSummary: FleetSummary = {
    total: jangadas.length,
    emInspecao: emInspecaoItems.length,
    aguardandoPecas: countByStatus(COLUMN_STATUSES.aguardando_pecas).length,
    prontas: prontasItems.length,
    certificadas,
    overdueCerts,
    lowStockItems: criticalStock?.total ?? 0,
    upcomingNext7Days: metrics?.upcomingNext7Days ?? 0,
    agendaOverdue: metrics?.overdueCount ?? 0,
    completionRate: metrics?.completionRate ?? 0,
    averageDurationMinutes: metrics?.averageDuration ?? 0,
  };

  const columns: Array<{ id: string; title: string; status: string[] }> = [
    { id: "agendado", title: "AGENDADO", status: [...COLUMN_STATUSES.agendado] },
    { id: "em_inspecao", title: "EM INSPEÇÃO", status: [...COLUMN_STATUSES.em_inspecao] },
    { id: "aguardando_pecas", title: "AGUARDA PEÇAS", status: [...COLUMN_STATUSES.aguardando_pecas] },
    { id: "pronto", title: "PRONTO", status: [...COLUMN_STATUSES.pronto] },
    { id: "certificado", title: "CERTIFICADO", status: [...COLUMN_STATUSES.certificado] },
  ];

  const kanbanColumns: KanbanColumn[] = columns.map((col) => {
    const items = countByStatus(col.status as EventStatus[]);
    return { ...col, items, count: items.length };
  });

  // Coluna "CERTIFICADO" deriva do estado do certificado, não da agenda.
  const certificadoColumn = kanbanColumns.find((c) => c.id === "certificado");
  if (certificadoColumn) {
    certificadoColumn.items = certificadasItems(jangadas, nowDate);
    certificadoColumn.count = certificadoColumn.items.length;
  }

  return {
    jangadas,
    agenda,
    metrics,
    fleetSummary,
    kanbanColumns,
    isLoading,
    refetch: refetchJangadas,
  };
}

function certificadasItems(jangadas: JangadaDashboard[], now: Date): JangadaDashboard[] {
  return jangadas.filter(
    (j) => !!j.ultimoCertificadoNumero && !!j.dataProxInspecao && new Date(j.dataProxInspecao) > now,
  );
}
