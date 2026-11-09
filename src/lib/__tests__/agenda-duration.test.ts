import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getInspectionDefaults, resolveAgendaDuration } from '@/types/agenda';
import { computeOperationalEnd, computeOperationalDuration } from '@/lib/agenda-page-helpers';
import { syncAssistenciaAgendaEvent } from '@/lib/agenda-sync';
import { GET, POST, PUT } from '@/app/api/agenda/route';
import { GET as conflicts } from '@/app/api/agenda/conflicts/route';
import { GET as metrics } from '@/app/api/agenda/metrics/route';

jest.mock('@/lib/prisma', () => {
  const delegate = () => ({ findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() });
  return { __esModule: true, default: {
    agendaEvento: delegate(), agenda: delegate(), jangada: delegate(), tecnico: delegate(),
    tecnicoAusencia: delegate(), serviceStationQueue: delegate(), navio: delegate(),
  } };
});
jest.mock('@/lib/access-control', () => ({ getAccessContext: jest.fn(async () => ({ isAdmin: true, allowedStationIds: [] })) }));
jest.mock('@/lib/station-selection', () => ({ resolveActiveServiceStationId: jest.fn(() => null) }));
jest.mock('@/lib/alcantarilha-scope', () => ({ activeStationIsAlcantarilha: jest.fn(), getSouthRegionShipIds: jest.fn() }));
jest.mock('@/lib/agenda-expiracao', () => ({ getRaftsAExpiar: jest.fn(async () => []), buildExpirationApiEvents: jest.fn(() => []) }));
jest.mock('@/lib/google-calendar-config', () => ({ getGoogleCalendarConfig: jest.fn(() => ({ janelaDiasApp: 30 })) }));

const row = (overrides = {}) => ({
  id: 1, title: 'Inspecao', date: new Date(2030, 0, 7, 9), raftSerial: 'RAFT-1',
  type: 'Inspeção', inspectionType: 'outro', durationMinutes: 210,
  bufferBeforeMinutes: 0, bufferAfterMinutes: 0, status: 'scheduled', responsavel: 'Tecnico',
  serviceStationId: null, createdAt: new Date(), updatedAt: new Date(), ...overrides,
});
const request = (body?: object) => new NextRequest('http://localhost/api/agenda', body
  ? { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : undefined);

beforeEach(() => {
  jest.clearAllMocks();
  for (const delegate of Object.values(prisma) as { findMany: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock }[]) {
    delegate.findMany.mockResolvedValue([]);
    delegate.findFirst.mockResolvedValue(null);
    delegate.findUnique.mockResolvedValue(null);
  }
  (prisma.agendaEvento.create as jest.Mock).mockImplementation(async ({ data }) => row(data));
  (prisma.agendaEvento.update as jest.Mock).mockImplementation(async ({ data }) => row(data));
  jest.mocked(prisma.jangada.findFirst).mockResolvedValue({ serviceStationId: null } as never);
});

it('defaults generic and annual raft inspections to 180m, leaving specialized work unchanged', () => {
  expect(getInspectionDefaults('outro').durationMinutes).toBe(180);
  expect(getInspectionDefaults('Inspeção').durationMinutes).toBe(180);
  expect(getInspectionDefaults('anual').durationMinutes).toBe(180);
  expect(getInspectionDefaults('anual_gi').durationMinutes).toBe(300);
  expect(getInspectionDefaults('hidraulico').durationMinutes).toBe(240);
  expect(getInspectionDefaults('reinspecao').durationMinutes).toBe(90);
});

it.each([30, 210])('resolves legacy generic %im consistently with standard or sync buffers', durationMinutes => {
  for (const type of ['Inspeção', 'outro', '']) {
    for (const buffer of [0, 15]) {
      expect(resolveAgendaDuration(row({ type, durationMinutes, bufferBeforeMinutes: buffer, bufferAfterMinutes: buffer }))).toBe(180);
    }
  }
});

it.each([null, undefined, 0, -5, NaN, Infinity])('falls back to 180 for invalid duration %s', durationMinutes => {
  expect(resolveAgendaDuration({ ...row(), durationMinutes })).toBe(180);
});

it('preserves identifiable overrides, specialized work and actual deliveries/absences/expiration', () => {
  for (const durationMinutes of [45, 120, 240, 270, 300]) {
    expect(resolveAgendaDuration(row({ durationMinutes }))).toBe(durationMinutes);
  }
  for (const durationMinutes of [30, 210]) {
    expect(resolveAgendaDuration(row({ durationMinutes, bufferBeforeMinutes: 25 }))).toBe(durationMinutes);
    expect(resolveAgendaDuration(row({ durationMinutes, inspectionType: 'reinspecao' }))).toBe(durationMinutes);
    for (const type of ['Entrega', 'ausencia', 'expiracao']) {
      expect(resolveAgendaDuration(row({ type, durationMinutes }))).toBe(durationMinutes);
    }
    expect(resolveAgendaDuration(row({ durationMinutes, raftSerial: '' }))).toBe(durationMinutes);
  }
});

it.each([30, 210])('lists legacy %im as 180m and uses the same value in metrics without repairing DB rows', async durationMinutes => {
  jest.mocked(prisma.agendaEvento.findMany).mockResolvedValue([row({ durationMinutes })] as never);
  expect(await (await GET(request())).json()).toEqual([expect.objectContaining({ durationMinutes: 180, inspectionType: 'outro' })]);
  expect(await (await metrics(request())).json()).toMatchObject({ averageDuration: 180 });
  expect(prisma.agendaEvento.update).not.toHaveBeenCalled();
});

it('creates API events at 180m and keeps explicit nonlegacy durations', async () => {
  for (const durationMinutes of [undefined, 270]) {
    const response = await POST(request({ raftSerial: 'RAFT-1', date: '2030-01-07T09:00:00', durationMinutes }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ durationMinutes: durationMinutes ?? 180 });
  }
});

it('keeps an existing override on PUT when duration is omitted', async () => {
  jest.mocked(prisma.agendaEvento.findFirst).mockResolvedValue(row({ durationMinutes: 270, responsavel: '' }) as never);
  const response = await PUT(request({ id: 1, raftSerial: 'RAFT-1', date: '2030-01-07T09:00:00' }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ durationMinutes: 270 });
});

it('keeps identifying custom buffers on PUT so a manual 210m stays manual on subsequent reads', async () => {
  const existing = row({ durationMinutes: 210, bufferBeforeMinutes: 25, bufferAfterMinutes: 5 });
  jest.mocked(prisma.agendaEvento.findFirst).mockResolvedValue({ ...existing, responsavel: '' } as never);
  const response = await PUT(request({ id: 1, raftSerial: 'RAFT-1', date: '2030-01-07T09:00:00' }));
  expect(await response.json()).toMatchObject({ durationMinutes: 210, bufferBeforeMinutes: 25, bufferAfterMinutes: 5 });
});

it('sync creates at 180m and excludes delivery events from reuse', async () => {
  await syncAssistenciaAgendaEvent({ raftSerial: 'RAFT-1', date: row().date });
  expect(prisma.agendaEvento.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ type: { notIn: ['Entrega', 'ausencia', 'expiracao'] } }),
  }));
  expect(prisma.agendaEvento.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ durationMinutes: 180 }) }));
});

