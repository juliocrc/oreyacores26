import { NextRequest } from "next/server";
import { enviarComunicacao } from "../communications";
import { POST as retry } from "@/app/api/comunicacoes/[id]/retry/route";
import { POST as bulkRetry } from "@/app/api/comunicacoes/bulk-retry/route";
import { POST as send } from "@/app/api/comunicacoes/route";
import { POST as audioSend } from "@/app/api/comunicacoes/whatsapp-audio/route";
import { sendWhatsAppApi } from "../whatsapp-provider";
import { sendOpenwa } from "../openwa";
import { sendInfinireachWhatsAppAudio } from "../infinireach-sms";
import { synthesizePortugueseSpeech } from "../speech-synthesis";
import prisma from "../prisma";

jest.mock("../access-control", () => ({ getAccessContext: jest.fn(async () => ({ userId: 7, email: "operator@example.test" })) }));
jest.mock("../whatsapp-provider", () => ({ sendWhatsAppApi: jest.fn(), whatsappApiConfigurado: jest.fn(), isWhatsAppAllowed: jest.fn(async () => true) }));
jest.mock("../openwa", () => ({
  ...jest.requireActual("../openwa"), sendOpenwa: jest.fn(),
}));
jest.mock("../infinireach-sms", () => ({ isInfinireachConfigured: jest.fn(() => true), sendInfinireachWhatsAppAudio: jest.fn() }));
jest.mock("../speech-synthesis", () => ({ isSpeechConfigured: jest.fn(() => true), synthesizePortugueseSpeech: jest.fn() }));
jest.mock("../rate-limit", () => ({ checkRateLimit: jest.fn(() => ({ allowed: true })) }));
jest.mock("../prisma", () => ({ __esModule: true, default: {
  comunicacao: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
  user: { findUnique: jest.fn(async () => ({ name: "Operator" })) },
} }));

const env = { ...process.env };
const input = { tipo: "WHATSAPP" as const, destinatario: "912345678", mensagem: "Mensagem de teste para WhatsApp." };
const request = (body = {}) => new NextRequest("http://localhost/api/comunicacoes", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-07-06T10:00:00Z") });
  jest.clearAllMocks();
  process.env = { ...env, WHATSAPP_PROVIDER: "openwa", OPENWA_BASE_URL: "https://orey-openwa.onrender.com", OPENWA_API_KEY: "test" };
  jest.mocked(prisma.comunicacao.create).mockResolvedValue({ id: 42 } as never);
  (prisma.comunicacao.update as jest.Mock).mockImplementation(async ({ data }) => ({ id: 42, ...data }));
  jest.mocked(prisma.comunicacao.updateMany).mockResolvedValue({ count: 1 });
  jest.mocked(prisma.comunicacao.findUnique).mockResolvedValue({ id: 42, ...input, canal: "openwa", status: "falhou" } as never);
  jest.mocked(prisma.comunicacao.findMany).mockResolvedValue([]);
  jest.mocked(sendWhatsAppApi).mockResolvedValue({ ok: true, provider: "openwa", enviadoDeFacto: true, accepted: true, providerId: "openwa-message" });
  jest.mocked(sendOpenwa).mockResolvedValue({ ok: true, providerId: "openwa-audio" });
  jest.mocked(synthesizePortugueseSpeech).mockResolvedValue(Buffer.from("mp3"));
});
afterEach(() => { process.env = { ...env }; jest.useRealTimers(); });

it("creates a durable pending text record before API I/O and stores acceptance as pending", async () => {
  jest.mocked(sendWhatsAppApi).mockImplementationOnce(async () => {
    expect(prisma.comunicacao.create).toHaveBeenCalledWith({ data: expect.objectContaining({ canal: "openwa", status: "pendente" }) });
    return { ok: true, provider: "openwa", enviadoDeFacto: true, accepted: true, providerId: "id" };
  });
  expect(await enviarComunicacao(input)).toMatchObject({ ok: true, status: "pendente", comunicacaoId: 42 });
  expect(sendWhatsAppApi).toHaveBeenCalledWith(input.destinatario, input.mensagem, 42);
  expect(prisma.comunicacao.create).toHaveBeenCalledTimes(1);
  expect(prisma.comunicacao.update).toHaveBeenCalledWith({ where: { id: 42 }, data: expect.objectContaining({ status: "pendente", canal: "openwa", providerId: "id" }) });
});

it("does not send if durable history cannot be created", async () => {
  jest.mocked(prisma.comunicacao.create).mockRejectedValueOnce(new Error("private DB URL"));
  expect(await enviarComunicacao(input)).toMatchObject({ ok: false });
  expect(sendWhatsAppApi).not.toHaveBeenCalled();
});

it("keeps uncertain text pending without returning wa.me, fake success or a retryable failure", async () => {
  jest.mocked(sendWhatsAppApi).mockResolvedValueOnce({ ok: false, provider: "openwa", uncertain: true, erro: "Uncertain" });
  expect(await enviarComunicacao(input)).toMatchObject({ ok: false, uncertain: true, status: "pendente", comunicacaoId: 42 });
  expect(prisma.comunicacao.update).toHaveBeenCalledWith({ where: { id: 42 }, data: expect.objectContaining({ status: "pendente", canal: "openwa", providerId: null }) });
});

