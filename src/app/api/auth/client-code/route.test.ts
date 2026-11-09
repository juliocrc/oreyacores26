import { NextRequest } from "next/server";
import { POST } from "./route";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEmail, isEmailConfigured } from "@/lib/email-sender";
import { sendTextBeeSms } from "@/lib/textbee-sms";
import { sendWhatsAppSystem } from "@/lib/whatsapp-provider";
import { encontrarClientePorContacto } from "@/lib/communications";

jest.mock("@/lib/prisma", () => ({ __esModule: true, default: {
  cliente: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  pedidoAssistencia: { create: jest.fn(), update: jest.fn() },
} }));
jest.mock("@/lib/rate-limit", () => ({ checkRateLimit: jest.fn() }));
jest.mock("@/lib/code", () => ({ generateFiveDigitCode: () => "54321" }));
jest.mock("@/lib/email-sender", () => ({ sendEmail: jest.fn(), isEmailConfigured: jest.fn() }));
jest.mock("@/lib/textbee-sms", () => ({ sendTextBeeSms: jest.fn() }));
jest.mock("@/lib/whatsapp-provider", () => ({ sendWhatsAppSystem: jest.fn() }));
jest.mock("@/lib/communications", () => ({ encontrarClientePorContacto: jest.fn() }));

const client = { id: 7, nome: "Cliente de teste", serviceStationId: 2, email: "owner@example.com", telmovel: "912345678" };
const request = (body: unknown = { email: client.email }) => POST(new NextRequest("http://localhost/api/auth/client-code", {
  method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
}));

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(checkRateLimit).mockReturnValue({ allowed: true, retryAfterMs: 0 } as never);
  jest.mocked(prisma.cliente.findFirst).mockResolvedValue(client as never);
  jest.mocked(prisma.cliente.findUnique).mockResolvedValue(client as never);
  jest.mocked(encontrarClientePorContacto).mockResolvedValue(client as never);
  jest.mocked(sendEmail).mockResolvedValue({ ok: true } as never);
  jest.mocked(isEmailConfigured).mockReturnValue(true);
  jest.mocked(prisma.pedidoAssistencia.create).mockResolvedValue({ id: 9 } as never);
  jest.mocked(prisma.pedidoAssistencia.update).mockResolvedValue({ id: 9 } as never);
  jest.mocked(sendTextBeeSms).mockResolvedValue({ ok: true } as never);
  jest.mocked(sendWhatsAppSystem).mockResolvedValue({ ok: true } as never);
});

it.each(["email", "sms", "whatsapp"])("issues an expiring code without leaking it in the %s response", async (channel) => {
  const before = Date.now();
  const response = await request({ email: client.email, channel });
  expect(response.status).toBe(200);
  const data = jest.mocked(prisma.cliente.update).mock.calls[0][0].data;
  expect(data.verificationCode).toBe("54321");
  expect((data.verificationCodeExpires as Date).getTime()).toBeGreaterThanOrEqual(before + 3600000);
  expect((data.verificationCodeExpires as Date).getTime()).toBeLessThanOrEqual(Date.now() + 3600000);
  expect(await response.text()).not.toMatch(/54321|verificationCode|clientAccessCode/);
});

it.each(["email", "sms", "whatsapp"])("does not reflect provider errors containing codes for %s", async (channel) => {
  jest.mocked(sendEmail).mockResolvedValue({ ok: false, error: "message 54321" } as never);
  jest.mocked(sendTextBeeSms).mockResolvedValue({ ok: false, error: "message 54321" } as never);
  jest.mocked(sendWhatsAppSystem).mockResolvedValue({ ok: false, erro: "message 54321" } as never);
  const response = await request({ email: client.email, channel });
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("54321");
});

it("does not leak a code through unexpected errors or logs", async () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    jest.mocked(prisma.cliente.update).mockRejectedValue(new Error("verificationCode: 54321"));
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("54321");
    expect(JSON.stringify(log.mock.calls)).not.toContain("54321");
  } finally {
    log.mockRestore();
  }
});

it("limits requests globally before looking up clients", async () => {
  jest.mocked(checkRateLimit).mockReturnValue({ allowed: false, retryAfterMs: 60000 } as never);
  expect((await request()).status).toBe(429);
  expect(prisma.cliente.findFirst).not.toHaveBeenCalled();
  expect(prisma.cliente.update).not.toHaveBeenCalled();
});

it.each(["client-code:global", "client-code:email:owner@example.com", "client-code:id:7"])("returns 503 without issuing codes when %s is unavailable", async (failedKey) => {
  jest.mocked(checkRateLimit).mockImplementation(async (key) => ({ allowed: key !== failedKey, status: key === failedKey ? 503 : 200, retryAfterMs: 0 }) as never);
  expect((await request()).status).toBe(503);
  expect(prisma.cliente.update).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
});

