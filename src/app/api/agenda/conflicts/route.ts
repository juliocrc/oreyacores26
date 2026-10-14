import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { resolveActiveServiceStationId } from "@/lib/station-selection";
import { getTechnicianKeyByName } from "@/lib/agenda-technicians";
import { canonicalizeAzoresIsland } from "@/lib/azores-islands";

export async function GET(req: NextRequest) {
  const access = await getAccessContext();
  if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

  const activeStationId = resolveActiveServiceStationId(req, access);
  let allowedRaftSerials: string[] | null = null;
  let allowedTechnicianKeys: Set<string> | null = null;

  if (activeStationId) {
    const [rafts, techs] = await Promise.all([
      prisma.jangada.findMany({ where: { serviceStationId: activeStationId }, select: { serial: true } }),
      prisma.tecnico.findMany({ where: { serviceStationId: activeStationId }, select: { nome: true } }),
    ]);
    allowedRaftSerials = rafts.map((r) => String(r.serial || "").trim()).filter(Boolean);
    if (techs.length > 0) {
      allowedTechnicianKeys = new Set(techs.map((t) => getTechnicianKeyByName(t.nome)).filter(Boolean));
    }
  } else if (!access.isAdmin) {
    const scope = access.allowedStationIds.length ? access.allowedStationIds : [-1];
    const [rafts, techs] = await Promise.all([
      prisma.jangada.findMany({ where: { serviceStationId: { in: scope } }, select: { serial: true } }),
      prisma.tecnico.findMany({ where: { serviceStationId: { in: scope } }, select: { nome: true } }),
    ]);
    allowedRaftSerials = rafts.map((r) => String(r.serial || "").trim()).filter(Boolean);
    if (techs.length > 0) {
      allowedTechnicianKeys = new Set(techs.map((t) => getTechnicianKeyByName(t.nome)).filter(Boolean));
    }
  }

  const eventosRaw = await prisma.agendaEvento.findMany({
    where: { status: { in: ["scheduled", "confirmed"] } },
    orderBy: { date: "asc" },
  });
  const eventos = allowedRaftSerials
    ? eventosRaw.filter((ev) => allowedRaftSerials!.includes(ev.raftSerial))
    : eventosRaw;

  const absencesRaw = await prisma.tecnicoAusencia.findMany({});
  const absences = allowedTechnicianKeys
    ? absencesRaw.filter((abs) => allowedTechnicianKeys!.has(abs.tecnicoKey))
    : absencesRaw;

  // Resolve islands for event serials
  const eventSerials = eventos.map(e => e.raftSerial).filter(Boolean);
  const rafts = await prisma.jangada.findMany({
    where: { serial: { in: eventSerials } },
    select: {
      serial: true,
      serviceStation: {
        select: {
          localizacao: true,
        }
      },
      shipId: true,
    }
  });

  const shipIds = rafts.map(r => r.shipId).filter(Boolean) as number[];
  const ships = await prisma.navio.findMany({
    where: { id: { in: shipIds } },
    select: {
      id: true,
      ilha: true,
    }
  });

  const serialToIslandMap = new Map<string, string>();
  for (const r of rafts) {
    let island: string | null = null;
    if (r.shipId) {
      const s = ships.find(x => x.id === r.shipId);
      if (s?.ilha) island = s.ilha;
    }
    if (!island && r.serviceStation?.localizacao) {
      const canonical = canonicalizeAzoresIsland(r.serviceStation.localizacao);
      if (canonical) island = canonical;
    }
    if (island) {
      serialToIslandMap.set(r.serial, island);
    }
  }

  type Conflict = {
    type: "slot_capacity" | "responsible_overlap" | "technician_absence" | "island_travel";
    description: string;
    date: string;
    eventIds: number[];
  };

  const conflicts: Conflict[] = [];

  // 1. Check technician absences
  for (const ev of eventos) {
    if (!ev.responsavel) continue;
    const techKey = getTechnicianKeyByName(ev.responsavel);
    if (techKey) {
      const isAbsent = absences.some(abs => {
        if (abs.tecnicoKey !== techKey) return false;
        const evDate = new Date(ev.date);
        return evDate >= abs.dataInicio && evDate <= abs.dataFim;
      });

      if (isAbsent) {
        conflicts.push({
          type: "technician_absence",
          description: `Técnico "${ev.responsavel}" tem férias/ausência registada em ${ev.date.toISOString().slice(0, 10)}`,
          date: ev.date.toISOString().slice(0, 10),
          eventIds: [ev.id],
        });
      }
    }
  }

  // Build per-day slot map
  const byDaySlot: Record<string, typeof eventos> = {};
  for (const ev of eventos) {
    const day = ev.date.toISOString().slice(0, 10);
    const hour = ev.date.getHours();
    const slot = hour < 13 ? "morning" : "afternoon";
    const key = `${day}__${slot}`;
    if (!byDaySlot[key]) byDaySlot[key] = [];
    byDaySlot[key].push(ev);
  }

  // Check slot capacity (morning ≤ 2, afternoon ≤ 1)
  for (const [key, evs] of Object.entries(byDaySlot)) {
    const isAfternoon = key.endsWith("afternoon");
    const limit = isAfternoon ? 1 : 2;
    if (evs.length > limit) {
      conflicts.push({
        type: "slot_capacity",
        description: `${isAfternoon ? "Tarde" : "Manhã"} do dia ${key.slice(0, 10)} tem ${evs.length} inspeções (limite: ${limit})`,
        date: key.slice(0, 10),
        eventIds: evs.map((e: { id: number }) => e.id),
      });
    }
  }

  // Check responsible overlap & island travel conflicts
  for (let i = 0; i < eventos.length; i++) {
    for (let j = i + 1; j < eventos.length; j++) {
      const a = eventos[i];
      const b = eventos[j];
      if (!a.responsavel || !b.responsavel) continue;
      if (a.responsavel.toLowerCase() !== b.responsavel.toLowerCase()) continue;

      const dayA = a.date.toISOString().slice(0, 10);
      const dayB = b.date.toISOString().slice(0, 10);

      // Check island travel (different islands on same day)
      if (dayA === dayB) {
        const islandA = serialToIslandMap.get(a.raftSerial);
        const islandB = serialToIslandMap.get(b.raftSerial);
        if (islandA && islandB && islandA !== islandB) {
          conflicts.push({
            type: "island_travel",
            description: `Técnico "${a.responsavel}" tem agendamentos em ilhas diferentes (${islandA} e ${islandB}) no dia ${dayA}`,
            date: dayA,
            eventIds: [a.id, b.id],
          });
        }
      }

      const aStart = new Date(a.date.getTime() - a.bufferBeforeMinutes * 60_000);
      const aEnd = new Date(a.date.getTime() + (a.durationMinutes + a.bufferAfterMinutes) * 60_000);
      const bStart = new Date(b.date.getTime() - b.bufferBeforeMinutes * 60_000);
      const bEnd = new Date(b.date.getTime() + (b.durationMinutes + b.bufferAfterMinutes) * 60_000);

      if (aStart < bEnd && bStart < aEnd) {
        const overlapMs = Math.min(aEnd.getTime(), bEnd.getTime()) - Math.max(aStart.getTime(), bStart.getTime());
        const overlapMinutes = Math.round(overlapMs / 60_000);
        conflicts.push({
          type: "responsible_overlap",
          description: `Responsável "${a.responsavel}" tem sobreposição de ${overlapMinutes} min entre agendamentos #${a.id} e #${b.id}`,
          date: dayA,
          eventIds: [a.id, b.id],
        });
      }
    }
  }

  return NextResponse.json({
    total: conflicts.length,
    conflicts,
  });
}
