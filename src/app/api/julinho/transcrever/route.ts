import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  isSttConfigured,
  MAX_STT_AUDIO_BYTES,
  transcribeAudio,
} from "@/lib/julinho/julinho-stt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ available: false }, { status: 401 });
    return NextResponse.json({ available: isSttConfigured() });
  } catch (error) {
    console.error("[GET /api/julinho/transcrever]", error);
    return NextResponse.json({ available: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    if (!isSttConfigured()) {
      return NextResponse.json(
        {
          error: "O ditado no servidor não está configurado.",
          code: "STT_NOT_CONFIGURED",
        },
        { status: 503 },
      );
    }

    const limit = await checkRateLimit(`julinho-stt:${access.userId}`, 10, 60_000);
    if (limit.status === 503) {
      return NextResponse.json(
        { error: "Ditado indisponível: não foi possível verificar o limite de pedidos." },
        { status: 503 },
      );
    }
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Limite de pedidos de ditado atingido. Tenta novamente daqui a pouco." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))) },
        },
      );
    }

    const declaredLength = Number(req.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_STT_AUDIO_BYTES + 64 * 1024) {
      return NextResponse.json({ error: "Áudio demasiado grande (máx. 10 MB)." }, { status: 413 });
    }

    const formData = await req.formData();
    const audioEntry = formData.get("audio");
    if (
      !audioEntry ||
      typeof audioEntry === "string" ||
      typeof audioEntry.arrayBuffer !== "function"
    ) {
      return NextResponse.json({ error: "Áudio em falta." }, { status: 400 });
    }

    const audio = audioEntry as File;
    if (audio.size === 0) {
      return NextResponse.json({ error: "Áudio vazio." }, { status: 400 });
    }
    if (audio.size > MAX_STT_AUDIO_BYTES) {
      return NextResponse.json({ error: "Áudio demasiado grande (máx. 10 MB)." }, { status: 413 });
    }

    const buffer = Buffer.from(await audio.arrayBuffer());
    const text = await transcribeAudio({
      audio: buffer,
      mimeType: audio.type || "audio/wav",
      language: "pt",
    });

    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "STT_NOT_CONFIGURED") {
      return NextResponse.json(
        {
          error: "O ditado no servidor não está configurado.",
          code: "STT_NOT_CONFIGURED",
        },
        { status: 503 },
      );
    }
    if (/formato de áudio|áudio vazio|demasiado grande/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("[POST /api/julinho/transcrever]", error);
    return NextResponse.json({ error: "Não foi possível transcrever o áudio." }, { status: 502 });
  }
}
