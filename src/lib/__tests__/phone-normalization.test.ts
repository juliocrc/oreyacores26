/** @jest-environment node */

import { normalizeE164 } from "../textbee-sms";
import { sendWhatsAppDocument, sendWhatsAppSystem } from "../whatsapp-provider";

jest.mock("../communications", () => ({ buildWhatsAppUrl: jest.fn(() => "https://wa.me/test") }));
jest.mock("@/auth", () => ({
  getAuthSession: jest.fn(async () => ({ user: { email: "julio.correia@orey.com" } })),
}));
jest.mock("../twilio", () => ({
  isTwilioWhatsAppConfigured: jest.fn(() => false),
  sendTwilioWhatsApp: jest.fn(),
}));
jest.mock("../infinireach-sms", () => ({
  isInfinireachConfigured: jest.fn(() => false),
  sendInfinireachWhatsApp: jest.fn(),
}));
jest.mock("../zapier-webhook", () => ({
  isZapierWhatsAppConfigured: jest.fn(() => false),
  sendZapierWhatsApp: jest.fn(),
}));

const validPhones = [
  ["912345678", "+351912345678"],
  ["212345678", "+351212345678"],
  [" 912 345 678 ", "+351912345678"],
  ["(212) 345-678", "+351212345678"],
  ["+351 (912) 345-678", "+351912345678"],
  ["00351 212.345.678", "+351212345678"],
  ["351912345678", "+351912345678"],
  ["+44 (20) 7946-0958", "+442079460958"],
  ["0044 20 7946 0958", "+442079460958"],
  ["14155552671", "+14155552671"],
  ["+12345678", "+12345678"],
  ["0012345678", "+12345678"],
  ["+123456789012345", "+123456789012345"],
];

const invalidPhones = [
  "", "   ", "abc", "1234567", "+1234567", "001234567", "+1234567890123456",
  "001234567890123456", "812345678", "012345678", "+012345678", "000351912345678",
  "++351912345678", "351+912345678", "+00351912345678", "whatsapp:+351912345678",
  "tel:+351912345678", "912345678 ext 1", "912345678x1", "912345678/212345678",
  "+351912345678,+351912345679", "912345678@example.test", "912345678#1",
  "912345678\u0000",
];

describe("normalizeE164", () => {
  it.each(validPhones)("normalizes %j to %s", (raw, expected) => {
    expect(normalizeE164(raw)).toBe(expected);
  });

  it.each(invalidPhones)("rejects unsafe or unsupported input %j", (raw) => {
    expect(normalizeE164(raw)).toBeNull();
  });
});

describe("Meta WhatsApp phone normalization", () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  const originalEnv = process.env;
  const document = { filename: "test.pdf", content: Buffer.from("test"), caption: "Test" };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      WHATSAPP_ACCESS_TOKEN: "test-token",
      WHATSAPP_PHONE_NUMBER_ID: "test-phone-id",
      WHATSAPP_API_VERSION: "v21.0",
    };
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  it.each(validPhones)("sends text to normalized recipient %j", async (raw, expected) => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: "test-message" }] }) });

    expect(await sendWhatsAppSystem(raw, "Test")).toMatchObject({
      ok: true, enviadoDeFacto: true, provider: "waba", providerId: "test-message",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v21.0/test-phone-id/messages");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      messaging_product: "whatsapp", to: expected.slice(1), type: "text", text: { body: "Test" },
    });
  });

  it.each(validPhones)("sends documents to normalized recipient %j", async (raw, expected) => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ id: "test-media" }) })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ messages: [{ id: "test-message" }] }) });

    expect(await sendWhatsAppDocument(raw, document)).toMatchObject({
      ok: true, enviadoDeFacto: true, providerId: "test-message",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://graph.facebook.com/v21.0/test-phone-id/media");
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe("https://graph.facebook.com/v21.0/test-phone-id/messages");
    expect(JSON.parse(options.body)).toEqual({
      messaging_product: "whatsapp", to: expected.slice(1), type: "document",
      document: { id: "test-media", filename: "test.pdf", caption: "Test" },
    });
  });

  it.each(invalidPhones)("rejects %j before sending text or uploading documents", async (raw) => {
    expect(await sendWhatsAppSystem(raw, "Test")).toMatchObject({ ok: false, erro: expect.any(String) });
    expect(await sendWhatsAppDocument(raw, document)).toMatchObject({ ok: false, erro: expect.any(String) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
