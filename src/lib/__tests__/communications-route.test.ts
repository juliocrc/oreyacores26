import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/comunicacoes/route";
import { getAccessContext } from "../access-control";
import { enviarComunicacao } from "../communications";
import prisma from "../prisma";
import { isEmailConfigured } from '../email-sender';

jest.mock("../access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("../communications", () => ({ enviarComunicacao: jest.fn() }));
jest.mock('../email-sender', () => ({ isEmailConfigured: jest.fn() }));
jest.mock("../prisma", () => ({
  __esModule: true,
  default: {
    comunicacao: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn(), updateMany: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

const request = (body: Record<string, unknown>) => new NextRequest("http://localhost/api/comunicacoes", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const reply = { tipo: "SMS", destinatario: "912345678", mensagem: "Resposta de teste", responderA: 42 };

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAccessContext).mockResolvedValue({ userId: 1, email: ' JULIO.CORREIA@OREY.COM ', isAdmin: false } as never);
  jest.mocked(prisma.comunicacao.findMany).mockResolvedValue([]);
  jest.mocked(prisma.comunicacao.count).mockResolvedValue(0);
  jest.mocked(prisma.comunicacao.groupBy).mockResolvedValue([]);
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ name: "Operador" } as never);
  jest.mocked(prisma.comunicacao.updateMany).mockResolvedValue({ count: 1 });
  jest.mocked(enviarComunicacao).mockResolvedValue({ ok: true, comunicacaoId: 7 });
  jest.mocked(isEmailConfigured).mockReturnValue(true);
});

it("requires a session for reading and sending", async () => {
  jest.mocked(getAccessContext).mockResolvedValue(null);
  expect((await GET(new NextRequest("http://localhost/api/comunicacoes"))).status).toBe(401);
  expect((await POST(request(reply))).status).toBe(401);
  expect(enviarComunicacao).not.toHaveBeenCalled();
});

it.each(['julio', 'tecnica'])('passes only the selected account %s to email delivery', async senderAccount => {
  expect((await POST(request({ ...reply, tipo: 'EMAIL', destinatario: 'owner@example.test', senderAccount, from: 'spoof@example.test', password: 'secret' }))).status).toBe(200);
  expect(isEmailConfigured).toHaveBeenCalledWith(senderAccount);
  const input = jest.mocked(enviarComunicacao).mock.calls[0][0];
  expect(input).toMatchObject({ tipo: 'EMAIL', senderAccount });
  expect(input).not.toHaveProperty('from');
  expect(input).not.toHaveProperty('password');
  expect(input.ref).not.toHaveProperty('senderAccount');
});

it.each([false, true])('denies both profiles to non-Julio, including admin=%s', async isAdmin => {
  jest.mocked(getAccessContext).mockResolvedValue({ userId: 2, email: 'other@orey.com', isAdmin } as never);
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ name: 'Julio Correia', email: 'julio.correia@orey.com' } as never);
  for (const senderAccount of ['julio', 'tecnica']) {
    expect((await POST(request({ ...reply, tipo: 'EMAIL', senderAccount }))).status).toBe(403);
  }
  expect(isEmailConfigured).not.toHaveBeenCalled();
  expect(enviarComunicacao).not.toHaveBeenCalled();
});

it.each(['other', 'julio.correia@orey.com', '', null, {}, ['julio']])('rejects invalid account %p before sending', async senderAccount => {
  expect((await POST(request({ ...reply, tipo: 'EMAIL', senderAccount }))).status).toBe(400);
  expect(enviarComunicacao).not.toHaveBeenCalled();
  expect(prisma.user.findUnique).not.toHaveBeenCalled();
});

it('rejects an unconfigured explicit account without global fallback or marking a reply answered', async () => {
  jest.mocked(isEmailConfigured).mockImplementation(account => account !== 'tecnica');
  const res = await POST(request({ ...reply, tipo: 'EMAIL', senderAccount: 'tecnica' }));
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ code: 'EMAIL_NOT_CONFIGURED' });
  expect(enviarComunicacao).not.toHaveBeenCalled();
  expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
});

it('preserves legacy global email delivery when no account is supplied', async () => {
  jest.mocked(getAccessContext).mockResolvedValue({ userId: 2, email: 'other@orey.com', isAdmin: true } as never);
  jest.mocked(isEmailConfigured).mockReturnValue(false);
  expect((await POST(request({ ...reply, tipo: 'EMAIL' }))).status).toBe(200);
  expect(isEmailConfigured).not.toHaveBeenCalled();
  expect(jest.mocked(enviarComunicacao).mock.calls[0][0]).not.toHaveProperty('senderAccount');
});

it.each(["NaN", "Infinity", "-1", "0", "1.5", "501"])("rejects invalid history limit %s", async (limit) => {
  expect((await GET(new NextRequest(`http://localhost/api/comunicacoes?limite=${limit}`))).status).toBe(400);
  expect(prisma.comunicacao.findMany).not.toHaveBeenCalled();
});

