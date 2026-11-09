import { buildWhatsAppUrl } from "./communications";
import { normalizeE164 } from "./textbee-sms";
import { sendZapierWhatsApp, isZapierWhatsAppConfigured } from "./zapier-webhook";
import { isInfinireachConfigured, sendInfinireachWhatsApp } from "./infinireach-sms";
import { isOpenwaSelected, isOpenwaConfigured, sendOpenwa } from "./openwa";
import prisma from "./prisma";
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
  /** Identifier returned by the delivery API. */
  providerId?: string;
  /** True when the API accepted the message, not evidence of delivery. False for manual links. */
  enviadoDeFacto?: boolean;
  /** Provider que tratou o envio. */
  provider?: "openwa" | "infinireach" | "zapier" | "waba";
  uncertain?: boolean;
  closed?: boolean;
  accepted?: boolean;
  /** URL wa.me de fallback. */
  link?: string;
  /** True quando não há API configurada (só link wa.me disponível). */
  naoConfigurado?: boolean;
};

function getConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const version = process.env.WHATSAPP_API_VERSION || "v21.0";
  return { accessToken, phoneNumberId, version };
}

export function whatsappApiConfigurado(): boolean {
  if (isOpenwaSelected()) return isOpenwaConfigured();
  const { accessToken, phoneNumberId } = getConfig();
  return Boolean(
    (accessToken && phoneNumberId) ||
      isZapierWhatsAppConfigured() ||
      isInfinireachConfigured(),
  );
}

