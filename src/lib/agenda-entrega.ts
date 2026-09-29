import prisma from "@/lib/prisma";
import { syncAgendaToGoogleCalendar } from "@/lib/google-calendar";

export const ENTREGA_EVENT_TYPE = "Entrega";
export const ENTREGA_DURATION_MINUTES = 30;

const ACTIVE_AGENDA_STATUSES = ["scheduled", "confirmed", "in_progress", "testing", "paused"] as const;

async function resolveRaftSerial(params: { raftSerial?: string | null; jangadaId?: number }) {
  const direct = String(params.raftSerial || "").trim();
  if (direct) return direct;
  if (!params.jangadaId) return "";
  const raft = await prisma.jangada.findUnique({
    where: { id: params.jangadaId },
    select: { serial: true },
  });
  return String(raft?.serial || "").trim();
}

function toDeliveryDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const parsed = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(parsed.getTime())) return null;
  // Sem hora explícita → assume 10:00 local.
  const hasTime = /\d{1,2}:\d{2}/.test(typeof value === "string" ? value : "");
  if (!hasTime) {
    parsed.setHours(10, 0, 0, 0);
  }
  return parsed;
}

function fireAndForgetGoogleSync() {
  syncAgendaToGoogleCalendar().catch((error) => {
    console.error("[agenda-entrega] Falha ao sincronizar Google Calendar:", error);
  });
}

export async function syncEntregaAgendaEvent(params: {
  raftSerial?: string | null;
  jangadaId?: number;
  dataPrevistaEntrega?: string | Date | null;
  observacao?: string | null;
}) {
  const raftSerial = await resolveRaftSerial(params);
  if (!raftSerial) return;

  const date = toDeliveryDate(params.dataPrevistaEntrega);
  if (!date) {
    await clearEntregaAgendaEvent({ raftSerial, jangadaId: params.jangadaId });
    return;
  }

  const existing = await prisma.agendaEvento.findFirst({
    where: {
      raftSerial: { equals: raftSerial },
      type: ENTREGA_EVENT_TYPE,
      status: { in: [...ACTIVE_AGENDA_STATUSES] },
    },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });

  const title = `Entrega ${raftSerial}`;
  const data = {
    title,
    date,
    raftSerial,
    type: ENTREGA_EVENT_TYPE,
    inspectionType: "outro",
    durationMinutes: ENTREGA_DURATION_MINUTES,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
  };

  if (existing) {
    await prisma.agendaEvento.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.agendaEvento.create({ data });
  }

  fireAndForgetGoogleSync();
}

export async function clearEntregaAgendaEvent(params: {
  raftSerial?: string | null;
  jangadaId?: number;
}) {
  const raftSerial = await resolveRaftSerial(params);
  if (!raftSerial) return;

  const deleted = await prisma.agendaEvento.deleteMany({
    where: {
      raftSerial: { equals: raftSerial },
      type: ENTREGA_EVENT_TYPE,
      status: { in: [...ACTIVE_AGENDA_STATUSES] },
    },
  });

  if (deleted.count > 0) {
    fireAndForgetGoogleSync();
  }
}
