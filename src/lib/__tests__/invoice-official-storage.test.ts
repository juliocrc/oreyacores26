import { createHash } from "crypto";
import { PDFDocument } from "pdf-lib";
import { list, put } from "@vercel/blob";
import { readOfficialPdf, storeOfficialPdf } from "@/lib/invoice-official-storage";
import { MAX_OFFICIAL_PDF_BYTES } from "@/lib/invoice-official";
import { readSignedIvaPdf, storeSignedIvaPdf } from "@/lib/iva-signed-storage";

jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("@vercel/blob", () => ({ put: jest.fn(), list: jest.fn() }));

const originalEnv = { ...process.env };
let bytes: Uint8Array;
beforeAll(async () => { const doc = await PDFDocument.create(); doc.addPage(); bytes = await doc.save(); });
beforeEach(() => {
  jest.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = "test-credential";
  delete process.env.BLOB_STORE_ID;
  delete process.env.BLOB_READ_WRITE_TOKEN_STORE_ID;
  delete process.env.VERCEL_OIDC_TOKEN;
  process.env.INVOICE_PDF_ENCRYPTION_KEY = "12".repeat(32);
});
afterEach(() => { process.env = { ...originalEnv }; jest.restoreAllMocks(); });
const pdf = (type = "application/pdf") => new File([bytes as BlobPart], "official.pdf", { type });

test("only encrypted bytes reach public Blob, with authenticated roundtrip and digest", async () => {
  const metadata = await storeOfficialPdf(10, pdf(), "admin@test");
  const [key, payload, options] = (put as jest.Mock).mock.calls[0];
  expect(Buffer.from(payload).includes(Buffer.from("%PDF-"))).toBe(false);
  expect(options.contentType).toBe("application/octet-stream");
  expect(options).toMatchObject({ token: "test-credential", access: "public", addRandomSuffix: false });
  expect(metadata).toMatchObject({ storage: "encrypted-blob", contentType: "application/pdf", uploadedBy: "admin@test", size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex") });
  expect(JSON.stringify(metadata)).not.toContain("https:");
  (list as jest.Mock).mockResolvedValue({ blobs: [{ pathname: key, url: "https://test.blob.vercel-storage.com/encrypted" }] });
  jest.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(payload));
  expect(await readOfficialPdf(10, metadata)).toEqual(Buffer.from(bytes));
  expect(list).toHaveBeenCalledWith({ token: "test-credential", prefix: key, limit: 2 });
  process.env.INVOICE_PDF_ENCRYPTION_KEY = "34".repeat(32);
  await expect(readOfficialPdf(10, metadata)).rejects.toThrow();
});

test.each(["BLOB_STORE_ID", "BLOB_READ_WRITE_TOKEN_STORE_ID"])("connected OIDC store via %s preserves encrypted roundtrip without exposing credentials or URLs", async name => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  if (name === "BLOB_STORE_ID") process.env.BLOB_STORE_ID = " store_abc123 ";
  else process.env.BLOB_READ_WRITE_TOKEN_STORE_ID = " store_abc123 ";
  process.env.VERCEL_OIDC_TOKEN = "sdk-managed-token";
  const metadata = await storeOfficialPdf(10, pdf(), "admin@test");
  const [key, payload, options] = (put as jest.Mock).mock.calls[0];
  expect(options).toEqual({ storeId: "store_abc123", access: "public", addRandomSuffix: false, contentType: "application/octet-stream" });
  expect(Buffer.from(payload).includes(Buffer.from("%PDF-"))).toBe(false);
  expect(JSON.stringify(metadata)).not.toMatch(/https:|abc123|sdk-managed-token/);
  (list as jest.Mock).mockResolvedValue({ blobs: [{ pathname: key, url: "https://test.blob.vercel-storage.com/encrypted" }] });
  jest.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(payload));
  expect(await readOfficialPdf(10, metadata)).toEqual(Buffer.from(bytes));
  expect(list).toHaveBeenCalledWith({ storeId: "store_abc123", prefix: key, limit: 2 });
  expect(fetch).toHaveBeenCalledWith("https://test.blob.vercel-storage.com/encrypted", { cache: "no-store", redirect: "error" });
  await expect(readOfficialPdf(10, { ...metadata, sha256: "0".repeat(64) })).rejects.toThrow("integridade");
  const tampered = Buffer.from(payload);
  tampered[tampered.length - 1] ^= 1;
  jest.mocked(fetch).mockResolvedValue(new Response(tampered));
  await expect(readOfficialPdf(10, metadata)).rejects.toThrow();
});

test("canonical store ID takes priority over prefixed connection variable, with OIDC resolution left to SDK", async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_STORE_ID = "abc123";
  process.env.BLOB_READ_WRITE_TOKEN_STORE_ID = "store_other";
  await storeOfficialPdf(10, pdf(), "admin@test");
  expect(put).toHaveBeenCalledWith(expect.any(String), expect.any(Buffer), expect.objectContaining({ storeId: "abc123" }));
});

