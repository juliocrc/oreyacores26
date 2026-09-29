import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getToken } from "next-auth/jwt";
import { getAuthSecret } from "@/lib/auth";
import { getAccessContext } from "@/lib/access-control";
import { resolveActiveServiceStationId } from "@/lib/station-selection";
import {
  getInspectionDefaults,
  normalizeInspectionType,
  type AgendaApiEvent,
  type AgendaApiPayload,
} from "@/types/agenda";
import { getTechnicianKeyByName, normalizeTechnicianName, getTechnicianNameByKey } from "@/lib/agenda-technicians";
import { getRaftsAExpiar, buildExpirationApiEvents } from "@/lib/agenda-expiracao";
import { getGoogleCalendarConfig } from "@/lib/google-calendar-config";

const AGENDA_MARKER = "__AGENDA_EVENT__";
const ACTIVE_ROLLOVER_STATUSES = new Set(["scheduled", "confirmed", "in_progress", "testing", "paused"]);

type AgendaMeta = {
  date?: string;
  responsavel?: string;
  status?: string;
  type?: string;
};

type LegacyAgendaRow = {
  id: number;
  nome: string | null;
  matricula: string | null;
  embarcacoesDePesca: string | null;
};

function parseAgendaMeta(raw: string | null | undefined) {
  if (!raw) return {} as AgendaMeta;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        date: typeof parsed.date === "string" ? parsed.date : undefined,
        responsavel: typeof parsed.responsavel === "string" ? parsed.responsavel : undefined,
        status: typeof parsed.status === "string" ? parsed.status : undefined,
        type: typeof parsed.type === "string" ? parsed.type : undefined,
      };
    }
  } catch {
    // Fallback para formato antigo onde o campo guardava só a data
  }

  return { date: raw };
}

function normalizeAgendaResponse(row: LegacyAgendaRow): AgendaApiEvent {
  const meta = parseAgendaMeta(row?.embarcacoesDePesca);
  const defaults = getInspectionDefaults("outro");
  return {
    id: row.id,
    title: row.nome || "Inspeção",
    date: meta.date || null,
    raftSerial: row.matricula || "",
    responsavel: meta.responsavel || "",
    status: meta.status || "scheduled",
    type: meta.type || "Inspeção",
    inspectionType: defaults ? "outro" : "outro",
    durationMinutes: defaults.durationMinutes,
    bufferBeforeMinutes: defaults.bufferBeforeMinutes,
    bufferAfterMinutes: defaults.bufferAfterMinutes,
  };
}

function getStartOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getStartOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function getEndOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

async function hasVacationConflict(responsavelRaw: string | null | undefined, date: Date) {
  const responsavel = normalizeTechnicianName(responsavelRaw);
  if (!responsavel) return false;

  const tecnicoKey = getTechnicianKeyByName(responsavel);
  if (!tecnicoKey) return false;

  const dataInicio = getStartOfDay(date);
  const dataFim = getEndOfDay(date);

  const holiday = await prisma.tecnicoAusencia.findFirst({
    where: {
      tecnicoKey,
      tipo: "ferias",
      dataInicio: { lte: dataFim },
      dataFim: { gte: dataInicio },
    },
    select: { id: true },
  });

  return Boolean(holiday);
}

function getMinutesOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function moveToNextBusinessDay(date: Date) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);

  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1);
  }

  const minutes = getMinutesOfDay(next);
  if (minutes < 9 * 60 || minutes >= 17 * 60 + 30) {
    next.setHours(9, 0, 0, 0);
  } else if (minutes >= 12 * 60 + 30 && minutes < 14 * 60) {
    next.setHours(14, 0, 0, 0);
  }

  return next;
}

function getRolledAgendaDate(date: Date, todayStart: Date) {
  const rolled = new Date(date);
  while (rolled < todayStart) {
    const next = moveToNextBusinessDay(rolled);
    rolled.setTime(next.getTime());
  }
  return rolled;
}

