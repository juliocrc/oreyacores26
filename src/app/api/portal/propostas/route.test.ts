import { GET, POST, PATCH } from './route';
import { getAuthSession } from '@/auth';
import prisma from '@/lib/prisma';
import { isKnownPackTypeName } from '@/lib/custom-pack-types';
import { PORTAL_EQUIPMENT_TYPES, type PortalEquipmentType } from '@/lib/portal-equipment-proposal';

jest.mock('@/auth', () => ({ getAuthSession: jest.fn() }));
jest.mock('@/lib/auditoria', () => ({ logAuditoria: jest.fn() }));
jest.mock('@/lib/custom-pack-types', () => ({ isKnownPackTypeName: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {
  navio: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  cliente: { findMany: jest.fn() },
  auditoria: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  colete: { findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  jangada: { findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  fatoImersao: { findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  epirb: { findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  extintor: { findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  $transaction: jest.fn(),
} }));

const updatedAt = new Date('2026-01-01T12:00:00.000Z');
const item = { tipoEquipamento: 'colete', serial: 'LJ-22', dataProxInspecao: '2020-02-29' };
const proposal = { tipo: 'associacao', navioId: 10, clienteId: 7, itens: [item], estado: 'PENDENTE' };
const snapshot = { id: 22, shipId: 10, updatedAt: updatedAt.toISOString() };
const existingItem = { ...item, modo: 'existente', existente: snapshot };
const raftFields = { brand: 'VIKING', model: 'DK+', capacity: 6, dataFabrico: '2020-02', packType: 'SOLAS A' };
const request = (body: unknown) => new Request('http://localhost/api/portal/propostas', { method: 'POST', body: JSON.stringify(body) });
const modelFor = (tipo: PortalEquipmentType) => tipo === 'jangada' ? prisma.jangada : tipo === 'colete' ? prisma.colete : tipo === 'fato' ? prisma.fatoImersao : tipo === 'epirb' ? prisma.epirb : prisma.extintor;
function admin() { jest.mocked(getAuthSession).mockResolvedValue({ user: { id: '1', role: 'ADMIN', email: 'admin@example.com' } } as never); }
function saved(data: unknown = { ...proposal, itens: [existingItem] }) {
  const row = { id: 100, tabela: 'PortalNavioProposal', dadosDepois: JSON.stringify(data) };
  jest.mocked(prisma.auditoria.findUnique).mockResolvedValue(row as never);
  return row;
}
function noEquipmentWrites() {
  for (const tipo of PORTAL_EQUIPMENT_TYPES) {
    expect(modelFor(tipo).create).not.toHaveBeenCalled();
    expect(modelFor(tipo).updateMany).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: '2', role: 'CLIENTE', clienteId: 7, email: 'client@example.com' } } as never);
  jest.mocked(prisma.navio.findUnique).mockResolvedValue({ id: 10, clienteId: 7, serviceStationId: 3, cliente: { nome: 'Own Client' } } as never);
  jest.mocked(prisma.navio.updateMany).mockResolvedValue({ count: 1 });
  jest.mocked(prisma.auditoria.updateMany).mockResolvedValue({ count: 1 });
  jest.mocked(prisma.auditoria.create).mockResolvedValue({ id: 100 } as never);
  jest.mocked(isKnownPackTypeName).mockResolvedValue(true);
  for (const tipo of PORTAL_EQUIPMENT_TYPES) {
    jest.mocked(modelFor(tipo).findMany).mockResolvedValue([]);
    jest.mocked(modelFor(tipo).updateMany).mockResolvedValue({ count: 1 });
    jest.mocked(modelFor(tipo).create).mockResolvedValue({ id: 22 } as never);
  }
  jest.mocked(prisma.colete.findMany).mockResolvedValue([{ id: 22, shipId: 10, updatedAt }] as never);
  jest.mocked(prisma.$transaction).mockImplementation((async (callback: (tx: typeof prisma) => unknown) => callback(prisma)) as never);
  saved();
});

it('keeps known equipment pending with server-side identity/version and exact overdue next date, ignoring forged client/snapshot fields', async () => {
  expect((await POST(request({ ...proposal, clienteId: 999, itens: [{ ...item, serial: ' LJ-22 ', modo: 'novo', existente: { id: 999 } }] }))).status).toBe(200);
  const data = JSON.parse(jest.mocked(prisma.auditoria.create).mock.calls[0][0].data.dadosDepois!);
  expect(data).toMatchObject({ ...proposal, itens: [existingItem] });
  expect(prisma.colete.findMany).toHaveBeenCalledWith({ where: { serial: 'LJ-22' }, select: { id: true, shipId: true, updatedAt: true }, take: 2 });
  noEquipmentWrites();
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it.each(PORTAL_EQUIPMENT_TYPES)('accepts a complete new %s proposal and creates nothing until approval', async tipo => {
  jest.mocked(modelFor(tipo).findMany).mockResolvedValue([]);
  const novoEquipamento = tipo === 'jangada' ? raftFields : {};
  expect((await POST(request({ ...proposal, itens: [{ ...item, tipoEquipamento: tipo, novoEquipamento }] }))).status).toBe(200);
  const data = JSON.parse(jest.mocked(prisma.auditoria.create).mock.calls[0][0].data.dadosDepois!);
  expect(data.itens[0]).toEqual({ ...item, tipoEquipamento: tipo, novoEquipamento, modo: 'novo' });
  noEquipmentWrites();
});

it.each(PORTAL_EQUIPMENT_TYPES)('requires a structured creation form for unknown %s serials', async tipo => {
  jest.mocked(modelFor(tipo).findMany).mockResolvedValue([]);
  const response = await POST(request({ ...proposal, itens: [{ ...item, tipoEquipamento: tipo }] }));
  expect(response.status).toBe(400);
  expect((await response.json()).code).toBe('EQUIPMENT_DETAILS_REQUIRED');
  expect(prisma.auditoria.create).not.toHaveBeenCalled();
  noEquipmentWrites();
});

it.each([undefined, null, '', 'unknown', '2026-02', '2026-02-29', '2024-02-30', '2026-04-31', '2026-13-01', '0000-01-01', '2026-01-01T00:00:00Z', 123])('rejects missing/unknown/invalid next calendar date %j', async date => {
  expect((await POST(request({ ...proposal, itens: [{ ...item, dataProxInspecao: date }] }))).status).toBe(400);
  expect(prisma.auditoria.create).not.toHaveBeenCalled();
  noEquipmentWrites();
});

it.each([null, {}, [], [null], [{ ...item }, { ...item, serial: '' }], [item, item], [{ ...item, tipoEquipamento: 'unknown' }]])('rejects malformed or repeated items: %j', async itens => {
  expect((await POST(request({ ...proposal, itens }))).status).toBe(400);
  expect(prisma.auditoria.create).not.toHaveBeenCalled();
});

it.each([null, [], { shipId: 999 }, { owner: 'Someone' }, { dataInspecao: '2026-02-29' }, { dataFabrico: '2026-13' }, { marca: {} }])('rejects malformed or forbidden creation details %j', async novoEquipamento => {
  jest.mocked(prisma.colete.findMany).mockResolvedValue([]);
  expect((await POST(request({ ...proposal, itens: [{ ...item, novoEquipamento }] }))).status).toBe(400);
  noEquipmentWrites();
});

it.each([
  ['jangada', {}], ['jangada', { ...raftFields, capacity: 0 }], ['jangada', { ...raftFields, capacity: 1.5 }],
  ['jangada', { ...raftFields, dataFabrico: 'unknown' }], ['extintor', { capacidadeKg: -1 }],
  ['extintor', { capacidadeKg: 1.5 }], ['epirb', { hexId: 'NOT-HEX' }], ['epirb', { dataValidadeBateria: '2026-13' }],
] as const)('rejects invalid type-specific creation fields for %s', async (tipo, novoEquipamento) => {
  jest.mocked(modelFor(tipo).findMany).mockResolvedValue([]);
  expect((await POST(request({ ...proposal, itens: [{ ...item, tipoEquipamento: tipo, novoEquipamento }] }))).status).toBe(400);
  noEquipmentWrites();
});

it('validates the raft pack against the existing pack rules', async () => {
  jest.mocked(isKnownPackTypeName).mockResolvedValue(false);
  expect((await POST(request({ ...proposal, itens: [{ ...item, tipoEquipamento: 'jangada', novoEquipamento: raftFields }] }))).status).toBe(400);
  expect(isKnownPackTypeName).toHaveBeenCalledWith('SOLAS A');
});

it('offers a creation form through a read-only check, returning no equipment/private owner fields', async () => {
  for (const tipo of PORTAL_EQUIPMENT_TYPES) {
    const response = await POST(request({ ...proposal, tipo: 'verificar-associacao', itens: [{ ...item, tipoEquipamento: tipo }] }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ itens: [{ tipoEquipamento: tipo, serial: item.serial, novo: tipo !== 'colete' }] });
  }
  expect(prisma.auditoria.create).not.toHaveBeenCalled();
  noEquipmentWrites();
});

it('rejects unowned destination ships before looking up equipment, even for checks', async () => {
  jest.mocked(prisma.navio.findUnique).mockResolvedValue({ clienteId: 999 } as never);
  for (const tipo of ['associacao', 'verificar-associacao']) expect((await POST(request({ ...proposal, tipo }))).status).toBe(403);
  expect(prisma.colete.findMany).not.toHaveBeenCalled();
  expect(prisma.auditoria.create).not.toHaveBeenCalled();
});

it('prevents takeover of equipment associated with another client ship', async () => {
  jest.mocked(prisma.navio.findUnique).mockResolvedValueOnce({ clienteId: 7 } as never).mockResolvedValue({ clienteId: 999 } as never);
  expect((await POST(request(proposal))).status).toBe(403);
  expect(prisma.auditoria.create).not.toHaveBeenCalled();
  noEquipmentWrites();
});

it.each(['jangada', 'epirb'] as const)('does not treat a manual %s owner name as identity proof', async tipo => {
  jest.mocked(modelFor(tipo).findMany).mockResolvedValue([{ id: 22, shipId: null, updatedAt, [tipo === 'jangada' ? 'owner' : 'ownerName']: 'Own Client' }] as never);
  expect((await POST(request({ ...proposal, itens: [{ ...item, tipoEquipamento: tipo }] }))).status).toBe(403);
});

it('rejects ambiguous extintor serials and never picks an arbitrary record', async () => {
  jest.mocked(prisma.extintor.findMany).mockResolvedValue([{ id: 22 }, { id: 23 }] as never);
  expect((await POST(request({ ...proposal, itens: [{ ...item, tipoEquipamento: 'extintor' }] }))).status).toBe(409);
  noEquipmentWrites();
});

it('rejects creation data for an existing serial instead of overwriting its fields', async () => {
  expect((await POST(request({ ...proposal, itens: [{ ...item, novoEquipamento: { marca: 'Replacement' } }] }))).status).toBe(409);
  noEquipmentWrites();
});

it.each(PORTAL_EQUIPMENT_TYPES)('creates a new %s with its exact date and owned ship only on admin approval', async tipo => {
  admin();
  jest.mocked(modelFor(tipo).findMany).mockResolvedValue([]);
  const novoEquipamento = tipo === 'jangada' ? raftFields : {};
  saved({ ...proposal, itens: [{ ...item, tipoEquipamento: tipo, novoEquipamento, modo: 'novo' }] });
  expect((await PATCH(request({ id: 100, decisao: 'APROVADA' }))).status).toBe(200);
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  expect(modelFor(tipo).create).toHaveBeenCalledWith({ data: expect.objectContaining({ shipId: 10, serial: item.serial, [tipo === 'extintor' ? 'dataProxRecarga' : 'dataProxInspecao']: item.dataProxInspecao }) });
  expect(modelFor(tipo).updateMany).not.toHaveBeenCalled();
  expect(prisma.navio.updateMany).toHaveBeenCalledWith({ where: { id: 10, clienteId: 7 }, data: { clienteId: 7 } });
  if (tipo === 'jangada') expect(prisma.jangada.create).toHaveBeenCalledWith({ data: expect.objectContaining({ owner: 'Own Client', serviceStationId: 3, capacity: 6, dataFabrico: '02/2020' }) });
  if (tipo === 'epirb') expect(prisma.epirb.create).toHaveBeenCalledWith({ data: expect.objectContaining({ ownerName: 'Own Client' }) });
});

it('preserves all structured EPIRB fields in metadata and approved creation', async () => {
  const novoEquipamento = { marca: 'Brand', modelo: 'Model', tipo: '406 MHz', hexId: '1d0e00000000001', dataValidadeBateria: '2028-06', dataInspecao: '2020-01-01', observacoes: 'On board' };
  const proposed = { ...proposal, itens: [{ ...item, tipoEquipamento: 'epirb', novoEquipamento }] };
  expect((await POST(request(proposed))).status).toBe(200);
  const metadata = JSON.parse(jest.mocked(prisma.auditoria.create).mock.calls[0][0].data.dadosDepois!);
  saved(metadata);
  admin();
  expect((await PATCH(request({ id: 100, decisao: 'APROVADA' }))).status).toBe(200);
  expect(prisma.epirb.create).toHaveBeenCalledWith({ data: { ...novoEquipamento, hexId: novoEquipamento.hexId.toUpperCase(), shipId: 10, serial: item.serial, dataProxInspecao: item.dataProxInspecao, ownerName: 'Own Client' } });
});

it.each(PORTAL_EQUIPMENT_TYPES)('updates only the approved date and ship for existing %s, with identity/version preconditions', async tipo => {
  admin();
  jest.mocked(modelFor(tipo).findMany).mockResolvedValue([{ id: 22, shipId: 10, updatedAt }] as never);
  saved({ ...proposal, itens: [{ ...existingItem, tipoEquipamento: tipo }] });
  expect((await PATCH(request({ id: 100, decisao: 'APROVADA' }))).status).toBe(200);
  expect(modelFor(tipo).updateMany).toHaveBeenCalledWith({ where: { id: 22, shipId: 10, updatedAt }, data: { shipId: 10, [tipo === 'extintor' ? 'dataProxRecarga' : 'dataProxInspecao']: item.dataProxInspecao } });
  expect(modelFor(tipo).create).not.toHaveBeenCalled();
});

it('permits moving equipment between ships of the same client and locks source ownership too', async () => {
  jest.mocked(prisma.colete.findMany).mockResolvedValue([{ id: 22, shipId: 11, updatedAt }] as never);
  expect((await POST(request(proposal))).status).toBe(200);
  saved(JSON.parse(jest.mocked(prisma.auditoria.create).mock.calls[0][0].data.dadosDepois!));
  admin();
  expect((await PATCH(request({ id: 100, decisao: 'APROVADA' }))).status).toBe(200);
  expect(prisma.navio.updateMany).toHaveBeenCalledWith({ where: { id: 11, clienteId: 7 }, data: { clienteId: 7 } });
});

it.each(['P2002', 'P2034'])('returns a safe conflict for a unique/serialization race (%s), not a destructive fallback', async code => {
  admin();
  saved({ ...proposal, itens: [{ ...item, modo: 'novo', novoEquipamento: {} }] });
  jest.mocked(prisma.colete.findMany).mockResolvedValue([]);
  jest.mocked(prisma.colete.create).mockRejectedValue({ code });
  expect((await PATCH(request({ id: 100, decisao: 'APROVADA' }))).status).toBe(409);
  expect(prisma.colete.updateMany).not.toHaveBeenCalled();
});

it('does not turn a new proposal into an association if its serial was registered while pending', async () => {
  admin();
  saved({ ...proposal, itens: [{ ...item, modo: 'novo', novoEquipamento: {} }] });
  expect((await PATCH(request({ id: 100, decisao: 'APROVADA' }))).status).toBe(409);
  noEquipmentWrites();
});

it.each([
  [], [{ id: 22, shipId: 11, updatedAt }], [{ id: 23, shipId: 10, updatedAt }],
  [{ id: 22, shipId: 10, updatedAt: new Date('2026-02-01') }],
].map(rows => ({ rows })))('blocks deleted, moved, replaced or edited existing equipment: %j', async ({ rows }) => {
  admin();
  jest.mocked(prisma.colete.findMany).mockResolvedValue(rows as never);
  expect((await PATCH(request({ id: 100, decisao: 'APROVADA' }))).status).toBe(409);
  noEquipmentWrites();
});

it('blocks a transferred destination ship, including when creating new equipment', async () => {
  admin();
  saved({ ...proposal, itens: [{ ...item, modo: 'novo', novoEquipamento: {} }] });
  jest.mocked(prisma.navio.updateMany).mockResolvedValue({ count: 0 });
  expect((await PATCH(request({ id: 100, decisao: 'APROVADA' }))).status).toBe(409);
  noEquipmentWrites();
});

it('blocks equipment whose source ship was transferred to another client after proposal', async () => {
  admin();
  saved({ ...proposal, itens: [{ ...existingItem, existente: { ...snapshot, shipId: 11 } }] });
  jest.mocked(prisma.colete.findMany).mockResolvedValue([{ id: 22, shipId: 11, updatedAt }] as never);
  jest.mocked(prisma.navio.findUnique).mockResolvedValueOnce({ clienteId: 7, cliente: { nome: 'Own' } } as never).mockResolvedValue({ clienteId: 999 } as never);
  expect((await PATCH(request({ id: 100, decisao: 'APROVADA' }))).status).toBe(403);
  noEquipmentWrites();
});

it('uses conditional equipment writes and fails if the snapshot changed between read and update', async () => {
  admin();
  jest.mocked(prisma.colete.updateMany).mockResolvedValue({ count: 0 });
  expect((await PATCH(request({ id: 100, decisao: 'APROVADA' }))).status).toBe(409);
  expect(prisma.colete.create).not.toHaveBeenCalled();
});

it.each([undefined, '2026-02-29'])('does not invent next inspection dates during approval (%j)', async date => {
  admin();
  saved({ ...proposal, itens: [{ ...existingItem, dataProxInspecao: date }] });
  expect((await PATCH(request({ id: 100, decisao: 'APROVADA' }))).status).toBe(400);
  expect(prisma.$transaction).not.toHaveBeenCalled();
  noEquipmentWrites();
});

it('requires complete persisted creation data, validated again on approval', async () => {
  admin();
  saved({ ...proposal, itens: [{ ...item, tipoEquipamento: 'jangada', modo: 'novo', novoEquipamento: {} }] });
  expect((await PATCH(request({ id: 100, decisao: 'APROVADA' }))).status).toBe(400);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('rejects a proposal without equipment writes or creation, even if its old metadata is incomplete', async () => {
  admin();
  saved(proposal);
  expect((await PATCH(request({ id: 100, decisao: 'REJEITADA' }))).status).toBe(200);
  expect(prisma.$transaction).not.toHaveBeenCalled();
  noEquipmentWrites();
  expect(JSON.parse(jest.mocked(prisma.auditoria.updateMany).mock.calls[0][0].data.dadosDepois as string).estado).toBe('REJEITADA');
});

it('claims pending metadata conditionally so concurrent decisions cannot both apply', async () => {
  admin();
  const row = saved();
  jest.mocked(prisma.auditoria.updateMany).mockResolvedValue({ count: 0 });
  for (const decisao of ['APROVADA', 'REJEITADA']) expect((await PATCH(request({ id: 100, decisao }))).status).toBe(409);
  expect(prisma.auditoria.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 100, tabela: 'PortalNavioProposal', dadosDepois: row.dadosDepois } }));
  noEquipmentWrites();
});

it('requires admin approval/review and rejects anonymous, invalid roles and already decided proposals', async () => {
  expect((await PATCH(request({ id: 100, decisao: 'APROVADA' }))).status).toBe(403);
  expect((await GET()).status).toBe(403);
  jest.mocked(getAuthSession).mockResolvedValue(null);
  expect((await POST(request(proposal))).status).toBe(401);
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: '2', role: 'USER', clienteId: 7 } } as never);
  expect((await POST(request(proposal))).status).toBe(403);
  admin();
  expect((await PATCH(request({ id: 100, decisao: 'UNKNOWN' }))).status).toBe(400);
  saved({ ...proposal, estado: 'APROVADA' });
  expect((await PATCH(request({ id: 100, decisao: 'APROVADA' }))).status).toBe(404);
  noEquipmentWrites();
});

