import { buildInspectionCertificateDoc, type InspectionCertificateInput } from "./inspection-certificate";

function sanitizeSegment(value?: string | null): string {
  return String(value ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120);
}

/** Nome do ficheiro PDF do certificado: "AZ26-NNN (NAVIO).pdf". */
export function certificatePdfFileName(input: InspectionCertificateInput): string {
  const cert = sanitizeSegment(input.certNumber) || "SEM-NUMERO";
  const ship = sanitizeSegment(input.shipName) || "SEM NAVIO";
  return `${cert} (${ship}).pdf`;
}

/** Gera o certificado em PDF (jsPDF, funciona em Node). */
export function buildCertificatePdfBuffer(input: InspectionCertificateInput): Buffer {
  const doc = buildInspectionCertificateDoc(input);
  const output = doc.output("arraybuffer") as ArrayBuffer;
  return Buffer.from(output);
}
