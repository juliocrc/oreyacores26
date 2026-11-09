import { NextRequest } from "next/server";
import { POST as retry } from "@/app/api/comunicacoes/[id]/retry/route";
import { POST as bulkRetry } from "@/app/api/comunicacoes/bulk-retry/route";
import { POST as send } from "@/app/api/comunicacoes/route";
import prisma from "../prisma";
import { getAccessContext } from "../access-control";
import { sendWhatsAppApi } from "../whatsapp-provider";
import { sendEmail } from '../email-sender';
import { enviarComunicacao } from '../communications';

jest.mock("../access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("../sms-provider", () => ({ sendSms: jest.fn() }));
jest.mock("../email-sender", () => ({ sendEmail: jest.fn() }));
jest.mock("../whatsapp-provider", () => ({ sendWhatsAppApi: jest.fn(), whatsappApiConfigurado: jest.fn() }));
jest.mock("../prisma", () => ({
  __esModule: true,
  default: {
    comunicacao: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

const original = {
  id: 42, tipo: "WHATSAPP", status: "falhou", mensagem: "Teste", destinatario: "912345678",
  providerId: "old-id", canal: "infinireach", tentativas: 1,
};
const req = () => new NextRequest("http://localhost/api/comunicacoes/42/retry", { method: "POST" });
const single = (id = "42") => retry(req(), { params: Promise.resolve({ id }) });

beforeEach(() => {
  jest.resetAllMocks();
  (getAccessContext as jest.Mock).mockResolvedValue({ userId: 1 });
  (prisma.comunicacao.findUnique as jest.Mock).mockResolvedValue(original);
  (prisma.comunicacao.findMany as jest.Mock).mockResolvedValue([original]);
  (prisma.comunicacao.update as jest.Mock).mockImplementation(async ({ data }) => ({ ...original, ...data }));
  (prisma.comunicacao.create as jest.Mock).mockResolvedValue({ id: 55 });
  (prisma.comunicacao.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ name: "Operator" });
  (sendWhatsAppApi as jest.Mock).mockResolvedValue({
    ok: true, enviadoDeFacto: true, provider: "infinireach", providerId: "new-SID", link: "https://wa.me/test",
  });
});

it("marks a WhatsApp reply answered when the successful provider also returns a fallback link", async () => {
  const response = await send(new NextRequest("http://localhost/api/comunicacoes", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo: "WHATSAPP", mensagem: "Resposta", destinatario: "912345678", responderA: 9 }),
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, comunicacaoId: 55, status: "enviado", providerId: "new-SID" });
  expect(prisma.comunicacao.updateMany).toHaveBeenCalledWith({
    where: { id: 9, status: "recebido", tipo: "WHATSAPP", destinatario: "912345678" },
    data: { respondidoEm: expect.any(Date) },
  });
});

it("requires authentication on both retry routes", async () => {
  (getAccessContext as jest.Mock).mockResolvedValue(null);
  expect((await single()).status).toBe(401);
  expect((await bulkRetry(req())).status).toBe(401);
  expect(sendWhatsAppApi).not.toHaveBeenCalled();
});

it.each([false, true])('rejects explicit retry profiles for non-Julio admin=%s', async isAdmin => {
  jest.mocked(getAccessContext).mockResolvedValue({ userId: 2, email: 'other@orey.com', isAdmin } as never);
  for (const senderAccount of ['julio', 'tecnica']) {
    const request = () => new NextRequest('http://localhost/api/comunicacoes/42/retry', {
      method: 'POST', body: JSON.stringify({ senderAccount }),
    });
    expect((await retry(request(), { params: Promise.resolve({ id: '42' }) })).status).toBe(403);
    expect((await bulkRetry(request())).status).toBe(403);
  }
  expect(prisma.comunicacao.findUnique).not.toHaveBeenCalled();
  expect(prisma.comunicacao.findMany).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
});

it.each([undefined, 'other@orey.com'])('blocks internal profile delivery without trusted Julio identity: %s', async authenticatedEmail => {
  const result = await enviarComunicacao({ tipo: 'EMAIL', mensagem: 'Test', destinatario: 'owner@example.test', senderAccount: 'tecnica', enviadoPor: 'Julio Correia' }, { authenticatedEmail });
  expect(result.ok).toBe(false);
  expect(sendEmail).not.toHaveBeenCalled();
  expect(prisma.comunicacao.create).not.toHaveBeenCalled();
});

it('does not restore profile selections or identities from persisted retry metadata', async () => {
  jest.mocked(prisma.comunicacao.findUnique).mockResolvedValue({ ...original, tipo: 'EMAIL', canal: 'email', destinatario: 'owner@example.test', senderAccount: 'tecnica', enviadoPor: 'julio.correia@orey.com' } as never);
  jest.mocked(sendEmail).mockResolvedValue({ ok: true });
  expect((await single()).status).toBe(200);
  expect(sendEmail).toHaveBeenCalledWith({ to: 'owner@example.test', subject: 'Orey Tecnica- Serviços Navais, Lda - Comunicação', text: 'Teste' });
});

it.each(["NaN", "0", "-1", "1.5", "Infinity"])("rejects invalid id %s", async (id) => {
  expect((await single(id)).status).toBe(400);
  expect(prisma.comunicacao.findUnique).not.toHaveBeenCalled();
});

it("returns 404 for missing history", async () => {
  (prisma.comunicacao.findUnique as jest.Mock).mockResolvedValue(null);
  expect((await single()).status).toBe(404);
});

it.each(["falhou", "pendente"])("never retries %s audio history as text", async (status) => {
  (prisma.comunicacao.findUnique as jest.Mock).mockResolvedValue({ ...original, canal: "infinireach-audio", status, providerId: null });
  expect((await single()).status).toBe(400);
  expect(sendWhatsAppApi).not.toHaveBeenCalled();
  expect(prisma.comunicacao.update).not.toHaveBeenCalled();
});

it("bulk guards audio rows even if returned by the query, preserving nullable text channels", async () => {
  (prisma.comunicacao.findMany as jest.Mock).mockResolvedValue([
    { ...original, canal: "infinireach-audio", providerId: null },
    { ...original, id: 43, canal: null },
  ]);
  expect(await (await bulkRetry(req())).json()).toMatchObject({ okCount: 1, failCount: 0 });
  expect(sendWhatsAppApi).toHaveBeenCalledTimes(1);
  expect(prisma.comunicacao.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 42 } }));
});

