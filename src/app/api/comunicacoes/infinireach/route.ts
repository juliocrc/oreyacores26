import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 64 * 1024;
const events: Record<string, { tipo: string; status: string; allowed: string[] }> = {
  "message.sent": { tipo: "SMS", status: "enviado", allowed: ["pendente", "enviado"] },
  "message.delivered": { tipo: "SMS", status: "entregue", allowed: ["pendente", "enviado", "entregue"] },
  "message.failed": { tipo: "SMS", status: "falhou", allowed: ["pendente", "enviado", "falhou"] },
  "whatsapp.message.sent": { tipo: "WHATSAPP", status: "enviado", allowed: ["pendente", "enviado"] },
  "whatsapp.message.delivered": { tipo: "WHATSAPP", status: "entregue", allowed: ["pendente", "enviado", "entregue"] },
  "whatsapp.message.read": { tipo: "WHATSAPP", status: "lido", allowed: ["pendente", "enviado", "entregue", "lido"] },
  "whatsapp.message.failed": { tipo: "WHATSAPP", status: "falhou", allowed: ["pendente", "enviado", "falhou"] },
};

/**
 * Status callbacks only; inbound events are ignored and never create messages.
 * Configure /api/comunicacoes/infinireach in Automations > Webhooks with the
 * same secret as INFINIREACH_WEBHOOK_SECRET. Only event and data.messageId
 * drive history updates; data.status and other provider fields are not trusted.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INFINIREACH_WEBHOOK_SECRET;
  if (!secret?.trim()) {
    return NextResponse.json({ error: "Webhook nao configurado." }, { status: 503 });
  }
  const signature = req.headers.get("x-webhook-signature");
  if (!signature || !/^[a-f0-9]{64}$/.test(signature)) {
    return NextResponse.json({ error: "Assinatura invalida." }, { status: 403 });
  }
  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Pedido demasiado grande." }, { status: 413 });
  }

  const reader = req.body?.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
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
  } catch {
    return NextResponse.json({ error: "Corpo invalido." }, { status: 400 });
  } finally {
    reader?.releaseLock();
  }

  const raw = Buffer.concat(chunks);
  const expected = createHmac("sha256", secret).update(raw).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) {
    return NextResponse.json({ error: "Assinatura invalida." }, { status: 403 });
  }

  let body;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.event !== "string") {
    return NextResponse.json({ error: "Evento invalido." }, { status: 400 });
  }
  if (!Object.prototype.hasOwnProperty.call(events, body.event)) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  const messageId = body.data?.messageId;
  if (!body.data || Array.isArray(body.data) || typeof messageId !== "string" ||
      !messageId.trim() || messageId.length > 256) {
    return NextResponse.json({ error: "messageId invalido." }, { status: 400 });
  }

  const event = events[body.event];
  try {
    // Apply the transition atomically so concurrent/late callbacks cannot regress delivery.
    await prisma.comunicacao.updateMany({
      where: {
        providerId: messageId,
        canal: { in: ["infinireach", "infinireach-audio"] },
        tipo: event.tipo,
        status: { in: event.allowed },
      },
      data: { status: event.status, erro: event.status === "falhou" ? "Falha no envio via InfiniReach." : null },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Nao foi possivel atualizar o estado." }, { status: 500 });
  }
}
