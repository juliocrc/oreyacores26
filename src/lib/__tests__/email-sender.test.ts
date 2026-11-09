import nodemailer from "nodemailer";
import { getEmailSenderAccounts, isEmailConfigured, isEmailSenderAccount, sendEmail, type EmailSenderAccount } from "../email-sender";

jest.mock("nodemailer", () => ({ __esModule: true, default: { createTransport: jest.fn() } }));

const originalEnv = { ...process.env };
const originalFetch = global.fetch;
const fetchMock = jest.fn();
const sendMail = jest.fn();
const close = jest.fn();
const tenantId = "11111111-1111-1111-1111-111111111111";
const clientId = "22222222-2222-2222-2222-222222222222";
const message = { to: "recipient@example.com", subject: "Test" };
const tokenResponse = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

beforeEach(() => {
  jest.resetAllMocks();
  process.env = { ...originalEnv };
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("M365_") || key.startsWith("SMTP_")) Reflect.deleteProperty(process.env, key);
  }
  Object.assign(process.env, {
    M365_TENANT_ID: tenantId, M365_CLIENT_ID: clientId, M365_CLIENT_SECRET: "private-client-secret",
    M365_JULIO_REFRESH_TOKEN: "private-julio-refresh", M365_TECNICA_REFRESH_TOKEN: "private-tecnica-refresh",
    SMTP_HOST: "legacy.example.com", SMTP_USER: "legacy@example.com", SMTP_PASS: "legacy-password",
    SMTP_FROM: "Legacy <legacy@example.com>",
  });
  global.fetch = fetchMock;
  fetchMock.mockResolvedValue(tokenResponse({ access_token: "private-access-token", token_type: "Bearer" }));
  jest.mocked(nodemailer.createTransport).mockReturnValue({ sendMail, close } as unknown as nodemailer.Transporter);
  sendMail.mockResolvedValue({ messageId: "test" });
});

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it("returns only safe fixed metadata, with per-profile configuration status and no provider calls", () => {
  delete process.env.M365_TECNICA_REFRESH_TOKEN;
  expect(getEmailSenderAccounts()).toEqual([
    { id: "julio", email: "julio.correia@orey.com", label: "Julio Correia", configured: true },
    { id: "tecnica", email: "azores.tecnica@orey.com", label: "Orey Tecnica Acores", configured: false },
  ]);
  expect(isEmailConfigured()).toBe(true);
  expect(isEmailConfigured("tecnica")).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("requires STARTTLS and bounded SMTP waits for the Gmail code sender", async () => {
  process.env.SMTP_HOST = "smtp.gmail.com";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_USER = "sender@example.test";
  process.env.SMTP_SECURE = "false";
  expect(await sendEmail(message)).toEqual({ ok: true });
  expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
    host: "smtp.gmail.com", port: 587, secure: false, requireTLS: true,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  }));
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each(["julio", "tecnica"] as const)("sends %s with delegated OAuth2, fixed identity and mandatory STARTTLS", async (senderAccount) => {
  const address = senderAccount === "julio" ? "julio.correia@orey.com" : "azores.tecnica@orey.com";
  const attachments = [{ filename: "test.txt", content: "hello", contentType: "text/plain" }];
  expect(await sendEmail({ ...message, senderAccount, text: "hello", html: "<p>hello</p>", attachments })).toEqual({ ok: true });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, request] = fetchMock.mock.calls[0];
  expect(url).toBe(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`);
  expect(request).toMatchObject({ method: "POST", redirect: "error", cache: "no-store", signal: expect.any(AbortSignal) });
  expect(Object.fromEntries(request.body)).toEqual({
    grant_type: "refresh_token", client_id: clientId, client_secret: "private-client-secret",
    refresh_token: `private-${senderAccount}-refresh`, scope: "https://outlook.office.com/SMTP.Send",
  });
  expect(nodemailer.createTransport).toHaveBeenCalledWith({
    host: "smtp.office365.com", port: 587, secure: false, requireTLS: true,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000,
    logger: false, debug: false,
    auth: { type: "OAuth2", user: address, accessToken: "private-access-token" },
  });
  expect(sendMail).toHaveBeenCalledWith({ ...message, from: address, text: "hello", html: "<p>hello</p>", attachments });
  expect(close).toHaveBeenCalled();
});

it("supports per-profile application overrides without changing the other profile", async () => {
  process.env.M365_JULIO_CLIENT_ID = "33333333-3333-3333-3333-333333333333";
  process.env.M365_JULIO_CLIENT_SECRET = "julio-client-secret";
  process.env.M365_JULIO_TENANT_ID = "44444444-4444-4444-4444-444444444444";
  expect(await sendEmail({ ...message, senderAccount: "julio" })).toEqual({ ok: true });
  expect(fetchMock.mock.calls[0][0]).toContain(process.env.M365_JULIO_TENANT_ID);
  expect(fetchMock.mock.calls[0][1].body.get("client_secret")).toBe("julio-client-secret");
  expect(isEmailConfigured("tecnica")).toBe(true);
});

it.each([null, "", "__proto__", "constructor", "other", "julio.correia@orey.com", {}, 1])("rejects runtime invalid selection %p without fallback", async (value) => {
  expect(isEmailSenderAccount(value)).toBe(false);
  expect(isEmailConfigured(value as EmailSenderAccount)).toBe(false);
  expect(await sendEmail({ ...message, senderAccount: value as EmailSenderAccount })).toMatchObject({ ok: false });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(nodemailer.createTransport).not.toHaveBeenCalled();
});

it.each(["M365_TENANT_ID", "M365_CLIENT_ID", "M365_CLIENT_SECRET", "M365_JULIO_REFRESH_TOKEN"])("does not use legacy/other credentials when %s is missing", async (key) => {
  Reflect.deleteProperty(process.env, key);
  expect(isEmailConfigured("julio")).toBe(false);
  expect(await sendEmail({ ...message, senderAccount: "julio" })).toMatchObject({ ok: false });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(nodemailer.createTransport).not.toHaveBeenCalled();
});

it.each(["https://evil.test", "../common", "common", `${tenantId}/../../evil`, ""])("rejects invalid tenant override %p before sending credentials", async (tenant) => {
  process.env.M365_JULIO_TENANT_ID = tenant;
  expect(await sendEmail({ ...message, senderAccount: "julio" })).toMatchObject({ ok: false });
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([
  { error_description: "private-refresh-token" },
  { access_token: "", token_type: "Bearer" },
  { access_token: "private-access-token", token_type: "Basic" },
  null,
])("rejects malformed OAuth response without sending SMTP or exposing it", async (data) => {
  fetchMock.mockResolvedValue(tokenResponse(data));
  const result = await sendEmail({ ...message, senderAccount: "julio" });
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).not.toContain("private");
  expect(nodemailer.createTransport).not.toHaveBeenCalled();
});

it.each(["http", "network", "smtp", "json"])("sanitizes %s failure without logging secrets or fallback", async (failure) => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  const secretError = new Error("private-client-secret private-access-token private-julio-refresh");
  if (failure === "http") fetchMock.mockResolvedValue(tokenResponse({ error_description: secretError.message }, 401));
  if (failure === "network") fetchMock.mockRejectedValue(secretError);
  if (failure === "smtp") sendMail.mockRejectedValue(secretError);
  if (failure === "json") fetchMock.mockResolvedValue({ ok: true, json: async () => { throw secretError; } });
  const result = await sendEmail({ ...message, senderAccount: "julio" });
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).not.toContain("private");
  expect(log).not.toHaveBeenCalled();
  expect(nodemailer.createTransport).toHaveBeenCalledTimes(failure === "smtp" ? 1 : 0);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("aborts a stalled token exchange at ten seconds", async () => {
  jest.useFakeTimers();
  jest.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  });
  fetchMock.mockImplementation((_, options) => new Promise((_, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
  }));
  const pending = sendEmail({ ...message, senderAccount: "julio" });
  await jest.advanceTimersByTimeAsync(10_000);
  expect(await pending).toMatchObject({ ok: false });
  expect(nodemailer.createTransport).not.toHaveBeenCalled();
});

it("closes stalled SMTP at the overall deadline and never retries", async () => {
  jest.useFakeTimers();
  sendMail.mockImplementation(() => new Promise(() => {}));
  const pending = sendEmail({ ...message, senderAccount: "tecnica" });
  await jest.advanceTimersByTimeAsync(30_000);
  expect(await pending).toMatchObject({ ok: false });
  expect(close).toHaveBeenCalled();
  expect(sendMail).toHaveBeenCalledTimes(1);
});

it("preserves unselected global SMTP behavior even when profiles are configured", async () => {
  expect(await sendEmail(message)).toEqual({ ok: true });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(nodemailer.createTransport).toHaveBeenCalledWith({
    host: "legacy.example.com", port: 587, secure: false,
    auth: { user: "legacy@example.com", pass: "legacy-password" },
  });
  expect(sendMail.mock.calls[0][0].from).toBe("Legacy <legacy@example.com>");
});

it("does not automatically choose a profile when legacy SMTP is absent", async () => {
  delete process.env.SMTP_PASS;
  expect(isEmailConfigured()).toBe(false);
  expect(isEmailConfigured("julio")).toBe(true);
  expect(await sendEmail(message)).toMatchObject({ ok: false });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(nodemailer.createTransport).not.toHaveBeenCalled();
});
