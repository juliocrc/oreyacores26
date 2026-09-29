import prisma from "@/lib/prisma";

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
