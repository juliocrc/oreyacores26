import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getAccessContext } from '@/lib/access-control';
import { POST, PUT } from '@/app/api/agenda/route';
import { agendaEventInterval, agendaZonedTime, calculateAgendaAvailability } from '@/lib/agenda-availability';
import { resolveActiveServiceStationId } from '@/lib/station-selection';

jest.mock('@/lib/prisma', () => {
  const delegate = () => ({ findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() });
  return { __esModule: true, default: { agendaEvento: delegate(), jangada: delegate(), tecnico: delegate(), tecnicoAusencia: delegate() } };
});
jest.mock('@/lib/access-control', () => ({ getAccessContext: jest.fn() }));
jest.mock('@/lib/station-selection', () => ({ resolveActiveServiceStationId: jest.fn(() => 2) }));
jest.mock('@/lib/agenda-expiracao', () => ({ getRaftsAExpiar: jest.fn(), buildExpirationApiEvents: jest.fn() }));
jest.mock('@/lib/google-calendar-config', () => ({ getGoogleCalendarConfig: jest.fn() }));
jest.mock('@/lib/alcantarilha-scope', () => ({ activeStationIsAlcantarilha: jest.fn(), getSouthRegionShipIds: jest.fn() }));

const at = (time: number, day = '2030-01-07') => new Date(agendaZonedTime(day, time));
const event = { id: 7, date: at(660), raftSerial: 'R1', responsavel: 'Ana', status: 'scheduled', type: 'Inspeção', inspectionType: 'anual', durationMinutes: 180, bufferBeforeMinutes: 15, bufferAfterMinutes: 15, serviceStationId: 2 };
const request = (body: object) => new NextRequest('http://localhost/api/agenda', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, allowedStationIds: [2], permissions: { editablePages: ['/agenda'] } } as never);
  jest.mocked(resolveActiveServiceStationId).mockReturnValue(2);
  jest.mocked(prisma.jangada.findFirst).mockResolvedValue({ serviceStationId: 2 } as never);
  jest.mocked(prisma.agendaEvento.findFirst).mockResolvedValue(event as never);
  jest.mocked(prisma.agendaEvento.findMany).mockResolvedValue([]);
  jest.mocked(prisma.tecnico.findMany).mockResolvedValue([{ id: 1, nome: 'Ana' }] as never);
  jest.mocked(prisma.tecnicoAusencia.findFirst).mockResolvedValue(null);
  (prisma.agendaEvento.create as jest.Mock).mockImplementation(async ({ data }) => ({ id: 8, ...data }));
  (prisma.agendaEvento.update as jest.Mock).mockImplementation(async ({ data }) => ({ ...event, ...data }));
});

it.each([POST, PUT])('rejects a technician overlap after lunch, including both buffers, before writing', async write => {
  jest.mocked(prisma.agendaEvento.findMany).mockResolvedValue([{ ...event, id: 8, raftSerial: 'R2', date: at(940), durationMinutes: 45 }] as never);
  const response = await write(request(event));
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain('sobreposto');
  expect(prisma.agendaEvento.create).not.toHaveBeenCalled();
  expect(prisma.agendaEvento.update).not.toHaveBeenCalled();
  expect(prisma.agendaEvento.findMany).toHaveBeenCalledWith({ where: { serviceStationId: 2, status: { in: expect.any(Array) }, id: { not: write === PUT ? 7 : 0 } } });
});

it.each([POST, PUT])('checks full absence interval and technician ID with a legacy-key fallback, not just the initial day', async write => {
  jest.mocked(prisma.tecnicoAusencia.findFirst).mockResolvedValue({ id: 9 } as never);
  const candidate = { ...event, date: at(1080), durationMinutes: 900 };
  const response = await write(request(candidate));
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain('ausência');
  const [start, end] = agendaEventInterval(candidate);
  expect(prisma.tecnicoAusencia.findFirst).toHaveBeenCalledWith({ where: {
    OR: [{ tecnicoId: 1 }, { tecnicoId: null, tecnicoKey: 'ana' }], dataInicio: { lt: new Date(end) }, dataFim: { gt: new Date(start) },
  }, select: { id: true } });
});

it('accepts exact half-open buffer boundaries and excludes the edited event', async () => {
  const [, end] = agendaEventInterval(event);
  jest.mocked(prisma.agendaEvento.findMany).mockResolvedValue([{ ...event, id: 8, raftSerial: 'R2', date: new Date(end + 15 * 60000), durationMinutes: 45 }] as never);
  expect((await PUT(request(event))).status).toBe(200);
  expect(prisma.agendaEvento.update).toHaveBeenCalledTimes(1);
});

