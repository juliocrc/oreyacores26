import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getDashboardScope } from '@/lib/dashboard-access';
import { hasEditablePathPermission, hasVisiblePathPermission } from '@/lib/permission-access';
import { appendOrdemServicoLog, appendWorkflowTransition, parseOrdemServicoMeta, type OrdemServicoMeta } from '@/lib/ordens-servico';
import { buildDatabaseErrorResponse } from '@/lib/database-errors';

type Entry = NonNullable<OrdemServicoMeta['timeEntries']>[number];
export class WorkTimeError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export function workTimeSummary(meta: OrdemServicoMeta, now = new Date()) {
  const entries = Array.isArray(meta.timeEntries) ? meta.timeEntries.filter((entry): entry is Entry => Boolean(entry && typeof entry === 'object')) : [];
  const activeEntry = entries.find(entry => !entry.endedAt) || null;
  const totalMinutes = entries.reduce((total, entry) => {
    const start = Date.parse(entry.startedAt || '');
    const end = entry.endedAt ? Date.parse(entry.endedAt) : now.getTime();
    // Timestamps are authoritative; durationMinutes is only a legacy fallback.
    const minutes = Number.isFinite(start) && Number.isFinite(end)
      ? Math.max(0, (end - start) / 60000)
      : entry.endedAt && Number.isFinite(entry.durationMinutes) ? Math.max(0, entry.durationMinutes!) : 0;
    return total + minutes;
  }, 0);
  return { entries, activeEntry, totalMinutes, actualMinutes: totalMinutes, measuredAt: now.toISOString() };
}

export function transitionWorkTime(meta: OrdemServicoMeta, status: string, action: string, user: string, now = new Date(), notes?: string) {
  const summary = workTimeSummary(meta, now);
  if (['concluida', 'cancelada'].includes(status)) throw new WorkTimeError('A OT esta fechada.');
  if (summary.entries.filter(entry => !entry.endedAt).length > 1) throw new WorkTimeError('Existem varios intervalos ativos. Corrija os registos na OT.');
  let entries = summary.entries;
  if (action === 'start') {
    if (summary.activeEntry) throw new WorkTimeError('Ja existe um cronometro ativo.');
    entries = [...entries, { id: randomUUID(), tecnico: user, startedAt: now.toISOString(), endedAt: null, durationMinutes: 0, notes }];
  } else {
    if (action === 'pause' && !summary.activeEntry) throw new WorkTimeError('Nao existe cronometro ativo.');
    entries = entries.map(entry => {
      if (entry.endedAt) return entry;
      const start = Date.parse(entry.startedAt || '');
      if (!Number.isFinite(start) || start > now.getTime()) throw new WorkTimeError('Inicio do intervalo invalido.');
      return { ...entry, endedAt: now.toISOString(), durationMinutes: (now.getTime() - start) / 60000, notes: notes || entry.notes };
    });
  }
  const nextStatus = action === 'start' ? 'em_progresso' : action === 'complete' ? 'concluida' : 'pausada';
  const loggedMeta = appendOrdemServicoLog({ ...meta, timeEntries: entries }, {
    type: `TIME_${action.toUpperCase()}`, message: `Cronometro: ${action}.`, user, at: now.toISOString(),
  });
  const nextMeta = action === 'pause' ? loggedMeta : appendWorkflowTransition(loggedMeta,
    action === 'start' ? 'em_execucao' : 'concluida', { origin: 'time', user, at: now.toISOString() });
  return { meta: nextMeta, status: nextStatus };
}

