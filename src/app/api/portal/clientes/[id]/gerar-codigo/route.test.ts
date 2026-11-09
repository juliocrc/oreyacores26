import { POST } from "./route";
import { getAuthSession } from "@/auth";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { isEmailConfigured, sendEmail } from "@/lib/email-sender";
import { sendWhatsAppSystem, whatsappApiConfigurado } from "@/lib/whatsapp-provider";
import { isOpenwaSelected } from "@/lib/openwa";
import { openwaBusinessHours } from "@/lib/business-hours";
import { PORTAL_ACCESS_CODE_TTL_MS } from "@/lib/portal-access-code";

jest.mock("@/lib/email-sender", () => ({ isEmailConfigured: jest.fn(), sendEmail: jest.fn() }));
jest.mock("@/lib/whatsapp-provider", () => ({ sendWhatsAppSystem: jest.fn(), whatsappApiConfigurado: jest.fn() }));
jest.mock("@/lib/openwa", () => ({ isOpenwaSelected: jest.fn() }));
jest.mock("@/lib/business-hours", () => ({ openwaBusinessHours: jest.fn(), OPENWA_HOURS: "business hours" }));
jest.mock("@/lib/textbee-sms", () => ({ normalizeE164: (value: string) => value === "912345678" ? "+351912345678" : null }));

jest.mock("@/auth", () => ({ getAuthSession: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: {
  cliente: { findUnique: jest.fn(), update: jest.fn() },
} }));
jest.mock("@/lib/rate-limit", () => ({ checkRateLimit: jest.fn() }));
jest.mock("@/lib/code", () => ({ generateFiveDigitCode: () => "54321" }));

const request = (body?: unknown) => POST(new Request("http://localhost", { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), { params: Promise.resolve({ id: "7" }) });

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: "1", role: "ADMIN", email: " JULIO.CORREIA@OREY.COM " } } as never);
  jest.mocked(checkRateLimit).mockReturnValue({ allowed: true } as never);
  jest.mocked(prisma.cliente.findUnique).mockResolvedValue({ id: 7, email: "client@example.com", telmovel: "912345678" } as never);
  jest.mocked(isEmailConfigured).mockReturnValue(true);
  jest.mocked(whatsappApiConfigurado).mockReturnValue(true);
  jest.mocked(sendEmail).mockResolvedValue({ ok: true });
  jest.mocked(sendWhatsAppSystem).mockResolvedValue({ ok: true, accepted: true });
  jest.mocked(openwaBusinessHours).mockReturnValue({ open: true } as never);
});

it.each([null, { user: { id: "2", role: "CLIENTE" } }, { user: { id: "3", role: "USER" } }])("does not disclose or issue codes to non-admins: %j", async (session) => {
  jest.mocked(getAuthSession).mockResolvedValue(session as never);
  const response = await request();
  expect(response.status).toBe(403);
  expect(await response.text()).not.toContain("54321");
  expect(prisma.cliente.update).not.toHaveBeenCalled();
});

it("issues only expiring codes to admins with a non-cacheable response", async () => {
  const before = Date.now();
  const response = await request();
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(PORTAL_ACCESS_CODE_TTL_MS).toBe(24 * 60 * 60 * 1000);
  expect(new Date(body.expiresAt).getTime()).toBeGreaterThanOrEqual(before + PORTAL_ACCESS_CODE_TTL_MS);
  expect(new Date(body.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + PORTAL_ACCESS_CODE_TTL_MS);
  expect(prisma.cliente.update).toHaveBeenCalledWith({
    where: { id: 7 }, data: { verificationCode: "54321", verificationCodeExpires: new Date(body.expiresAt) },
  });
});

it("sends via the global email sender only to the saved contact", async () => {
  const response = await request({ channel: "email" });
  expect(response.status).toBe(200);
  expect(sendEmail).toHaveBeenCalledWith({ to: "client@example.com", subject: expect.any(String), text: expect.stringContaining("54321") });
  expect(await response.text()).not.toContain("54321");
  expect(sendWhatsAppSystem).not.toHaveBeenCalled();
});

it.each([{ channel: "sms" }, { channel: "email", to: "evil@example.com" }, { from: "evil@example.com" }, []])("rejects arbitrary send parameters: %j", async (body) => {
  const response = await request(body);
  expect(response.status).toBe(400);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(prisma.cliente.update).not.toHaveBeenCalled();
});

it("requires both ADMIN and the allowed authenticated email for WhatsApp", async () => {
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: "1", role: "ADMIN", email: "other@orey.com" } } as never);
  expect((await request({ channel: "whatsapp" })).status).toBe(403);
  expect(prisma.cliente.update).not.toHaveBeenCalled();
  expect(sendWhatsAppSystem).not.toHaveBeenCalled();
});

