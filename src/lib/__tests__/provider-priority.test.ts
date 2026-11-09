import { sendSms, smsProviderName } from "../sms-provider";
import { sendWhatsAppApi, sendWhatsAppSystem, sendWhatsAppDocument } from "../whatsapp-provider";
import { sendOpenwa } from "../openwa";
import prisma from "../prisma";
import { GET as connectionStatus } from "@/app/api/whatsapp/status/route";
import { isInfinireachConfigured, sendInfinireachSms, sendInfinireachWhatsApp } from "../infinireach-sms";
import { sendZapierWhatsApp } from "../zapier-webhook";
import { getEmailSenderAccounts } from '../email-sender';
import { getAccessContext } from '../access-control';

jest.mock("server-only", () => ({}));
jest.mock("@/auth", () => ({ getAuthSession: jest.fn(async () => ({ user: { email: "operator@example.test" } })) }));
jest.mock("../whatsapp-allowed", () => ({ isWhatsAppAllowedEmail: jest.fn(() => true) }));
jest.mock("../communications", () => ({ buildWhatsAppUrl: jest.fn(() => "https://wa.me/351912345678?text=Teste") }));
jest.mock("../infinireach-sms", () => ({
  isInfinireachConfigured: jest.fn(), sendInfinireachSms: jest.fn(), sendInfinireachWhatsApp: jest.fn(),
}));
jest.mock("../access-control", () => ({ getAccessContext: jest.fn(async () => ({ userId: 1 })) }));
jest.mock("../prisma", () => ({ __esModule: true, default: { comunicacao: { create: jest.fn(), update: jest.fn() } } }));
jest.mock("../zapier-webhook", () => ({ isZapierWhatsAppConfigured: jest.fn(() => true), sendZapierWhatsApp: jest.fn() }));
jest.mock("../email-sender", () => ({ isEmailConfigured: jest.fn(() => false), getEmailSenderAccounts: jest.fn(() => [
  { id: 'julio', email: 'julio.correia@orey.com', label: 'Julio', configured: true },
  { id: 'tecnica', email: 'azores.tecnica@orey.com', label: 'Tecnica', configured: false },
]) }));
jest.mock("../voice-call", () => ({ isVoiceConfigured: jest.fn(() => false) }));
jest.mock("../openwa", () => ({ ...jest.requireActual("../openwa"), sendOpenwa: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isInfinireachConfigured).mockReturnValue(true);
  jest.mocked(sendInfinireachSms).mockResolvedValue({ ok: true });
  jest.mocked(sendInfinireachWhatsApp).mockResolvedValue({ ok: true });
  jest.mocked(sendZapierWhatsApp).mockResolvedValue({ ok: true });
});

describe("SMS provider priority", () => {
  it("uses InfiniReach when both providers are configured", async () => {
    expect(await sendSms("912345678", "Teste")).toMatchObject({ ok: true, provider: "infinireach" });
    expect(sendInfinireachSms).toHaveBeenCalledWith("912345678", "Teste");
    expect(smsProviderName()).toBe("InfiniReach");
  });

  it("does not use retired Twilio when InfiniReach is not configured", async () => {
    jest.mocked(isInfinireachConfigured).mockReturnValue(false);
    expect(await sendSms("912345678", "Teste")).toMatchObject({ ok: false });
    expect(sendInfinireachSms).not.toHaveBeenCalled();
    expect(smsProviderName()).toBeNull();
  });

  it("does not resend through Twilio after an InfiniReach failure", async () => {
    jest.mocked(sendInfinireachSms).mockResolvedValue({ ok: false, error: "Provider unavailable" });
    expect(await sendSms("912345678", "Teste")).toMatchObject({ ok: false, error: "Provider unavailable" });
    expect(sendInfinireachSms).toHaveBeenCalledTimes(1);
  });

  it("reports unavailable when neither provider is configured", async () => {
    jest.mocked(isInfinireachConfigured).mockReturnValue(false);
    expect((await sendSms("912345678", "Teste")).ok).toBe(false);
    expect(smsProviderName()).toBeNull();
  });
});

