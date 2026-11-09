import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { list, put } from "@vercel/blob";
import { PDFDocument } from "pdf-lib";
import { MAX_OFFICIAL_PDF_BYTES, type OfficialPdfMetadata } from "./invoice-official";

export class OfficialInvoiceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function encryptionKey() {
  const value = process.env.INVOICE_PDF_ENCRYPTION_KEY || "";
  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new OfficialInvoiceError("Configure INVOICE_PDF_ENCRYPTION_KEY com 32 bytes hexadecimais para proteger os PDFs.", 503);
  }
  return Buffer.from(value, "hex");
}

function blobCredentials() {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  // Pin shipped static-token stores even when a different OIDC store is connected.
  if (token) return { token };
  const storeId = process.env.BLOB_STORE_ID?.trim() || process.env.BLOB_READ_WRITE_TOKEN_STORE_ID?.trim();
  if (!storeId) return undefined;
  if (!/^(?:store_)?[a-zA-Z0-9]{1,128}$/.test(storeId)) {
    throw new OfficialInvoiceError("BLOB_STORE_ID invalido.", 503);
  }
  // Let the SDK obtain and refresh OIDC credentials; never pass the OIDC token.
  return { storeId };
}

type PdfNamespace = "invoice-official" | "iva-signed";

function localRoot(namespace: PdfNamespace) {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL) {
    throw new OfficialInvoiceError("Armazenamento duravel de PDFs nao configurado. Configure BLOB_STORE_ID (OIDC) ou BLOB_READ_WRITE_TOKEN e INVOICE_PDF_ENCRYPTION_KEY.", 503);
  }
  return path.join(process.cwd(), namespace === "invoice-official" ? ".private-invoice-pdfs" : ".private-iva-signed-pdfs");
}

export async function storeSecurePdf(namespace: PdfNamespace, invoiceId: number, file: File, actor: string): Promise<OfficialPdfMetadata> {
  if (!file.size || file.size > MAX_OFFICIAL_PDF_BYTES) throw new OfficialInvoiceError("O PDF deve ter entre 1 byte e 4 MB.", 413);
  if (!/\.pdf$/i.test(file.name) || !["", "application/pdf", "application/octet-stream"].includes(file.type)) {
    throw new OfficialInvoiceError("Selecione um ficheiro .pdf com tipo PDF.", 415);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length !== file.size || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new OfficialInvoiceError("O ficheiro nao e um PDF valido.");
  }
  try { await PDFDocument.load(bytes); } catch { throw new OfficialInvoiceError("PDF invalido ou protegido por palavra-passe."); }
  const key = `${namespace}/${invoiceId}/${randomUUID()}.bin`;
  let storage: OfficialPdfMetadata["storage"];
  const credentials = blobCredentials();
  if (credentials) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
    cipher.setAAD(Buffer.from(key));
    const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
    await put(key, Buffer.concat([iv, cipher.getAuthTag(), encrypted]), {
      ...credentials,
      access: "public", addRandomSuffix: false, contentType: "application/octet-stream",
    });
    storage = "encrypted-blob";
  } else {
    const root = localRoot(namespace);
    await mkdir(path.join(root, String(invoiceId)), { recursive: true, mode: 0o700 });
    // *.pdf is already gitignored; local development documents must not enter commits.
    await writeFile(path.join(root, String(invoiceId), path.posix.basename(key, ".bin") + ".pdf"), bytes, { flag: "wx", mode: 0o600 });
    storage = "local-dev";
  }
  return { storage, key, sha256: createHash("sha256").update(bytes).digest("hex"),
    filename: file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "fatura.pdf",
    size: bytes.length, contentType: "application/pdf", uploadedBy: actor, uploadedAt: new Date().toISOString() };
}

export async function readSecurePdf(namespace: PdfNamespace, invoiceId: number, pdf: OfficialPdfMetadata) {
  if (!new RegExp(`^${namespace}/${invoiceId}/[a-f0-9-]{36}\\.bin$`).test(pdf.key)) {
    throw new OfficialInvoiceError("Referencia de PDF invalida.", 500);
  }
  let bytes: Buffer;
  if (pdf.storage === "encrypted-blob") {
    const key = encryptionKey();
    const credentials = blobCredentials();
    if (!credentials) throw new OfficialInvoiceError("Armazenamento de PDFs indisponivel.", 503);
    const result = await list({ ...credentials, prefix: pdf.key, limit: 2 });
    const blob = result.blobs.find(item => item.pathname === pdf.key);
    if (!blob) throw new OfficialInvoiceError("PDF nao encontrado.", 404);
    const response = await fetch(blob.url, { cache: "no-store", redirect: "error" });
    if (!response.ok) throw new OfficialInvoiceError("PDF indisponivel.", 502);
    const payload = Buffer.from(await response.arrayBuffer());
    const decipher = createDecipheriv("aes-256-gcm", key, payload.subarray(0, 12));
    decipher.setAAD(Buffer.from(pdf.key));
    decipher.setAuthTag(payload.subarray(12, 28));
    bytes = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
  } else if (pdf.storage === "local-dev") {
    bytes = await readFile(path.join(localRoot(namespace), String(invoiceId), path.posix.basename(pdf.key, ".bin") + ".pdf"));
  } else throw new OfficialInvoiceError("Armazenamento de PDF invalido.", 500);
  if (bytes.length !== pdf.size || createHash("sha256").update(bytes).digest("hex") !== pdf.sha256) {
    throw new OfficialInvoiceError("Falha de integridade do PDF.", 500);
  }
  return bytes;
}