it.each([POST, PUT])('rejects unknown or ambiguous technicians in the authorized station', async write => {
  jest.mocked(prisma.tecnico.findMany).mockResolvedValue([]);
  expect((await write(request(event))).status).toBe(409);
  expect(prisma.tecnico.findMany).toHaveBeenCalledWith({ where: { serviceStationId: 2, ativo: true }, select: { id: true, nome: true } });
  jest.mocked(prisma.tecnico.findMany).mockResolvedValue([{ id: 1, nome: 'Ana' }, { id: 2, nome: 'Ana' }] as never);
  expect((await write(request(event))).status).toBe(409);
});

it('does not permit editing an event or scheduling a raft outside the write scope', async () => {
  jest.mocked(prisma.agendaEvento.findFirst).mockResolvedValue(null);
  expect((await PUT(request(event))).status).toBe(404);
  expect(prisma.agendaEvento.findFirst).toHaveBeenCalledWith({ where: { id: 7, serviceStationId: 2 } });
  jest.mocked(prisma.jangada.findFirst).mockResolvedValue(null);
  expect((await POST(request(event))).status).toBe(404);
  expect(prisma.jangada.findFirst).toHaveBeenCalledWith({ where: { serial: { equals: 'R1' }, serviceStationId: 2 }, select: { serviceStationId: true } });
});

it('denies writes without edit permission before reading agenda rows', async () => {
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, allowedStationIds: [2], permissions: { editablePages: [] } } as never);
  expect((await POST(request(event))).status).toBe(403);
  expect(prisma.agendaEvento.findMany).not.toHaveBeenCalled();
});

it.each([POST, PUT])('requires authentication before querying booking data', async write => {
  jest.mocked(getAccessContext).mockResolvedValue(null);
  expect((await write(request(event))).status).toBe(401);
  expect(prisma.agendaEvento.findMany).not.toHaveBeenCalled();
  expect(prisma.agendaEvento.findFirst).not.toHaveBeenCalled();
});

it('does not turn an empty station allowlist into an unrestricted write scope', async () => {
  jest.mocked(resolveActiveServiceStationId).mockReturnValue(null);
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, allowedStationIds: [], permissions: { editablePages: ['/agenda'] } } as never);
  jest.mocked(prisma.agendaEvento.findFirst).mockResolvedValue(null);
  expect((await PUT(request(event))).status).toBe(404);
  expect(prisma.agendaEvento.findFirst).toHaveBeenCalledWith({ where: { id: 7, serviceStationId: { in: [-1] } } });
});

it('does not let an unknown status bypass active-overlap checks', async () => {
  jest.mocked(prisma.agendaEvento.findMany).mockResolvedValue([{ ...event, id: 8, raftSerial: 'R2' }] as never);
  expect((await POST(request({ ...event, status: 'made-up' }))).status).toBe(409);
});

it('keeps the raft duplicate rule but permits cancellation despite current conflicts', async () => {
  jest.mocked(prisma.agendaEvento.findMany).mockResolvedValue([{ ...event, id: 8, responsavel: 'Bia' }] as never);
  expect((await POST(request(event))).status).toBe(409);
  expect((await PUT(request({ ...event, status: 'cancelled' }))).status).toBe(200);
});

it('does not impose weekdays, opening hours or fixed buffers on manual bookings', async () => {
  expect((await POST(request({ ...event, date: at(1200, '2030-01-06'), bufferBeforeMinutes: 25, bufferAfterMinutes: 5 }))).status).toBe(201);
  expect(prisma.agendaEvento.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ bufferBeforeMinutes: 25, bufferAfterMinutes: 5 }) }));
});

it('accepts an unmodified suggestion and uses the same reservation window as capacity', async () => {
  const suggestion = calculateAgendaAvailability({ date: '2030-01-07', technicians: [{ id: 1, nome: 'Ana' }], events: [], absences: [] }).suggestions[0];
  expect((await POST(request({ ...event, date: suggestion.start }))).status).toBe(201);
  const interval = agendaEventInterval({ ...event, date: suggestion.start });
  expect(interval[0]).toBe(at(540).getTime());
  expect(interval[1]).toBe(at(750).getTime());
});

it('keeps sub-minute timestamp precision when checking the full window', () => {
  const [start, end] = agendaEventInterval({ ...event, date: new Date(at(660).getTime() + 30500) });
  expect(start).toBe(at(645).getTime() + 30500);
  expect(end).toBe(at(945).getTime() + 30500);
});
