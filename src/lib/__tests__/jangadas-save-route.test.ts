import { NextRequest } from 'next/server';
import { GET, PUT, PATCH } from '@/app/api/jangadas/[id]/route';
import { POST, PUT as collectionPUT } from '@/app/api/jangadas/route';
import prisma from '../prisma';
import { syncRichChecklistToRaft } from '../checklist-sync';
import { readInspectionChecklistValues, writeInspectionChecklistValues } from '../inspection-checklist-store';
import { getAccessContext } from '../access-control';

jest.mock('../access-control', () => ({ getAccessContext: jest.fn(async () => ({ email: 'tecnico@orey.pt', isAdmin: true, allowedStationIds: [] })) }));
jest.mock('../prisma', () => ({ __esModule: true, default: {
  jangada: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  artigoJangada: { findMany: jest.fn(async () => []), deleteMany: jest.fn(), createMany: jest.fn() },
  serviceStationQueue: { findFirst: jest.fn(async () => null) },
  stock: { findMany: jest.fn(async () => []) },
  auditoria: { create: jest.fn() },
  inspecao: { findMany: jest.fn(async () => []), findFirst: jest.fn(), update: jest.fn() },
  tecnico: { findFirst: jest.fn() },
  $queryRaw: jest.fn(async () => []), $transaction: jest.fn(),
} }));
jest.mock('../auditoria', () => ({ logAuditoria: jest.fn() }));
jest.mock('../auditorias-storage', () => ({ readAuditoriaJson: jest.fn(async () => ({})), writeAuditoriaJson: jest.fn() }));
jest.mock('../inspection-checklist-store', () => ({
  normalizeInspectionChecklistValues: (value: unknown) => value || {},
  readInspectionChecklistValues: jest.fn(async () => ({ cylinderSerial: 'OLD' })),
  writeInspectionChecklistValues: jest.fn(async (_id: number, value: unknown) => value),
}));
jest.mock('../jangada-abate-store', () => ({ readJangadaAbate: jest.fn(), writeJangadaAbate: jest.fn() }));
jest.mock('../notify-jangada-sms', () => ({ notifyJangadaEnviada: jest.fn(), tryNotifySms: jest.fn() }));
jest.mock('../checklist-sync', () => ({ syncRaftArticlesWithPackType: jest.fn(), syncRichChecklistToRaft: jest.fn() }));
jest.mock('../agenda-sync', () => ({ clearActiveAgendaForRaft: jest.fn(), syncNextInspectionAgenda: jest.fn() }));
jest.mock('../agenda-entrega', () => ({ clearEntregaAgendaEvent: jest.fn(), syncEntregaAgendaEvent: jest.fn() }));
jest.mock('../google-calendar', () => ({ syncAgendaToGoogleCalendar: jest.fn() }));
jest.mock('../custom-pack-types', () => ({ isKnownPackTypeName: jest.fn(async () => true), resolveMandatoryPackItemsForRaftAsync: jest.fn(async () => ({ items: [] })) }));
jest.mock('../jangada-delete', () => ({ deleteJangadaById: jest.fn() }));
jest.mock('@/app/inspecoes/actions', () => ({ generateInspectionCertificateNumber: jest.fn(), resolveCertificateStationPrefix: jest.fn() }));
jest.mock('../inspection-snapshots', () => ({ getInspectionSnapshot: jest.fn(), saveInspectionSnapshot: jest.fn() }));
jest.mock('../station-selection', () => ({ resolveActiveServiceStationId: jest.fn() }));
jest.mock('../alcantarilha-scope', () => ({ activeStationIsAlcantarilha: jest.fn(), getSouthRegionShipIds: jest.fn() }));

const existing = { id: 1, brand: 'RFD', model: 'SURVIVA', packType: 'R', capacity: 25, shipId: null };
const request = (body: object) => new NextRequest('http://localhost/api/jangadas?id=1', { method: 'PUT', body: JSON.stringify(body) });
const context = { params: Promise.resolve({ id: '1' }) };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(prisma.inspecao.findFirst).mockReset();
  jest.mocked(prisma.tecnico.findFirst).mockReset();
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue(existing as never);
  jest.mocked(prisma.jangada.update).mockImplementation((async ({ data }: { data: object }) => ({ ...existing, ...data })) as never);
  jest.mocked(prisma.$transaction).mockImplementation((async (callback: (tx: typeof prisma) => unknown) => callback(prisma)) as never);
});

it('does not rewrite capacity or reapply a stale checklist during a partial PUT', async () => {
  const response = await PUT(request({ cylinderSerial: 'NEW' }), context);
  expect(response.status).toBe(200);
  expect(prisma.jangada.update).toHaveBeenCalledWith(expect.objectContaining({ data: { cylinderSerial: 'NEW' } }));
  expect(syncRichChecklistToRaft).not.toHaveBeenCalled();
  expect(await response.json()).toMatchObject({ capacity: 25, cylinderSerial: 'NEW' });
});

