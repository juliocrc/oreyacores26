import prisma from "@/lib/prisma";
import { getTechnicianKeyByName, normalizeTechnicianName } from "@/lib/agenda-technicians";

const ACTIVE_AGENDA_STATUSES = ["scheduled", "confirmed", "in_progress", "testing", "paused"] as const;

export function parseFlexibleDate(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  // Intercept MM/YY, MM/YYYY, YYYY-MM
  const parts = raw.split(/[\/-]/);
  if (parts.length === 2) {
    const p1 = parts[0].trim();
    const p2 = parts[1].trim();
    if (/^\d{1,2}$/.test(p1) && /^\d{2,4}$/.test(p2)) {
      const month = parseInt(p1, 10);
      let year = parseInt(p2, 10);
      if (year < 100) year += 2000;
      if (month >= 1 && month <= 12) {
        const parsed = new Date(year, month - 1, 1);
        if (!Number.isNaN(parsed.getTime())) return parsed;
      }
    } else if (/^\d{4}$/.test(p1) && /^\d{1,2}$/.test(p2)) {
      const year = parseInt(p1, 10);
      const month = parseInt(p2, 10);
      if (month >= 1 && month <= 12) {
        const parsed = new Date(year, month - 1, 1);
        if (!Number.isNaN(parsed.getTime())) return parsed;
      }
    }
  }

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const normalized = raw.replace(/\//g, "-");
  const directNormalized = new Date(normalized);
  if (!Number.isNaN(directNormalized.getTime())) return directNormalized;

  const dayFirstMatch = normalized.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (dayFirstMatch) {
    const [, dayText, monthText, yearText, hourText, minuteText] = dayFirstMatch;
    const parsed = new Date(
      Number(yearText),
      Number(monthText) - 1,
      Number(dayText),
      Number(hourText || 0),
      Number(minuteText || 0),
      0,
      0,
    );
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const isoDayMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDayMatch) {
    const [, yearText, monthText, dayText] = isoDayMatch;
    const parsed = new Date(Number(yearText), Number(monthText) - 1, Number(dayText), 0, 0, 0, 0);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

export async function syncNextInspectionAgenda(params: {
  jangadaId: number;
  tecnico?: string;
}) {
  const raft = await prisma.jangada.findUnique({
    where: { id: params.jangadaId },
    select: {
      id: true,
      serial: true,
      brand: true,
      model: true,
      shipNameManual: true,
      owner: true,
      dataProxInspecao: true,
      cylinderDataProxTeste: true,
      cylinderSistema: true,
      artigos: {
        select: {
          name: true,
          referencia: true,
        },
      },
    },
  });

  if (!raft?.serial) return;

  await prisma.agendaEvento.deleteMany({
    where: {
      raftSerial: { equals: raft.serial },
      status: { in: [...ACTIVE_AGENDA_STATUSES] },
    },
  });
}

function normalizePerfectDate(value: Date): Date {
  const date = new Date(value);
  if (date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0) {
    date.setHours(9, 0, 0, 0);
  }
  return date;
}

async function hasVacationConflictAssistencia(responsavelRaw?: string | null, date?: Date | null) {
  const responsavel = normalizeTechnicianName(responsavelRaw);
  if (!responsavel || !date) return false;

  const tecnicoKey = getTechnicianKeyByName(responsavel);
  if (!tecnicoKey) return false;

  const dataInicio = new Date(date);
  dataInicio.setHours(0, 0, 0, 0);
  const dataFim = new Date(date);
  dataFim.setHours(23, 59, 59, 999);

  const holiday = await prisma.tecnicoAusencia.findFirst({
    where: {
      tecnicoKey,
      tipo: "ferias",
      dataInicio: { lte: dataFim },
      dataFim: { gte: dataInicio },
    },
    select: { id: true },
  }).catch(() => null);

  return Boolean(holiday);
}

export type SyncAssistenciaAgendaResult = {
  id: number;
  created: boolean;
  responsavel: string;
  vacationDropped: boolean;
};

/** Cria ou atualiza (idempotente por jangada + dia) o evento de assistência/inspeção na agenda. */
export async function syncAssistenciaAgendaEvent(params: {
  raftSerial: string;
  date: Date;
  title?: string;
  responsavel?: string | null;
  serviceStationId?: number | null;
}): Promise<SyncAssistenciaAgendaResult | null> {
  const raftSerial = String(params.raftSerial || "").trim();
  if (!raftSerial) return null;

  const date = normalizePerfectDate(params.date || new Date());
  const title = String(params.title || "").trim() || "Inspeção - Assistência";
  const responsavel = normalizeTechnicianName(params.responsavel);

  const vacationDropped = await hasVacationConflictAssistencia(responsavel, date);

  const dayInicio = new Date(date);
  dayInicio.setHours(0, 0, 0, 0);
  const dayFim = new Date(date);
  dayFim.setHours(23, 59, 59, 999);

  const existing = await prisma.agendaEvento.findFirst({
    where: {
      raftSerial: { equals: raftSerial },
      status: { in: [...ACTIVE_AGENDA_STATUSES] },
      date: { gte: dayInicio, lte: dayFim },
    },
    orderBy: { id: "desc" },
  });

  if (existing) {
    const updated = await prisma.agendaEvento.update({
      where: { id: existing.id },
      data: {
        title,
        date,
        serviceStationId: params.serviceStationId ?? existing.serviceStationId,
        responsavel: vacationDropped
          ? (existing.responsavel || "")
          : ((responsavel ?? existing.responsavel) || ""),
        type: existing.type || "Inspeção",
        inspectionType: existing.inspectionType || "Inspeção",
        durationMinutes: existing.durationMinutes && existing.durationMinutes > 0 ? existing.durationMinutes : 210,
        status: "scheduled",
      },
    });

    return {
      id: updated.id,
      created: false,
      responsavel: updated.responsavel || "",
      vacationDropped,
    };
  }

  const created = await prisma.agendaEvento.create({
    data: {
      title,
      date,
      raftSerial,
      responsavel: vacationDropped ? "" : (responsavel || ""),
      status: "scheduled",
      type: "Inspeção",
      inspectionType: "Inspeção",
      durationMinutes: 210,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      serviceStationId: params.serviceStationId ?? null,
    },
  });

  return {
    id: created.id,
    created: true,
    responsavel: created.responsavel || "",
    vacationDropped,
  };
}

export async function clearActiveAgendaForRaft(params: {
  jangadaId?: number;
  raftSerial?: string | null;
}) {
  let raftSerial = String(params.raftSerial || "").trim();

  if (!raftSerial && params.jangadaId) {
    const raft = await prisma.jangada.findUnique({
      where: { id: params.jangadaId },
      select: { serial: true },
    });
    raftSerial = String(raft?.serial || "").trim();
  }

  if (!raftSerial) return;

  await prisma.agendaEvento.deleteMany({
    where: {
      raftSerial: { equals: raftSerial },
      status: { in: [...ACTIVE_AGENDA_STATUSES] },
    },
  });
}
