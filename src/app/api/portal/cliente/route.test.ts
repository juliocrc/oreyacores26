import { GET } from "./route";
import { POST } from "@/app/api/auth/verify-client-code/route";
import { getAuthSession } from "@/auth";
import prisma from "@/lib/prisma";

jest.mock("@/auth", () => ({ getAuthSession: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: {
  cliente: { findUnique: jest.fn() }, jangada: { findMany: jest.fn() },
  inspecao: { findMany: jest.fn() }, ordemServico: { findMany: jest.fn() },
} }));

beforeEach(() => jest.resetAllMocks());

it("rejects anonymous requests even with AUTH_BYPASS", async () => {
  const old = process.env.AUTH_BYPASS;
  process.env.AUTH_BYPASS = "true";
  try {
    expect((await GET()).status).toBe(401);
    expect(prisma.cliente.findUnique).not.toHaveBeenCalled();
  } finally {
    if (old === undefined) delete process.env.AUTH_BYPASS;
    else process.env.AUTH_BYPASS = old;
  }
});

it.each([
  { id: "1", role: "ADMIN", clienteId: 7 },
  { id: "1", role: "USER", clienteId: 7 },
  { id: "1", role: "CLIENTE" },
  { id: "1", role: "CLIENTE", clienteId: -1 },
])("requires a valid CLIENTE session: %j", async (user) => {
  jest.mocked(getAuthSession).mockResolvedValue({ user } as never);
  expect((await GET()).status).toBe(403);
  expect(prisma.cliente.findUnique).not.toHaveBeenCalled();
});

it("ignores supplied clienteId and whitelists each level of the owned fleet, history and OT", async () => {
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: "1", role: "CLIENTE", clienteId: 7 } } as never);
  jest.mocked(prisma.cliente.findUnique).mockResolvedValue({ id: 7, nome: "Own", email: null, telefone: null,
    navios: [{ id: 10, nome: "Ship" }] } as never);
  jest.mocked(prisma.jangada.findMany).mockResolvedValue([{ id: 20, shipId: 10, serial: "Own raft" }] as never);
  jest.mocked(prisma.inspecao.findMany).mockResolvedValue([{ id: 30, jangadaId: 20, certificadoNumero: "Cert" }] as never);
  jest.mocked(prisma.ordemServico.findMany).mockResolvedValue([{ id: 40, status: "OPEN" }] as never);
  const response = await (GET as (request: Request) => ReturnType<typeof GET>)(new Request("http://localhost/api/portal/cliente?clienteId=999"));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const body = await response.json();
  expect(body.cliente.id).toBe(7);
  expect(body.cliente.navios[0].jangadas[0].inspecoes[0].id).toBe(30);
  expect(body.ordensServico[0].id).toBe(40);
  const query = jest.mocked(prisma.cliente.findUnique).mock.calls[0][0];
  expect(query?.where).toEqual({ id: 7 });
  expect(query?.select).toEqual({ id: true, nome: true, email: true, telefone: true,
    navios: { select: { id: true, nome: true, bandeira: true, imo: true, callSignal: true } } });
  expect(prisma.jangada.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { shipId: { in: [10] } }, select: expect.any(Object) }));
  expect(prisma.inspecao.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { jangadaId: { in: [20] } }, select: expect.any(Object) }));
  expect(prisma.ordemServico.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clienteId: 7 }, select: expect.any(Object) }));
  expect(JSON.stringify(body)).not.toContain("verificationCode");
});

it("retires the unauthenticated verifier without querying client data", async () => {
  const response = await POST();
  expect(response.status).toBe(410);
  expect(await response.json()).not.toHaveProperty("cliente");
  expect(prisma.cliente.findUnique).not.toHaveBeenCalled();
});

it('exposes all exact inspections with reference-based validity, expired and superseded states', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-25T12:00:00Z'));
  try {
    jest.mocked(getAuthSession).mockResolvedValue({ user: { id: '1', role: 'CLIENTE', clienteId: 7 } } as never);
    jest.mocked(prisma.cliente.findUnique).mockResolvedValue({ id: 7, navios: [{ id: 10 }] } as never);
    jest.mocked(prisma.jangada.findMany).mockResolvedValue([{ id: 20, shipId: 10 }, { id: 21, shipId: 10 }] as never);
    jest.mocked(prisma.ordemServico.findMany).mockResolvedValue([]);
    const inspection = { jangadaId: 20, certificadoNumero: 'CERT', status: 'Concluída', dataInspecao: '2025-10-25', dataProxInspecao: '2026-10-25' };
    jest.mocked(prisma.inspecao.findMany).mockResolvedValue([
      { ...inspection, id: 9, status: 'Rascunho' },
      ...[8, 7, 6, 5, 4, 3].map(id => ({ ...inspection, id })),
      { ...inspection, id: 2, jangadaId: 21, dataProxInspecao: '2026-10-24' },
    ] as never);
    const body = await (await GET()).json();
    const rafts = body.cliente.navios[0].jangadas;
    expect(rafts[0].inspecoes).toHaveLength(7);
    expect(rafts[0].inspecoes[0]).toMatchObject({ id: 9, documentStatus: 'indisponivel', downloadable: false });
    expect(rafts[0].inspecoes[1]).toMatchObject({ id: 8, documentStatus: 'valido', referenceDate: '2026-10-25' });
    expect(rafts[0].inspecoes[2].documentStatus).toBe('substituido');
    expect(rafts[1].inspecoes[0].documentStatus).toBe('expirado');
  } finally {
    jest.useRealTimers();
  }
});
