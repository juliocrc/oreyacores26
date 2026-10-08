import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { registarComunicacaoRecebida } from "@/lib/communications";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

const APP_SECRET = process.env.WHATSAPP_APP_SECRET || "";
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "oreyazores26";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

async function verificarAssinatura(req: NextRequest, raw: string): Promise<boolean> {
  if (!APP_SECRET) return true;
  const signature = req.headers.get("x-hub-signature-256") || "";
  if (!signature) return false;
  const expected = `sha256=${crypto.createHmac("sha256", APP_SECRET).update(raw).digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function extrairTextoDaMensagem(msg: Record<string, any>): string {
  if (msg?.text?.body) return String(msg.text.body);
  // Media com legenda ou sem texto: descreve o tipo para não perder a mensagem.
  for (const tipo of ["image", "video", "audio", "document", "sticker", "location", "contacts"]) {
    const part = msg?.[tipo];
    if (!part) continue;
    const caption = part?.caption || part?.url || part?.name || "";
    switch (tipo) {
      case "image":
        return caption ? `[Imagem] ${caption}` : "[Imagem recebida]";
      case "video":
        return caption ? `[Vídeo] ${caption}` : "[Vídeo recebido]";
      case "audio":
        return "[Mensagem de voz recebida]";
      case "document":
        return caption ? `[Documento] ${caption}` : `[Documento recebido: ${part?.filename || ""}]`;
      case "sticker":
        return "[Autocolante recebido]";
      case "location":
        return part?.name ? `[Localização: ${part.name}]` : "[Localização recebida]";
      case "contacts":
        return "[Contacto partilhado]";
      default:
        break;
    }
  }
  return "";
}

async function tratarStatuses(value: Record<string, any>): Promise<void> {
  const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
  for (const st of statuses) {
    const id = st?.id || st?.message_id;
    const evento = String(st?.status || "").toLowerCase();
    if (!id) continue;

    const alvo = await prisma.comunicacao.findFirst({
      where: { providerId: id },
      orderBy: { id: "desc" },
    }).catch(() => null);
    if (!alvo || alvo.status === "recebido") continue;

    const data: Record<string, unknown> = {};
    if (evento === "delivered") data.status = "entregue";
    if (evento === "read") data.status = "lido";
    if (evento === "failed") {
      data.status = "falhou";
      data.erro = String(st?.errors?.[0]?.message || st?.errors?.[0]?.title || "Falha na entrega WhatsApp.");
    }
    if (evento === "sent" && alvo.status === "pendente") data.status = "enviado";

    if (Object.keys(data).length > 0) {
      await prisma.comunicacao.update({ where: { id: alvo.id }, data }).catch(() => {});
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const okSig = await verificarAssinatura(req, raw);
    if (!okSig) {
      return NextResponse.json({ error: "Assinatura inválida." }, { status: 403 });
    }

    let body: Record<string, any>;
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
    }

    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value || {};

    // 1) Status de entrega/leitura das mensagens que nós enviamos.
    await tratarStatuses(value);

    // 2) Mensagens recebidas (payload da WhatsApp Cloud API).
    const messages = Array.isArray(value?.messages) ? value.messages : [];
    if (messages.length > 0) {
      for (const msg of messages) {
        const from = String(msg?.from || "").trim();
        const wamid = String(msg?.id || "").trim();
        const nomePerfil = String(msg?.profile?.name || value?.contacts?.[0]?.profile?.name || "").trim();
        const timestamp = msg?.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date();
        const texto = extrairTextoDaMensagem(msg);

        if (!from) continue;
        if (!texto && msg?.type !== "text") continue;

        const resultado = await registarComunicacaoRecebida({
          tipo: "WHATSAPP",
          remetente: from,
          nomeRemetente: nomePerfil || undefined,
          mensagem: texto || "[Mensagem recebida sem texto]",
          canal: "whatsapp-api",
          providerId: wamid || undefined,
          recebidoEm: timestamp,
        });
        if (!resultado.ok) {
          console.error("[whatsapp/webhook] Não foi possível registar mensagem recebida de", from);
        }
      }
      return NextResponse.json({ success: true, registadas: messages.length });
    }

    // 3) Formato antigo genérico (Zapier / providers simples).
    const from = String(body?.from || body?.sender || body?.phone || body?.contact || "").trim();
    const text = String(
      body?.message || body?.text || body?.content ||
      (Array.isArray(body?.messages) ? body.messages.map((m: any) => m?.text || m?.body || "").join("\n") : ""),
    ).trim();

    if (from && text) {
      const resultado = await registarComunicacaoRecebida({
        tipo: "WHATSAPP",
        remetente: from,
        mensagem: text,
        canal: "zapier-webhook",
        providerId: String(body?.providerId || body?.id || "").trim() || undefined,
        recebidoEm: body?.timestamp ? new Date(String(body.timestamp)) : new Date(),
      });
      return NextResponse.json({ success: resultado.ok, duplicada: resultado.duplicada ?? false });
    }

    // 4) Mensagem de erro/echo do próprio número (ignorar silenciosamente).
    return NextResponse.json({ success: true, registadas: 0 });
  } catch (error) {
    console.error("[whatsapp/webhook] Erro:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}