it.each(["enviado", "entregue", "lido", "recebido", "rascunho", "delivered", "read", "queued"])("does not retry %s", async (status) => {
  (prisma.comunicacao.findUnique as jest.Mock).mockResolvedValue({ ...original, status });
  expect((await single()).status).toBe(400);
  expect(sendWhatsAppApi).not.toHaveBeenCalled();
  expect(prisma.comunicacao.update).not.toHaveBeenCalled();
});

it.each([
  { tipo: "CHAMADA", status: "falhou" },
  { tipo: "WHATSAPP", status: "pendente", providerId: "accepted-SID" },
])("rejects calls and provider-accepted pending messages: %p", async (fields) => {
  (prisma.comunicacao.findUnique as jest.Mock).mockResolvedValue({ ...original, ...fields });
  expect((await single()).status).toBe(400);
  expect(sendWhatsAppApi).not.toHaveBeenCalled();
});

it("reuses one history row for an actual retry and returns no manual link", async () => {
  const response = await single();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, comunicacao: { id: 42, status: "enviado", providerId: "new-SID" } });
  expect(prisma.comunicacao.create).not.toHaveBeenCalled();
  expect(prisma.comunicacao.update).toHaveBeenCalledWith({ where: { id: 42 }, data: expect.objectContaining({ providerId: "new-SID", canal: "infinireach" }) });
});

it("returns manual fallback without marking it sent or retaining an old SID", async () => {
  (sendWhatsAppApi as jest.Mock).mockResolvedValue({ ok: true, enviadoDeFacto: false, link: "https://wa.me/test" });
  const body = await (await single()).json();
  expect(body).toMatchObject({ ok: true, whatsappUrl: "https://wa.me/test", comunicacao: { status: "pendente", providerId: null } });
  expect(prisma.comunicacao.create).not.toHaveBeenCalled();
});

it("records a failed retry and returns its fallback link", async () => {
  (sendWhatsAppApi as jest.Mock).mockResolvedValue({ ok: false, erro: "Provider failed", link: "https://wa.me/test" });
  const response = await single();
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ ok: false, erro: "Provider failed", whatsappUrl: "https://wa.me/test" });
  expect(prisma.comunicacao.update).toHaveBeenLastCalledWith({ where: { id: 42 }, data: expect.objectContaining({ status: "falhou", tentativas: { increment: 1 } }) });
});

it("bulk selects only failed or unaccepted pending WhatsApp messages", async () => {
  const body = await (await bulkRetry(req())).json();
  expect(body).toMatchObject({ okCount: 1, failCount: 0, manualCount: 0 });
  expect(prisma.comunicacao.findMany).toHaveBeenCalledWith({
    where: {
      tipo: "WHATSAPP", OR: [{ status: "falhou" }, { status: "pendente", providerId: null }],
      AND: [{ OR: [{ canal: null }, { canal: { notIn: ["infinireach-audio", "openwa-audio", "openwa", "twilio", "twilio-voice"] } }] }],
    },
    orderBy: { enviadoEm: "asc" }, take: 50,
  });
  expect(prisma.comunicacao.create).not.toHaveBeenCalled();
});

it("bulk returns manual links separately from actual sends and failures", async () => {
  (prisma.comunicacao.findMany as jest.Mock).mockResolvedValue([original, { ...original, id: 43 }]);
  (sendWhatsAppApi as jest.Mock)
    .mockResolvedValueOnce({ ok: true, enviadoDeFacto: false, link: "https://wa.me/manual" })
    .mockResolvedValueOnce({ ok: false, erro: "Failed" });
  const body = await (await bulkRetry(req())).json();
  expect(body).toMatchObject({ okCount: 0, failCount: 1, manualCount: 1, manualLinks: [{ comunicacaoId: 42, whatsappUrl: "https://wa.me/manual" }] });
  expect(prisma.comunicacao.update).toHaveBeenCalledWith({ where: { id: 42 }, data: expect.objectContaining({ status: "pendente", providerId: null }) });
  expect(prisma.comunicacao.create).not.toHaveBeenCalled();
});