describe("WhatsApp provider priority", () => {
  it("uses InfiniReach before Twilio and Zapier", async () => {
    expect(await sendWhatsAppApi("912345678", "Teste")).toMatchObject({ ok: true, enviadoDeFacto: true, provider: "infinireach" });
    expect(sendInfinireachWhatsApp).toHaveBeenCalledWith("912345678", "Teste");
    expect(sendZapierWhatsApp).not.toHaveBeenCalled();
  });

  it("uses existing Zapier, never Twilio, when InfiniReach is not configured", async () => {
    jest.mocked(isInfinireachConfigured).mockReturnValue(false);
    expect(await sendWhatsAppApi("912345678", "Teste")).toMatchObject({ ok: true, provider: "zapier" });
    expect(sendInfinireachWhatsApp).not.toHaveBeenCalled();
    expect(sendZapierWhatsApp).toHaveBeenCalledTimes(1);
  });

  it("does not resend through another provider after an InfiniReach failure", async () => {
    jest.mocked(sendInfinireachWhatsApp).mockResolvedValue({ ok: false, error: "Provider unavailable" });
    expect(await sendWhatsAppApi("912345678", "Teste")).toMatchObject({ ok: false, erro: "Provider unavailable" });
    expect(sendZapierWhatsApp).not.toHaveBeenCalled();
  });
});

describe("explicit OpenWA selection", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env = { ...env, WHATSAPP_PROVIDER: "openwa", OPENWA_BASE_URL: "https://orey-openwa.onrender.com", OPENWA_API_KEY: "private-test-key" };
    jest.mocked(prisma.comunicacao.create).mockResolvedValue({ id: 42 } as never);
    jest.mocked(prisma.comunicacao.update).mockResolvedValue({ id: 42 } as never);
    jest.mocked(sendOpenwa).mockResolvedValue({ ok: true, providerId: "message-id" });
  });
  afterEach(() => { process.env = { ...env }; });

  it("takes precedence over existing providers and returns acceptance, not delivery", async () => {
    expect(await sendWhatsAppApi("912345678", "Teste", 42)).toMatchObject({ ok: true, provider: "openwa", accepted: true, providerId: "message-id" });
    expect(sendOpenwa).toHaveBeenCalledWith("912345678", { text: "Teste" }, 42);
    expect(sendInfinireachWhatsApp).not.toHaveBeenCalled();
    expect(sendZapierWhatsApp).not.toHaveBeenCalled();
  });

  it.each([{ ok: false, uncertain: true, error: "Uncertain" }, { ok: false, closed: true, error: "Closed" }, { ok: false, error: "Not configured" }])("never falls back on selected OpenWA failure %j", async (result) => {
    jest.mocked(sendOpenwa).mockResolvedValue(result);
    const sent = await sendWhatsAppApi("912345678", "Teste", 42);
    expect(sent.ok).toBe(false);
    expect(sent.link).toBeUndefined();
    expect(sendInfinireachWhatsApp).not.toHaveBeenCalled();
    expect(sendZapierWhatsApp).not.toHaveBeenCalled();
  });

  it("gives automatic access-code sends durable IDs, but never stores the secret code in history", async () => {
    expect(await sendWhatsAppSystem("912345678", "Access code: 87006")).toMatchObject({ ok: true, provider: "openwa", accepted: true });
    expect(sendOpenwa).toHaveBeenCalledWith("912345678", { text: "Access code: 87006" }, 42);
    expect(JSON.stringify(jest.mocked(prisma.comunicacao.create).mock.calls)).not.toContain("87006");
    expect(prisma.comunicacao.update).toHaveBeenCalledWith({ where: { id: 42 }, data: expect.objectContaining({ status: "pendente", providerId: "message-id" }) });
  });

  it("blocks documents explicitly without sending text, media or a manual link", async () => {
    const result = await sendWhatsAppDocument("912345678", { filename: "file.pdf", content: Buffer.from("pdf") });
    expect(result).toMatchObject({ ok: false, provider: "openwa", erro: expect.stringContaining("indisponivel") });
    expect(result.link).toBeUndefined();
    expect(sendOpenwa).not.toHaveBeenCalled();
  });

  it("configuration does not claim session readiness and exposes no OpenWA secrets", async () => {
    const result = await (await connectionStatus()).json();
    expect(result).toMatchObject({ provider: "OpenWA", configured: true, readinessRequired: true, openwa: { selected: true, configured: true, statusUrl: "/api/comunicacoes/openwa" }, voice: { configured: false, provider: null }, documents: { configured: false } });
    expect(result.openwa.ready).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("private-test-key");
    expect(JSON.stringify(result)).not.toContain("orey-openwa.onrender.com");
    expect(result.twilio).toBeUndefined();
  });
});

