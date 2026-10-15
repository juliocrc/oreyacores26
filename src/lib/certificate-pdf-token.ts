import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuthSecret, getBaseUrl } from "./auth";

/**
 * Token de acesso público a um certificado PDF específico (por serial).
 *
 * O certificado contém dados do cliente/navio, por isso não é exposto por mero
 * conhecimento do serial. Em vez disso gera-se um token assinado (HMAC) com
 * expiração, que pode ser partilhado (ex.: link enviado por email) sem expor os
 * restantes certificados.
 */

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dias

function getTokenSecret(): string {
  return (
    process.env.CERTIFICATE_PDF_TOKEN_SECRET ||
    process.env.PUBLIC_FATURA_TOKEN_SECRET ||
    process.env.CRON_SECRET ||
    getAuthSecret()
  );
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(data: string): string {
  return createHmac("sha256", getTokenSecret()).update(data).digest("hex").slice(0, 32);
}

export function signCertificatePdfToken(serial: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const normalized = String(serial || "").trim();
  if (!normalized) throw new Error("Serial obrigatório para gerar o token do certificado.");
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(60, Math.floor(ttlSeconds));
  const payload = `${normalized}|${expiresAt}`;
  return `${base64UrlEncode(payload)}.${sign(payload)}`;
}

/** Devolve true se o token é válido, não expirou e corresponde ao serial indicado. */
export function verifyCertificatePdfToken(token: string | null | undefined, serial: string): boolean {
  const rawToken = String(token || "").trim();
  const normalized = String(serial || "").trim();
  if (!rawToken || !normalized) return false;

  const [encoded, provided] = rawToken.split(".");
  if (!encoded || !provided) return false;

  let payload: string;
  try {
    payload = base64UrlDecode(encoded);
  } catch {
    return false;
  }

  const sep = payload.lastIndexOf("|");
  if (sep <= 0) return false;
  const payloadSerial = payload.slice(0, sep);
  const expiresAt = Number(payload.slice(sep + 1));
  if (payloadSerial !== normalized) return false;
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return false;

  const expected = sign(payload);
  try {
    return timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

/** URL pública assinada (com expiração) para descarregar o certificado PDF. */
export function buildCertificatePdfPublicUrl(serial: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const base = getBaseUrl().replace(/\/+$/, "");
  const params = new URLSearchParams({ serial: String(serial || "").trim() });
  params.set("t", signCertificatePdfToken(serial, ttlSeconds));
  return `${base}/api/certificados/pdf?${params.toString()}`;
}