it.each(["openwa-audio", "infinireach-audio", "twilio", "twilio-voice"])("core never retries %s history as text even if OpenWA is deselected", async (canal) => {
  delete process.env.WHATSAPP_PROVIDER;
  jest.mocked(prisma.comunicacao.findUnique).mockResolvedValueOnce({ id: 42, canal, status: "falhou" } as never);
  expect((await enviarComunicacao(input, { comunicacaoId: 42 })).ok).toBe(false);
  expect(sendWhatsAppApi).not.toHaveBeenCalled();
  expect(prisma.comunicacao.update).not.toHaveBeenCalled();
});

it.each([null, "accepted-id"])("blocks a pending OpenWA text attempt regardless of provider ID %s", async (providerId) => {
  jest.mocked(prisma.comunicacao.findUnique).mockResolvedValue({ id: 42, ...input, canal: "openwa", status: "pendente", providerId } as never);
  expect(await enviarComunicacao(input, { comunicacaoId: 42 })).toMatchObject({ ok: false, uncertain: true });
  expect((await retry(request(), { params: Promise.resolve({ id: "42" }) })).status).toBe(409);
  expect(sendWhatsAppApi).not.toHaveBeenCalled();
});

it("atomically claims failed retries before sending, and a lost claim never sends", async () => {
  jest.mocked(prisma.comunicacao.updateMany).mockResolvedValueOnce({ count: 0 });
  expect(await enviarComunicacao(input, { comunicacaoId: 42 })).toMatchObject({ ok: false, uncertain: true });
  expect(sendWhatsAppApi).not.toHaveBeenCalled();
  expect(prisma.comunicacao.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "pendente", canal: "openwa" }) }));
});

it("retry route does not overwrite API acceptance or uncertainty as sent or failed", async () => {
  const accepted = await retry(request(), { params: Promise.resolve({ id: "42" }) });
  expect(await accepted.json()).toMatchObject({ ok: true, comunicacao: { status: "pendente" } });
  jest.mocked(sendWhatsAppApi).mockResolvedValueOnce({ ok: false, provider: "openwa", uncertain: true, erro: "Uncertain" });
  const uncertain = await retry(request(), { params: Promise.resolve({ id: "42" }) });
  expect(uncertain.status).toBe(409);
  expect(await uncertain.json()).toMatchObject({ ok: false, uncertain: true });
  expect(prisma.comunicacao.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "enviado" }) }));
  expect(prisma.comunicacao.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "falhou" }) }));
});

it("bulk guards pending/failed audio, OpenWA and retired Twilio rows even if the DB returns them", async () => {
  jest.mocked(prisma.comunicacao.findMany).mockResolvedValue(["openwa-audio", "infinireach-audio", "openwa", "twilio"].map((canal) => ({ id: 42, ...input, canal, status: "pendente", providerId: null })) as never);
  expect(await (await bulkRetry(request())).json()).toMatchObject({ okCount: 0, failCount: 0 });
  expect(sendWhatsAppApi).not.toHaveBeenCalled();
});

it("manual send returns pending acceptance without falsely marking the inbound message answered", async () => {
  expect(await (await send(request({ ...input, responderA: 9 }))).json()).toMatchObject({ ok: true, status: "pendente" });
  expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
});

it("closed text and audio return precise 409 contracts with no queue, synthesis or send", async () => {
  jest.setSystemTime(new Date("2026-07-06T12:30:00Z"));
  const audioResponse = await audioSend(request({ destinatario: input.destinatario, mensagem: input.mensagem, confirmed: true }));
  expect(audioResponse.status).toBe(409);
  expect(await audioResponse.json()).toMatchObject({ closed: true, status: "closed" });
  const response = await send(request(input));
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ closed: true, status: "closed" });
  expect(prisma.comunicacao.create).not.toHaveBeenCalled();
  expect(sendWhatsAppApi).not.toHaveBeenCalled();
  expect(synthesizePortugueseSpeech).not.toHaveBeenCalled();
});

it("audio sends OpenWA only after durable history and keeps acceptance pending", async () => {
  expect(await (await audioSend(request({ destinatario: input.destinatario, mensagem: input.mensagem, confirmed: true }))).json()).toMatchObject({ ok: true, status: "pendente", providerId: "openwa-audio" });
  expect(prisma.comunicacao.create).toHaveBeenCalledWith({ data: expect.objectContaining({ canal: "openwa-audio", status: "pendente" }) });
  expect(sendOpenwa).toHaveBeenCalledWith("+351912345678", { audio: Buffer.from("mp3") }, 42);
  expect(sendInfinireachWhatsAppAudio).not.toHaveBeenCalled();
});

it("uncertain OpenWA audio remains pending, is not converted to text and is blocked from retry", async () => {
  jest.mocked(sendOpenwa).mockResolvedValueOnce({ ok: false, uncertain: true, error: "Uncertain" });
  const response = await audioSend(request({ destinatario: input.destinatario, mensagem: input.mensagem, confirmed: true }));
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ uncertain: true, comunicacaoId: 42 });
  expect(prisma.comunicacao.update).toHaveBeenCalledWith({ where: { id: 42 }, data: expect.objectContaining({ status: "pendente" }) });
  jest.mocked(prisma.comunicacao.findUnique).mockResolvedValueOnce({ id: 42, ...input, canal: "openwa-audio", status: "pendente" } as never);
  expect((await retry(request(), { params: Promise.resolve({ id: "42" }) })).status).toBe(400);
  expect(sendWhatsAppApi).not.toHaveBeenCalled();
  expect(sendInfinireachWhatsAppAudio).not.toHaveBeenCalled();
  expect(sendOpenwa).toHaveBeenCalledTimes(1);
});
