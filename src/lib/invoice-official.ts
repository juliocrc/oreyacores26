export const MAX_OFFICIAL_PDF_BYTES = 4 * 1024 * 1024;

export type OfficialPdfMetadata = {
  storage: "encrypted-blob" | "local-dev";
  key: string;
  sha256: string;
  filename: string;
  size: number;
  contentType: "application/pdf";
  uploadedBy: string;
  uploadedAt: string;
};

export function invoiceMetadata(value: string | null | undefined): Record<string, unknown> {
  const meta: unknown = JSON.parse(value || "{}");
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new Error("Metadados de faturacao invalidos.");
  return meta as Record<string, unknown>;
}

export function invoiceDisplay(invoice: { numeroFatura: string; metadados?: string | null; numeroFaturaOficial?: string | null }) {
  const meta = invoiceMetadata(invoice.metadados);
  const value = invoice.numeroFaturaOficial ?? meta.numeroFaturaOficial;
  const official = typeof value === "string" ? value.trim() : "";
  const pdf = meta.pdfOficial as OfficialPdfMetadata | undefined;
  return {
    numeroFaturaInterno: invoice.numeroFatura,
    numeroFaturaOficial: official || null,
    numeroFaturaDisplay: official || invoice.numeroFatura,
    sistemaOrigem: official ? "Navision" : null,
    // Never serialize the storage locator to a browser.
    pdfOficial: pdf ? { filename: pdf.filename, size: pdf.size, sha256: pdf.sha256,
      contentType: pdf.contentType, uploadedBy: pdf.uploadedBy, uploadedAt: pdf.uploadedAt } : null,
  };
}