async function requireSession(req: NextRequest) {
  const token = await getToken({ req, secret: getAuthSecret() });
  if (!token?.sub && !token?.email) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireSession(req);
  if (unauthorized) return unauthorized;

  const access = await getAccessContext();
  if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const where: { raftSerial?: { equals: string } } = {};
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

  const raftSerial = searchParams.get("raftSerial");
  if (raftSerial) {
    if (allowedRaftSerials && !allowedRaftSerials.includes(raftSerial)) {
      return NextResponse.json([]);
    }
    where.raftSerial = { equals: raftSerial };
  }

  let eventos = await prisma.agendaEvento.findMany({ where, orderBy: { date: "desc" } });
  if (allowedRaftSerials) {
    const serialSet = new Set(allowedRaftSerials.map((s) => s.toUpperCase()));
    eventos = eventos.filter((ev) => serialSet.has(String(ev.raftSerial || "").toUpperCase()));
  }

  const todayStart = getStartOfToday();
  const activeOverdue = eventos.filter((ev) => ACTIVE_ROLLOVER_STATUSES.has(String(ev.status || "").trim().toLowerCase()) && ev.date < todayStart);

  if (activeOverdue.length > 0) {
    await prisma.$transaction(
      activeOverdue.map((ev) =>
        prisma.agendaEvento.update({
          where: { id: ev.id },
          data: { date: getRolledAgendaDate(ev.date, todayStart) },
        })
      )
    );

    eventos = await prisma.agendaEvento.findMany({ where, orderBy: { date: "desc" } });
  }

  // Fetch technician absences/vacations and map them to Agenda events
  let absencesEvents: AgendaApiEvent[] = [];
  if (!raftSerial) {
    const ausencias = await prisma.tecnicoAusencia.findMany({
      orderBy: { dataInicio: "desc" },
    });
    absencesEvents = ausencias.map((aus) => {
      const techName = getTechnicianNameByKey(aus.tecnicoKey) || aus.tecnicoKey;
      const title = aus.tipo === "ferias"
        ? `[FÉRIAS] ${techName}`
        : `[AUSÊNCIA] ${techName}${aus.motivo ? `: ${aus.motivo}` : ""}`;
      
      const duration = Math.max(
        15,
        Math.round((aus.dataFim.getTime() - aus.dataInicio.getTime()) / (60 * 1000))
      );

      return {
        id: `ausencia-${aus.id}`,
        title,
        date: aus.dataInicio.toISOString(),
        raftSerial: "",
        responsavel: techName,
        status: "confirmed",
        type: "ausencia",
        inspectionType: "outro",
        durationMinutes: duration,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
      } as AgendaApiEvent;
    });
  }

  const normalized = eventos.map((ev) => ({
    id: ev.id,
    title: ev.title,
    date: ev.date.toISOString(),
    raftSerial: ev.raftSerial,
    responsavel: ev.responsavel || "",
    status: ev.status || "scheduled",
    type: ev.type || "Inspeção",
    inspectionType: normalizeInspectionType(ev.inspectionType),
    durationMinutes: ev.durationMinutes,
    bufferBeforeMinutes: ev.bufferBeforeMinutes,
    bufferAfterMinutes: ev.bufferAfterMinutes,
  } as AgendaApiEvent));

  let combined = [...normalized, ...absencesEvents];

  // Eventos sintéticos de caducidade (jangadas a expirar / caducadas) visíveis no calendário
  if (!raftSerial) {
    const config = getGoogleCalendarConfig();
    const expiracao = await getRaftsAExpiar({
      janelaDias: config.janelaDiasApp,
      serials: allowedRaftSerials ?? undefined,
    });
    combined = [...combined, ...buildExpirationApiEvents(expiracao)];
  }

  if (combined.length > 0) {
    return NextResponse.json(combined);
  }

  // Fallback de compatibilidade: ler registos antigos marcados na tabela Agenda
  const legacyWhere: {
    tipoPesca: string;
    matricula?: { equals: string };
  } = { tipoPesca: AGENDA_MARKER };
  if (raftSerial) {
    legacyWhere.matricula = { equals: raftSerial };
  }
  const legacy = await prisma.agenda.findMany({ where: legacyWhere, orderBy: { id: "desc" } });
  const normalizedLegacy = legacy.map(normalizeAgendaResponse);
  if (!allowedRaftSerials) return NextResponse.json(normalizedLegacy);

  const serialSet = new Set(allowedRaftSerials.map((s) => s.toUpperCase()));
  return NextResponse.json(normalizedLegacy.filter((item) => serialSet.has(String(item.raftSerial || "").toUpperCase())));
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireSession(req);
  if (unauthorized) return unauthorized;

  try {
    const body = (await req.json()) as AgendaApiPayload;
    const title = String(body?.title || "Inspeção").trim();
    const raftSerial = String(body?.raftSerial || "").trim();
    const date = String(body?.date || "").trim();

    if (!raftSerial || !date) {
      return NextResponse.json({ error: "Campos obrigatórios: raftSerial e date." }, { status: 400 });
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "Campo date inválido." }, { status: 400 });
    }

    const inspectionType = normalizeInspectionType(body?.inspectionType);
    const defaults = getInspectionDefaults(inspectionType);
    const durationMinutes = Number(body?.durationMinutes ?? defaults.durationMinutes);
    const bufferBeforeMinutes = Number(body?.bufferBeforeMinutes ?? defaults.bufferBeforeMinutes);
    const bufferAfterMinutes = Number(body?.bufferAfterMinutes ?? defaults.bufferAfterMinutes);

    if (await hasVacationConflict(body?.responsavel, parsedDate)) {
      return NextResponse.json({ error: "O técnico selecionado está de férias nesta data." }, { status: 409 });
    }

    const access = await getAccessContext();
    const activeStationId = access ? resolveActiveServiceStationId(req, access) : null;
    const raft = await prisma.jangada.findFirst({
      where: { serial: { equals: raftSerial } },
      select: { serviceStationId: true },
    });

    const created = await prisma.agendaEvento.create({
      data: {
        title: title || "Inspeção",
        date: parsedDate,
        raftSerial,
        responsavel: body?.responsavel || "",
        status: body?.status || "scheduled",
        type: body?.type || "Inspeção",
        inspectionType,
        durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : defaults.durationMinutes,
        bufferBeforeMinutes: Number.isFinite(bufferBeforeMinutes) ? bufferBeforeMinutes : defaults.bufferBeforeMinutes,
        bufferAfterMinutes: Number.isFinite(bufferAfterMinutes) ? bufferAfterMinutes : defaults.bufferAfterMinutes,
        serviceStationId: raft?.serviceStationId ?? activeStationId,
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        title: created.title,
        date: created.date.toISOString(),
        raftSerial: created.raftSerial,
        responsavel: created.responsavel || "",
        status: created.status,
        type: created.type,
        inspectionType: normalizeInspectionType(created.inspectionType),
        durationMinutes: created.durationMinutes,
        bufferBeforeMinutes: created.bufferBeforeMinutes,
        bufferAfterMinutes: created.bufferAfterMinutes,
      } as AgendaApiEvent,
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Não foi possível criar o agendamento." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const unauthorized = await requireSession(req);
  if (unauthorized) return unauthorized;

  try {
    const body = (await req.json()) as AgendaApiPayload;
    const id = Number(body?.id);
    const title = String(body?.title || "Inspeção").trim();
    const raftSerial = String(body?.raftSerial || "").trim();
    const date = String(body?.date || "").trim();

    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: "ID inválido para atualização." }, { status: 400 });
    }
    if (!raftSerial || !date) {
      return NextResponse.json({ error: "Campos obrigatórios: raftSerial e date." }, { status: 400 });
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "Campo date inválido." }, { status: 400 });
    }

    const inspectionType = normalizeInspectionType(body?.inspectionType);
    const defaults = getInspectionDefaults(inspectionType);
    const durationMinutes = Number(body?.durationMinutes ?? defaults.durationMinutes);
    const bufferBeforeMinutes = Number(body?.bufferBeforeMinutes ?? defaults.bufferBeforeMinutes);
    const bufferAfterMinutes = Number(body?.bufferAfterMinutes ?? defaults.bufferAfterMinutes);

    if (await hasVacationConflict(body?.responsavel, parsedDate)) {
      return NextResponse.json({ error: "O técnico selecionado está de férias nesta data." }, { status: 409 });
    }

    const existing = await prisma.agendaEvento.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Agendamento não encontrado." }, { status: 404 });
    }

    const updated = await prisma.agendaEvento.update({
      where: { id },
      data: {
        title: title || "Inspeção",
        date: parsedDate,
        raftSerial,
        responsavel: body?.responsavel || "",
        status: body?.status || "scheduled",
        type: body?.type || "Inspeção",
        inspectionType,
        durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : defaults.durationMinutes,
        bufferBeforeMinutes: Number.isFinite(bufferBeforeMinutes) ? bufferBeforeMinutes : defaults.bufferBeforeMinutes,
        bufferAfterMinutes: Number.isFinite(bufferAfterMinutes) ? bufferAfterMinutes : defaults.bufferAfterMinutes,
      },
    });

    return NextResponse.json({
      id: updated.id,
      title: updated.title,
      date: updated.date.toISOString(),
      raftSerial: updated.raftSerial,
      responsavel: updated.responsavel || "",
      status: updated.status,
      type: updated.type,
      inspectionType: normalizeInspectionType(updated.inspectionType),
      durationMinutes: updated.durationMinutes,
      bufferBeforeMinutes: updated.bufferBeforeMinutes,
      bufferAfterMinutes: updated.bufferAfterMinutes,
    } as AgendaApiEvent);
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar o agendamento." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const unauthorized = await requireSession(req);
  if (unauthorized) return unauthorized;

  try {
    const body = (await req.json()) as AgendaApiPayload & { deleteAll?: boolean };

    // Bulk cancel: mark all active AgendaEvento as cancelled (keeps history) and reset agendada service-station items
    if (body.deleteAll === true) {
      const [cancelled, resetQueue] = await Promise.all([
        prisma.agendaEvento.updateMany({
          where: { status: { in: ["scheduled", "confirmed"] } },
          data: { status: "cancelled" },
        }),
        prisma.serviceStationQueue.updateMany({
          where: { status: "agendada" },
          data: { status: "aguardar" },
        }),
      ]);
      return NextResponse.json({ success: true, cancelled: cancelled.count, resetQueue: resetQueue.count });
    }

    const id = Number(body?.id);

    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: "ID inválido para exclusão." }, { status: 400 });
    }

    const existing = await prisma.agendaEvento.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Agendamento não encontrado." }, { status: 404 });
    }

    await prisma.agendaEvento.delete({ where: { id } });
    return NextResponse.json({ success: true, id });
  } catch {
    return NextResponse.json({ error: "Não foi possível excluir o agendamento." }, { status: 500 });
  }
}