it('retains explicit checklist synchronization', async () => {
  expect((await PUT(request({ inspectionChecklistValues: { cylinderSerial: 'NEW' } }), context)).status).toBe(200);
  expect(syncRichChecklistToRaft).toHaveBeenCalledWith(1, { cylinderSerial: 'NEW' }, prisma);
});

it('persists and returns lighting fields, including independent expiry dates and explicit clearing', async () => {
  const inspectionChecklistValues = {
    cylinderSerial: 'CYL', ref_bateria_litio: 'BAT', qtd_bateria_litio: 1, validade_bateria: '2030-01', bateria_litio: 'YES',
    ref_luz_interior: 'RL5', qtd_luz_interior: 0, validade_luz_interior: '', luz_interior_bateria: 'NA',
    ref_luz_exterior: 'EXT', qtd_luz_exterior: 1, validade_luzes_exteriores: '2032-03', luz_exterior_bateria: 'OK',
  };
  const response = await PUT(request({ inspectionChecklistValues }), context);
  expect(response.status).toBe(200);
  expect(writeInspectionChecklistValues).toHaveBeenCalledWith(1, inspectionChecklistValues, 'tecnico@orey.pt');
  expect(await response.json()).toMatchObject({ inspectionChecklistValues });
  expect(prisma.jangada.update).toHaveBeenCalledWith(expect.objectContaining({ data: {} }));
  jest.mocked(readInspectionChecklistValues).mockResolvedValueOnce(inspectionChecklistValues);
  const loaded = await GET(new NextRequest('http://localhost/api/jangadas/1'), context);
  expect(loaded.status).toBe(200);
  expect(await loaded.json()).toMatchObject({ inspectionChecklistValues });
});

it('validates the pack before deleting any articles', async () => {
  const { isKnownPackTypeName } = jest.requireMock('../custom-pack-types');
  isKnownPackTypeName.mockResolvedValueOnce(false);
  expect((await PUT(request({ artigos: [], packType: 'invalid' }), context)).status).toBe(400);
  expect(prisma.artigoJangada.deleteMany).not.toHaveBeenCalled();
});

it('replaces active articles and scalar fields in the same transaction', async () => {
  expect((await PUT(request({ cylinderSerial: 'NEW', artigos: [] }), context)).status).toBe(200);
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  expect(prisma.artigoJangada.deleteMany).toHaveBeenCalledWith({ where: { jangadaId: 1, inspecaoId: null } });
});

it('does not delete articles when the scalar write fails', async () => {
  jest.mocked(prisma.jangada.update).mockRejectedValueOnce(new Error('Write failed'));
  expect((await PUT(request({ cylinderSerial: 'NEW', artigos: [] }), context)).status).toBe(500);
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  expect(prisma.artigoJangada.deleteMany).not.toHaveBeenCalled();
});

it('reports article insertion errors rather than acknowledging a partial save', async () => {
  jest.mocked(prisma.artigoJangada.createMany).mockRejectedValueOnce(new Error('Insert failed'));
  expect((await PUT(request({ artigos: [{ name: 'Water', quantidade: 1 }] }), context)).status).toBe(500);
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
});

it('does not coerce omitted capacity to NaN in the collection PUT', async () => {
  expect((await collectionPUT(request({ owner: 'New owner' }))).status).toBe(200);
  expect(prisma.jangada.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1 }, data: { owner: 'New owner' } }));
});

it('returns a JSON error when creating a raft fails', async () => {
  jest.mocked(prisma.jangada.create).mockRejectedValueOnce(new Error('Database unavailable'));
  const response = await POST(request({ brand: 'RFD', model: 'SURVIVA', packType: 'R', capacity: 25 }));
  expect(response.status).toBeGreaterThanOrEqual(500);
  expect(await response.json()).toHaveProperty('error');
});

it('audits equipment changes with the session actor and suppresses unrelated edits', async () => {
  expect((await PUT(request({ cylinderSerial: 'NEW' }), context)).status).toBe(200);
  expect(prisma.auditoria.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    tabela: 'JangadaEquipment', idRegisto: 1, usuario: 'tecnico@orey.pt',
    dadosAntes: '{"cylinderSerial":null}', dadosDepois: '{"cylinderSerial":"NEW"}',
  }) });
  jest.mocked(prisma.auditoria.create).mockClear();
  expect((await PUT(request({ owner: 'Another owner' }), context)).status).toBe(200);
  expect(prisma.auditoria.create).not.toHaveBeenCalled();
});

