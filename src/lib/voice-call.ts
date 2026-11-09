import { normalizeE164 } from "./textbee-sms";

export type VoiceCallInput = { telefone: string; mensagem: string; confirmed: true };
export type VoiceCallResult = {
  ok: boolean;
  providerId?: string;
  status?: string;
  error?: string;
};


function phoneNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  // Reject lists, extensions and overlong numbers before normalization.
  if (!/^(?:\+[1-9]\d{7,14}|00[1-9]\d{7,14}|351\d{9}|[2-9]\d{8})$/.test(raw)) return null;
  const phone = normalizeE164(/^[2-9]\d{8}$/.test(raw) ? `+351${raw}` : raw);
  if (!phone || (phone.startsWith("+351") && !/^\+351[2-9]\d{8}$/.test(phone))) return null;
  return phone;
}

export function validateVoiceCallInput(input: unknown):
  | { ok: true; value: VoiceCallInput }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Corpo inválido." };
  }
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["telefone", "mensagem", "confirmed"].includes(key))) {
    return { ok: false, error: "Apenas telefone, mensagem e confirmed são permitidos." };
  }
  if (body.confirmed !== true) return { ok: false, error: "Confirmação explícita obrigatória (confirmed: true)." };
  const telefone = phoneNumber(body.telefone);
  if (!telefone) return { ok: false, error: "Indique um único telefone E.164 válido ou um número português de 9 dígitos." };
  if (typeof body.mensagem !== "string" || body.mensagem.trim().length < 10 || body.mensagem.length > 1500) {
    return { ok: false, error: "A mensagem deve ser texto com 10 a 1500 caracteres." };
  }
  // XML 1.0 cannot represent these controls or unpaired UTF-16 surrogates.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(body.mensagem)) {
    return { ok: false, error: "A mensagem contém caracteres inválidos para voz." };
  }
  return { ok: true, value: { telefone, mensagem: body.mensagem.trim(), confirmed: true } };
}

export function isVoiceConfigured(): boolean {
  return false;
}

export async function startVoiceCall(input: unknown): Promise<VoiceCallResult> {
  const validated = validateVoiceCallInput(input);
  if (!validated.ok) return { ok: false, error: validated.error };
  return { ok: false, status: "disabled", error: "Chamadas de voz desativadas. Twilio foi removido; nao existe fornecedor de voz alternativo." };
}
