import { NextRequest } from 'next/server';
import { getAuthSession } from '@/auth';
import { getAccessContext } from '../access-control';
import prisma from '../prisma';
import { GET as statistics } from '@/app/api/estatisticas/route';
import { GET as notifications } from '@/app/api/notificacoes/route';

jest.mock('@/auth', () => ({ getAuthSession: jest.fn() }));
jest.mock('../access-control', () => ({ getAccessContext: jest.fn() }));
jest.mock('../prisma', () => {
  const delegate = () => ({ count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() });
  return { __esModule: true, default: { jangada: delegate(), navio: delegate(), stock: delegate(), ordemServico: delegate(),
    inspecao: delegate(), serviceStation: delegate(), comunicacao: delegate(), pedidoAssistencia: delegate(), agendaEvento: delegate(),
    certificadoExtraido: delegate(), epirb: delegate(), extintor: delegate(), fatoImersao: delegate() } };
});

const request = (query = '', cookie?: string) => new NextRequest(`http://localhost/api/dashboard${query}`, { headers: cookie ? { cookie } : {} });
const setAccess = (overrides = {}) => jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, allowedStationIds: [2, 3], stationId: null, ...overrides } as never);

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: '7', role: 'USER' } } as never);
  setAccess();
  for (const delegate of Object.values(prisma) as { count: jest.Mock; findMany: jest.Mock; groupBy: jest.Mock }[]) {
    delegate.count.mockResolvedValue(0);
    delegate.findMany.mockResolvedValue([]);
    delegate.groupBy.mockResolvedValue([]);
  }
});
afterEach(() => jest.restoreAllMocks());

describe.each([['statistics', statistics], ['notifications', notifications]] as const)('%s access', (_name, get) => {
  it('rejects missing sessions before any data read', async () => {
    jest.mocked(getAuthSession).mockResolvedValue(null);
    expect((await get(request())).status).toBe(401);
    expect(getAccessContext).not.toHaveBeenCalled();
    expect(prisma.jangada.findMany).not.toHaveBeenCalled();
  });
  it.each(['CLIENTE', 'unknown', undefined])('rejects role %s even if access context could elevate it', async role => {
    jest.mocked(getAuthSession).mockResolvedValue({ user: { id: '7', role } } as never);
    expect((await get(request())).status).toBe(403);
    expect(getAccessContext).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992'])('rejects invalid station %s', async id => {
    expect((await get(request(`?stationId=${id}`))).status).toBe(400);
    expect(prisma.jangada.findMany).not.toHaveBeenCalled();
  });
  it('rejects explicit stations outside the allowlist', async () => {
    expect((await get(request('?stationId=4'))).status).toBe(403);
    expect(prisma.jangada.findMany).not.toHaveBeenCalled();
  });
  it('honors an authorized active station cookie', async () => {
    expect((await get(request('', 'active_service_station_id=3'))).status).toBe(200);
    expect(prisma.jangada.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { serviceStationId: 3 } }));
  });
  it('does not trust a forged station cookie', async () => {
    expect((await get(request('', 'active_service_station_id=999'))).status).toBe(200);
    expect(prisma.jangada.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { serviceStationId: { in: [2, 3] } } }));
  });
  it('fails closed on an empty non-admin station allowlist', async () => {
    setAccess({ allowedStationIds: [] });
    expect((await get(request())).status).toBe(200);
    expect(prisma.jangada.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { serviceStationId: { in: [] } } }));
  });
});

it('scopes all statistics, selects only aggregate inputs and returns twelve buckets', async () => {
  jest.mocked(prisma.jangada.findMany).mockResolvedValue([{ id: 22 }] as never);
  jest.mocked(prisma.inspecao.findMany).mockResolvedValue([
    { status: 'Concluída', dataInspecao: '2026-01-01', testeWP: 'PASSOU' },
    { status: 'Condenada', dataInspecao: '2026-01-02', testeWP: 'REPROVOU' },
    { status: 'Draft', dataInspecao: '2026-01-03', testeWP: 'PASSOU' },
    { status: 'Cancelada', dataInspecao: '2026-01-04', testeWP: 'PASSOU' },
  ] as never);
  const response = await statistics(request());
  const body = await response.json();
  for (const delegate of [prisma.navio, prisma.stock, prisma.ordemServico]) {
    expect(delegate.count).toHaveBeenCalledWith({ where: { serviceStationId: { in: [2, 3] } } });
  }
  expect(prisma.inspecao.findMany).toHaveBeenCalledWith({ where: { jangadaId: { in: [22] } },
    select: { status: true, dataInspecao: true, testeWP: true, testeNAP: true, testeFS: true, testeGI: true, testeDL: true } });
  expect(prisma.serviceStation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [2, 3] } } }));
  expect(body.kpis).toMatchObject({ totalInspecoes: 4, concluidas: 1, condenadas: 1, rascunhos: 1, outros: 1 });
  expect(body.tests.wp).toEqual({ pass: 1, fail: 1, na: 0 });
  expect(body.monthlyTrend).toHaveLength(12);
  expect(response.headers.get('Cache-Control')).toContain('no-store');
});