it('does not emit equipment events when articles are recreated without material changes', async () => {
  jest.mocked(prisma.artigoJangada.findMany).mockResolvedValueOnce([{ id: 99, name: 'Water', quantidade: 1, referencia: 'W', validade: new Date('2030-01-01') }] as never);
  expect((await PUT(request({ artigos: [{ name: 'Water', quantidade: 1, referencia: 'W', validade: '2030-01-01' }] }), context)).status).toBe(200);
  expect(prisma.auditoria.create).not.toHaveBeenCalled();
});

it('rejects a save if its transactional audit fails', async () => {
  jest.mocked(prisma.auditoria.create).mockRejectedValueOnce(new Error('Audit failed'));
  expect((await PUT(request({ cylinderSerial: 'NEW' }), context)).status).toBe(500);
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });
});

it('blocks unauthorised PATCH access and station reassignment on PUT', async () => {
  jest.mocked(getAccessContext).mockResolvedValueOnce({ isAdmin: false, allowedStationIds: [5], permissions: {} } as never);
  expect((await PATCH(request({ shipId: 2 }), context)).status).toBe(403);
  jest.mocked(prisma.jangada.findUnique).mockResolvedValueOnce({ ...existing, serviceStationId: 5 } as never);
  const permissions = jest.spyOn(require('../user-permissions'), 'canEditPath').mockReturnValue(true);
  jest.mocked(getAccessContext).mockResolvedValueOnce({ isAdmin: false, allowedStationIds: [5], permissions: {} } as never);
  expect((await PUT(request({ serviceStationId: 6 }), context)).status).toBe(403);
  expect(prisma.jangada.update).not.toHaveBeenCalled();
  permissions.mockRestore();
});

it('rejects a stale ficha before history, movement, articles or JSON writes', async () => {
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...existing, updatedAt: new Date('2026-10-02') } as never);
  const response = await PUT(request({ expectedUpdatedAt: '2026-10-01T00:00:00.000Z', shipId: 2, dataInspecao: '2026-10-01', artigos: [], observacoes: 'stale', inspectionChecklistValues: { stale: true } }), context);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: 'EDIT_CONFLICT' });
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(prisma.jangada.update).not.toHaveBeenCalled();
  expect(prisma.artigoJangada.deleteMany).not.toHaveBeenCalled();
  expect(writeInspectionChecklistValues).not.toHaveBeenCalled();
  expect(jest.requireMock('../auditorias-storage').writeAuditoriaJson).not.toHaveBeenCalled();
});

it('rechecks a version changed between preflight and transaction before any effects', async () => {
  const token = '2026-10-01T00:00:00.000Z';
  jest.mocked(prisma.jangada.findUnique)
    .mockResolvedValueOnce({ ...existing, updatedAt: new Date(token) } as never)
    .mockResolvedValueOnce({ ...existing, updatedAt: new Date('2026-10-02') } as never);
  const response = await PUT(request({ expectedUpdatedAt: token, dataInspecao: '2026-10-01', artigos: [], observacoes: 'stale' }), context);
  expect(response.status).toBe(409);
  expect(prisma.jangada.update).not.toHaveBeenCalled();
  expect(prisma.artigoJangada.deleteMany).not.toHaveBeenCalled();
  expect(jest.requireMock('../auditorias-storage').writeAuditoriaJson).not.toHaveBeenCalled();
});

it('allows only one atomic claim for racing saves with the same token', async () => {
  const token = '2026-10-01T00:00:00.000Z';
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...existing, updatedAt: new Date(token) } as never);
  jest.mocked(prisma.jangada.updateMany).mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
  const results = await Promise.all([
    PUT(request({ expectedUpdatedAt: token, owner: 'winner' }), context),
    PUT(request({ expectedUpdatedAt: token, owner: 'loser', artigos: [] }), context),
  ]);
  expect(results.map(result => result.status).sort()).toEqual([200, 409]);
  expect(prisma.jangada.updateMany).toHaveBeenCalledWith({ where: { id: 1, updatedAt: new Date(token) }, data: { updatedAt: expect.any(Date) } });
  expect(prisma.jangada.update).toHaveBeenCalledTimes(1);
  expect(prisma.artigoJangada.deleteMany).not.toHaveBeenCalled();
});

it('reports serialization failures as an edit conflict without retrying the transaction', async () => {
  jest.mocked(prisma.$transaction).mockRejectedValueOnce({ code: 'P2034' });
  const response = await PUT(request({ owner: 'new' }), context);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: 'EDIT_CONFLICT' });
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
});