it('returns structured new-equipment data and the proposed next date for administrator review', async () => {
  admin();
  const data = { ...proposal, itens: [{ ...item, tipoEquipamento: 'epirb', modo: 'novo', novoEquipamento: { marca: 'Brand', modelo: 'Model', hexId: '1D0E00000000001', dataValidadeBateria: '2028-06' } }] };
  jest.mocked(prisma.auditoria.findMany).mockResolvedValue([saved(data)] as never);
  jest.mocked(prisma.navio.findMany).mockResolvedValue([{ id: 10, nome: 'Ship', cliente: { nome: 'Own' } }] as never);
  jest.mocked(prisma.cliente.findMany).mockResolvedValue([{ id: 7, nome: 'Own' }] as never);
  const response = await GET();
  expect(response.status).toBe(200);
  expect((await response.json()).proposals[0].dados.itens).toEqual(data.itens);
  noEquipmentWrites();
});

it('performs creation and the approval claim through the same transaction client, never the outer client', async () => {
  admin();
  saved({ ...proposal, itens: [{ ...item, modo: 'novo', novoEquipamento: {} }] });
  const txCreate = jest.fn().mockResolvedValue({ id: 22 });
  const txClaim = jest.fn().mockResolvedValue({ count: 1 });
  const tx = { ...prisma, auditoria: { ...prisma.auditoria, updateMany: txClaim },
    colete: { ...prisma.colete, findMany: jest.fn().mockResolvedValue([]), create: txCreate } };
  jest.mocked(prisma.$transaction).mockImplementation((async (callback: (client: typeof tx) => unknown) => callback(tx)) as never);
  expect((await PATCH(request({ id: 100, decisao: 'APROVADA' }))).status).toBe(200);
  expect(txCreate).toHaveBeenCalledTimes(1);
  expect(txClaim).toHaveBeenCalledTimes(1);
  expect(prisma.colete.create).not.toHaveBeenCalled();
  expect(prisma.auditoria.updateMany).not.toHaveBeenCalled();
});