it("normalizes phone formatting and limits all identifiers of the same client", async () => {
  jest.mocked(checkRateLimit).mockImplementation((key) => ({ allowed: key !== "client-code:id:7", retryAfterMs: 60000 }) as never);
  expect((await request({ phone: "+351 912-345-678" })).status).toBe(429);
  expect(checkRateLimit).toHaveBeenCalledWith("client-code:phone:351912345678", 3, 600000);
  expect(prisma.cliente.update).not.toHaveBeenCalled();
});

it("does not issue codes to NIF-only requests", async () => {
  expect((await request({ nif: "123456789", clientAccessCode: "54321" })).status).toBe(400);
  expect(prisma.cliente.update).not.toHaveBeenCalled();
});

it("records a station-scoped assistance request before delivery without storing the code in the request", async () => {
  const response = await request();
  expect(response.status).toBe(200);
  expect(prisma.pedidoAssistencia.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    nome: client.nome, serviceStationId: 2, origem: "portal_acesso", estado: "novo",
    tipoAssistencia: "Acesso ao portal do cliente",
    descricao: expect.stringContaining("ainda nao foi autenticado"),
  }) });
  const data = jest.mocked(prisma.pedidoAssistencia.update).mock.calls[0][0].data;
  expect(JSON.parse(String(data.metadados))).toEqual({ clienteId: 7, canalPedido: "email", estadoEnvio: "enviado" });
  expect(JSON.stringify(jest.mocked(prisma.pedidoAssistencia.create).mock.calls)).not.toContain("54321");
  expect(JSON.stringify(jest.mocked(prisma.pedidoAssistencia.update).mock.calls)).not.toContain("54321");
  expect(await response.json()).toMatchObject({ success: true, assistanceRequested: true });
  expect(jest.mocked(prisma.pedidoAssistencia.create).mock.invocationCallOrder[0])
    .toBeLessThan(jest.mocked(sendEmail).mock.invocationCallOrder[0]);
});

it("records unavailable email for manual support without replacing an existing access code", async () => {
  jest.mocked(isEmailConfigured).mockReturnValue(false);
  const response = await request();
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ assistanceRequested: true, message: expect.stringContaining("Pedidos de Assistencia") });
  expect(prisma.cliente.update).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
  expect(prisma.pedidoAssistencia.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    descricao: expect.stringContaining("email nao configurado"),
  }) }));
});

it.each([
  [{ ok: false, closed: true }, "fora_horario", 409],
  [{ ok: false, uncertain: true }, "pendente", 409],
  [{ ok: false, erro: "provider secret 54321" }, "falhou", 500],
])("keeps an assistance message for failed WhatsApp delivery", async (result, status, http) => {
  jest.mocked(sendWhatsAppSystem).mockResolvedValue(result as never);
  const response = await request({ phone: client.telmovel, channel: "whatsapp" });
  expect(response.status).toBe(http);
  const body = await response.json();
  expect(body).toMatchObject({ assistanceRequested: true, status });
  expect(JSON.stringify(body)).not.toContain("54321");
  expect(JSON.stringify(jest.mocked(prisma.pedidoAssistencia.update).mock.calls)).not.toContain("54321");
});

it("does not create assistance for unknown or throttled contacts", async () => {
  jest.mocked(prisma.cliente.findFirst).mockResolvedValue(null);
  expect((await request()).status).toBe(404);
  expect(prisma.pedidoAssistencia.create).not.toHaveBeenCalled();
  jest.mocked(checkRateLimit).mockReturnValue({ allowed: false, retryAfterMs: 60000 } as never);
  expect((await request()).status).toBe(429);
  expect(prisma.pedidoAssistencia.create).not.toHaveBeenCalled();
});

it("uses a phone as identification but emails the code only to the existing client email", async () => {
  const response = await request({ phone: client.telmovel });
  expect(response.status).toBe(200);
  expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: client.email }));
  expect(sendWhatsAppSystem).not.toHaveBeenCalled();
  expect(sendTextBeeSms).not.toHaveBeenCalled();
});

it("assigns clients without email to the team without generating or sending a code", async () => {
  jest.mocked(prisma.cliente.findUnique).mockResolvedValue({ ...client, email: null } as never);
  const response = await request({ phone: client.telmovel });
  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({ success: false, manualDelivery: true, assistanceRequested: true });
  expect(prisma.cliente.update).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
  expect(sendWhatsAppSystem).not.toHaveBeenCalled();
  expect(prisma.pedidoAssistencia.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    descricao: expect.stringContaining("comunica-lo diretamente ao cliente"),
  }) }));
});