it.each([[30, 180], [210, 180], [270, 270]])('sync resolves %im to %im', async (durationMinutes, expected) => {
  jest.mocked(prisma.agendaEvento.findFirst).mockResolvedValue(row({ durationMinutes }) as never);
  await syncAssistenciaAgendaEvent({ raftSerial: 'RAFT-1', date: row().date });
  expect(prisma.agendaEvento.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ durationMinutes: expected }) }));
});

it.each([30, 210])('conflicts use a 180m window for legacy %im, not 30m or 210m', async durationMinutes => {
  const first = row({ durationMinutes });
  for (const [hour, minute, overlaps] of [[11, 59, true], [12, 0, false], [12, 15, false]] as const) {
    jest.mocked(prisma.agendaEvento.findMany).mockResolvedValue([
      first, row({ id: 2, raftSerial: 'RAFT-2', durationMinutes: 45, date: new Date(2030, 0, 7, hour, minute) }),
    ] as never);
    const body = await (await conflicts(request())).json();
    expect(body.conflicts.some((c: { type: string }) => c.type === 'responsible_overlap')).toBe(overlaps);
  }
});

it('keeps slot capacity limits while resolving all legacy durations to 180m', async () => {
  jest.mocked(prisma.agendaEvento.findMany).mockResolvedValue([
    row({ durationMinutes: 30 }), row({ id: 2 }), row({ id: 3 }),
  ] as never);
  const body = await (await conflicts(request())).json();
  expect(body.conflicts).toContainEqual(expect.objectContaining({ type: 'slot_capacity', eventIds: [1, 2, 3] }));
});

it('fits a 180m morning slot and excludes lunch from operational resize duration', () => {
  const start = new Date(2030, 0, 7, 9);
  expect(computeOperationalEnd(start, resolveAgendaDuration(row())).getHours()).toBe(12);
  const acrossLunch = new Date(2030, 0, 7, 11);
  const end = computeOperationalEnd(acrossLunch, 180);
  expect([end.getHours(), end.getMinutes()]).toEqual([15, 30]);
  expect(computeOperationalDuration(acrossLunch, end)).toBe(180);
});
