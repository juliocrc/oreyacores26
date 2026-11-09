import { normalizeE164 } from "./textbee-sms";
const BASE_URL = "https://api.infinireach.io";

// Lidas em tempo de execução (e não em âmbito de módulo) para que a chave já
// definida nas variáveis de ambiente seja apanhada mesmo com módulos em cache.
function infinireachKey() {
  return String(process.env.INFINIREACH_API_KEY || "").trim();
}

function infinireachFrom() {
  return String(process.env.INFINIREACH_FROM || "").trim();
}

export function isInfinireachConfigured(): boolean {
  return Boolean(infinireachKey() && infinireachFrom());
}

export async function sendInfinireachMessage(
  phoneRaw: string,
  message: string,
  channel: "sms" | "whatsapp" = "sms",
): Promise<{ ok: boolean; error?: string; uncertain?: boolean; providerId?: string }> {
  if (!isInfinireachConfigured()) {
    return { ok: false, error: "InfiniReach não configurado. Faltam INFINIREACH_API_KEY / INFINIREACH_FROM." };
  }

  const phone = normalizeE164(phoneRaw);
  if (!phone) {
    return { ok: false, error: "Número de telemóvel inválido." };
  }
  if (!String(message || "").trim()) {
    return { ok: false, error: "A mensagem não pode estar vazia." };
  }

  try {
    const response = await fetch(`${BASE_URL}/api/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": infinireachKey(),
      },
      body: JSON.stringify({
        to: phone,
        message,
        from: infinireachFrom(),
        channel,
        externalId: `orey-${channel}-${Date.now()}`,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok && data?.success === true && data?.queued === true && typeof data?.messageId === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(data.messageId)) {
      return { ok: true, providerId: data.messageId };
    }
    if (response.ok || response.status >= 500 || response.status === 408 || response.status === 409) {
      return { ok: false, uncertain: true, error: "O fornecedor pode ter colocado a SMS em fila. Não repita; verifique a fila e o histórico no InfiniReach." };
    }
    if (!response.ok) {
      const errorDetail =
        data && typeof data === "object" && "message" in data
          ? String((data as { message?: unknown }).message || "")
          : "";
      console.error(`[infinireach-${channel}] Falhou:`, response.status, errorDetail);
      return { ok: false, error: `Falha ao enviar ${channel.toUpperCase()} (${response.status}).` };
    }
    return { ok: false, uncertain: true, error: "Estado da SMS não confirmado. Não repita; verifique no fornecedor." };
  } catch (error) {
    console.error(`[infinireach-${channel}] Erro:`, error);
    return { ok: false, uncertain: true, error: `Resposta do fornecedor não confirmada para ${channel.toUpperCase()}. Não repita; verifique no fornecedor.` };
  }
}

export async function sendInfinireachSms(
  phoneRaw: string,
  message: string,
): Promise<{ ok: boolean; error?: string; uncertain?: boolean; providerId?: string }> {
  return sendInfinireachMessage(phoneRaw, message, "sms");
}

export async function sendInfinireachWhatsApp(
  phoneRaw: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  return sendInfinireachMessage(phoneRaw, message, "whatsapp");
}

export async function sendInfinireachWhatsAppAudio(
  phoneRaw: string,
  audio: Buffer,
  externalId: string,
): Promise<{ ok: boolean; providerId?: string; status?: "pendente"; uncertain?: boolean; error?: string }> {
  const key = infinireachKey();
  const from = infinireachFrom();
  if (!key || !from || /[\r\n]/.test(key + from)) {
    return { ok: false, error: "InfiniReach audio is not configured correctly." };
  }
  const to = normalizeE164(phoneRaw);
  if (!to || typeof externalId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(externalId) ||
      !Buffer.isBuffer(audio) || !audio.length || audio.length > 10 * 1024 * 1024) {
    return { ok: false, error: "Invalid audio, phone number or externalId." };
  }

  let messageStarted = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "voice.mp3");
    const upload = await fetch(`${BASE_URL}/api/v1/media`, {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { "X-API-Key": key }, body: form,
    });
    if (!upload.ok) return { ok: false, error: `InfiniReach upload rejected (HTTP ${upload.status}).` };
    const media = await upload.json();
    if (media?.success !== true || typeof media.url !== "string") {
      return { ok: false, error: "Invalid InfiniReach upload response." };
    }
    const url = new URL(media.url);
    if (url.protocol !== "https:" || url.hostname !== "api.infinireach.io" || url.port ||
        url.username || url.password || !url.pathname.startsWith("/api/media/") ||
        url.pathname === "/api/media/" || url.hash) {
      return { ok: false, error: "Invalid InfiniReach media URL." };
    }
    messageStarted = true;
    const response = await fetch(`${BASE_URL}/api/v1/messages`, {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { "Content-Type": "application/json", "X-API-Key": key },
      body: JSON.stringify({ to, from, channel: "whatsapp", mediaUrl: url.href, mediaType: "audio/mpeg", externalId }),
    });
    const data = await response.json();
    if (data?.success === false || (response.status >= 400 && response.status < 500)) {
      return { ok: false, error: `InfiniReach message rejected (HTTP ${response.status}).` };
    }
    if (!response.ok || data?.success !== true || data.queued !== true ||
        typeof data.messageId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(data.messageId)) {
      throw new Error("Unconfirmed acceptance");
    }
    return { ok: true, providerId: data.messageId, status: "pendente" };
  } catch {
    if (messageStarted) {
      console.warn("[infinireach-audio] Message outcome uncertain; check provider logs before retrying.");
      return { ok: false, uncertain: true, error: "Message outcome uncertain; check provider logs before retrying." };
    }
    return { ok: false, error: "InfiniReach audio upload failed; no message sent." };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
