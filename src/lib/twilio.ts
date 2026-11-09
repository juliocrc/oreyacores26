import { createHmac, timingSafeEqual } from "crypto";
import { normalizeE164 } from "./textbee-sms";

// Historical callbacks only. No outbound Twilio transport remains.
export function getTwilioConfig() {
  return { authToken: (process.env.TWILIO_AUTH_TOKEN || "").trim() };
}

export type TwilioMessageStatus = "pendente" | "enviado" | "entregue" | "lido" | "falhou";

export function toWhatsAppAddress(raw: string | null | undefined): string {
  const value = String(raw || "").trim().replace(/^whatsapp:/i, "");
  const e164 = normalizeE164(value);
  return e164 ? `whatsapp:${e164}` : "";
}

const STATUS_MAP: Record<string, TwilioMessageStatus> = {
  accepted: "pendente", queued: "pendente", scheduled: "pendente", sending: "pendente",
  sent: "enviado", delivered: "entregue", read: "lido", failed: "falhou", undelivered: "falhou", canceled: "falhou",
};

export function mapTwilioStatus(raw: string | null | undefined): TwilioMessageStatus | null {
  return STATUS_MAP[String(raw || "").trim().toLowerCase()] || null;
}

export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const payload = Object.keys(params).sort().reduce((acc, key) => acc + key + String(params[key] ?? ""), url);
  return createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
}

export function validTwilioSignature(authToken: string, signature: string | null | undefined, url: string, params: Record<string, string>): boolean {
  if (!authToken || !signature) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params), "utf8");
  const received = Buffer.from(String(signature), "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
