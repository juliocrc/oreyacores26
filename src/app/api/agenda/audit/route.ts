import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { resolveActiveServiceStationId } from "@/lib/station-selection";
import { normalizeEventStatus, normalizeInspectionType } from "@/types/agenda";

export async function GET(req: NextRequest) {
  const access = await getAccessContext();
  if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(200, Math.max(20, Number(searchParams.get("limit") || 50)));

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

  const rowsRaw = await prisma.agendaEvento.findMany({
    orderBy: { updatedAt: "desc" },
    take: allowedRaftSerials ? undefined : limit,
  });
  const rows = allowedRaftSerials
    ? rowsRaw.filter((row) => allowedRaftSerials!.includes(row.raftSerial)).slice(0, limit)
    : rowsRaw;

  const entries = rows.map((row) => ({
    id: row.id,
    happenedAt: row.updatedAt.toISOString(),
    action: "upsert",
    event: {
      id: row.id,
      title: row.title,
      date: row.date.toISOString(),
      raftSerial: row.raftSerial,
      responsavel: row.responsavel || "",
      status: normalizeEventStatus(row.status),
      inspectionType: normalizeInspectionType(row.inspectionType),
      durationMinutes: row.durationMinutes,
      bufferBeforeMinutes: row.bufferBeforeMinutes,
      bufferAfterMinutes: row.bufferAfterMinutes,
    },
  }));

  return NextResponse.json({ total: entries.length, entries });
}
