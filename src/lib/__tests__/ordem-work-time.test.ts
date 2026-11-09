import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getDashboardScope } from '@/lib/dashboard-access';
import { GET, POST } from '@/app/api/ordens-servico/[id]/tempos/route';
import { GET as eventGET, POST as eventPOST } from '@/app/api/agenda/[id]/time/route';
import { transitionWorkTime, workTimeSummary } from '@/lib/ordem-work-time';

jest.mock('@/lib/dashboard-access', () => ({ getDashboardScope: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {
  $transaction: jest.fn(),
  ordemServico: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  agendaEvento: { findFirst: jest.fn(), updateMany: jest.fn() },
  auditoria: { create: jest.fn() },
} }));

const now = new Date('2026-10-20T12:00:00Z');
const order = { id: 7, numeroOrdem: 'OT-7', serviceStationId: 2, status: 'pendente', metadados: '{}',
  updatedAt: new Date('2026-10-19T12:00:00Z'), durationMinutes: 210, dataInicio: null, dataConclusao: null };
const event = { id: 3, serviceStationId: 2, status: 'scheduled', durationMinutes: 180, updatedAt: order.updatedAt };
const scope = { access: { isAdmin: false, email: 'staff@test.pt', permissions: { visiblePages: ['/agenda', '/ordens-servico'], editablePages: ['/agenda', '/ordens-servico'] } }, where: { serviceStationId: { in: [2] } } };
const request = (body?: unknown, target = 'order') => new NextRequest(`http://localhost/api/${target === 'order' ? 'ordens-servico/7/tempos' : 'agenda/3/time'}`, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers().setSystemTime(now);
  jest.mocked(getDashboardScope).mockResolvedValue(scope as never);
  jest.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma));
  jest.mocked(prisma.ordemServico.findFirst).mockResolvedValue(order as never);
  jest.mocked(prisma.ordemServico.findMany).mockResolvedValue([]);
  jest.mocked(prisma.agendaEvento.findFirst).mockResolvedValue(event as never);
  jest.mocked(prisma.ordemServico.updateMany).mockResolvedValue({ count: 1 });
  jest.mocked(prisma.agendaEvento.updateMany).mockResolvedValue({ count: 1 });
});
afterEach(() => jest.useRealTimers());

it('accumulates start/pause/resume/complete without pauses or minimum-minute rounding', () => {
  const first = transitionWorkTime({}, 'pendente', 'start', 'staff', new Date('2026-10-20T10:00:00Z'));
  const paused = transitionWorkTime(first.meta, first.status, 'pause', 'staff', new Date('2026-10-20T10:00:30Z'));
  expect(workTimeSummary(paused.meta, now).actualMinutes).toBe(0.5);
  const resumed = transitionWorkTime(paused.meta, paused.status, 'start', 'staff', new Date('2026-10-20T11:00:00Z'));
  const finished = transitionWorkTime(resumed.meta, resumed.status, 'complete', 'staff', new Date('2026-10-20T11:02:00Z'));
  expect(workTimeSummary(finished.meta, now)).toMatchObject({ actualMinutes: 2.5, activeEntry: null });
  expect(finished.status).toBe('concluida');
  expect(finished.meta.workflowStatus).toBe('concluida');
});

it('completes while paused and before starting', () => {
  expect(transitionWorkTime({}, 'pausada', 'complete', 'staff', now).status).toBe('concluida');
  expect(transitionWorkTime({}, 'pendente', 'complete', 'staff', now).meta.timeEntries).toEqual([]);
});

it('uses timestamp intervals, not stale rounded durations, and includes running time', () => {
  expect(workTimeSummary({ timeEntries: [
    { startedAt: '2026-10-20T10:00:00Z', endedAt: '2026-10-20T10:01:30Z', durationMinutes: 99 },
    { startedAt: '2026-10-20T11:59:30Z' },
  ] }, now).actualMinutes).toBe(2);
});

it.each(['concluida', 'cancelada'])('does not restart closed order %s', status => {
  expect(() => transitionWorkTime({}, status, 'start', 'staff', now)).toThrow('fechada');
});

it('rejects duplicate starts, inactive pauses and multiple active entries', () => {
  expect(() => transitionWorkTime({ timeEntries: [{ startedAt: now.toISOString() }] }, 'em_progresso', 'start', 'staff', now)).toThrow('ativo');
  expect(() => transitionWorkTime({}, 'pausada', 'pause', 'staff', now)).toThrow('ativo');
  expect(() => transitionWorkTime({ timeEntries: [{}, {}] }, 'em_progresso', 'complete', 'staff', now)).toThrow('varios');
});

it('preserves estimates on legacy stop and attributes time to authenticated staff', async () => {
  jest.mocked(prisma.ordemServico.findFirst).mockResolvedValue({ ...order, status: 'em_progresso', metadados: JSON.stringify({ timeEntries: [{ startedAt: '2026-10-20T11:30:00Z' }] }) } as never);
  const response = await POST(request({ action: 'stop', tecnico: 'spoofed' }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ actualMinutes: 30, estimatedMinutes: 210, status: 'pausada', order: { durationMinutes: 210 } });
  const update = jest.mocked(prisma.ordemServico.updateMany).mock.calls[0][0];
  expect(update.data).not.toHaveProperty('durationMinutes');
  expect(JSON.parse(update.data.metadados as string).logs[0].user).toBe('staff@test.pt');
  expect(update.where).toMatchObject({ id: 7, serviceStationId: { in: [2] }, updatedAt: order.updatedAt });
});

