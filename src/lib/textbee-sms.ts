import { phoneIdentity } from "./communication-inbox";

const TEXTBEE_API_KEY = process.env.TEXTBEE_API_KEY || "";
const TEXTBEE_DEVICE_ID = process.env.TEXTBEE_DEVICE_ID || "";

export function normalizeE164(raw: string): string | null {
  const phone = phoneIdentity(String(raw || ""));
  return phone && /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export async function sendTextBeeSms(phoneRaw: string, message: string): Promise<{ ok: boolean; error?: string }> {
  if (!TEXTBEE_API_KEY || !TEXTBEE_DEVICE_ID) {
    return { ok: false, error: "SMS não configurado. Faltam TEXTBEE_API_KEY / TEXTBEE_DEVICE_ID." };
  }

  const phone = normalizeE164(phoneRaw);
  if (!phone) {
    return { ok: false, error: "Número de telemóvel inválido." };
  }
  if (!String(message || "").trim()) {
    return { ok: false, error: "A mensagem não pode estar vazia." };
  }

  try {
    const response = await fetch(
      `https://api.textbee.dev/api/v1/gateway/devices/${TEXTBEE_DEVICE_ID}/send-sms`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": TEXTBEE_API_KEY,
        },
        body: JSON.stringify({ recipients: [phone], message }),
      },
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[textbee-sms] Falhou:", response.status, JSON.stringify(data));
      return { ok: false, error: `Falha ao enviar SMS (${response.status}).` };
    }
    return { ok: true };
  } catch (error) {
    console.error("[textbee-sms] Erro:", error);
    return { ok: false, error: "Erro de rede ao enviar SMS." };
  }
}
