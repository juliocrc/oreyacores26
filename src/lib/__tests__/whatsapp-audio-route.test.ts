import { NextRequest } from "next/server";
import { POST, runtime, maxDuration } from "@/app/api/comunicacoes/whatsapp-audio/route";
import { getAccessContext } from "../access-control";
import { isWhatsAppAllowed } from "../whatsapp-provider";
import { checkRateLimit } from "../rate-limit";
import { isSpeechConfigured, synthesizePortugueseSpeech } from "../speech-synthesis";
import { isInfinireachConfigured, sendInfinireachWhatsAppAudio } from "../infinireach-sms";
import prisma from "../prisma";

jest.mock("../access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("../whatsapp-provider", () => ({ isWhatsAppAllowed: jest.fn() }));
jest.mock("../rate-limit", () => ({ checkRateLimit: jest.fn() }));
jest.mock("../speech-synthesis", () => ({ isSpeechConfigured: jest.fn(), synthesizePortugueseSpeech: jest.fn() }));
jest.mock("../infinireach-sms", () => ({ isInfinireachConfigured: jest.fn(), sendInfinireachWhatsAppAudio: jest.fn() }));
jest.mock("../prisma", () => ({ __esModule: true, default: {
  comunicacao: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
} }));

const input = { destinatario: "912345678", mensagem: "Mensagem de teste para audio.", confirmed: true };
const audio = Buffer.from("audio");
const request = (body: unknown = input) => new NextRequest("http://localhost/api/comunicacoes/whatsapp-audio", {
  method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
});
const expectNoExpense = () => {
  expect(prisma.comunicacao.create).not.toHaveBeenCalled();
  expect(synthesizePortugueseSpeech).not.toHaveBeenCalled();
  expect(sendInfinireachWhatsAppAudio).not.toHaveBeenCalled();
};

beforeEach(() => {
  jest.resetAllMocks();
  (getAccessContext as jest.Mock).mockResolvedValue({ userId: 7, email: "operator@example.test" });
  (isWhatsAppAllowed as jest.Mock).mockResolvedValue(true);
  (isSpeechConfigured as jest.Mock).mockReturnValue(true);
  (isInfinireachConfigured as jest.Mock).mockReturnValue(true);
  (checkRateLimit as jest.Mock).mockReturnValue({ allowed: true, retryAfterMs: 0 });
  (prisma.comunicacao.create as jest.Mock).mockResolvedValue({ id: 42 });
  (prisma.comunicacao.update as jest.Mock).mockResolvedValue({ id: 42 });
  (synthesizePortugueseSpeech as jest.Mock).mockResolvedValue(audio);
  (sendInfinireachWhatsAppAudio as jest.Mock).mockResolvedValue({ ok: true, providerId: "provider-42", status: "pendente" });
});

it("uses the long-running node runtime", () => {
  expect(runtime).toBe("nodejs");
  expect(maxDuration).toBe(120);
});

it("returns 503 without expense on limiter backend failure", async () => {
  jest.mocked(checkRateLimit).mockResolvedValue({ allowed: false, status: 503 } as never);
  const res = await POST(request());
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({
    code: "AUDIO_RATE_LIMIT_UNAVAILABLE", error: expect.stringContaining("configuracao do limitador"),
  });
  expectNoExpense();
});

it("requires authentication before policy, parsing or expense", async () => {
  (getAccessContext as jest.Mock).mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  expect(isWhatsAppAllowed).not.toHaveBeenCalled();
  expectNoExpense();
});

it("awaits and enforces the single-user WhatsApp policy", async () => {
  (isWhatsAppAllowed as jest.Mock).mockResolvedValue(false);
  expect((await POST(request())).status).toBe(403);
  expect(checkRateLimit).not.toHaveBeenCalled();
  expectNoExpense();
});

it.each([isSpeechConfigured, isInfinireachConfigured])("fails closed for missing configuration", async (configured) => {
  (configured as jest.Mock).mockReturnValue(false);
  expect((await POST(request())).status).toBe(503);
  expect(checkRateLimit).not.toHaveBeenCalled();
  expectNoExpense();
});

it.each([
  null, [], {}, { ...input, confirmed: false }, { ...input, confirmed: "true" },
  { ...input, destinatario: 912345678 }, { ...input, destinatario: "+351912345678,+351912345679" },
  { ...input, destinatario: "+1234567890123456" }, { ...input, destinatario: "+35191234567" },
  { ...input, mensagem: 1234567890 }, { ...input, mensagem: "short" },
  { ...input, mensagem: "x".repeat(1501) }, { ...input, mensagem: "invalid control \u0000" },
  { ...input, mensagem: "invalid surrogate \ud800" }, { ...input, mensagem: "invalid surrogate \udc00" },
  { ...input, mediaUrl: "https://example.test/audio.mp3" }, { ...input, key: "secret" },
  { ...input, refTipo: 1 }, { ...input, refTipo: "" }, { ...input, refTipo: "bad\u0000" },
])("rejects invalid payload without expense: %j", async (body) => {
  expect((await POST(request(body))).status).toBe(400);
  expectNoExpense();
});

it.each(["responderA", "clienteId", "jangadaId", "ordemServicoId", "refId"])("strictly validates %s", async (key) => {
  for (const value of [null, "1", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, true]) {
    expect((await POST(request({ ...input, [key]: value }))).status).toBe(400);
  }
  expectNoExpense();
});

it("rejects malformed JSON", async () => {
  expect((await POST(new NextRequest("http://localhost", { method: "POST", body: "{" }))).status).toBe(400);
  expectNoExpense();
});

it.each([false, true])("bounds actual body bytes with or without content-length: %s", async (declared) => {
  const req = new NextRequest("http://localhost", {
    method: "POST", body: " ".repeat(16 * 1024 + 1),
    headers: declared ? { "Content-Length": "16385" } : {},
  });
  expect((await POST(req)).status).toBe(413);
  expectNoExpense();
});

it("limits each user to three requests per minute before expense", async () => {
  (checkRateLimit as jest.Mock).mockReturnValue({ allowed: false, retryAfterMs: 4500 });
  const response = await POST(request());
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("5");
  expect(checkRateLimit).toHaveBeenCalledWith("whatsapp-audio:7", 3, 60000);
  expectNoExpense();
});

it("precreates transcript, operator and references before synthesis and uses the exact stable externalId", async () => {
  (synthesizePortugueseSpeech as jest.Mock).mockImplementation(async () => {
    expect(prisma.comunicacao.create).toHaveBeenCalledTimes(1);
    return audio;
  });
  const response = await POST(request({ ...input, mensagem: `  ${input.mensagem}  `,
    responderA: 9, clienteId: 1, jangadaId: 2, ordemServicoId: 3, refTipo: "OS", refId: 4,
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, comunicacaoId: 42, providerId: "provider-42", status: "pendente" });
  expect(prisma.comunicacao.create).toHaveBeenCalledWith({ data: {
    tipo: "WHATSAPP", canal: "infinireach-audio", assunto: "Audio WhatsApp (voz sintetica)",
    destinatario: "+351912345678", mensagem: input.mensagem, status: "pendente", enviadoPor: "operator@example.test",
    clienteId: 1, jangadaId: 2, ordemServicoId: 3, refTipo: "OS", refId: 4,
  } });
  expect(synthesizePortugueseSpeech).toHaveBeenCalledWith(input.mensagem, undefined);
  expect(sendInfinireachWhatsAppAudio).toHaveBeenCalledTimes(1);
  expect(sendInfinireachWhatsAppAudio).toHaveBeenCalledWith("+351912345678", audio, "orey-whatsapp-audio-42");
  expect(prisma.comunicacao.update).toHaveBeenCalledWith({ where: { id: 42 }, data: { status: "pendente", providerId: "provider-42", erro: null } });
  expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
});

it("does not synthesize or send if history cannot be created", async () => {
  (prisma.comunicacao.create as jest.Mock).mockRejectedValue(new Error("secret database URL"));
  const response = await POST(request());
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain("secret");
  expect(synthesizePortugueseSpeech).not.toHaveBeenCalled();
  expect(sendInfinireachWhatsAppAudio).not.toHaveBeenCalled();
});

it("passes the selected preview voice unchanged to final synthesis", async () => {
  expect((await POST(request({ ...input, voice: "pt-PT-DuarteNeural" }))).status).toBe(200);
  expect(synthesizePortugueseSpeech).toHaveBeenCalledWith(input.mensagem, "pt-PT-DuarteNeural");
  expect(sendInfinireachWhatsAppAudio).toHaveBeenCalledTimes(1);
});

it.each([null, "", "en-US-AriaNeural", "pt-PT-DuarteNeural\r\n", 1])("rejects invalid send voice %j", async (voice) => {
  expect((await POST(request({ ...input, voice }))).status).toBe(400);
  expectNoExpense();
});

it("marks synthesis rejection failed without sending or leaking details", async () => {
  (synthesizePortugueseSpeech as jest.Mock).mockRejectedValue(new Error("secret token"));
  const response = await POST(request());
  expect(response.status).toBe(502);
  expect(JSON.stringify(await response.json())).not.toContain("secret");
  expect(prisma.comunicacao.update).toHaveBeenCalledWith({ where: { id: 42 }, data: expect.objectContaining({ status: "falhou" }) });
  expect(sendInfinireachWhatsAppAudio).not.toHaveBeenCalled();
});

it("marks definite upload/send rejection failed without an automatic retry", async () => {
  (sendInfinireachWhatsAppAudio as jest.Mock).mockResolvedValue({ ok: false, error: "secret provider body" });
  const response = await POST(request());
  expect(response.status).toBe(502);
  expect(JSON.stringify(await response.json())).not.toContain("secret");
  expect(prisma.comunicacao.update).toHaveBeenCalledWith({ where: { id: 42 }, data: expect.objectContaining({ status: "falhou" }) });
  expect(sendInfinireachWhatsAppAudio).toHaveBeenCalledTimes(1);
});

it.each([false, true])("keeps uncertain outcomes pending even if history update fails: %s", async (dbFails) => {
  (sendInfinireachWhatsAppAudio as jest.Mock).mockResolvedValue({ ok: false, uncertain: true, error: "secret" });
  if (dbFails) (prisma.comunicacao.update as jest.Mock).mockRejectedValue(new Error("secret"));
  const response = await POST(request());
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: expect.stringContaining("Nao repita"), uncertain: true, comunicacaoId: 42 });
  expect(prisma.comunicacao.update).toHaveBeenCalledTimes(1);
  expect(prisma.comunicacao.update).toHaveBeenCalledWith({ where: { id: 42 }, data: expect.objectContaining({ status: "pendente", erro: expect.stringContaining("pode ter aceite") }) });
  expect(sendInfinireachWhatsAppAudio).toHaveBeenCalledTimes(1);
});

it("treats thrown provider failures conservatively as uncertain", async () => {
  (sendInfinireachWhatsAppAudio as jest.Mock).mockRejectedValue(new Error("secret network detail"));
  const response = await POST(request());
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ uncertain: true, comunicacaoId: 42 });
  expect(prisma.comunicacao.update).toHaveBeenCalledWith({ where: { id: 42 }, data: expect.objectContaining({ status: "pendente" }) });
});

it("returns accepted success with a no-resend warning if updating history fails", async () => {
  (prisma.comunicacao.update as jest.Mock).mockRejectedValue(new Error("secret database detail"));
  const response = await POST(request({ ...input, responderA: 9 }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, comunicacaoId: 42, providerId: "provider-42", status: "pendente", warning: expect.stringContaining("Nao repita") });
  expect(prisma.comunicacao.update).toHaveBeenCalledTimes(1);
  expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
  expect(sendInfinireachWhatsAppAudio).toHaveBeenCalledTimes(1);
});