it('honors legacy stop completion and completes a paused OT via the API', async () => {
  const response = await POST(request({ action: 'stop', status: 'concluida' }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'concluida', activeEntry: null });
  expect(jest.mocked(prisma.ordemServico.updateMany).mock.calls[0][0].data).toMatchObject({ dataConclusao: now });
});

it.each([GET, POST, eventGET, eventPOST])('returns auth failures before any transaction', async handler => {
  jest.mocked(getDashboardScope).mockResolvedValue({ error: new Response('{}', { status: 401 }) } as never);
  expect((await handler(request({ action: 'start' }))).status).toBe(401);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('denies writes without page edit permission', async () => {
  jest.mocked(getDashboardScope).mockResolvedValue({ ...scope, access: { ...scope.access, permissions: { visiblePages: ['/ordens-servico'], editablePages: [] } } } as never);
  expect((await POST(request({ action: 'start' }))).status).toBe(403);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('returns 404 for an OT outside the authorized station scope', async () => {
  jest.mocked(prisma.ordemServico.findFirst).mockResolvedValue(null);
  expect((await GET(request())).status).toBe(404);
  expect(prisma.ordemServico.findFirst).toHaveBeenCalledWith({ where: { id: 7, serviceStationId: { in: [2] } } });
});

it('returns an unlinked event without inferring an OT or creating anything', async () => {
  const response = await eventGET(request(undefined, 'event'));
  expect(await response.json()).toMatchObject({ eventId: 3, ordemId: null, estimatedMinutes: 180 });
  expect(prisma.ordemServico.findFirst).not.toHaveBeenCalled();
  expect(prisma.ordemServico.updateMany).not.toHaveBeenCalled();
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});

it('persists an explicit event-to-OT association and leaves both estimates unchanged', async () => {
  const response = await eventPOST(request({ action: 'link', ordemId: 7 }, 'event'));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ordemId: 7, eventId: 3, estimatedMinutes: 180, order: { durationMinutes: 210 } });
  expect(JSON.parse(jest.mocked(prisma.ordemServico.updateMany).mock.calls[0][0].data.metadados as string).agendaEventId).toBe(3);
  expect(prisma.agendaEvento.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ updatedAt: event.updatedAt }), data: { updatedAt: now } }));
  expect(prisma.auditoria.create).toHaveBeenCalledTimes(1);
});

it.each([null, 4])('rejects linking event to an OT in a different or unknown station %s', serviceStationId => {
  jest.mocked(prisma.ordemServico.findFirst).mockResolvedValue({ ...order, serviceStationId } as never);
  return eventPOST(request({ action: 'link', ordemId: 7 }, 'event')).then(response => {
    expect(response.status).toBe(409);
    expect(prisma.ordemServico.updateMany).not.toHaveBeenCalled();
  });
});

it('does not rebind an OT already linked elsewhere', async () => {
  jest.mocked(prisma.ordemServico.findFirst).mockResolvedValue({ ...order, metadados: '{"agendaEventId":8}' } as never);
  expect((await eventPOST(request({ action: 'link', ordemId: 7 }, 'event'))).status).toBe(409);
});

it('does not choose arbitrarily between multiple explicitly linked OTs', async () => {
  jest.mocked(prisma.ordemServico.findMany).mockResolvedValue([order, { ...order, id: 8 }].map(row => ({ ...row, metadados: '{"agendaEventId":3}' })) as never);
  expect((await eventGET(request(undefined, 'event'))).status).toBe(409);
});

it('updates the event status using only the explicit metadata association', async () => {
  jest.mocked(prisma.ordemServico.findMany).mockResolvedValue([{ ...order, metadados: '{"agendaEventId":3}' }] as never);
  const response = await eventPOST(request({ action: 'start' }, 'event'));
  expect(response.status).toBe(200);
  expect(prisma.agendaEvento.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { updatedAt: now, status: 'in_progress' } }));
});

it('returns conflict for stale client revisions without writing', async () => {
  expect((await POST(request({ action: 'start', updatedAt: now.toISOString() }))).status).toBe(409);
  expect(prisma.ordemServico.updateMany).not.toHaveBeenCalled();
});

it('returns conflict when the metadata compare-and-swap loses', async () => {
  jest.mocked(prisma.ordemServico.updateMany).mockResolvedValue({ count: 0 });
  expect((await POST(request({ action: 'start' }))).status).toBe(409);
  expect(prisma.auditoria.create).not.toHaveBeenCalled();
});

it('aborts the transaction if the event compare-and-swap loses', async () => {
  jest.mocked(prisma.agendaEvento.updateMany).mockResolvedValue({ count: 0 });
  expect((await eventPOST(request({ action: 'link', ordemId: 7 }, 'event'))).status).toBe(409);
  expect(prisma.auditoria.create).not.toHaveBeenCalled();
});

it('maps transaction write conflicts to 409 without automatic mutation retries', async () => {
  jest.mocked(prisma.$transaction).mockRejectedValue({ code: 'P2034' });
  expect((await POST(request({ action: 'start' }))).status).toBe(409);
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
});
