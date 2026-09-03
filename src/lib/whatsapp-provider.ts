import { buildWhatsAppUrl } from "./communications";
import { sendZapierWhatsApp, isZapierWhatsAppConfigured } from "./zapier-webhook";
import { getAuthSession } from "@/auth";
import { isWhatsAppAllowedEmail, WHATSAPP_ALLOWED_USER_EMAIL } from "./whatsapp-allowed";

/** Email do administrador com permissão para usar WhatsApp. */
export { WHATSAPP_ALLOWED_USER_EMAIL };

/**
 * O WhatsApp só está funcional para o administrador Júlio Correia.
 * Devolve true apenas para esse email autenticado.
 */
export async function isWhatsAppAllowed(): Promise<boolean> {
  const session = await getAuthSession();
  return isWhatsAppAllowedEmail(session?.user?.email);
}

export type WhatsAppProviderResult = {
  ok: boolean;
  erro?: string;
  /** Identificador devolvido pela API (ex.: wamidMessageID). */
  providerId?: string;
  /** True quando a mensagem foi realmente entregue pela API. False quando só há link wa.me. */
  enviadoDeFacto?: boolean;
  /** URL wa.me de fallback. */
  link?: string;
};

function getConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const version = process.env.WHATSAPP_API_VERSION || "v21.0";
  return { accessToken, phoneNumberId, version };
}

export function whatsappApiConfigurado(): boolean {
  const { accessToken, phoneNumberId } = getConfig();
  return Boolean((accessToken && phoneNumberId) || isZapierWhatsAppConfigured());
}

export function apiUrlBase(): string {
  const { phoneNumberId, version } = getConfig();
  return `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
}

function decapitalizeFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

function normalizePhoneForApi(raw: string): string {
  return raw.replace(/[^0-9]/g, "").replace(/^0+/, "");
}

/**
 * Envia uma mensagem de texto via WhatsApp Business Cloud API ou Zapier.
 * Devolve link wa.me de fallback quando nenhum está configurado ou falham.
 */
export async function sendWhatsAppApi(
  phoneRaw: string,
  mensagem: string,
): Promise<WhatsAppProviderResult> {
  if (!(await isWhatsAppAllowed())) {
    return {
      ok: false,
      erro: "WhatsApp disponível apenas para o administrador Júlio Correia.",
    };
  }

  const link = buildWhatsAppUrl(phoneRaw, mensagem);

  if (isZapierWhatsAppConfigured()) {
    const zapRes = await sendZapierWhatsApp(phoneRaw, mensagem);
    if (zapRes.ok) {
      return { ok: true, enviadoDeFacto: true, link };
    }
    return { ok: false, erro: zapRes.error || "Erro no envio WhatsApp via Zapier.", link };
  }

  if (!whatsappApiConfigurado()) {
    return { ok: true, enviadoDeFacto: false, link };
  }

  const phone = normalizePhoneForApi(phoneRaw);
  if (!phone) {
    return { ok: false, erro: "Número de telemóvel inválido.", link };
  }

  try {
    const res = await fetch(apiUrlBase(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getConfig().accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: mensagem },
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      const message = extractErrorMessage(errorBody);
      return { ok: false, erro: message || `Erro WhatsApp API (${res.status}).`, link };
    }

    const data = (await res.json()) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    };

    if (data.error?.message) {
      return { ok: false, erro: data.error.message, link };
    }

    return {
      ok: true,
      enviadoDeFacto: true,
      providerId: data.messages?.[0]?.id,
      link,
    };
  } catch (e: any) {
    return {
      ok: false,
      erro: e?.message || "Erro ao ligar à WhatsApp API.",
      link,
    };
  }
}

function extractErrorMessage(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) return String(parsed.error.message);
    if (parsed?.error?.error?.message) return String(parsed.error.error.message);
    const first = Array.isArray(parsed?.error?.error_details)
      ? parsed.error.error_details[0]?.message
      : null;
    return first || null;
  } catch {
    return raw || null;
  }
}

export { decapitalizeFirst };
