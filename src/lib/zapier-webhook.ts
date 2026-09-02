import { normalizeE164 } from "./textbee-sms";

const ZAPIER_SMS_WEBHOOK_URL = process.env.ZAPIER_SMS_WEBHOOK_URL || "";
const ZAPIER_WHATSAPP_WEBHOOK_URL = process.env.ZAPIER_WHATSAPP_WEBHOOK_URL || process.env.ZAPIER_WEBHOOK_URL || "";

export function getZapierSmsWebhookUrl(): string | null {
  return ZAPIER_SMS_WEBHOOK_URL || ZAPIER_WEBHOOK_URL || null;
}

export function isZapierSmsConfigured(): boolean {
  return Boolean(getZapierSmsWebhookUrl());
}

export function getZapierWhatsAppWebhookUrl(): string | null {
  return ZAPIER_WHATSAPP_WEBHOOK_URL || null;
}

export function isZapierWhatsAppConfigured(): boolean {
  return Boolean(getZapierWhatsAppWebhookUrl());
}

export async function sendZapierSms(
  phoneRaw: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  const webhook = getZapierSmsWebhookUrl();
  if (!webhook) {
    return { ok: false, error: "SMS não configurado. Faltam ZAPIER_SMS_WEBHOOK_URL." };
  }

  const phone = normalizeE164(phoneRaw);
  if (!phone) {
    return { ok: false, error: "Número de telemóvel inválido." };
  }
  if (!String(message || "").trim()) {
    return { ok: false, error: "A mensagem não pode estar vazia." };
  }

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app: "orey",
        channel: "sms",
        to: phone,
        message,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      console.error("[zapier-sms] Falhou:", response.status);
      return { ok: false, error: `Falha ao entregar SMS no Zapier (${response.status}).` };
    }
    return { ok: true };
  } catch (error) {
    console.error("[zapier-sms] Erro:", error);
    return { ok: false, error: "Erro de rede ao contactar o Zapier." };
  }
}

export async function sendZapierWhatsApp(
  phoneRaw: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  const webhook = getZapierWhatsAppWebhookUrl();
  if (!webhook) {
    return { ok: false, error: "WhatsApp via Zapier não configurado. Falta ZAPIER_WHATSAPP_WEBHOOK_URL." };
  }

  const phone = normalizeE164(phoneRaw);
  if (!phone) {
    return { ok: false, error: "Número de telemóvel inválido." };
  }
  if (!String(message || "").trim()) {
    return { ok: false, error: "A mensagem não pode estar vazia." };
  }

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app: "orey",
        channel: "whatsapp",
        to: phone,
        message,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      console.error("[zapier-whatsapp] Falhou:", response.status);
      return { ok: false, error: `Falha ao enviar WhatsApp via Zapier (${response.status}).` };
    }
    return { ok: true };
  } catch (error) {
    console.error("[zapier-whatsapp] Erro:", error);
    return { ok: false, error: "Erro de rede ao contactar o Zapier para WhatsApp." };
  }
}
