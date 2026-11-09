import { POST } from "@/app/api/comunicacoes/voip-call/route";
import { getAccessContext } from "../access-control";
import prisma from "../prisma";
import { isVoiceConfigured, startVoiceCall, validateVoiceCallInput } from "../voice-call";

jest.mock("../access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("../prisma", () => ({ __esModule: true, default: { comunicacao: { create: jest.fn() } } }));

const input = { telefone: "912345678", mensagem: "Mensagem de teste para voz.", confirmed: true };
const fetchMock = jest.fn();
const originalFetch = global.fetch;

beforeEach(() => {
  jest.resetAllMocks();
  global.fetch = fetchMock;
  jest.mocked(getAccessContext).mockResolvedValue({ email: "operator@example.test" } as never);
});
afterAll(() => { global.fetch = originalFetch; });

describe("retired voice provider", () => {
  it.each([false, true])("cannot send even with historical Twilio credentials (configured=%s)", async (configured) => {
    const env = { ...process.env };
    try {
      if (configured) Object.assign(process.env, { TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`, TWILIO_AUTH_TOKEN: "test", TWILIO_PHONE_NUMBER: "+351212345678" });
      expect(isVoiceConfigured()).toBe(false);
      expect(await startVoiceCall(input)).toMatchObject({ ok: false, status: "disabled" });
      const response = await POST();
      expect(response.status).toBe(410);
      expect(await response.json()).toMatchObject({ code: "VOICE_DISABLED", configured: false });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.comunicacao.create).not.toHaveBeenCalled();
    } finally { process.env = env; }
  });

  it.each([
    null, [], { ...input, confirmed: false }, { ...input, confirmed: "true" },
    { telefone: input.telefone, mensagem: input.mensagem },
    { ...input, telefone: 912345678 }, { ...input, telefone: "+351912345678,+351912345679" },
    { ...input, telefone: "+1234567890123456" }, { ...input, telefone: "+35191234567" },
    { ...input, telefone: "9123456789" }, { ...input, mensagem: 1234567890 },
    { ...input, mensagem: "short" }, { ...input, mensagem: "x".repeat(1501) },
    { ...input, mensagem: "invalid control \u0000" },
    { ...input, url: "https://example.test" }, { ...input, Twiml: "<Response/>" },
  ])("preserves input protection without sending: %j", async (body) => {
    expect(validateVoiceCallInput(body).ok).toBe(false);
    expect((await startVoiceCall(body)).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["212345678", "912345678", "+351912345678", "00351912345678", "+14155552671"])("preserves validation of a single number: %s", (telefone) => {
    expect(validateVoiceCallInput({ ...input, telefone }).ok).toBe(true);
  });

  it.each([`XML & <Say>"test"</Say> 'end'`, "Mensagem com texto simples"])("never transmits text or fabricates provider acceptance: %s", async (mensagem) => {
    const result = await startVoiceCall({ ...input, mensagem });
    expect(result).toMatchObject({ ok: false, status: "disabled" });
    expect(result.providerId).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires authentication without sending or changing historical records", async () => {
    jest.mocked(getAccessContext).mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.comunicacao.create).not.toHaveBeenCalled();
  });
});
