import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { isWhatsAppAllowed } from "@/lib/whatsapp-provider";
import { normalizeE164 } from "@/lib/textbee-sms";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSpeechConfigured, synthesizePortugueseSpeech } from "@/lib/speech-synthesis";
import { isInfinireachConfigured, sendInfinireachWhatsAppAudio } from "@/lib/infinireach-sms";
import prisma from "@/lib/prisma";
import { isTtsVoice } from "@/lib/tts-voices";
import { isOpenwaSelected, isOpenwaConfigured, sendOpenwa, OPENWA_CLOSED } from "@/lib/openwa";
import { openwaBusinessHours } from "@/lib/business-hours";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BODY_BYTES = 16 * 1024;
const invalidText = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\uD800-\uDFFF]/u;
const uncertainError = "O fornecedor pode ter aceite o audio, mas nao foi possivel confirmar. Nao repita o envio; verifique o estado junto do fornecedor.";
const failureError = "Nao foi possivel preparar ou enviar o audio WhatsApp. O envio nao sera repetido automaticamente.";

export async function POST(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
    if (!(await isWhatsAppAllowed())) {
      return NextResponse.json({ error: "Sem permissao para enviar WhatsApp." }, { status: 403 });
    }
    const openwa = isOpenwaSelected();
    if (!isSpeechConfigured() || !(openwa ? isOpenwaConfigured() : isInfinireachConfigured())) {
      return NextResponse.json({ error: "Audio WhatsApp nao configurado." }, { status: 503 });
    }
    if (openwa && !openwaBusinessHours().open) return NextResponse.json({ error: OPENWA_CLOSED, closed: true, status: "closed" }, { status: 409 });

    if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Pedido demasiado grande." }, { status: 413 });
    }
    // Bound the stream itself, not just Content-Length, before decoding or parsing JSON.
    const reader = req.body?.getReader();
    const chunks: Buffer[] = [];
    let bytes = 0;
    let body: unknown;
    try {
      if (!reader) throw new Error("Empty body");
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BODY_BYTES) {
          await reader.cancel().catch(() => {});
          return NextResponse.json({ error: "Pedido demasiado grande." }, { status: 413 });
        }
        chunks.push(Buffer.from(value));
      }
      body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    } catch {
      return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
    } finally {
      reader?.releaseLock();
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Pedido invalido." }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const keys = ["destinatario", "mensagem", "voice", "confirmed", "responderA", "clienteId", "jangadaId", "ordemServicoId", "refTipo", "refId"];
    const idKeys = ["responderA", "clienteId", "jangadaId", "ordemServicoId", "refId"] as const;
    if (Object.keys(input).some((key) => !keys.includes(key)) || input.confirmed !== true ||
        ("voice" in input && !isTtsVoice(input.voice)) ||
        typeof input.destinatario !== "string" || typeof input.mensagem !== "string" ||
        idKeys.some((key) => key in input && (typeof input[key] !== "number" || !Number.isSafeInteger(input[key]) || (input[key] as number) <= 0)) ||
        ("refTipo" in input && (typeof input.refTipo !== "string" || !input.refTipo.trim() || input.refTipo.length > 100 || invalidText.test(input.refTipo)))) {
      return NextResponse.json({ error: "Campos do pedido invalidos." }, { status: 400 });
    }
    const rawPhone = input.destinatario.trim();
    const destinatario = normalizeE164(rawPhone);
    const mensagem = input.mensagem.trim();
    if (!destinatario || !/^(?:\+[1-9]\d{7,14}|00[1-9]\d{7,14}|351\d{9}|[2-9]\d{8})$/.test(rawPhone) ||
        (destinatario.startsWith("+351") && !/^\+351[2-9]\d{8}$/.test(destinatario)) || invalidText.test(input.destinatario) ||
        mensagem.length < 10 || mensagem.length > 1500 || invalidText.test(input.mensagem)) {
      return NextResponse.json({ error: "Destinatario ou mensagem invalidos." }, { status: 400 });
    }

    const limit = await checkRateLimit(`whatsapp-audio:${access.userId}`, 3, 60_000);
    if (limit.status === 503) return NextResponse.json({
      error: "Audio indisponivel: nao foi possivel verificar o limite de pedidos. Contacte a administracao para verificar a configuracao do limitador. Nenhum audio foi enviado.",
      code: "AUDIO_RATE_LIMIT_UNAVAILABLE",
    }, { status: 503 });
    if (!limit.allowed) {
      return NextResponse.json({ error: "Limite de envios atingido. Aguarde antes de enviar." }, {
        status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))) },
      });
    }

    const row = await prisma.comunicacao.create({
      data: {
        tipo: "WHATSAPP", canal: openwa ? "openwa-audio" : "infinireach-audio", assunto: "Audio WhatsApp (voz sintetica)",
        destinatario, mensagem, status: "pendente", enviadoPor: access.email || String(access.userId),
        clienteId: input.clienteId as number | undefined,
        jangadaId: input.jangadaId as number | undefined,
        ordemServicoId: input.ordemServicoId as number | undefined,
        refTipo: typeof input.refTipo === "string" ? input.refTipo.trim() : undefined,
        refId: input.refId as number | undefined,
      },
    });

    let audio: Buffer;
    try {
      audio = await synthesizePortugueseSpeech(mensagem, input.voice as string | undefined);
    } catch {
      await prisma.comunicacao.update({ where: { id: row.id }, data: { status: "falhou", erro: failureError } }).catch(() => {});
      return NextResponse.json({ error: failureError, status: "falhou", comunicacaoId: row.id }, { status: 502 });
    }

    // A thrown send may have reached the provider. Never turn that ambiguity into a retryable failure.
    const result = await (openwa ? sendOpenwa(destinatario, { audio }, row.id) : sendInfinireachWhatsAppAudio(destinatario, audio, `orey-whatsapp-audio-${row.id}`))
      .catch(() => ({ ok: false, uncertain: true } as Awaited<ReturnType<typeof sendInfinireachWhatsAppAudio>>));
    if (result.uncertain) {
      await prisma.comunicacao.update({
        where: { id: row.id }, data: { status: "pendente", erro: uncertainError, providerId: result.providerId },
      }).catch(() => {});
      return NextResponse.json({ error: uncertainError, uncertain: true, comunicacaoId: row.id }, { status: 502 });
    }
    if (!result.ok) {
      await prisma.comunicacao.update({ where: { id: row.id }, data: { status: "falhou", erro: failureError } }).catch(() => {});
      const closed = "closed" in result && result.closed;
      return NextResponse.json({ error: closed ? OPENWA_CLOSED : failureError, closed: Boolean(closed), status: closed ? "closed" : "falhou", comunicacaoId: row.id }, { status: closed ? 409 : 502 });
    }

    let warning: string | undefined;
    try {
      await prisma.comunicacao.update({
        where: { id: row.id }, data: { status: "pendente", providerId: result.providerId, erro: null },
      });
    } catch {
      warning = "Audio aceite pelo fornecedor, mas nao foi possivel atualizar o historico. Nao repita o envio; consulte o fornecedor.";
    }
    // Queue acceptance does not prove delivery and must not mark responderA as answered.
    return NextResponse.json({ ok: true, comunicacaoId: row.id, providerId: result.providerId, status: "pendente", ...(warning ? { warning } : {}) });
  } catch {
    return NextResponse.json({ error: "Nao foi possivel processar o pedido de audio WhatsApp." }, { status: 500 });
  }
}
