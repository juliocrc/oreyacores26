import { saveInspection } from '@/app/inspecoes/actions';
import prisma from '../prisma';
import { EditConflictError } from '../edit-conflict';
import { InspectionLockedError } from '../inspecao-lock';
import { logAuditoria } from '../auditoria';

jest.mock('../prisma', () => ({ __esModule: true, default: {
  inspecao: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn(), create: jest.fn() },
  jangada: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  stock: { update: jest.fn() }, artigoJangada: { deleteMany: jest.fn(), findMany: jest.fn(async () => []) },
  ordemServico: { findFirst: jest.fn(async () => null) },
  $queryRaw: jest.fn(async () => []), $transaction: jest.fn(),
} }));
jest.mock('../auditoria', () => ({ logAuditoria: jest.fn() }));
jest.mock('../ordens-servico', () => ({ resolveLotStock: jest.fn() }));
jest.mock('../integrity-stamp', () => ({ computeInspectionDigest: jest.fn(() => 'digest'), INTEGRITY_VERSION: 1 }));
jest.mock('../stock/inspecao-sync', () => ({ reverterMovimentosInspecao: jest.fn() }));
jest.mock('../access-control', () => ({ getAccessContext: jest.fn(async () => ({ email: 'operator@orey.pt' })) }));
jest.mock('../inspection-snapshots', () => ({ saveInspectionSnapshot: jest.fn() }));
jest.mock('../service-station-queue-sync', () => ({ syncServiceStationQueueForInspection: jest.fn() }));

const token = '2026-10-01T00:00:00.000Z';
const payload = { id: 10, raftId: 1, date: '2026-10-01', certificadoNumero: 'AZ26-001', status: 'Draft', expectedUpdatedAt: token, expectedRaftUpdatedAt: token };
const inspection = { id: 10, certificadoNumero: 'AZ26-001', status: 'Draft', integrityHash: null, checklistSnapshot: {}, updatedAt: new Date(token) };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValue(inspection as never);
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ id: 1, serviceStation: null, updatedAt: new Date(token) } as never);
  jest.mocked(prisma.$transaction).mockImplementation((async (callback: (tx: typeof prisma) => unknown) => callback(prisma)) as never);
  jest.mocked(prisma.jangada.updateMany).mockResolvedValue({ count: 1 });
  jest.mocked(prisma.inspecao.updateMany).mockResolvedValue({ count: 1 });
});

