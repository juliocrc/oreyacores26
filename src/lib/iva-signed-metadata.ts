import type { OfficialPdfMetadata } from "./invoice-official";

export function signedIvaDisplay(value: string | null | undefined) {
  if (!value) return null;
  const pdf = JSON.parse(value) as OfficialPdfMetadata;
  return { filename: pdf.filename, size: pdf.size, uploadedAt: pdf.uploadedAt, sha256: pdf.sha256 };
}
