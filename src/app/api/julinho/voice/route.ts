import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSpeechConfigured, synthesizePortugueseSpeech } from "@/lib/speech-synthesis";
import { isTtsVoice } from "@/lib/tts-voices";

export const runtime = "nodejs";
export const maxDuration = 45;

const MAX_BODY_BYTES = 4 * 1024;
const MAX_TEXT_LENGTH = 600;

function configuredVoice(): string | undefined {
  const voice = (process.env.JULINHO_VOICE || "pt-PT-RaquelNeural").trim();
  return isTtsVoice(voice) ? voice : "pt-PT-RaquelNeural";
}

export async function POST(req: NextRequest) {
  const access = await getAccessContext();
  if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  if (!isSpeechConfigured()) return NextResponse.json({ error: "Síntese de voz indisponível." }, { status: 503 });

  const limit = await checkRateLimit(`julinho-voice:${access.userId}`, 20, 60_000);
  if (limit.status === 503) {
    return NextResponse.json({
      error: "Voz indisponível: não foi possível verificar o limite de pedidos.",
      code: "JULINHO_VOICE_RATE_LIMIT_UNAVAILABLE",
    }, { status: 503 });
  }
  if (!limit.allowed) {
    return NextResponse.json({ error: "Limite de pedidos de voz atingido." }, {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))) },
    });
  }

  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Pedido demasiado grande." }, { status: 413 });
  }

  let text = "";
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
    const value = (body as Record<string, unknown>).text;
    text = typeof value === "string" ? value.trim() : "";
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  if (!text || text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: `O texto deve ter entre 1 e ${MAX_TEXT_LENGTH} caracteres.` }, { status: 400 });
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    return NextResponse.json({ error: "O texto contém caracteres inválidos." }, { status: 400 });
  }

  try {
    const audio = await synthesizePortugueseSpeech(text, configuredVoice(), req.signal);
    if (!audio.length || audio.length > 10 * 1024 * 1024) throw new Error("invalid audio");
    return new NextResponse(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível gerar a voz." }, { status: 502 });
  }
}