describe("connection status agrees with the actual sender", () => {
  it.each([false, true])('hides profile metadata from non-Julio admin=%s', async isAdmin => {
    jest.mocked(getAccessContext).mockResolvedValueOnce({ userId: 2, email: 'other@orey.com', isAdmin } as never);
    expect((await (await connectionStatus()).json()).email).toEqual({ configured: false, accounts: [] });
    expect(getEmailSenderAccounts).not.toHaveBeenCalled();
  });

  it('returns account-specific email configuration without credentials and disables caching', async () => {
    jest.mocked(getAccessContext).mockResolvedValueOnce({ userId: 1, email: ' JULIO.CORREIA@OREY.COM ', isAdmin: false } as never);
    jest.mocked(getEmailSenderAccounts).mockReturnValueOnce([
      { id: 'julio', email: 'julio.correia@orey.com', label: 'Julio', configured: true, refreshToken: 'private-token' },
      { id: 'tecnica', email: 'azores.tecnica@orey.com', label: 'Tecnica', configured: false, clientSecret: 'private-secret' },
    ] as never);
    const response = await connectionStatus();
    const json = await response.json();
    expect(json.email).toEqual({ configured: false, accounts: [
      { id: 'julio', email: 'julio.correia@orey.com', label: 'Julio', configured: true },
      { id: 'tecnica', email: 'azores.tecnica@orey.com', label: 'Tecnica', configured: false },
    ] });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(JSON.stringify(json)).not.toContain('private-token');
    expect(JSON.stringify(json)).not.toContain('private-secret');
  });

  it.each([
    [undefined, true, true, "pt-BR"],
    [undefined, false, true, "pt-BR"],
    ["pt-PT-DuarteNeural", true, true, "pt-PT"],
    ["invalid-voice", true, false, "pt-BR"],
  ])("separates free synthesis from delivery (%s, %s)", async (voice, delivery, speech, language) => {
    const env = { ...process.env };
    try {
      delete process.env.AZURE_SPEECH_KEY;
      delete process.env.AZURE_SPEECH_REGION;
      if (voice === undefined) delete process.env.TTS_VOICE;
      else process.env.TTS_VOICE = voice;
      jest.mocked(isInfinireachConfigured).mockReturnValue(delivery);
      expect(await (await connectionStatus()).json()).toMatchObject({
        audio: { configured: delivery && speech, speechConfigured: speech, deliveryConfigured: delivery,
          provider: "InfiniReach", speechProvider: "Edge TTS", language, maxMessageLength: 1500 },
      });
    } finally {
      process.env = env;
    }
  });

  it("shows InfiniReach for both messaging channels with voice disabled", async () => {
    const response = await connectionStatus();
    expect(await response.json()).toMatchObject({
      provider: "InfiniReach", canSend: true,
      sms: { configured: true, provider: "InfiniReach" },
      voice: { configured: false, provider: null, disabled: true },
    });
  });

  it("shows existing Zapier and no SMS provider when InfiniReach is not configured", async () => {
    jest.mocked(isInfinireachConfigured).mockReturnValue(false);
    expect(await (await connectionStatus()).json()).toMatchObject({
      provider: "Zapier", sms: { configured: false, provider: null },
    });
  });
});
