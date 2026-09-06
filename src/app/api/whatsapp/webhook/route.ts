import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "oreyazores26";

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (Array.isArray(messages) && messages.length > 0) {
      for (const msg of messages) {
        const from = msg.from;
        const text = msg.text?.body || "";
        const wamid = msg.id;

        if (from && text) {
          await prisma.comunicacao.create({
            data: {
              tipo: "WHATSAPP",
              canal: "webhook-inbound",
              destinatario: from,
              mensagem: text,
              status: "recebido",
              providerId: wamid,
              assunto: "Mensagem Recebida do Cliente",
            },
          });
        }
      }
    } else {
      const from = body?.from || body?.sender || body?.phone || "Desconhecido";
      const text = body?.message || body?.text || body?.content || JSON.stringify(body);
      await prisma.comunicacao.create({
        data: {
          tipo: "WHATSAPP",
          canal: "zapier-webhook",
          destinatario: String(from),
          mensagem: String(text),
          status: "recebido",
          assunto: "Webhook Inbound",
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[whatsapp/webhook] Erro:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
