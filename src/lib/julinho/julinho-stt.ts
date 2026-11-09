/**
 * Reconhecimento de voz no servidor (fallback para dispositivos sem o
 * serviço de voz nativo do Android, ou browsers sem Web Speech API).
 *
 * Fornecedores suportados:
 * - OpenAI Whisper ou qualquer endpoint compatível com
 *   `POST /audio/transcriptions` (via JULINHO_STT_API_KEY / OPENAI_API_KEY).
 * - Gemini (via GEMINI_API_KEY), com áudio inline.
 *
 * O cliente envia WAV mono 16 kHz, formato aceite por ambos.
 */

export type SttConfig =
  | {
      provider: "openai";
      apiKey: string;
      baseUrl: string;
      model: string;
    }
  | {
      provider: "gemini";
      apiKey: string;
      model: string;
    };

export const MAX_STT_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 2_000;
const REQUEST_TIMEOUT_MS = 45_000;

export function getSttConfig(): SttConfig | null {
  const explicitKey = String(process.env.JULINHO_STT_API_KEY ?? "").trim();
  const openAiKey = String(process.env.OPENAI_API_KEY ?? "").trim();
  const geminiKey = String(process.env.GEMINI_API_KEY ?? "").trim();
  const llmKey = String(process.env.JULINHO_LLM_API_KEY ?? "").trim();
  const llmBaseUrl = String(process.env.JULINHO_LLM_BASE_URL ?? "").trim();
  const sttModel = String(process.env.JULINHO_STT_MODEL ?? "").trim();
  const sttBaseUrl = String(process.env.JULINHO_STT_BASE_URL ?? "").trim();

  const openAiBase = (sttBaseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const openAiModel = sttModel || "whisper-1";
  const geminiModel = sttModel || "gemini-2.5-flash";

  if (explicitKey) {
    return {
      provider: "openai",
      apiKey: explicitKey,
      baseUrl: openAiBase,
      model: openAiModel,
    };
  }

  if (openAiKey) {
    return {
      provider: "openai",
      apiKey: openAiKey,
      baseUrl: openAiBase,
      model: openAiModel,
    };
  }

  if (geminiKey) {
    return { provider: "gemini", apiKey: geminiKey, model: geminiModel };
  }

  if (llmKey) {
    // Alguns utilizadores configuram o Julinho com a chave Gemini no
    // endpoint compatível OpenAI. Para áudio usamos a API nativa Gemini.
    if (/generativelanguage\.googleapis\.com/i.test(llmBaseUrl)) {
      return { provider: "gemini", apiKey: llmKey, model: geminiModel };
    }
    return {
      provider: "openai",
      apiKey: llmKey,
      baseUrl: (sttBaseUrl || llmBaseUrl || "https://api.openai.com/v1").replace(/\/+$/, ""),
      model: openAiModel,
    };
  }

  return null;
}

export function isSttConfigured(): boolean {
  return getSttConfig() !== null;
}

function cleanTranscript(value: unknown): string {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TRANSCRIPT_CHARS);
  return text;
}

async function transcribeWithOpenAi(
  config: Extract<SttConfig, { provider: "openai" }>,
  audio: Buffer,
  mimeType: string,
  language: string,
): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(audio)], { type: mimeType }),
    "julinho.wav",
  );
  form.append("model", config.model);
  form.append("language", language);
  form.append("response_format", "json");
  form.append("temperature", "0");

  const response = await fetch(`${config.baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`STT provider returned HTTP ${response.status}`);
  }

  const raw = await response.text();
  if (!raw.trim()) throw new Error("STT provider returned an empty response.");

  try {
    const payload = JSON.parse(raw) as { text?: unknown };
    return cleanTranscript(payload?.text);
  } catch {
    // Alguns fornecedores devolvem texto simples em vez de JSON.
    return cleanTranscript(raw);
  }
}

async function transcribeWithGemini(
  config: Extract<SttConfig, { provider: "gemini" }>,
  audio: Buffer,
  mimeType: string,
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Transcreve exatamente o áudio em português de Portugal. Devolve apenas a transcrição, sem comentários, sem introdução e sem tradução.",
              },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: audio.toString("base64"),
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 512,
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    throw new Error(`STT provider returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: unknown }> };
    }>;
  };

  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  return cleanTranscript(
    parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join(" "),
  );
}

export async function transcribeAudio(params: {
  audio: Buffer;
  mimeType?: string;
  language?: string;
}): Promise<string> {
  const { audio } = params;
  if (!audio || audio.length === 0) throw new Error("Áudio vazio.");
  if (audio.length > MAX_STT_AUDIO_BYTES) throw new Error("Áudio demasiado grande.");

  const config = getSttConfig();
  if (!config) throw new Error("STT_NOT_CONFIGURED");

  const mimeType = (params.mimeType || "audio/wav").toLowerCase();
  if (!/^audio\/(wav|wave|x-wav|webm|ogg|mpeg|mp4|m4a|aac|flac)/i.test(mimeType)) {
    throw new Error("Formato de áudio não suportado.");
  }

  const language = (params.language || "pt").slice(0, 16);

  const text =
    config.provider === "gemini"
      ? await transcribeWithGemini(config, audio, mimeType)
      : await transcribeWithOpenAi(config, audio, mimeType, language);

  if (!text) throw new Error("Não foi possível transcrever o áudio.");
  return text;
}