it.each([['?stationId=2', { serviceStationId: 2 }], ['', { serviceStationId: { in: [2, 3] } }]])(
  'builds complete model/capacity statistics from the scoped raft records: %s', async (query, where) => {
    const rafts = Array.from({ length: 10 }, (_, id) => ({ id, brand: `Brand ${id}`, model: 'M', capacity: 6, packType: null, serial: `S${id}` }));
    jest.mocked(prisma.jangada.findMany).mockResolvedValue(rafts as never);
    const body = await (await statistics(request(query))).json();
    expect(prisma.jangada.findMany).toHaveBeenCalledWith({ where,
      select: { id: true, brand: true, model: true, capacity: true, packType: true, serial: true } });
    expect(body.brandBreakdown).toHaveLength(10);
    expect(body.kpis.totalJangadas).toBe(10);
    expect(body.brandBreakdown.reduce((sum: number, row: { count: number }) => sum + row.count, 0)).toBe(body.kpis.totalJangadas);
    expect(body.brandBreakdown[0].models).toEqual([{ model: 'M', capacity: 6, count: 1 }]);
    expect(prisma.jangada.groupBy).not.toHaveBeenCalled();
  },
);

it('keeps the global admin view and allows explicit station narrowing', async () => {
  setAccess({ isAdmin: true, allowedStationIds: [] });
  expect((await statistics(request())).status).toBe(200);
  expect(prisma.navio.count).toHaveBeenLastCalledWith({ where: {} });
  expect(prisma.inspecao.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));
  expect((await statistics(request('?stationId=8'))).status).toBe(200);
  expect(prisma.stock.count).toHaveBeenLastCalledWith({ where: { serviceStationId: 8 } });
});

it('returns only a generic statistics error', async () => {
  jest.mocked(prisma.inspecao.findMany).mockRejectedValue(new Error('postgres://secret-password'));
  const response = await statistics(request());
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain('secret');
});

it('maps real communication and assistance fields and restricts actionable states', async () => {
  jest.mocked(prisma.jangada.findMany).mockResolvedValue([{ id: 22 }] as never);
  jest.mocked(prisma.ordemServico.findMany).mockResolvedValue([{ id: 44, numeroOrdem: 'OT-44', orcamentoStatus: 'Enviado', updatedAt: new Date('2026-01-02T12:00Z') }] as never);
  jest.mocked(prisma.comunicacao.findMany).mockResolvedValue([{ id: 9, tipo: 'SMS', mensagem: 'Preciso de ajuda', enviadoEm: new Date('2026-01-01T12:00Z'), status: 'recebido' }] as never);
  jest.mocked(prisma.pedidoAssistencia.findMany).mockResolvedValue([{ id: 8, nome: 'Ana', descricao: 'Pedido real', estado: 'novo', createdAt: new Date('2026-01-02T12:00Z') }] as never);
  const response = await notifications(request());
  const body = await response.json();
  expect(body.errors).toEqual([]);
  expect(body.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'comm_9', titulo: 'Comunicação SMS recebida', descricao: 'Preciso de ajuda', data: '2026-01-01T12:00:00.000Z' }),
    expect.objectContaining({ id: 'ast_8', descricao: 'Ana: Pedido real' }),
    expect.objectContaining({ id: 'quote_44', tipo: 'orcamento' }),
  ]));
  expect(prisma.comunicacao.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'recebido', respondidoEm: null, AND: [
    { OR: [{ jangadaId: { in: [22] } }, { ordemServicoId: { in: [44] } }] },
    { OR: [{ jangadaId: null }, { jangadaId: { in: [22] } }] },
    { OR: [{ ordemServicoId: null }, { ordemServicoId: { in: [44] } }] },
  ] } }));
  expect(prisma.pedidoAssistencia.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { serviceStationId: { in: [2, 3] }, estado: { in: ['novo', 'em_atendimento'] } } }));
  expect(prisma.ordemServico.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ serviceStationId: { in: [2, 3] }, orcamentoStatus: { in: ['Enviado', 'Pendente', 'Emitido'] } }) }));
});

it('returns successful sources alongside visible, generic partial failures', async () => {
  jest.mocked(prisma.comunicacao.findMany).mockRejectedValue(new Error('secret SQL details'));
  const response = await notifications(request());
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.errors).toEqual(['Não foi possível carregar comunicações recebidas.']);
  expect(JSON.stringify(body)).not.toContain('secret');
});