it.each([false, true])("exposes the effective deletion permission: %s", async (isAdmin) => {
  jest.mocked(getAccessContext).mockResolvedValue({ userId: 1, isAdmin } as never);
  const response = await GET(new NextRequest("http://localhost/api/comunicacoes?limite=500"));
  expect(await response.json()).toMatchObject({ permissions: { canDelete: isAdmin } });
  expect(prisma.comunicacao.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 501 }));
});

it.each(["", " ", "NaN", "Infinity", "-1", "0", "1.5", "9007199254740992"])("rejects invalid history cursor %s", async (cursor) => {
  const response = await GET(new NextRequest(`http://localhost/api/comunicacoes?cursor=${encodeURIComponent(cursor)}`));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "O cursor deve ser um inteiro positivo." });
  expect(prisma.comunicacao.findMany).not.toHaveBeenCalled();
  expect(prisma.comunicacao.count).not.toHaveBeenCalled();
  expect(prisma.comunicacao.groupBy).not.toHaveBeenCalled();
});

it("uses the default page size without a cursor and preserves response metadata", async () => {
  jest.mocked(prisma.comunicacao.count).mockResolvedValueOnce(12).mockResolvedValueOnce(3);
  jest.mocked(prisma.comunicacao.groupBy)
    .mockResolvedValueOnce([{ tipo: "SMS", _count: 12 }] as never)
    .mockResolvedValueOnce([{ status: "recebido", _count: 3 }] as never);

  const response = await GET(new NextRequest("http://localhost/api/comunicacoes"));

  expect(response.status).toBe(200);
  expect(prisma.comunicacao.findMany).toHaveBeenCalledWith({
    where: {}, orderBy: [{ enviadoEm: "desc" }, { id: "desc" }], take: 201,
  });
  expect(await response.json()).toEqual({
    items: [], nextCursor: null, total: 12,
    porTipo: [{ tipo: "SMS", _count: 12 }],
    porStatus: [{ status: "recebido", _count: 3 }],
    recebidasNaoRespondidas: 3, permissions: { canDelete: false },
  });
});

it.each([undefined, 20])("trims the extra row and returns the last visible id for cursor %s", async (cursor) => {
  const items = [
    { id: 19, enviadoEm: "2026-10-24T10:00:00.000Z" },
    { id: 18, enviadoEm: "2026-10-24T10:00:00.000Z" },
    { id: 17, enviadoEm: "2026-10-24T09:00:00.000Z" },
  ];
  jest.mocked(prisma.comunicacao.findMany).mockResolvedValue(items as never);
  const response = await GET(new NextRequest(`http://localhost/api/comunicacoes?limite=2${cursor === undefined ? "" : `&cursor=${cursor}`}`));

  expect(prisma.comunicacao.findMany).toHaveBeenCalledWith({
    where: {}, orderBy: [{ enviadoEm: "desc" }, { id: "desc" }], take: 3,
    ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
  });
  expect(await response.json()).toMatchObject({ items: items.slice(0, 2), nextCursor: 18 });
});

it.each([0, 1, 2])("returns no next cursor for a final page of %s items", async (length) => {
  const items = [{ id: 19 }, { id: 18 }].slice(0, length);
  jest.mocked(prisma.comunicacao.findMany).mockResolvedValue(items as never);
  const response = await GET(new NextRequest("http://localhost/api/comunicacoes?limite=2&cursor=20"));
  expect(await response.json()).toMatchObject({ items, nextCursor: null });
});

it("preserves filters and full matching totals when using a cursor", async () => {
  await GET(new NextRequest("http://localhost/api/comunicacoes?limite=500&cursor=1&tipo=SMS&direcao=recebida&clienteId=2&jangadaId=3&ordemServicoId=4&q=teste"));
  const where = {
    tipo: "SMS", status: "recebido", clienteId: 2, jangadaId: 3, ordemServicoId: 4,
    OR: [
      { destinatario: { contains: "teste" } }, { mensagem: { contains: "teste" } },
      { assunto: { contains: "teste" } }, { enviadoPor: { contains: "teste" } },
    ],
  };
  expect(prisma.comunicacao.findMany).toHaveBeenCalledWith({
    where, orderBy: [{ enviadoEm: "desc" }, { id: "desc" }], take: 501,
    cursor: { id: 1 }, skip: 1,
  });
  expect(prisma.comunicacao.count).toHaveBeenNthCalledWith(1, { where });
});

it("only marks an incoming message for the same recipient and channel answered", async () => {
  expect((await POST(request(reply))).status).toBe(200);
  expect(prisma.comunicacao.updateMany).toHaveBeenCalledWith({
    where: { id: 42, status: "recebido", tipo: "SMS", destinatario: "912345678" },
    data: { respondidoEm: expect.any(Date) },
  });
});

it("does not mark a manual WhatsApp link as an answered message", async () => {
  jest.mocked(enviarComunicacao).mockResolvedValue({ ok: true, whatsappUrl: "https://wa.me/351912345678" });
  await POST(request({ ...reply, tipo: "WHATSAPP" }));
  expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
});

it("does not mark failed sends or unresolved recipients as answered", async () => {
  jest.mocked(enviarComunicacao).mockResolvedValueOnce({ ok: false, erro: "Falhou" });
  expect((await POST(request(reply))).status).toBe(400);
  await POST(request({ ...reply, destinatario: undefined }));
  expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
});