it('blocks duplicated extintor serials found at approval without updating any one of them', async () => {
  admin();
  saved({ ...proposal, itens: [{ ...existingItem, tipoEquipamento: 'extintor' }] });
  jest.mocked(prisma.extintor.findMany).mockResolvedValue([{ id: 22 }, { id: 23 }] as never);
  expect((await PATCH(request({ id: 100, decisao: 'APROVADA' }))).status).toBe(409);
  noEquipmentWrites();
});

it('rejects destination ships without confirmed client ownership and old proposals without a client snapshot', async () => {
  jest.mocked(prisma.navio.findUnique).mockResolvedValue({ clienteId: null } as never);
  admin();
  expect((await POST(request(proposal))).status).toBe(400);
  saved({ ...proposal, clienteId: undefined, itens: [existingItem] });
  expect((await PATCH(request({ id: 100, decisao: 'APROVADA' }))).status).toBe(400);
  noEquipmentWrites();
});

it('rejects lost source ownership between the approval read and its conditional lock', async () => {
  admin();
  saved({ ...proposal, itens: [{ ...existingItem, existente: { ...snapshot, shipId: 11 } }] });
  jest.mocked(prisma.colete.findMany).mockResolvedValue([{ id: 22, shipId: 11, updatedAt }] as never);
  jest.mocked(prisma.navio.updateMany).mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
  expect((await PATCH(request({ id: 100, decisao: 'APROVADA' }))).status).toBe(409);
  noEquipmentWrites();
});

it.each([undefined, null, true, '10', -1, 1.5, {}])('rejects malformed destination IDs before querying data: %j', async navioId => {
  expect((await POST(request({ ...proposal, navioId }))).status).toBe(400);
  expect(prisma.navio.findUnique).not.toHaveBeenCalled();
  noEquipmentWrites();
});

it.each([undefined, null, true, '100', -1, 1.5])('rejects malformed approval IDs: %j', async id => {
  admin();
  expect((await PATCH(request({ id, decisao: 'APROVADA' }))).status).toBe(400);
  expect(prisma.auditoria.findUnique).not.toHaveBeenCalled();
  noEquipmentWrites();
});