it.each(["email", "whatsapp"])("checks %s config before allocating a code", async (channel) => {
  jest.mocked(isEmailConfigured).mockReturnValue(false);
  jest.mocked(whatsappApiConfigurado).mockReturnValue(false);
  expect((await request({ channel })).status).toBe(503);
  expect(prisma.cliente.update).not.toHaveBeenCalled();
});

it.each(["email", "whatsapp"])("checks %s contact before allocating a code", async (channel) => {
  jest.mocked(prisma.cliente.findUnique).mockResolvedValue({ id: 7 } as never);
  expect((await request({ channel })).status).toBe(400);
  expect(prisma.cliente.update).not.toHaveBeenCalled();
});

it("does not allocate or send outside OpenWA business hours", async () => {
  jest.mocked(isOpenwaSelected).mockReturnValue(true);
  jest.mocked(openwaBusinessHours).mockReturnValue({ open: false } as never);
  expect((await request({ channel: "whatsapp" })).status).toBe(409);
  expect(prisma.cliente.update).not.toHaveBeenCalled();
  expect(sendWhatsAppSystem).not.toHaveBeenCalled();
});

it.each(["email", "whatsapp"])("reuses an existing valid code for %s without extending it", async (channel) => {
  const expiresAt = new Date(Date.now() + 60000);
  jest.mocked(prisma.cliente.findUnique).mockResolvedValue({ id: 7, email: "client@example.com", telmovel: "912345678", verificationCode: "12345", verificationCodeExpires: expiresAt } as never);
  const response = await request({ channel });
  expect(response.status).toBe(200);
  expect((await response.json()).expiresAt).toBe(expiresAt.toISOString());
  expect(prisma.cliente.update).not.toHaveBeenCalled();
  if (channel === "email") expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("12345") }));
  else expect(sendWhatsAppSystem).toHaveBeenCalledWith("+351912345678", expect.stringContaining("12345"));
});

it.each([null, new Date(Date.now() - 1000)])("replaces consumed or expired codes: %j", async (expiry) => {
  jest.mocked(prisma.cliente.findUnique).mockResolvedValue({ id: 7, email: "client@example.com", verificationCode: expiry ? "12345" : null, verificationCodeExpires: expiry } as never);
  expect((await request({ channel: "email" })).status).toBe(200);
  expect(prisma.cliente.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ verificationCode: "54321" }) }));
});

it("reports accepted WhatsApp as pending, not delivered", async () => {
  const response = await request({ channel: "whatsapp" });
  expect(await response.json()).toMatchObject({ success: true, status: "pendente", target: "+351912345678" });
  expect(sendWhatsAppSystem).toHaveBeenCalledTimes(1);
});

it("does not retry or fall back after an uncertain WhatsApp result", async () => {
  jest.mocked(sendWhatsAppSystem).mockResolvedValue({ ok: false, uncertain: true });
  const response = await request({ channel: "whatsapp" });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ uncertain: true, status: "pendente" });
  expect(sendWhatsAppSystem).toHaveBeenCalledTimes(1);
  expect(sendEmail).not.toHaveBeenCalled();
});

it("shares the per-client issuance limit with the public endpoint", async () => {
  jest.mocked(checkRateLimit).mockImplementation((key) => ({ allowed: key !== "client-code:id:7" }) as never);
  expect((await request()).status).toBe(429);
  expect(prisma.cliente.update).not.toHaveBeenCalled();
});

it("keeps both rate-limit windows at ten minutes", async () => {
  await request({ channel: "email" });
  expect(checkRateLimit).toHaveBeenCalledWith("client-code:admin:1", 20, 600000);
  expect(checkRateLimit).toHaveBeenCalledWith("client-code:id:7", 3, 600000);
});

it.each(["email", "whatsapp"])("does not let non-admins send via %s even with the allowed email", async (channel) => {
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: "1", role: "USER", email: "julio.correia@orey.com" } } as never);
  expect((await request({ channel })).status).toBe(403);
  expect(prisma.cliente.update).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
  expect(sendWhatsAppSystem).not.toHaveBeenCalled();
});

it("does not expose or log codes in unexpected send errors", async () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    jest.mocked(sendEmail).mockRejectedValue(new Error("OTP 54321"));
    const response = await request({ channel: "email" });
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).not.toContain("54321");
    expect(log).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  } finally { log.mockRestore(); }
});

it.each(["client-code:admin:1", "client-code:id:7"])("returns 503 without issuing codes when %s is unavailable", async (failedKey) => {
  jest.mocked(checkRateLimit).mockImplementation(async (key) => ({ allowed: key !== failedKey, status: key === failedKey ? 503 : 200 }) as never);
  expect((await request()).status).toBe(503);
  expect(prisma.cliente.update).not.toHaveBeenCalled();
});
