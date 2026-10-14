import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { resolveActiveServiceStationId } from "@/lib/station-selection";
import { normalizeInspectionType, normalizeEventStatus } from "@/types/agenda";

export async function GET(req: NextRequest) {
  const access = await getAccessContext();
  if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

  const activeStationId = resolveActiveServiceStationId(req, access);
  let allowedRaftSerials: string[] | null = null;
  if (activeStationId) {
    const rafts = await prisma.jangada.findMany({
      where: { serviceStationId: activeStationId },
      select: { serial: true },
    });
    allowedRaftSerials = rafts.map((r) => String(r.serial || "").trim()).filter(Boolean);
  } else if (!access.isAdmin) {
    const rafts = await prisma.jangada.findMany({
      where: { serviceStationId: { in: access.allowedStationIds.length ? access.allowedStationIds : [-1] } },
      select: { serial: true },
    });
    allowedRaftSerials = rafts.map((r) => String(r.serial || "").trim()).filter(Boolean);
  }

  const eventosRaw = await prisma.agendaEvento.findMany({ orderBy: { date: "asc" } });
  const eventos = allowedRaftSerials
    ? eventosRaw.filter((ev) => allowedRaftSerials!.includes(ev.raftSerial))
    : eventosRaw;

  const now = new Date();
  const next7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  const byResponsavel: Record<string, number> = {};
  let totalDuration = 0;
  let upcomingNext7Days = 0;
  let overdueCount = 0;

  for (const ev of eventos) {
    const st = normalizeEventStatus(ev.status);
    byStatus[st] = (byStatus[st] || 0) + 1;

    const tp = normalizeInspectionType(ev.inspectionType);
    byType[tp] = (byType[tp] || 0) + 1;

    const mk = ev.date.toISOString().slice(0, 7);
    byMonth[mk] = (byMonth[mk] || 0) + 1;

    if (ev.responsavel) {
      byResponsavel[ev.responsavel] = (byResponsavel[ev.responsavel] || 0) + 1;
    }

    totalDuration += ev.durationMinutes;

    if (ev.date >= now && ev.date <= next7 && (st === "scheduled" || st === "confirmed")) {
      upcomingNext7Days++;
    }
    if (ev.date < now && (st === "scheduled" || st === "confirmed")) {
      overdueCount++;
    }
  }

  const total = eventos.length;
  const completed = byStatus["completed"] || 0;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const averageDuration = total > 0 ? Math.round(totalDuration / total) : 0;

  const topResponsavel = Object.entries(byResponsavel)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return NextResponse.json({
    total,
    byStatus,
    byType,
    byMonth: Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, count]) => ({ month, count })),
    topResponsavel,
    completionRate,
    averageDuration,
    upcomingNext7Days,
    overdueCount,
  });
}
