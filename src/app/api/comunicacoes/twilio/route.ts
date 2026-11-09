import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { registarComunicacaoRecebida } from "@/lib/communications";
import {
  getTwilioConfig,
  mapTwilioStatus,
  validTwilioSignature,
} from "@/lib/twilio";

export const runtime = "nodejs";

/**
 * Webhook único do Twilio para a central de comunicações:
 *
 * - Mensagens recebidas (SMS/WhatsApp): campos `Body`, `From`, `MessageSid`.
 * - Estados de entrega (status callback): `MessageSid` + `MessageStatus`
 *   (queued/sent/delivered/read/failed/undelivered).
 * - Estados de chamadas de voz: `CallSid` + `CallStatus`.
 *
 * Configurar em Twilio:
 *   Messaging > Senders > (número) > "A message comes in":
 *     POST https://<dominio>/api/comunicacoes/twilio
 *   Status callback (por número ou via TWILIO_STATUS_CALLBACK_URL):
 *     https://<dominio>/api/comunicacoes/twilio
 *
 * A assinatura `X-Twilio-Signature` é validada com TWILIO_AUTH_TOKEN. Para
 * testes locais em NODE_ENV="development" pode desativar-se com
 * TWILIO_VALIDATE_SIGNATURE="false".
 */
export async function POST(req: NextRequest) {
  try {
    const { authToken } = getTwilioConfig();
    const validarAssinatura = !(
      process.env.NODE_ENV === "development" &&
      String(process.env.TWILIO_VALIDATE_SIGNATURE || "").trim().toLowerCase() === "false"
    );
    if (validarAssinatura && !authToken) {
      return NextResponse.json({ error: "Webhook Twilio não configurado." }, { status: 503 });
    }

    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
    }

    const params: Record<string, string> = {};
    form.forEach((value, key) => {
      params[key] = typeof value === "string" ? value : value.name;
    });

    if (validarAssinatura) {
      const url = resolveWebhookUrl(req);
      const signature = req.headers.get("x-twilio-signature");
      if (!validTwilioSignature(authToken, signature, url, params)) {
        console.warn("[POST /api/comunicacoes/twilio] Assinatura inválida.");
        return NextResponse.json({ error: "Assinatura Twilio inválida." }, { status: 403 });
      }
    }

    await sincronizarEstado(params);

    const mensagemRecebida = await registarRecebida(params);
    if (mensagemRecebida.erro) {
      return NextResponse.json({ error: mensagemRecebida.erro }, { status: 400 });
    }

    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } },
    );
  } catch (error) {
    console.error("[POST /api/comunicacoes/twilio]", error);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

function resolveWebhookUrl(req: NextRequest): string {
  const override = String(process.env.TWILIO_WEBHOOK_URL || "").trim();
  if (override) return override;
  const original = new URL(req.url);
  const proto = String(req.headers.get("x-forwarded-proto") || original.protocol.replace(":", "")).split(",")[0].trim();
  const host = String(req.headers.get("x-forwarded-host") || req.headers.get("host") || original.host).split(",")[0].trim();
  return `${proto}://${host}${original.pathname}${original.search}`;
}

async function sincronizarEstado(params: Record<string, string>): Promise<void> {
  const voice = Boolean(params.CallSid);
  const messageStatus = voice ? params.CallStatus : params.MessageStatus || params.SmsStatus || "";
  const sid = voice ? params.CallSid : params.MessageSid || params.SmsSid || "";
  if (!messageStatus || !sid) return;

  // A completed call is not proof that a person heard the message.
  const voiceStatuses: Record<string, "pendente" | "enviado" | "falhou"> = {
    accepted: "pendente", queued: "pendente", initiated: "pendente",
    ringing: "pendente", "in-progress": "pendente", completed: "enviado",
    failed: "falhou", busy: "falhou", "no-answer": "falhou", canceled: "falhou",
  };
  const status = voice
    ? voiceStatuses[messageStatus.trim().toLowerCase()]
    : mapTwilioStatus(messageStatus);
  if (!status) return;

  const erro =
    status === "falhou"
      ? String(params.ErrorMessage || "").trim() ||
        (params.ErrorCode ? `Twilio error ${params.ErrorCode}` : voice ? `Twilio voice: ${messageStatus}` : "Falha no envio via Twilio.")
      : null;

  const atualizados = await prisma.comunicacao.updateMany({
    where: {
      providerId: sid,
      ...(voice ? { tipo: "CHAMADA", canal: "twilio-voice" } : {}),
      // Late progress callbacks must not undo a terminal call status.
      ...(voice && status === "pendente" ? { status: "pendente" } : {}),
    },
    data: { status, erro },
  }).catch((error: unknown) => {
    console.error("[twilio] Erro ao atualizar estado:", error);
    return { count: 0 };
  });

  if (atualizados.count === 0) {
    console.warn("[twilio] Estado recebido para mensagem desconhecida:", sid, messageStatus);
  }
}

async function registarRecebida(
  params: Record<string, string>,
): Promise<{ ok: boolean; erro?: string }> {
  const body = String(params.Body || "").trim();
  const from = String(params.From || "").trim();
  if (!body || !from) return { ok: true };

  const eWhatsApp = /^whatsapp:/i.test(from);
  const remetente = eWhatsApp ? from.replace(/^whatsapp:/i, "") : from;

  const resultado = await registarComunicacaoRecebida({
    tipo: eWhatsApp ? "WHATSAPP" : "SMS",
    mensagem: body,
    remetente,
    nomeRemetente: params.ProfileName ? String(params.ProfileName) : undefined,
    canal: "twilio",
    providerId: params.MessageSid || params.SmsSid || undefined,
    recebidoEm: new Date(),
  });

  return { ok: resultado.ok, erro: resultado.ok ? undefined : "Não foi possível registar a mensagem recebida." };
}
