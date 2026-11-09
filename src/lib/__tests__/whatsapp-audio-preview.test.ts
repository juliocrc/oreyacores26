import { NextRequest } from "next/server";
import { POST } from "@/app/api/comunicacoes/whatsapp-audio/preview/route";
import { getAccessContext } from "../access-control";
import { isWhatsAppAllowed } from "../whatsapp-provider";
import { checkRateLimit } from "../rate-limit";
import { isSpeechConfigured, synthesizePortugueseSpeech } from "../speech-synthesis";
import { sendInfinireachWhatsAppAudio } from "../infinireach-sms";
import prisma from "../prisma";

jest.mock("../access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("../whatsapp-provider", () => ({ isWhatsAppAllowed: jest.fn() }));
jest.mock("../rate-limit", () => ({ checkRateLimit: jest.fn() }));
jest.mock("../speech-synthesis", () => ({ isSpeechConfigured: jest.fn(), synthesizePortugueseSpeech: jest.fn() }));
jest.mock("../infinireach-sms", () => ({ sendInfinireachWhatsAppAudio: jest.fn() }));
jest.mock("../prisma", () => ({ __esModule: true, default: { comunicacao: { create: jest.fn(), update: jest.fn() } } }));

const input = { mensagem: "Mensagem para ouvir antes de enviar.", voice: "pt-PT-DuarteNeural" };
const request = (body: unknown = input) => new NextRequest("http://localhost/api/comunicacoes/whatsapp-audio/preview", {
  method: "POST", body: JSON.stringify(body),
});
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAccessContext).mockResolvedValue({ userId: 7 } as never);
  jest.mocked(isWhatsAppAllowed).mockResolvedValue(true);
  jest.mocked(isSpeechConfigured).mockReturnValue(true);
  jest.mocked(checkRateLimit).mockResolvedValue({ success: true, allowed: true, remaining: 4, retryAfterMs: 0, status: 200 });
  jest.mocked(synthesizePortugueseSpeech).mockResolvedValue(Buffer.from("mp3"));
});
afterEach(() => {
  expect(sendInfinireachWhatsAppAudio).not.toHaveBeenCalled();
  expect(prisma.comunicacao.create).not.toHaveBeenCalled();
  expect(prisma.comunicacao.update).not.toHaveBeenCalled();
});
it("generates only bounded, non-cacheable MP3 using the selected voice", async () => {
  const req = request();
  const res = await POST(req);
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
  expect(res.headers.get("Cache-Control")).toContain("no-store");
  expect(await res.text()).toBe("mp3");
  expect(synthesizePortugueseSpeech).toHaveBeenCalledWith(input.mensagem, input.voice, req.signal);
});
it("requires authentication", async () => {
  jest.mocked(getAccessContext).mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  expect(isWhatsAppAllowed).not.toHaveBeenCalled();
  expect(synthesizePortugueseSpeech).not.toHaveBeenCalled();
});
it("preserves WhatsApp email restrictions", async () => {
  jest.mocked(isWhatsAppAllowed).mockResolvedValue(false);
  expect((await POST(request())).status).toBe(403);
  expect(synthesizePortugueseSpeech).not.toHaveBeenCalled();
});
it.each([null, [], {}, { ...input, voice: "en-US-AriaNeural" }, { ...input, voice: null },
  { ...input, mensagem: "short" }, { ...input, mensagem: "x".repeat(1501) },
  { ...input, mensagem: "invalid\ud800 text" }, { ...input, confirmed: true }, { ...input, destinatario: "+351912345678" },
])("rejects invalid preview %j", async (body) => {
  expect((await POST(request(body))).status).toBe(400);
  expect(synthesizePortugueseSpeech).not.toHaveBeenCalled();
});
it("rate limits before synthesis", async () => {
  jest.mocked(checkRateLimit).mockResolvedValue({ success: false, allowed: false, remaining: 0, retryAfterMs: 4500, status: 429 });
  const res = await POST(request());
  expect(res.status).toBe(429);
  expect(res.headers.get("Retry-After")).toBe("5");
  expect(checkRateLimit).toHaveBeenCalledWith("whatsapp-audio-preview:7", 5, 60000);
  expect(synthesizePortugueseSpeech).not.toHaveBeenCalled();
});
it("bounds actual body bytes", async () => {
  expect((await POST(request({ mensagem: "x".repeat(17000) }))).status).toBe(413);
  expect(synthesizePortugueseSpeech).not.toHaveBeenCalled();
});
it("returns 503 before synthesis on limiter backend failure", async () => {
  jest.mocked(checkRateLimit).mockResolvedValue({ success: false, allowed: false, remaining: 0, retryAfterMs: 0, status: 503 });
  const res = await POST(request());
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({
    code: "AUDIO_RATE_LIMIT_UNAVAILABLE", error: expect.stringContaining("configuracao do limitador"),
  });
  expect(synthesizePortugueseSpeech).not.toHaveBeenCalled();
});
it.each([false, true])("uses the real limiter: preview works only with valid configuration (%s)", async (configured) => {
  const env = { ...process.env };
  try {
    delete process.env.RATE_LIMIT_BACKEND;
    delete process.env.RATE_LIMIT_NAMESPACE;
    delete process.env.RATE_LIMIT_KEY_SECRET;
    delete process.env.VERCEL_ENV;
    if (configured) {
      process.env.RATE_LIMIT_BACKEND = "local";
      process.env.RATE_LIMIT_NAMESPACE = "audio-preview-regression";
      process.env.RATE_LIMIT_KEY_SECRET = "test-only-key-not-a-production-secret";
    }
    jest.mocked(checkRateLimit).mockImplementation(jest.requireActual("../rate-limit").checkRateLimit);
    const res = await POST(request());
    expect(res.status).toBe(configured ? 200 : 503);
    if (configured) {
      expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
      expect(synthesizePortugueseSpeech).toHaveBeenCalledTimes(1);
    } else {
      expect(await res.json()).toMatchObject({ code: "AUDIO_RATE_LIMIT_UNAVAILABLE" });
      expect(synthesizePortugueseSpeech).not.toHaveBeenCalled();
    }
  } finally {
    process.env = env;
  }
});
it("does not leak synthesis errors", async () => {
  jest.mocked(synthesizePortugueseSpeech).mockRejectedValue(new Error("secret"));
  const res = await POST(request());
  expect(res.status).toBe(502);
  expect(await res.text()).not.toContain("secret");
});
it.each([0, 10 * 1024 * 1024 + 1])("rejects invalid audio size %s", async (size) => {
  jest.mocked(synthesizePortugueseSpeech).mockResolvedValue(Buffer.alloc(size));
  expect((await POST(request())).status).toBe(502);
});