export function apiUrlBase(): string {
  const { phoneNumberId, version } = getConfig();
  return `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
}

function decapitalizeFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

function normalizePhoneForApi(raw: string): string | null {
  return normalizeE164(raw)?.slice(1) ?? null;
}

async function enviarWhatsAppCore(
  phoneRaw: string,
  mensagem: string,
  communicationId?: number,
  system = false,
): Promise<WhatsAppProviderResult> {
  const link = buildWhatsAppUrl(phoneRaw, mensagem);

  if (isOpenwaSelected()) {
    let id = communicationId;
    try {
      if (!id) {
        const row = await prisma.comunicacao.create({ data: {
          tipo: "WHATSAPP", canal: "openwa", destinatario: phoneRaw,
          mensagem: system ? "Mensagem automatica WhatsApp (conteudo omitido)." : mensagem, status: "pendente",
        } });
        id = row.id;
      }
    } catch { return { ok: false, erro: "Nao foi possivel guardar o envio antes de contactar OpenWA." }; }
    const result = await sendOpenwa(phoneRaw, { text: mensagem }, id);
    if (!communicationId) {
      await prisma.comunicacao.update({ where: { id }, data: {
        status: result.ok || result.uncertain ? "pendente" : "falhou", erro: result.error ?? null, providerId: result.providerId ?? null,
      } }).catch(() => {});
    }
    return { ok: result.ok, erro: result.error, provider: "openwa", providerId: result.providerId,
      enviadoDeFacto: result.ok, accepted: result.ok, uncertain: result.uncertain, closed: result.closed };
  }

  if (isInfinireachConfigured()) {
    const waRes = await sendInfinireachWhatsApp(phoneRaw, mensagem);
    if (waRes.ok) {
      return { ok: true, enviadoDeFacto: true, provider: "infinireach", link };
    }
    return { ok: false, erro: waRes.error || "Erro no envio WhatsApp via InfiniReach.", link };
  }

  if (isZapierWhatsAppConfigured()) {
    const zapRes = await sendZapierWhatsApp(phoneRaw, mensagem);
    if (zapRes.ok) {
      return { ok: true, enviadoDeFacto: true, provider: "zapier", link };
    }
    return { ok: false, erro: zapRes.error || "Error no envio WhatsApp via Zapier.", link };
  }

  if (!whatsappApiConfigurado()) {
    return { ok: false, erro: "WhatsApp não configurado.", link, naoConfigurado: true };
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
      provider: "waba",
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

/**
 * Envia uma mensagem de texto via WhatsApp Business Cloud API ou Zapier.
 * Devolve link wa.me de fallback quando nenhum está configurado ou falham.
 */
export async function sendWhatsAppApi(
  phoneRaw: string,
  mensagem: string,
  communicationId?: number,
): Promise<WhatsAppProviderResult> {
  if (!(await isWhatsAppAllowed())) {
    return {
      ok: false,
      erro: "WhatsApp disponível apenas para o administrador Júlio Correia.",
    };
  }

  const core = await enviarWhatsAppCore(phoneRaw, mensagem, communicationId);
  if (core.naoConfigurado) {
    return { ok: true, enviadoDeFacto: false, link: core.link };
  }
  return core;
}

export type WhatsAppDocumentInput = {
  filename: string;
  content: Buffer;
  caption?: string;
};

/**
 * Envia um documento (PDF) via WhatsApp Cloud API nativa.
 *
 * Só funciona com a Cloud API oficial (WHATSAPP_ACCESS_TOKEN +
 * WHATSAPP_PHONE_NUMBER_ID): faz primeiro o upload da media e depois envia a
 * mensagem do tipo "document". Quando só existem providers de texto
 * (Zapier/InfiniReach) devolve `naoConfigurado` para o chamador cair no
 * fallback de texto + link wa.me.
 */
export async function sendWhatsAppDocument(
  phoneRaw: string,
  doc: WhatsAppDocumentInput,
): Promise<WhatsAppProviderResult> {
  if (!(await isWhatsAppAllowed())) {
    return {
      ok: false,
      erro: "WhatsApp disponível apenas para o administrador Júlio Correia.",
    };
  }

  const link = buildWhatsAppUrl(phoneRaw, doc.caption || doc.filename);
  if (isOpenwaSelected()) return { ok: false, provider: "openwa", erro: "Envio de documentos OpenWA indisponivel. Nenhum documento ou texto alternativo foi enviado." };
  const { accessToken, phoneNumberId, version } = getConfig();

  if (!accessToken || !phoneNumberId) {
    return {
      ok: false,
      erro: "O envio de documentos por WhatsApp requer a Cloud API configurada.",
      link,
      naoConfigurado: true,
    };
  }

  const phone = normalizePhoneForApi(phoneRaw);
  if (!phone) {
    return { ok: false, erro: "Número de telemóvel inválido.", link };
  }

  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", "application/pdf");
    form.append("file", new Blob([new Uint8Array(doc.content)], { type: "application/pdf" }), doc.filename);

    const uploadRes = await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      },
    );
    const uploadText = await uploadRes.text().catch(() => "");
    if (!uploadRes.ok) {
      return {
        ok: false,
        erro: extractErrorMessage(uploadText) || `Erro ao carregar o documento (${uploadRes.status}).`,
        link,
      };
    }

    const media = JSON.parse(uploadText) as { id?: string };
    if (!media?.id) {
      return { ok: false, erro: "A API do WhatsApp não devolveu o id do documento.", link };
    }

    const res = await fetch(apiUrlBase(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "document",
        document: {
          id: media.id,
          filename: doc.filename,
          ...(doc.caption ? { caption: doc.caption } : {}),
        },
      }),
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, erro: extractErrorMessage(text) || `Erro WhatsApp API (${res.status}).`, link };
    }

    const data = JSON.parse(text) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    };
    if (data.error?.message) {
      return { ok: false, erro: data.error.message, link };
    }

    return { ok: true, enviadoDeFacto: true, providerId: data.messages?.[0]?.id, link };
  } catch (e: any) {
    return { ok: false, erro: e?.message || "Erro ao ligar à WhatsApp API.", link };
  }
}

/**
 * Envia uma mensagem via WhatsApp sem exigir sessão de administrador
 * (usado por fluxos do sistema, ex.: código de acesso do cliente).
 * Falha explicitamente quando não há API configurada (não devolve só o link).
 */
export async function sendWhatsAppSystem(
  phoneRaw: string,
  mensagem: string,
): Promise<WhatsAppProviderResult> {
  const core = await enviarWhatsAppCore(phoneRaw, mensagem, undefined, true);
  if (core.naoConfigurado) {
    return {
      ok: false,
      erro: "O envio por WhatsApp não está configurado. Contacte a Orey Técnica Açores.",
      link: core.link,
    };
  }
  return core;
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
