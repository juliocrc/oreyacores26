import { encodeWav, resampleLinear } from "../julinho/julinho-stt-client";
import { getSttConfig, transcribeAudio } from "../julinho/julinho-stt";

function clearSttEnv() {
  delete process.env.JULINHO_STT_API_KEY;
  delete process.env.JULINHO_STT_BASE_URL;
  delete process.env.JULINHO_STT_MODEL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.JULINHO_LLM_API_KEY;
  delete process.env.JULINHO_LLM_BASE_URL;
}

describe("Julinho server STT configuration", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearSttEnv();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it("uses the explicit STT key before the shared keys", () => {
    process.env.JULINHO_STT_API_KEY = "stt-key";
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.GEMINI_API_KEY = "gemini-key";

    expect(getSttConfig()).toEqual({
      provider: "openai",
      apiKey: "stt-key",
      baseUrl: "https://api.openai.com/v1",
      model: "whisper-1",
    });
  });

  it("uses Gemini when only its key is configured", () => {
    process.env.GEMINI_API_KEY = "gemini-key";

    expect(getSttConfig()).toEqual({
      provider: "gemini",
      apiKey: "gemini-key",
      model: "gemini-2.5-flash",
    });
  });

  it("detects Gemini from the Julinho LLM base URL", () => {
    process.env.JULINHO_LLM_API_KEY = "gemini-key";
    process.env.JULINHO_LLM_BASE_URL =
      "https://generativelanguage.googleapis.com/v1beta/openai";

    expect(getSttConfig()).toEqual({
      provider: "gemini",
      apiKey: "gemini-key",
      model: "gemini-2.5-flash",
    });
  });

  it("rejects transcription when no provider is configured", async () => {
    await expect(
      transcribeAudio({ audio: Buffer.from("audio"), mimeType: "audio/wav" }),
    ).rejects.toThrow("STT_NOT_CONFIGURED");
  });

  it("transcribes through an OpenAI-compatible endpoint", async () => {
    process.env.JULINHO_STT_API_KEY = "stt-key";
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ text: "  Olá   mundo  " }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const text = await transcribeAudio({
      audio: Buffer.from("wav-data"),
      mimeType: "audio/wav",
    });

    expect(text).toBe("Olá mundo");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer stt-key" },
      }),
    );

    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("model")).toBe("whisper-1");
    expect(body.get("language")).toBe("pt");
    expect(body.get("response_format")).toBe("json");
  });

  it("transcribes through Gemini with inline audio", async () => {
    process.env.GEMINI_API_KEY = "gemini-key";
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "  Teste de voz  " }] } }],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const text = await transcribeAudio({
      audio: Buffer.from("wav-data"),
      mimeType: "audio/wav",
    });

    expect(text).toBe("Teste de voz");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-goog-api-key": "gemini-key" }),
      }),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      contents: Array<{ parts: Array<{ inline_data?: { mime_type?: string } }> }>;
    };
    expect(body.contents[0].parts[1].inline_data?.mime_type).toBe("audio/wav");
  });
});

describe("Julinho WAV encoder", () => {
  it("writes a valid mono 16-bit WAV header", async () => {
    const blob = encodeWav(new Float32Array([0, 0.5, -0.5]), 16_000);
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(44 + 3 * 2);

    const bytes = Buffer.from(await blob.arrayBuffer());
    expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
    expect(bytes.toString("ascii", 8, 12)).toBe("WAVE");
    expect(bytes.readUInt16LE(22)).toBe(1);
    expect(bytes.readUInt32LE(24)).toBe(16_000);
    expect(bytes.readUInt32LE(40)).toBe(6);
  });

  it("resamples linearly to the target rate", () => {
    const input = new Float32Array([0, 1, 0, -1]);
    const output = resampleLinear(input, 32_000, 16_000);

    expect(output.length).toBe(2);
    expect(output[0]).toBeCloseTo(0);
    expect(output[1]).toBeCloseTo(0);
  });
});