it('preserves an uncertain transaction outcome without retrying or exposing internal details', async () => {
  jest.mocked(prisma.$transaction).mockRejectedValueOnce({ code: 'P2028', message: 'Transaction not found' });
  const response = await PUT(request({ owner: 'new' }), context);
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body).toMatchObject({ code: 'TRANSACTION_UNCONFIRMED', error: expect.stringContaining('verifique os dados guardados') });
  expect(JSON.stringify(body)).not.toContain('Transaction not found');
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
});

it('saves the exact inspection technician in existing metadata without discarding rich snapshot evidence', async () => {
  const version = '2026-10-01T00:00:00.000Z';
  const snapshot = { responsavel: 'Original', luz_interior: { stockId: 77, quantidade: 0 }, testeWP: '2026-10' };
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...existing, serviceStationId: 2 } as never);
  jest.mocked(prisma.inspecao.findFirst).mockResolvedValueOnce({ id: 190, jangadaId: 1, updatedAt: new Date(version), checklistSnapshot: snapshot } as never);
  jest.mocked(prisma.tecnico.findFirst).mockResolvedValueOnce({ id: 7, nome: 'Actual Technician' } as never);
  jest.mocked(prisma.inspecao.update).mockImplementationOnce((async ({ data }: { data: object }) => ({ id: 190, ...data })) as never);
  const response = await PUT(request({ inspectionResponsible: { inspecaoId: 190, tecnicoId: 7, nome: 'Untrusted name', expectedUpdatedAt: version } }), context);
  expect(response.status).toBe(200);
  expect(prisma.inspecao.findFirst).toHaveBeenCalledWith({ where: { id: 190, jangadaId: 1 } });
  expect(prisma.tecnico.findFirst).toHaveBeenCalledWith({ where: { id: 7, ativo: true, serviceStationId: 2 } });
  expect(prisma.inspecao.update).toHaveBeenCalledWith({ where: { id: 190 }, data: {
    checklistSnapshot: { ...snapshot, responsavel: 'Actual Technician' }, updatedAt: expect.any(Date),
  } });
  const saved = await response.json();
  const { resolveInspectionTechnician } = await import('../certificate-input-from-jangada');
  expect(resolveInspectionTechnician(saved.savedResponsibleInspection)).toBe('Actual Technician');
  jest.mocked(prisma.inspecao.findMany).mockResolvedValueOnce([saved.savedResponsibleInspection] as never);
  const reloaded = await GET(new NextRequest('http://localhost/api/jangadas/1'), context);
  expect(reloaded.status).toBe(200);
  const loaded = await reloaded.json();
  expect(resolveInspectionTechnician(loaded.inspecoes[0])).toBe('Actual Technician');
  expect(loaded.inspecoes[0].checklistSnapshot.luz_interior).toEqual({ stockId: 77, quantidade: 0 });
  expect(prisma.jangada.update).toHaveBeenCalledWith(expect.objectContaining({ data: {} }));
  expect(writeInspectionChecklistValues).not.toHaveBeenCalled();
});

it.each(['missing', 'stale', 'wrong-station', 'no-version'])('rejects unsafe inspection technician corrections: %s', async scenario => {
  const version = '2026-10-01T00:00:00.000Z';
  jest.mocked(prisma.jangada.findUnique).mockResolvedValue({ ...existing, serviceStationId: 2 } as never);
  jest.mocked(prisma.inspecao.findFirst).mockResolvedValueOnce(scenario === 'missing' ? null : {
    id: 190, updatedAt: new Date(scenario === 'stale' ? '2026-10-02' : version), checklistSnapshot: {},
  } as never);
  jest.mocked(prisma.tecnico.findFirst).mockResolvedValueOnce(null);
  const response = await PUT(request({ inspectionResponsible: { inspecaoId: 190, tecnicoId: 7,
    ...(scenario === 'no-version' ? {} : { expectedUpdatedAt: version }),
  } }), context);
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(prisma.inspecao.update).not.toHaveBeenCalled();
  expect(prisma.jangada.update).not.toHaveBeenCalled();
});

it('persists searchable equipment references verbatim without stock consumption or resource replacement', async () => {
  const fields = { cylinderCabecaDisparoRef: '007', cylinderTuboCamaraSuperiorRef: 'L-DSB', cylinderTuboCamaraInferiorRef: 'A10', valvulasAlivio: 'A10', valvulasAtestar: '' };
  const response = await PUT(request(fields), context);
  expect(response.status).toBe(200);
  expect(prisma.jangada.update).toHaveBeenCalledWith(expect.objectContaining({ data: fields }));
  expect(await response.json()).toMatchObject(fields);
  expect(prisma.artigoJangada.createMany).not.toHaveBeenCalled();
  expect(prisma.stock.findMany).not.toHaveBeenCalled();
});
