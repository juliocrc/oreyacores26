import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAccessContext } from '@/lib/access-control';
import { resolveActiveServiceStationId } from '@/lib/station-selection';
import { hasEditablePathPermission } from '@/lib/permission-access';
import { getTechnicianKeyByName } from '@/lib/agenda-technicians';
import { AGENDA_ACTIVE_STATES, agendaEventInterval, agendaIntervalsOverlap, type AvailabilityEvent } from '@/lib/agenda-availability';

export async function agendaWriteScope(req: NextRequest) {
  const access = await getAccessContext();
  if (!access) return { error: NextResponse.json({ error: 'Sessão obrigatória.' }, { status: 401 }) };
  if (!access.isAdmin && !hasEditablePathPermission(access.permissions, '/agenda')) {
    return { error: NextResponse.json({ error: 'Sem permissão para alterar a agenda.' }, { status: 403 }) };
  }
  const stationId = resolveActiveServiceStationId(req, access);
  const where = stationId !== null ? { serviceStationId: stationId }
    : access.isAdmin ? {} : { serviceStationId: { in: access.allowedStationIds.length ? access.allowedStationIds : [-1] } };
  return { where, stationId };
}

// Read-time validation, not an atomic booking or a new business-hours policy.
export async function validateAgendaWrite(event: AvailabilityEvent & { serviceStationId: number | null }) {
  if (!AGENDA_ACTIVE_STATES.includes((event.status ?? 'scheduled').trim().toLowerCase())) return null;
  const interval = agendaEventInterval(event);
  if (!interval.every(Number.isFinite) || interval[1] <= interval[0]) return 'Janela do agendamento inválida.';
  const events = await prisma.agendaEvento.findMany({ where: {
    serviceStationId: event.serviceStationId, status: { in: AGENDA_ACTIVE_STATES }, id: { not: event.id },
  } });
  if (events.some(other => other.raftSerial === event.raftSerial)) return 'Já existe um agendamento ativo para esta jangada.';
  const key = getTechnicianKeyByName(event.responsavel);
  if (!key) return null;
  if (event.serviceStationId === null) return 'Selecione uma estação para atribuir um técnico.';
  const technicians = await prisma.tecnico.findMany({ where: { serviceStationId: event.serviceStationId, ativo: true }, select: { id: true, nome: true } });
  const matching = technicians.filter(tech => getTechnicianKeyByName(tech.nome) === key);
  if (matching.length !== 1) return 'Técnico inexistente ou ambíguo nesta estação.';
  if (events.some(other => getTechnicianKeyByName(other.responsavel) === key && agendaIntervalsOverlap(interval, agendaEventInterval(other)))) {
    return 'O técnico já tem um agendamento sobreposto nesta janela, incluindo buffers.';
  }
  const absence = await prisma.tecnicoAusencia.findFirst({ where: {
    OR: [{ tecnicoId: matching[0].id }, { tecnicoId: null, tecnicoKey: key }],
    dataInicio: { lt: new Date(interval[1]) }, dataFim: { gt: new Date(interval[0]) },
  }, select: { id: true } });
  return absence ? 'O técnico tem férias ou ausência durante a janela do agendamento, incluindo buffers.' : null;
}
