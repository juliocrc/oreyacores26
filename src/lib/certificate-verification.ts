import crypto from "node:crypto";
import QRCode from "qrcode";
import { getBaseUrl } from "./auth";
import type { InspectionCertificateInput } from "./inspection-certificate";

/**
 * Campos que entram no hash de integridade. É deliberadamente um tipo estrutural
 * mínimo para poder ser usado tanto pelo certificado PDF (a partir da BD) como
 * pelo certificado Excel (a partir do payload), garantindo o MESMO hash/QR.
 */
export type CertificateVerificationSource = {
  certNumber?: string | null;
  raftSerial?: string | null;
  inspectionDate?: string | null;
  shipName?: string | null;
  technician?: string | null;
  clientName?: string | null;
  checklist?: Record<string, unknown> | null;
};

/**
 * Hash de integridade do certificado (sha256 truncado). Não é uma assinatura
 * criptográfica — serve apenas para detetar alterações aos campos essenciais
 * entre o PDF emitido e os dados atuais no sistema.
 */
export function computeCertificateVerificationHashFrom(source: CertificateVerificationSource): string {
  const checklist = (source.checklist || {}) as Record<string, unknown>;
  const canonical = [
    source.certNumber ?? "",
    source.raftSerial ?? "",
    source.inspectionDate ?? "",
    source.shipName ?? "",
    source.technician ?? "",
    source.clientName ?? "",
    String(checklist.aprovacao_wp ?? ""),
  ].join("|");
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export function computeCertificateVerificationHash(input: InspectionCertificateInput): string {
  return computeCertificateVerificationHashFrom(input);
}

/** URL pública de verificação do certificado. */
export function buildCertificateVerificationUrlFor(
  serial: string | null | undefined,
  hash: string,
): string {
  const base = getBaseUrl().replace(/\/+$/, "");
  return `${base}/verificar/certificado?serial=${encodeURIComponent(serial || "")}&h=${hash}`;
}

export function buildCertificateVerificationUrl(input: InspectionCertificateInput, hash: string): string {
  return buildCertificateVerificationUrlFor(input.raftSerial, hash);
}

/** QR code (data URL) da página de verificação, com as opções canónicas. */
export async function generateCertificateVerificationQr(url: string): Promise<string | undefined> {
  try {
    return await QRCode.toDataURL(url, { margin: 0, width: 220, errorCorrectionLevel: "M" });
  } catch {
    return undefined;
  }
}

/**
 * Acrescenta ao certificado o hash de integridade e o QR code que aponta para a
 * página pública de verificação. Nunca lança: em caso de erro devolve o input
 * apenas com o hash (sem QR).
 */
export async function withCertificateVerification(
  input: InspectionCertificateInput,
): Promise<InspectionCertificateInput> {
  const hash = computeCertificateVerificationHashFrom(input);
  const verificationQr = await generateCertificateVerificationQr(
    buildCertificateVerificationUrlFor(input.raftSerial, hash),
  );
  return { ...input, verificationHash: hash, verificationQr };
}
