import prisma from "@/lib/prisma";
import { isSameDay } from "date-fns";
import type { AgendaApiEvent } from "@/types/agenda";
import { parseAgendaDateFlexible } from "@/lib/agenda-page-helpers";

export type RaftAExpiar = {
  id: number;
  serial: string;
  brand: string | null;
  model: string | null;
  shipNameManual: string | null;
  shipId: number | null;
  shipName: string;
  dataProxInspecao: string | null;
};

function startOfTodayLocal(hoje: Date) {
  const value = new Date(hoje);
  value.setHours(0, 0, 0, 0);
  return value;
}

function startOfDayLocal(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

/**
 * Jangadas com dataProxInspecao definida e dentro da janela (inclui caducadas).
 * A coluna dataProxInspecao é TEXT no esquema, por isso a comparação é feita
 * em memória após parse flexível (mesma lógica usada no cliente da agenda).
 */
export async function getRaftsAExpiar(opts?: {
  janelaDias?: number;
  serials?: string[];
}): Promise<RaftAExpiar[]> {
  const hoje = new Date();
  const janela = Math.max(1, Math.min(365, Number(opts?.janelaDias ?? 30)));
  const limite = new Date(startOfTodayLocal(hoje));
  limite.setDate(limite.getDate() + janela);
  limite.setHours(23, 59, 59, 999);

  const serialFilter =
    opts?.serials && opts.serials.length ? { serial: { in: opts.serials } } : {};

  const rows = await prisma.jangada.findMany({
    where: {
      dataProxInspecao: { not: null },
      ...serialFilter,
    },
    select: {
      id: true,
      serial: true,
      brand: true,
      model: true,
      shipNameManual: true,
      shipId: true,
      dataProxInspecao: true,
    },
  });

  const shipIds = Array.from(
    new Set(
      rows
        .map((r) => r.shipId)
        .filter((id): id is number => typeof id === "number" && Number.isFinite(id)),
    ),
  );

  const navios = shipIds.length
    ? await prisma.navio.findMany({
        where: { id: { in: shipIds } },
        select: { id: true, nome: true },
      })
    : [];
  const navioById = new Map(navios.map((n) => [n.id, n.nome]));

  return rows
    .map((r) => ({
      ...r,
      shipName:
        (r.shipNameManual && String(r.shipNameManual).trim()) ||
        (r.shipId ? navioById.get(r.shipId) || "" : ""),
    }))
    .filter((r) => {
      if (!r.dataProxInspecao) return false;
      const due = parseAgendaDateFlexible(r.dataProxInspecao);
      if (!due) return false;
      return startOfDayLocal(due).getTime() <= limite.getTime();
    });
}

export function buildExpirationApiEvents(
  rafts: RaftAExpiar[],
  hoje: Date = new Date(),
): AgendaApiEvent[] {
  const todayStart = startOfTodayLocal(hoje);
  return rafts.flatMap((r) => {
    const due = r.dataProxInspecao ? parseAgendaDateFlexible(r.dataProxInspecao) : null;
    if (!due) return [];
    const dueStart = startOfDayLocal(due);
    const isOverdue = dueStart.getTime() < todayStart.getTime();
    const isToday = isSameDay(due, hoje);
    const label = isOverdue ? "Caducada" : isToday ? "Caduca hoje" : "Caduca";
    const model = r.model && String(r.model).trim() ? ` (${String(r.model).trim()})` : "";
    const ship = r.shipName && String(r.shipName).trim() ? ` · ${String(r.shipName).trim()}` : "";
    return [
      {
        id: `expiracao-${r.id}`,
        title: `⚠ ${label} — ${r.serial}${model}${ship}`,
        date: due.toISOString(),
        raftSerial: r.serial,
        responsavel: "",
        status: "confirmed",
        type: "expiracao",
        inspectionType: "outro",
        durationMinutes: 60,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
      } as AgendaApiEvent,
    ];
  });
}