export async function handleWorkTime(req: NextRequest, id: number, target: 'order' | 'event') {
  try {
    const scope = await getDashboardScope(req);
    if (scope.error) return scope.error;
    const { access, where } = scope;
    const write = req.method === 'POST';
    const paths = target === 'event' ? ['/agenda', '/ordens-servico'] : ['/ordens-servico'];
    if (!access.isAdmin && paths.some(path => !hasVisiblePathPermission(access.permissions, path) || (write && !hasEditablePathPermission(access.permissions, path)))) {
      return NextResponse.json({ error: 'Sem permissao para consultar ou alterar tempos.' }, { status: 403 });
    }
    if (!Number.isSafeInteger(id) || id <= 0) throw new WorkTimeError('ID invalido.', 400);
    const body = write ? await req.json() as Record<string, unknown> : {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new WorkTimeError('Pedido invalido.', 400);
    // stop is the shipped OT client's pause action; its explicit completion remains supported.
    const action = body.action === 'stop' ? body.status === 'concluida' ? 'complete' : 'pause' : body.action;
    if (write && !['start', 'pause', 'complete', ...(target === 'event' ? ['link'] : [])].includes(String(action))) throw new WorkTimeError('Acao invalida.', 400);
    const result = await prisma.$transaction(async tx => {
      let event = target === 'event' ? await tx.agendaEvento.findFirst({ where: { id, ...where } }) : null;
      if (target === 'event' && !event) throw new WorkTimeError('Evento nao encontrado nesta estacao.', 404);
      let order;
      if (target === 'order') {
        order = await tx.ordemServico.findFirst({ where: { id, ...where } });
      } else {
        const linked = (await tx.ordemServico.findMany({ where: { ...where, metadados: { contains: 'agendaEventId' } } }))
          .filter(row => parseOrdemServicoMeta(row.metadados).agendaEventId === id);
        if (linked.length > 1) throw new WorkTimeError('Evento associado a varias OTs. Corrija a associacao.');
        if (action === 'link') {
          const ordemId = Number(body.ordemId);
          if (!Number.isSafeInteger(ordemId) || ordemId <= 0) throw new WorkTimeError('Selecione uma OT existente.', 400);
          if (linked.length && linked[0].id !== ordemId) throw new WorkTimeError('O evento ja tem uma OT associada.');
          order = await tx.ordemServico.findFirst({ where: { id: ordemId, ...where } });
        } else order = linked[0];
      }
      if (!order) {
        if (target === 'order' || write) throw new WorkTimeError('OT nao encontrada ou sem associacao explicita.', 404);
        return { eventId: id, ordemId: null, estimatedMinutes: event!.durationMinutes, canEdit: access.isAdmin || paths.every(path => hasEditablePathPermission(access.permissions, path)) };
      }
      const meta = parseOrdemServicoMeta(order.metadados);
      if (target === 'order' && meta.agendaEventId != null) {
        event = await tx.agendaEvento.findFirst({ where: { id: meta.agendaEventId, ...where } });
        if (!event) throw new WorkTimeError('Evento associado indisponivel nesta estacao.');
      }
      if (event && (event.serviceStationId == null || event.serviceStationId !== order.serviceStationId)) throw new WorkTimeError('Evento e OT devem pertencer a mesma estacao.');
      if (event && meta.agendaEventId != null && meta.agendaEventId !== event.id) throw new WorkTimeError('A OT ja esta associada a outro evento.');
      if (event && !access.isAdmin && (!hasVisiblePathPermission(access.permissions, '/agenda') || (write && !hasEditablePathPermission(access.permissions, '/agenda')))) throw new WorkTimeError('Sem permissao para a agenda associada.', 403);
      if (write && body.updatedAt !== undefined && body.updatedAt !== order.updatedAt.toISOString()) throw new WorkTimeError('OT alterada. Atualize antes de tentar novamente.');
      const now = new Date(Math.max(Date.now(), write ? order.updatedAt.getTime() + 1 : 0, write && event ? event.updatedAt.getTime() + 1 : 0));
      if (write) {
        if (event && ['cancelled', 'completed'].includes(event.status)) throw new WorkTimeError('O evento esta fechado.');
        if (action === 'link' && ['concluida', 'cancelada'].includes(order.status)) throw new WorkTimeError('A OT esta fechada.');
        const next = action === 'link'
          ? { meta: appendOrdemServicoLog({ ...meta, agendaEventId: event!.id }, { type: 'AGENDA_LINK', message: `Evento #${event!.id} associado explicitamente.`, user: access.email }), status: order.status }
          : transitionWorkTime(meta, order.status, String(action), access.email, now, typeof body.notes === 'string' ? body.notes.trim() : undefined);
        // Compare-and-swap protects metadata and status even without a client revision.
        const changed = await tx.ordemServico.updateMany({
          where: { id: order.id, ...where, updatedAt: order.updatedAt, metadados: order.metadados, status: order.status },
          data: { metadados: JSON.stringify(next.meta), status: next.status, updatedAt: now,
            ...(action === 'start' ? { dataInicio: order.dataInicio || now } : {}),
            ...(action === 'complete' ? { dataConclusao: now } : {}) },
        });
        if (changed.count !== 1) throw new WorkTimeError('OT alterada em simultaneo. Atualize e tente novamente.');
        if (event) {
          const changedEvent = await tx.agendaEvento.updateMany({ where: { id: event.id, ...where, updatedAt: event.updatedAt, status: event.status }, data: {
            updatedAt: now, ...(action === 'link' ? {} : { status: action === 'start' ? 'in_progress' : action === 'complete' ? 'completed' : 'paused' }),
          } });
          if (changedEvent.count !== 1) throw new WorkTimeError('Evento alterado em simultaneo. Atualize e tente novamente.');
        }
        await tx.auditoria.create({ data: { tabela: 'OrdemServico', tipoOperacao: 'UPDATE', idRegisto: order.id, usuario: access.email,
          descricao: `Cronometro OT: ${action}`, dadosAntes: JSON.stringify({ status: order.status, metadados: order.metadados }), dadosDepois: JSON.stringify({ status: next.status, metadados: next.meta }) } });
        order = { ...order, status: next.status, metadados: JSON.stringify(next.meta), updatedAt: now,
          dataInicio: action === 'start' ? order.dataInicio || now : order.dataInicio,
          dataConclusao: action === 'complete' ? now : order.dataConclusao };
      }
      const summary = workTimeSummary(parseOrdemServicoMeta(order.metadados), now);
      const estimatedMinutes = event?.durationMinutes ?? order.durationMinutes;
      return { ...summary, eventId: event?.id ?? null, ordemId: order.id, status: order.status,
        estimatedMinutes, deltaMinutes: summary.actualMinutes - estimatedMinutes, updatedAt: order.updatedAt.toISOString(),
        canEdit: access.isAdmin || paths.every(path => hasEditablePathPermission(access.permissions, path)),
        source: 'metadados.timeEntries', order: { status: order.status, durationMinutes: order.durationMinutes, dataInicio: order.dataInicio, dataConclusao: order.dataConclusao } };
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof WorkTimeError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'JSON invalido.' }, { status: 400 });
    if (error && typeof error === 'object' && 'code' in error && ['P2034', 'P2028', 'SQLITE_BUSY'].includes(String(error.code))) return NextResponse.json({ error: 'Alteracao concorrente. Atualize e tente novamente.' }, { status: 409 });
    return buildDatabaseErrorResponse(error, 'Erro ao registar tempos da OT.');
  }
}