test("existing static credential pins the original store when OIDC is also configured", async () => {
  process.env.BLOB_STORE_ID = "store_other";
  process.env.VERCEL_OIDC_TOKEN = "sdk-managed-token";
  const metadata = await storeOfficialPdf(10, pdf(), "admin@test");
  const [key, payload, options] = (put as jest.Mock).mock.calls[0];
  expect(options.token).toBe("test-credential");
  expect(options).not.toHaveProperty("storeId");
  (list as jest.Mock).mockResolvedValue({ blobs: [{ pathname: key, url: "https://test.blob.vercel-storage.com/encrypted" }] });
  jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(payload));
  expect(await readOfficialPdf(10, metadata)).toEqual(Buffer.from(bytes));
  expect(list).toHaveBeenCalledWith({ token: "test-credential", prefix: key, limit: 2 });
});

test.each(["https://example.com", "store_", "../secret", "store_abc/def", "abc\nsecret"])("invalid server-side store ID %s fails closed", async storeId => {
  const metadata = await storeOfficialPdf(10, pdf(), "admin@test");
  jest.clearAllMocks();
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_STORE_ID = storeId;
  process.env.BLOB_READ_WRITE_TOKEN_STORE_ID = "store_valid";
  await expect(storeOfficialPdf(10, pdf(), "admin@test")).rejects.toMatchObject({ status: 503 });
  await expect(readOfficialPdf(10, metadata)).rejects.toMatchObject({ status: 503 });
  expect(put).not.toHaveBeenCalled();
  expect(list).not.toHaveBeenCalled();
});

test("unconfigured encrypted reads fail before provider access", async () => {
  const metadata = await storeOfficialPdf(10, pdf(), "admin@test");
  delete process.env.BLOB_READ_WRITE_TOKEN;
  await expect(readOfficialPdf(10, metadata)).rejects.toMatchObject({ status: 503 });
  expect(list).not.toHaveBeenCalled();
});

test("OIDC provider failure never falls back to local storage", async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_STORE_ID = "store_abc123";
  (put as jest.Mock).mockRejectedValueOnce(new Error("OIDC unavailable"));
  await expect(storeOfficialPdf(10, pdf(), "admin@test")).rejects.toThrow("OIDC unavailable");
});

test("mislabeled and malformed files, oversized files and empty files cannot be stored", async () => {
  for (const file of [new File(["not pdf"], "forged.pdf", { type: "application/pdf" }),
    new File(["%PDF-broken"], "broken.pdf"), new File([], "empty.pdf"),
    new File([new Uint8Array(MAX_OFFICIAL_PDF_BYTES + 1)], "large.pdf")]) {
    await expect(storeOfficialPdf(10, file, "admin@test")).rejects.toThrow();
  }
  expect(put).not.toHaveBeenCalled();
});

test.each(["text/plain", "image/png", "text/html"])("rejects a declared non-PDF type %s even for PDF bytes", async type => {
  await expect(storeOfficialPdf(10, pdf(type), "admin@test")).rejects.toMatchObject({ status: 415 });
  expect(put).not.toHaveBeenCalled();
});

test("rejects a non-PDF extension even for valid PDF content", async () => {
  await expect(storeOfficialPdf(10, new File([bytes as BlobPart], "invoice.html", { type: "application/pdf" }), "admin@test")).rejects.toMatchObject({ status: 415 });
  expect(put).not.toHaveBeenCalled();
});

test.each(["", "application/octet-stream"])("accepts generic browser type %s only with PDF extension and valid PDF content", async type => {
  await expect(storeOfficialPdf(10, pdf(type), "admin@test")).resolves.toMatchObject({ contentType: "application/pdf" });
  expect(put).toHaveBeenCalledTimes(1);
});

test.each(["static", "OIDC"])("missing encryption secret never falls back to plaintext with %s credentials", async mode => {
  if (mode === "OIDC") {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.BLOB_STORE_ID = "store_abc123";
  }
  delete process.env.INVOICE_PDF_ENCRYPTION_KEY;
  await expect(storeOfficialPdf(10, pdf(), "admin@test")).rejects.toMatchObject({ status: 503 });
  expect(put).not.toHaveBeenCalled();
});

test("Vercel and non-development cannot fall back to ephemeral local files", async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.VERCEL = "1";
  await expect(storeOfficialPdf(10, pdf(), "admin@test")).rejects.toMatchObject({ status: 503 });
  delete process.env.VERCEL;
  await expect(storeOfficialPdf(10, pdf(), "admin@test")).rejects.toMatchObject({ status: 503 });
  expect(put).not.toHaveBeenCalled();
});

test("storage locators cannot be used to read another invoice or local path", async () => {
  const metadata = await storeOfficialPdf(10, pdf(), "admin@test");
  await expect(readOfficialPdf(11, metadata)).rejects.toThrow("Referencia");
  await expect(readOfficialPdf(10, { ...metadata, key: "../../secret" })).rejects.toThrow("Referencia");
  expect(list).not.toHaveBeenCalled();
});

test("IVA uses its own namespace and neither wrapper can read the other's persisted key", async () => {
  const invoice = await storeOfficialPdf(10, pdf(), "admin@test");
  const signed = await storeSignedIvaPdf(10, pdf(), "client");
  expect(invoice.key).toMatch(/^invoice-official\/10\//);
  expect(signed.key).toMatch(/^iva-signed\/10\//);
  await expect(readOfficialPdf(10, signed)).rejects.toThrow("Referencia");
  await expect(readSignedIvaPdf(10, invoice)).rejects.toThrow("Referencia");
  await expect(readSignedIvaPdf(11, signed)).rejects.toThrow("Referencia");
  expect(list).not.toHaveBeenCalled();
});