it('rejects stale inspection input before entering the write transaction', async () => {
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValue({ ...inspection, updatedAt: new Date('2026-10-02') } as never);
  await expect(saveInspection(payload)).rejects.toBeInstanceOf(EditConflictError);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('rejects a lost raft CAS before articles, stock or inspection writes', async () => {
  jest.mocked(prisma.jangada.updateMany).mockResolvedValue({ count: 0 });
  await expect(saveInspection(payload)).rejects.toBeInstanceOf(EditConflictError);
  expect(prisma.inspecao.updateMany).not.toHaveBeenCalled();
  expect(prisma.inspecao.update).not.toHaveBeenCalled();
  expect(prisma.stock.update).not.toHaveBeenCalled();
  expect(prisma.artigoJangada.deleteMany).not.toHaveBeenCalled();
});

it('rechecks inspection version in the transaction after a concurrent change', async () => {
  jest.mocked(prisma.inspecao.findUnique)
    .mockResolvedValueOnce(inspection as never)
    .mockResolvedValueOnce(inspection as never)
    .mockResolvedValueOnce({ ...inspection, updatedAt: new Date('2026-10-02') } as never);
  await expect(saveInspection(payload)).rejects.toBeInstanceOf(EditConflictError);
  expect(prisma.inspecao.update).not.toHaveBeenCalled();
  expect(prisma.stock.update).not.toHaveBeenCalled();
});

it('keeps the legal reopening error distinct from edit conflicts', async () => {
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValue({ ...inspection, status: 'Concluída' } as never);
  await expect(saveInspection(payload)).rejects.toBeInstanceOf(InspectionLockedError);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('rechecks the legal seal inside the transaction, including legacy callers', async () => {
  jest.mocked(prisma.inspecao.findUnique)
    .mockResolvedValueOnce(inspection as never)
    .mockResolvedValueOnce(inspection as never)
    .mockResolvedValueOnce({ ...inspection, status: 'Concluída' } as never);
  await expect(saveInspection({ ...payload, expectedUpdatedAt: undefined, expectedRaftUpdatedAt: undefined })).rejects.toBeInstanceOf(InspectionLockedError);
  expect(prisma.inspecao.update).not.toHaveBeenCalled();
});

it('rejects a deleted or invalid inspection ID rather than creating a replacement', async () => {
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValue(null);
  await expect(saveInspection(payload)).rejects.toBeInstanceOf(EditConflictError);
  await expect(saveInspection({ ...payload, id: 'offline_old' })).rejects.toBeInstanceOf(EditConflictError);
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(prisma.inspecao.create).not.toHaveBeenCalled();
});

it('rejects a stale raft before requesting legal reopening of a sealed inspection', async () => {
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ updatedAt: new Date('2026-10-02') } as never);
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValue({ ...inspection, status: 'Concluída' } as never);
  await expect(saveInspection(payload)).rejects.toBeInstanceOf(EditConflictError);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('does not treat an authenticated non-admin as an administrator for reopening', async () => {
  jest.mocked(prisma.inspecao.findUnique).mockResolvedValue({ ...inspection, status: 'Concluída' } as never);
  await expect(saveInspection({ ...payload, reabrir: true, reaberturaJustificacao: 'Correcao tecnicamente justificada.' })).rejects.toMatchObject({ motivo: 'sem-permissao' });
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('allows only one competing inspection save and emits no related effects for the loser', async () => {
  let claimed = false;
  jest.mocked(prisma.inspecao.updateMany).mockImplementation((async () => {
    if (claimed) return { count: 0 };
    claimed = true;
    return { count: 1 };
  }) as never);
  jest.mocked(prisma.inspecao.update).mockImplementation((async ({ data }: { data: object }) => ({ ...inspection, ...data })) as never);
  const input = { ...payload, raftId: undefined, expectedRaftUpdatedAt: undefined };
  const results = await Promise.allSettled([saveInspection(input), saveInspection(input)]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: expect.any(EditConflictError) });
  expect(prisma.inspecao.update).toHaveBeenCalledTimes(1);
  expect(prisma.stock.update).not.toHaveBeenCalled();
  expect(prisma.artigoJangada.deleteMany).not.toHaveBeenCalled();
  expect(logAuditoria).toHaveBeenCalledTimes(1);
});

it('rejects a lost inspection CAS before any scalar or related write', async () => {
  jest.mocked(prisma.inspecao.updateMany).mockResolvedValue({ count: 0 });
  await expect(saveInspection(payload)).rejects.toBeInstanceOf(EditConflictError);
  expect(prisma.inspecao.update).not.toHaveBeenCalled();
  expect(prisma.jangada.update).not.toHaveBeenCalled();
  expect(prisma.artigoJangada.deleteMany).not.toHaveBeenCalled();
  expect(logAuditoria).not.toHaveBeenCalled();
});

it('does not recreate an inspection deleted between preflight and transaction', async () => {
  jest.mocked(prisma.inspecao.findUnique)
    .mockResolvedValueOnce(inspection as never)
    .mockResolvedValueOnce(inspection as never)
    .mockResolvedValueOnce(null);
  await expect(saveInspection(payload)).rejects.toBeInstanceOf(EditConflictError);
  expect(prisma.inspecao.create).not.toHaveBeenCalled();
  expect(prisma.inspecao.update).not.toHaveBeenCalled();
});

it('reports a competing certificate insert as a conflict instead of upserting over it', async () => {
  jest.mocked(prisma.inspecao.create).mockRejectedValueOnce({ code: 'P2002', meta: { target: ['certificadoNumero'] } });
  await expect(saveInspection({ date: '2026-10-01', certificadoNumero: 'AZ26-001', status: 'Draft' })).rejects.toBeInstanceOf(EditConflictError);
  expect(prisma.inspecao.update).not.toHaveBeenCalled();
  expect(logAuditoria).not.toHaveBeenCalled();
});

it('keeps optional-token compatibility for an existing external draft caller', async () => {
  jest.mocked(prisma.inspecao.update).mockResolvedValue(inspection as never);
  await expect(saveInspection({ id: 10, date: '2026-10-01', certificadoNumero: 'AZ26-001', status: 'Draft' })).resolves.toMatchObject({ id: 10 });
  expect(prisma.inspecao.updateMany).not.toHaveBeenCalled();
});

it('seals the final inspection inside the transaction and returns its committed versions', async () => {
  let inTransaction = false;
  jest.mocked(prisma.$transaction).mockImplementation((async (callback: (tx: typeof prisma) => unknown) => {
    inTransaction = true;
    const result = await callback(prisma);
    inTransaction = false;
    return result;
  }) as never);
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ id: 1, containerModel: 'valise', updatedAt: new Date(token), serviceStation: null } as never);
  jest.mocked(prisma.jangada.update).mockImplementation((async ({ data }: { data: object }) => ({ id: 1, ...data })) as never);
  jest.mocked(prisma.inspecao.update).mockImplementation((async ({ data }: { data: object }) => {
    expect(inTransaction).toBe(true);
    return { ...inspection, ...data };
  }) as never);
  const saved = await saveInspection({ ...payload, status: 'Concluída', applyStockMovements: false });
  expect(prisma.inspecao.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ integrityHash: 'digest', integrityVersion: 1 }) }));
  expect(saved.updatedAt).toEqual((jest.mocked(prisma.inspecao.update).mock.calls.at(-1)![0].data as { updatedAt: Date }).updatedAt);
  expect(saved.raftUpdatedAt).toEqual((jest.mocked(prisma.jangada.update).mock.calls.at(-1)![0].data as { updatedAt: Date }).updatedAt);
});
