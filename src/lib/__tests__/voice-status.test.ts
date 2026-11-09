import { NextRequest } from "next/server";
import { POST } from "@/app/api/comunicacoes/twilio/route";
import { GET } from "@/app/api/comunicacoes/webrtc-token/route";
import { getAccessContext } from "../access-control";
import { registarComunicacaoRecebida } from "../communications";
import prisma from "../prisma";
import { twilioSignature } from "../twilio";

jest.mock("../access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("../communications", () => ({ registarComunicacaoRecebida: jest.fn() }));
jest.mock("../prisma", () => ({ __esModule: true, default: { comunicacao: { updateMany: jest.fn() } } }));

const url = "https://example.test/api/comunicacoes/twilio?source=voice";
const sid = `CA${"a".repeat(32)}`;
const token = "synthetic-voice-test-token";

function request(params: Record<string, string>, signature = twilioSignature(token, url, params)) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "x-twilio-signature": signature },
    body: new URLSearchParams(params).toString(),
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.replaceProperty(process, "env", { NODE_ENV: "production", TWILIO_AUTH_TOKEN: token });
  jest.mocked(prisma.comunicacao.updateMany).mockResolvedValue({ count: 1 });
});

afterEach(() => jest.restoreAllMocks());

describe("voice status callbacks", () => {
  it.each(["accepted", "queued", "initiated", "ringing", "in-progress"])("keeps %s pending without overwriting terminal states", async (CallStatus) => {
    expect((await POST(request({ CallSid: sid, CallStatus }))).status).toBe(200);
    expect(prisma.comunicacao.updateMany).toHaveBeenCalledWith({
      where: { providerId: sid, tipo: "CHAMADA", canal: "twilio-voice", status: "pendente" },
      data: { status: "pendente", erro: null },
    });
    expect(registarComunicacaoRecebida).not.toHaveBeenCalled();
  });

  it("records completion as sent, not heard or read", async () => {
    expect((await POST(request({ CallSid: sid, CallStatus: "completed" }))).status).toBe(200);
    expect(prisma.comunicacao.updateMany).toHaveBeenCalledWith({
      where: { providerId: sid, tipo: "CHAMADA", canal: "twilio-voice" },
      data: { status: "enviado", erro: null },
    });
  });

  it.each(["failed", "busy", "no-answer", "canceled"])("records %s with a failure reason", async (CallStatus) => {
    expect((await POST(request({ CallSid: sid, CallStatus }))).status).toBe(200);
    expect(prisma.comunicacao.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "falhou", erro: `Twilio voice: ${CallStatus}` },
    }));
  });

  it.each([
    [{ ErrorMessage: "Synthetic provider failure", ErrorCode: "12345" }, "Synthetic provider failure"],
    [{ ErrorCode: "12345" }, "Twilio error 12345"],
  ])("retains provider error detail %j", async (detail, erro) => {
    await POST(request({ CallSid: sid, CallStatus: "failed", ...detail }));
    expect(prisma.comunicacao.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "falhou", erro } }));
  });

  it.each<Record<string, string>>([{ CallSid: sid, CallStatus: "unknown" }, { CallSid: sid }, { CallStatus: "completed" }])("ignores incomplete or unknown voice events %j", async (params) => {
    expect((await POST(request(params))).status).toBe(200);
    expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
  });

  it("fails closed without a token even if production signature-disable is requested", async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    process.env.TWILIO_VALIDATE_SIGNATURE = "false";
    expect((await POST(request({ CallSid: sid, CallStatus: "completed" }))).status).toBe(503);
    expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
  });

  it.each(["", "invalid"])("rejects missing or invalid signature %j", async (signature) => {
    expect((await POST(request({ CallSid: sid, CallStatus: "completed" }, signature))).status).toBe(403);
    expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
  });

  it("rejects tampering with signed voice status", async () => {
    const params = { CallSid: sid, CallStatus: "completed" };
    expect((await POST(request({ ...params, CallStatus: "failed" }, twilioSignature(token, url, params)))).status).toBe(403);
    expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
  });
});

describe("WebRTC tokens", () => {
  it("requires authentication", async () => {
    jest.mocked(getAccessContext).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it.each([false, true])("returns explicit 410 without fabricating tokens (configured=%s)", async (configured) => {
    jest.mocked(getAccessContext).mockResolvedValue({ email: "operator@example.test" } as Awaited<ReturnType<typeof getAccessContext>>);
    if (configured) Object.assign(process.env, {
      TWILIO_ACCOUNT_SID: `AC${"b".repeat(32)}`, TWILIO_API_KEY: "synthetic-key", TWILIO_API_SECRET: "synthetic-secret",
    });
    const response = await GET();
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ code: "VOICE_DISABLED", configured: false });
  });
});
