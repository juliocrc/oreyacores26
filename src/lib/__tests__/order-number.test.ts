import { NextRequest } from 'next/server';
import { canonicalOrderNumber, resolveOrderNumber, syncOrderNumber, OrderNumberConflictError } from '../order-number';
import { GET } from '@/app/api/ordens-servico/[id]/route';
import { POST } from '@/app/api/ordens-servico/[id]/repair-number/route';
import { getAccessContext } from '../access-control';
import prisma from '../prisma';

jest.mock('../access-control', () => ({ getAccessContext: jest.fn() }));
jest.mock('../auditoria', () => ({ logAuditoria: jest.fn() }));
jest.mock('../agenda-sync', () => ({ parseFlexibleDate: jest.fn(), syncNextInspectionAgenda: jest.fn() }));
jest.mock('../prisma', () => ({ __esModule: true, default: {
  ordemServico: { findUnique: jest.fn(), update: jest.fn() },
  inspecao: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  jangada: { findUnique: jest.fn() },
  ordemServicoLog: { create: jest.fn() },
  $transaction: jest.fn(),
} }));

const order = { id: 2307, numeroOrdem: 'OS-2026-0024', jangadaId: 163, inspecaoId: 50, shipId: 7,
  serviceStationId: 2, status: 'pendente', updatedAt: new Date('2026-10-01'), metadados: '{"grupoNumeroOrdem":"OS-2026-0024"}' };
const inspection = { id: 50, jangadaId: 163, numeroObra: null, dataInspecao: '2026-10-01' };
const raft = { id: 163, numeroObra: 'FO102600098', shipId: 7, serviceStationId: 2, dataInspecao: '2026-10-01' };

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true, allowedStationIds: [], stationId: null } as never);
  jest.mocked(prisma.ordemServico.findUnique).mockImplementation(args => Promise.resolve('id' in args.where ? order : null) as never);
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValue(inspection as never);
  jest.mocked(prisma.inspecao.findFirst).mockResolvedValue({ id: 50 } as never);
  jest.mocked(prisma.inspecao.findMany).mockResolvedValue([]);
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue(raft as never);
  jest.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) => (callback as (tx: typeof prisma) => unknown)(prisma) as never);
});

it('resolves the linked example without mutating on GET', async () => {
  const response = await GET(new NextRequest('http://localhost/api/ordens-servico/2307'));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ numeroOrdem: 'FO102600098', grupoNumeroOrdem: 'FO102600098' });
  expect(prisma.ordemServico.update).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('prefers the persisted inspection FO, not a newer raft reference', async () => {
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValue({ ...inspection, numeroObra: 'FO102600001' } as never);
  expect(await canonicalOrderNumber(prisma, order)).toBe('FO102600001');
});

it.each([
  { shipId: 8 }, { serviceStationId: 3 }, { jangadaId: 164 }, { inspecaoId: null },
  { numeroOrdem: 'FO102600002' }, { status: 'concluida' }, { status: 'cancelada' },
])('does not replace explicit, historical or unrelated references: %p', async change => {
  expect(await canonicalOrderNumber(prisma, { ...order, ...change })).toBe(change.numeroOrdem || order.numeroOrdem);
});

it('does not borrow the raft number from another inspection', async () => {
  jest.mocked(prisma.inspecao.findFirst).mockResolvedValue({ id: 51 } as never);
  expect(await canonicalOrderNumber(prisma, order)).toBe(order.numeroOrdem);
  expect(resolveOrderNumber({ numeroOrdem: order.numeroOrdem, inspectionNumber: 'FO102600098', sameInspection: false, currentInspection: true })).toBe(order.numeroOrdem);
});

it('dry-run checks uniqueness but writes nothing', async () => {
  expect(await syncOrderNumber(prisma, order.id, true)).toMatchObject({ changed: true, dryRun: true, numeroOrdem: raft.numeroObra });
  expect(prisma.ordemServico.update).not.toHaveBeenCalled();
  expect(prisma.ordemServicoLog.create).not.toHaveBeenCalled();
});

it('rejects a conflicting OT number rather than adding a suffix', async () => {
  jest.mocked(prisma.ordemServico.findUnique).mockImplementation(args => Promise.resolve('id' in args.where ? order : { id: 999 }) as never);
  await expect(syncOrderNumber(prisma, order.id)).rejects.toBeInstanceOf(OrderNumberConflictError);
  expect(prisma.ordemServico.update).not.toHaveBeenCalled();
});

it('repairs just the selected OT and its group reference, not invoice snapshots', async () => {
  await syncOrderNumber(prisma, order.id);
  expect(prisma.ordemServico.update).toHaveBeenCalledTimes(1);
  expect(prisma.ordemServico.update).toHaveBeenCalledWith({ where: { id: order.id, updatedAt: order.updatedAt }, data: { numeroOrdem: raft.numeroObra, metadados: JSON.stringify({ grupoNumeroOrdem: raft.numeroObra }) } });
  expect(prisma.ordemServicoLog.create).toHaveBeenCalledTimes(1);
});

const repair = (body: object) => POST(new NextRequest('http://localhost/api/ordens-servico/2307/repair-number', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: '2307' }) });

it('defaults the admin repair to dry-run and requires expected linkage to apply', async () => {
  expect(await (await repair({})).json()).toMatchObject({ dryRun: true, numeroOrdem: raft.numeroObra, inspecaoId: 50, jangadaId: 163 });
  expect(prisma.ordemServico.update).not.toHaveBeenCalled();
  expect((await repair({ dryRun: false })).status).toBe(409);
  expect((await repair({ dryRun: false, expectedNumber: order.numeroOrdem, expectedInspectionId: 50 })).status).toBe(200);
});

it.each([null, { isAdmin: false, allowedStationIds: [2] }])('requires administrator authentication for repair: %p', async access => {
  jest.mocked(getAccessContext).mockResolvedValue(access as never);
  expect((await repair({})).status).toBe(access ? 403 : 401);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('keeps GET station-scoped, including users without stations', async () => {
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, allowedStationIds: [], stationId: null } as never);
  jest.mocked(prisma.ordemServico.findUnique).mockResolvedValue(null);
  expect((await GET(new NextRequest('http://localhost/api/ordens-servico/2307'))).status).toBe(404);
  expect(prisma.ordemServico.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 2307, serviceStationId: { in: [] } } }));
});
