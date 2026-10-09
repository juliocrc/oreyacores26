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

export async function sendInfinireachSms(
  phoneRaw: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isInfinireachConfigured()) {
    return { ok: false, error: "SMS não configurado. Faltam INFINIREACH_API_KEY / INFINIREACH_FROM." };
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
        channel: "sms",
        externalId: `orey-${Date.now()}`,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || (data && typeof data === "object" && (data as { success?: unknown }).success === false)) {
      const errorDetail =
        data && typeof data === "object" && "message" in data
          ? String((data as { message?: unknown }).message || "")
          : "";
      console.error("[infinireach-sms] Falhou:", response.status, errorDetail);
      return { ok: false, error: `Falha ao enviar SMS (${response.status}).` };
    }
    return { ok: true };
  } catch (error) {
    console.error("[infinireach-sms] Erro:", error);
    return { ok: false, error: "Erro de rede ao enviar SMS." };
  }
}
