import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { isWhatsAppAllowed } from "@/lib/whatsapp-provider";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSpeechConfigured, synthesizePortugueseSpeech } from "@/lib/speech-synthesis";
import { isTtsVoice } from "@/lib/tts-voices";

export const runtime = "nodejs";
export const maxDuration = 45;
const MAX_BODY = 16 * 1024;

export async function POST(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
    if (!(await isWhatsAppAllowed())) return NextResponse.json({ error: "Sem permissao para audio WhatsApp." }, { status: 403 });
    if (!isSpeechConfigured()) return NextResponse.json({ error: "Edge TTS indisponivel." }, { status: 503 });
    const limit = await checkRateLimit(`whatsapp-audio-preview:${access.userId}`, 5, 60_000);
    if (limit.status === 503) return NextResponse.json({
      error: "Pre-escuta indisponivel: nao foi possivel verificar o limite de pedidos. Contacte a administracao para verificar a configuracao do limitador. Nenhum audio foi enviado.",
      code: "AUDIO_RATE_LIMIT_UNAVAILABLE",
    }, { status: 503 });
    if (!limit.allowed) return NextResponse.json({ error: "Limite de pre-escutas atingido." }, {
      status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))) },
    });
    if (Number(req.headers.get("content-length")) > MAX_BODY) return NextResponse.json({ error: "Pedido demasiado grande." }, { status: 413 });
    const reader = req.body?.getReader();
    if (!reader) return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
    let expired = false;
    const timer = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}); }, 5_000);
    let input: unknown;
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (expired) return NextResponse.json({ error: "Tempo de leitura excedido." }, { status: 408 });
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY) {
          void reader.cancel().catch(() => {});
          return NextResponse.json({ error: "Pedido demasiado grande." }, { status: 413 });
        }
        chunks.push(Buffer.from(value));
      }
      input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    } catch {
      return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
    } finally {
      clearTimeout(timer);
      reader.releaseLock();
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) return NextResponse.json({ error: "Pedido invalido." }, { status: 400 });
    const body = input as Record<string, unknown>;
    if (Object.keys(body).some((key) => !["mensagem", "voice"].includes(key)) ||
        typeof body.mensagem !== "string" || body.mensagem.trim().length < 10 || body.mensagem.length > 1500 ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\uD800-\uDFFF\ufffe\uffff]/u.test(body.mensagem) ||
        ("voice" in body && !isTtsVoice(body.voice))) {
      return NextResponse.json({ error: "Texto ou voz invalidos." }, { status: 400 });
    }
    const audio = await synthesizePortugueseSpeech(body.mensagem.trim(), body.voice as string | undefined, req.signal);
    if (!audio.length || audio.length > 10 * 1024 * 1024) throw new Error("Invalid audio size");
    return new NextResponse(new Uint8Array(audio), { headers: {
      "Content-Type": "audio/mpeg", "Content-Length": String(audio.length),
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return NextResponse.json({ error: "Nao foi possivel gerar a pre-escuta. Nenhum audio foi enviado." }, { status: 502 });
  }
}