it('notifies administrators of unassigned portal access requests without exposing them to unrelated stations', async () => {
  setAccess({ isAdmin: true, allowedStationIds: [] });
  jest.mocked(prisma.pedidoAssistencia.findMany).mockResolvedValue([{ id: 8, nome: 'Ana', origem: 'portal_acesso',
    descricao: 'Pedido de acesso; envio por verificar.', estado: 'novo', createdAt: new Date('2026-01-02T12:00Z') }] as never);
  const body = await (await notifications(request('?stationId=2'))).json();
  expect(body.items).toEqual(expect.arrayContaining([expect.objectContaining({
    tipo: 'assistencia', titulo: 'Pedido de acesso ao portal #8 (novo)', link: '/pedidos-assistencia',
  })]));
  expect(prisma.pedidoAssistencia.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {
    OR: [{ serviceStationId: 2 }, { serviceStationId: null, origem: 'portal_acesso' }],
    estado: { in: ['novo', 'em_atendimento'] },
  } }));
  setAccess({ isAdmin: false, allowedStationIds: [2] });
  await notifications(request('?stationId=2'));
  expect(prisma.pedidoAssistencia.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {
    serviceStationId: 2, estado: { in: ['novo', 'em_atendimento'] },
  } }));
});

it('does not present failure of every source as an empty success', async () => {
  for (const delegate of [prisma.navio, prisma.comunicacao, prisma.pedidoAssistencia, prisma.agendaEvento, prisma.ordemServico]) {
    jest.mocked(delegate.findMany).mockRejectedValue(new Error('private details'));
  }
  const body = await (await notifications(request())).json();
  expect(body.items).toEqual([]);
  expect(body.errors).toHaveLength(5);
  expect(JSON.stringify(body)).not.toContain('private details');
});

it('allows unlinked incoming messages only in the unrestricted admin view', async () => {
  setAccess({ isAdmin: true, allowedStationIds: [] });
  await notifications(request());
  expect(prisma.comunicacao.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { status: 'recebido', respondidoEm: null } }));
  await notifications(request('?stationId=2'));
  expect(prisma.comunicacao.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: expect.any(Array) }) }));
});

it('scopes expiration sources and does not fabricate dates for invalid/expired alerts', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-01-02T12:00Z'));
  jest.mocked(prisma.navio.findMany).mockResolvedValue([{ id: 5 }] as never);
  jest.mocked(prisma.jangada.findMany).mockResolvedValue([
    { id: 1, serial: 'J1', dataProxInspecao: '03/01/2026' },
    { id: 2, serial: 'J2', dataProxInspecao: '2026-02-31' },
    { id: 3, serial: 'J3', dataProxInspecao: '2026-01-01' },
    { id: 4, serial: 'J4', dataProxInspecao: null },
    { id: 5, serial: 'J5', dataProxInspecao: '2026-03-01' },
  ] as never);
  try {
    const body = await (await notifications(request('?stationId=2'))).json();
    expect(body.errors).toEqual([]);
    expect(body.items).toEqual([expect.objectContaining({ id: 'alert_jangada_1', data: '2026-01-03' })]);
    expect(prisma.certificadoExtraido.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { jangada: { serviceStationId: 2 }, isMaisRecente: true } }));
    for (const delegate of [prisma.epirb, prisma.extintor, prisma.fatoImersao]) {
      expect(delegate.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { shipId: { in: [5] }, estado: 'Ativo' } }));
    }
  } finally { jest.useRealTimers(); }
});

it('filters appointments by the Azores civil day including the winter UTC boundary', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-01-02T12:00Z'));
  jest.mocked(prisma.agendaEvento.findMany).mockResolvedValue([
    { id: 1, title: 'Hoje', date: new Date('2026-01-03T00:30Z'), raftSerial: 'J1', status: 'scheduled' },
    { id: 2, title: 'Ontem', date: new Date('2026-01-02T00:30Z'), raftSerial: 'J2', status: 'scheduled' },
    { id: 3, title: 'Amanhã', date: new Date('2026-01-03T01:30Z'), raftSerial: 'J3', status: 'scheduled' },
  ] as never);
  try {
    const body = await (await notifications(request())).json();
    expect(body.items.map((row: { id: string }) => row.id)).toEqual(['agenda_1']);
    expect(prisma.agendaEvento.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ serviceStationId: { in: [2, 3] }, status: { in: ['scheduled', 'confirmed', 'in_progress', 'testing', 'paused'] } }) }));
  } finally { jest.useRealTimers(); }
});
