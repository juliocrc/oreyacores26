import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/comunicacoes/infinireach/route";
import prisma from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: { comunicacao: { updateMany: jest.fn(), create: jest.fn() } },
}));

const secret = "synthetic-infinireach-secret";
const payload = {
  event: "whatsapp.message.delivered",
  timestamp: "2026-10-24T10:30:00.000Z",
  data: { messageId: "provider-audio-123", from: "+351912345678", to: "+351923456789", body: "Audio", status: "failed" },
};
const raw = JSON.stringify(payload, null, 2);
const sign = (body: string | Buffer) => createHmac("sha256", secret).update(body).digest("hex");
function request(body = raw, signature: string | null = sign(body), headers = {}) {
  return new NextRequest("https://example.test/api/comunicacoes/infinireach", {
    method: "POST", body,
    headers: { "Content-Type": "application/json", ...(signature === null ? {} : { "X-Webhook-Signature": signature }), ...headers },
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.replaceProperty(process, "env", { NODE_ENV: "test", INFINIREACH_WEBHOOK_SECRET: secret });
  jest.mocked(prisma.comunicacao.updateMany).mockResolvedValue({ count: 1 });
});
afterEach(() => {
  expect(prisma.comunicacao.create).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

it.each([undefined, "", "   "])("fails closed without a configured secret: %s", async (value) => {
  if (value === undefined) delete process.env.INFINIREACH_WEBHOOK_SECRET;
  else process.env.INFINIREACH_WEBHOOK_SECRET = value;
  expect((await POST(request())).status).toBe(503);
  expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
});

it.each([null, "", "bad", "0".repeat(64), "a".repeat(63), "a".repeat(65), "z".repeat(64), "A".repeat(64), `sha256=${"a".repeat(64)}`])(
  "rejects forged or malformed signatures: %s", async (signature) => {
    expect((await POST(request(raw, signature))).status).toBe(403);
    expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
  },
);

it("verifies exact raw bytes, not reserialized JSON", async () => {
  expect((await POST(request(raw + " ", sign(raw)))).status).toBe(403);
  expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
  expect((await POST(request())).status).toBe(200);
  expect(prisma.comunicacao.updateMany).toHaveBeenCalledWith({
    where: { providerId: payload.data.messageId, canal: { in: ["infinireach", "infinireach-audio"] }, tipo: "WHATSAPP", status: { in: ["pendente", "enviado", "entregue"] } },
    data: { status: "entregue", erro: null },
  });
});

it.each([
  ["message.sent", "SMS", "enviado", ["pendente", "enviado"]],
  ["message.delivered", "SMS", "entregue", ["pendente", "enviado", "entregue"]],
  ["message.failed", "SMS", "falhou", ["pendente", "enviado", "falhou"]],
  ["whatsapp.message.sent", "WHATSAPP", "enviado", ["pendente", "enviado"]],
  ["whatsapp.message.delivered", "WHATSAPP", "entregue", ["pendente", "enviado", "entregue"]],
  ["whatsapp.message.read", "WHATSAPP", "lido", ["pendente", "enviado", "entregue", "lido"]],
  ["whatsapp.message.failed", "WHATSAPP", "falhou", ["pendente", "enviado", "falhou"]],
])("maps %s with channel scope and atomic late-event constraints", async (event, tipo, status, allowed) => {
  expect((await POST(request(JSON.stringify({ ...payload, event })))).status).toBe(200);
  expect(prisma.comunicacao.updateMany).toHaveBeenCalledTimes(1);
  expect(prisma.comunicacao.updateMany).toHaveBeenCalledWith({
    where: { providerId: payload.data.messageId, canal: { in: ["infinireach", "infinireach-audio"] }, tipo, status: { in: allowed } },
    data: { status, erro: status === "falhou" ? "Falha no envio via InfiniReach." : null },
  });
});

it.each(["whatsapp.message.inbound", "message.inbound", "whatsapp.message.queued", "device.offline", "message.read", "unknown", "__proto__", "constructor"])(
  "ignores unsupported event %s without touching history", async (event) => {
    const response = await POST(request(JSON.stringify({ event })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: true });
    expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
  },
);

it.each(["{", "null", "[]", "{}", '{"event":123}',
  ...[undefined, null, [], {}, { messageId: 12 }, { messageId: " " }, { messageId: "x".repeat(257) }].map(
    (data) => JSON.stringify({ event: payload.event, data }),
  ),
])("rejects invalid signed input: %s", async (body) => {
  expect((await POST(request(body))).status).toBe(400);
  expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
});

it.each([{}, { "Content-Length": "1" }, { "Content-Length": "65537" }])("bounds body size independently of Content-Length: %j", async (headers) => {
  expect((await POST(request("x".repeat(65537), undefined, headers))).status).toBe(413);
  expect(prisma.comunicacao.updateMany).not.toHaveBeenCalled();
});

it("acknowledges an unknown provider ID without creating a message", async () => {
  jest.mocked(prisma.comunicacao.updateMany).mockResolvedValue({ count: 0 });
  expect((await POST(request())).status).toBe(200);
});

it("returns a generic retryable error without exposing database details", async () => {
  jest.mocked(prisma.comunicacao.updateMany).mockRejectedValue(new Error(secret));
  const response = await POST(request());
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain(secret);
});
