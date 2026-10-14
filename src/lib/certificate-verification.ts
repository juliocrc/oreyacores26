import crypto from "node:crypto";
import QRCode from "qrcode";
import { getBaseUrl } from "./auth";
import type { InspectionCertificateInput } from "./inspection-certificate";

/**
 * Hash de integridade do certificado (sha256 truncado). Não é uma assinatura
 * criptográfica — serve apenas para detetar alterações aos campos essenciais
 * entre o PDF emitido e os dados atuais no sistema.
 */
export function computeCertificateVerificationHash(input: InspectionCertificateInput): string {
  const checklist = (input.checklist || {}) as Record<string, unknown>;
  const canonical = [
    input.certNumber ?? "",
    input.raftSerial ?? "",
    input.inspectionDate ?? "",
    input.shipName ?? "",
    input.technician ?? "",
    input.clientName ?? "",
    String(checklist.aprovacao_wp ?? ""),
  ].join("|");
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

/** URL pública de verificação do certificado. */
export function buildCertificateVerificationUrl(input: InspectionCertificateInput, hash: string): string {
  const base = getBaseUrl().replace(/\/+$/, "");
  const serial = encodeURIComponent(input.raftSerial || "");
  return `${base}/verificar/certificado?serial=${serial}&h=${hash}`;
}

/**
 * Acrescenta ao certificado o hash de integridade e o QR code que aponta para a
 * página pública de verificação. Nunca lança: em caso de erro devolve o input
 * apenas com o hash (sem QR).
 */
export async function withCertificateVerification(
  input: InspectionCertificateInput,
): Promise<InspectionCertificateInput> {
  const hash = computeCertificateVerificationHash(input);
  let verificationQr: string | undefined;
  try {
    verificationQr = await QRCode.toDataURL(buildCertificateVerificationUrl(input, hash), {
      margin: 0,
      width: 220,
      errorCorrectionLevel: "M",
    });
  } catch {
    verificationQr = undefined;
  }
  return { ...input, verificationHash: hash, verificationQr };
}
