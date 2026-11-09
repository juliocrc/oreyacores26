import { createHmac } from "crypto";
import { NextRequest } from "next/server";
import { POST as twilio } from "@/app/api/comunicacoes/twilio/route";
import { POST as inbound } from "@/app/api/comunicacoes/inbound/route";
import { GET as verifyMeta, POST as meta } from "@/app/api/whatsapp/webhook/route";
import { registarComunicacaoRecebida } from "@/lib/communications";
import prisma from "@/lib/prisma";

jest.mock("@/lib/communications", () => ({ registarComunicacaoRecebida: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: { comunicacao: { updateMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() } },
}));

const twilioUrl = "https://example.test/api/comunicacoes/twilio";
const params = { Body: "Hello", From: "+351912345678", MessageSid: "SMtest", MessageStatus: "delivered" };
const metaBody = JSON.stringify({
  entry: [{ changes: [{ value: {
    statuses: [{ id: "wamid.test", status: "delivered" }],
    messages: [{ from: "351912345678", id: "wamid.in", text: { body: "Hello" } }],
  } }] }],
});

function twilioRequest(signature?: string, body = params) {
  return new NextRequest(twilioUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...(signature ? { "x-twilio-signature": signature } : {}) },
    body: new URLSearchParams(body).toString(),
  });
}

function metaRequest(signature?: string, body = metaBody) {
  return new NextRequest("https://example.test/api/whatsapp/webhook", {
    method: "POST", body,
    headers: signature ? { "x-hub-signature-256": signature } : {},
  });
}

function inboundRequest(secret?: string) {
  return new NextRequest("https://example.test/api/comunicacoes/inbound", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(secret ? { "x-inbound-secret": secret } : {}) },
    body: JSON.stringify({ tipo: "SMS", mensagem: "Hello", remetente: "+351912345678" }),
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  // Use only synthetic configuration; never load local environment files.
  jest.replaceProperty(process, "env", { NODE_ENV: "production" });
  jest.mocked(registarComunicacaoRecebida).mockResolvedValue({ ok: true, comunicacaoId: 1 });
  jest.mocked(prisma.comunicacao.updateMany).mockResolvedValue({ count: 1 });
  jest.mocked(prisma.comunicacao.findFirst).mockResolvedValue({ id: 1, status: "enviado" } as never);
  jest.mocked(prisma.comunicacao.update).mockResolvedValue({} as never);
});

afterEach(() => jest.restoreAllMocks());

function expectNoSideEffects() {
  expect(registarComunicacaoRecebida).not.toHaveBeenCalled();
  expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
  expect(prisma.comunicacao.findFirst).not.toHaveBeenCalled();
  expect(prisma.comunicacao.update).not.toHaveBeenCalled();
}

describe("Twilio webhook authentication", () => {
  it.each([undefined, "false"])("fails closed without a token (disable=%s)", async (disable) => {
    if (disable) process.env.TWILIO_VALIDATE_SIGNATURE = disable;
    expect((await twilio(twilioRequest())).status).toBe(503);
    expectNoSideEffects();
  });

  it.each(["production", "test", "development", ""])("rejects unsigned requests by default in %s", async (environment) => {
    Object.assign(process.env, { NODE_ENV: environment });
    process.env.TWILIO_AUTH_TOKEN = "test-twilio-token";
    expect((await twilio(twilioRequest())).status).toBe(403);
    expectNoSideEffects();
  });

  it.each(["production", "test", ""])("does not allow signature-disable in %s", async (environment) => {
    Object.assign(process.env, { NODE_ENV: environment });
    process.env.TWILIO_AUTH_TOKEN = "test-twilio-token";
    process.env.TWILIO_VALIDATE_SIGNATURE = "false";
    expect((await twilio(twilioRequest("invalid"))).status).toBe(403);
    expectNoSideEffects();
  });

  it("preserves explicit local development signature-disable", async () => {
    jest.replaceProperty(process, "env", { ...process.env, NODE_ENV: "development" });
    process.env.TWILIO_VALIDATE_SIGNATURE = "false";
    expect((await twilio(twilioRequest())).status).toBe(200);
    expect(registarComunicacaoRecebida).toHaveBeenCalledTimes(1);
  });

  it("accepts signed callbacks and rejects tampered parameters", async () => {
    process.env.TWILIO_AUTH_TOKEN = "test-twilio-token";
    const payload = Object.keys(params).sort().reduce((value, key) => value + key + params[key as keyof typeof params], twilioUrl);
    const signature = createHmac("sha1", "test-twilio-token").update(payload).digest("base64");
    expect((await twilio(twilioRequest(signature, { ...params, Body: "Tampered" }))).status).toBe(403);
    expectNoSideEffects();
    const response = await twilio(twilioRequest(signature));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<Response></Response>");
    expect(prisma.comunicacao.updateMany).toHaveBeenCalledTimes(1);
    expect(registarComunicacaoRecebida).toHaveBeenCalledTimes(1);
  });
});

describe("generic inbound authentication", () => {
  it.each([undefined, "", "   "])("returns 503 when the secret is absent: %s", async (secret) => {
    if (secret !== undefined) process.env.COMUNICACOES_INBOUND_SECRET = secret;
    expect((await inbound(inboundRequest())).status).toBe(503);
    expectNoSideEffects();
  });

  it.each([undefined, "wrong"])("rejects missing or incorrect credentials: %s", async (secret) => {
    process.env.COMUNICACOES_INBOUND_SECRET = "test-inbound-secret";
    expect((await inbound(inboundRequest(secret))).status).toBe(403);
    expectNoSideEffects();
  });

  it("accepts the configured secret", async () => {
    process.env.COMUNICACOES_INBOUND_SECRET = "test-inbound-secret";
    expect((await inbound(inboundRequest("test-inbound-secret"))).status).toBe(200);
    expect(registarComunicacaoRecebida).toHaveBeenCalledTimes(1);
  });
});

describe("Meta webhook authentication", () => {
  it.each([undefined, "", "   "])("returns 503 without an app secret: %s", async (secret) => {
    if (secret !== undefined) process.env.WHATSAPP_APP_SECRET = secret;
    expect((await meta(metaRequest())).status).toBe(503);
    expectNoSideEffects();
  });

  it.each([undefined, "sha256=x", `sha256=${"0".repeat(64)}`, `sha256=${"0".repeat(65)}`, `sha256=${"é".repeat(64)}`])(
    "rejects missing, invalid or malformed signatures without throwing: %s", async (signature) => {
      process.env.WHATSAPP_APP_SECRET = "test-meta-secret";
      expect((await meta(metaRequest(signature))).status).toBe(403);
      expectNoSideEffects();
    },
  );

  it("accepts a signed payload and rejects tampered content", async () => {
    process.env.WHATSAPP_APP_SECRET = "test-meta-secret";
    const signature = `sha256=${createHmac("sha256", "test-meta-secret").update(metaBody).digest("hex")}`;
    expect((await meta(metaRequest(signature, metaBody + " "))).status).toBe(403);
    expectNoSideEffects();
    expect((await meta(metaRequest(signature))).status).toBe(200);
    expect(prisma.comunicacao.update).toHaveBeenCalledTimes(1);
    expect(registarComunicacaoRecebida).toHaveBeenCalledTimes(1);
  });

  it("requires a configured verification token rather than the old fallback", async () => {
    const url = "https://example.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=oreyazores26&hub.challenge=challenge";
    expect((await verifyMeta(new NextRequest(url))).status).toBe(503);
    process.env.WHATSAPP_VERIFY_TOKEN = "test-verify-token";
    expect((await verifyMeta(new NextRequest(url))).status).toBe(403);
    const response = await verifyMeta(new NextRequest(url.replace("oreyazores26", "test-verify-token")));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("challenge");
    expectNoSideEffects();
  });
});
