import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { GET, PATCH } from "@/app/api/faturas/[id]/oficial/route";
import { OfficialInvoiceError, readOfficialPdf, storeOfficialPdf } from "@/lib/invoice-official-storage";
import { invoiceDisplay, MAX_OFFICIAL_PDF_BYTES } from "@/lib/invoice-official";

jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: { fatura: { findUnique: jest.fn() }, $transaction: jest.fn() } }));
jest.mock("@/lib/access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("@/lib/invoice-official-storage", () => ({ ...jest.requireActual("@/lib/invoice-official-storage"), storeOfficialPdf: jest.fn(), readOfficialPdf: jest.fn() }));
const pdf = { storage: "encrypted-blob", key: "invoice-official/10/test.bin", sha256: "digest", filename: "official.pdf", size: 100,
  contentType: "application/pdf", uploadedBy: "old@test", uploadedAt: "2026-10-26T12:00:00.000Z" };
const invoice = { id: 10, numeroFatura: "FT1026000001", metadados: JSON.stringify({ ordensSnapshot: [{ id: 1 }], numeroFaturaOficial: "NAV-OLD", pdfOficial: pdf }),
  updatedAt: new Date("2026-10-26T12:00:00.000Z"), valorTotal: 100, cancelada: false };
const tx = { fatura: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn() }, auditoria: { create: jest.fn() } };
const context = (id = "10") => ({ params: Promise.resolve({ id }) });
const request = (number = "NAV-NEW", extra: Record<string, string | File> = {}) => {
  const body = new FormData(); body.set("numeroFaturaOficial", number);
  for (const [key, value] of Object.entries(extra)) body.set(key, value);
  return new NextRequest("http://localhost/api/faturas/10/oficial", { method: "PATCH", body });
};
beforeEach(() => {
  jest.clearAllMocks();
  (getAccessContext as jest.Mock).mockResolvedValue({ isAdmin: true, userId: 7, email: "admin@test" });
  (prisma.fatura.findUnique as jest.Mock).mockResolvedValue(invoice);
  (prisma.$transaction as jest.Mock).mockImplementation(async fn => fn(tx));
  tx.fatura.updateMany.mockResolvedValue({ count: 1 });
  tx.fatura.findUniqueOrThrow.mockImplementation(async () => ({ ...invoice, ...tx.fatura.updateMany.mock.calls[0][0].data }));
  tx.auditoria.create.mockResolvedValue({});
  (storeOfficialPdf as jest.Mock).mockResolvedValue({ ...pdf, key: "invoice-official/10/new.bin", uploadedBy: "admin@test" });
  (readOfficialPdf as jest.Mock).mockResolvedValue(Buffer.from("%PDF-test"));
});

test.each([GET, PATCH])("authentication and staff/admin permission required for both endpoints", async handler => {
  (getAccessContext as jest.Mock).mockResolvedValue(null);
  expect((await handler(request(), context())).status).toBe(401);
  (getAccessContext as jest.Mock).mockResolvedValue({ isAdmin: false });
  expect((await handler(request(), context())).status).toBe(403);
  expect(prisma.fatura.findUnique).not.toHaveBeenCalled();
  expect(storeOfficialPdf).not.toHaveBeenCalled();
  expect(readOfficialPdf).not.toHaveBeenCalled();
});

test("unknown invoice cannot create remote/local invoices or upload PDFs", async () => {
  (prisma.fatura.findUnique as jest.Mock).mockResolvedValue(null);
  expect((await PATCH(request(), context("999"))).status).toBe(404);
  expect(storeOfficialPdf).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

test.each([GET, PATCH])("rejects invalid invoice ids before database access", async handler => {
  expect((await handler(request(), context("10junk"))).status).toBe(400);
  expect((await handler(request(), context("0"))).status).toBe(400);
  expect(prisma.fatura.findUnique).not.toHaveBeenCalled();
});

test("invalid file or missing storage credentials never changes the number or existing PDF", async () => {
  (storeOfficialPdf as jest.Mock).mockRejectedValueOnce(new OfficialInvoiceError("PDF invalido."));
  expect((await PATCH(request("NAV", { pdf: new File(["forged"], "x.pdf") }), context())).status).toBe(400);
  (storeOfficialPdf as jest.Mock).mockRejectedValueOnce(new OfficialInvoiceError("Configure armazenamento seguro.", 503));
  expect((await PATCH(request("NAV", { pdf: new File(["%PDF-"], "x.pdf") }), context())).status).toBe(503);
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(tx.auditoria.create).not.toHaveBeenCalled();
});

test.each(["", "   ", "x\n", "x".repeat(121)])("rejects invalid official number %s", async number => {
  expect((await PATCH(request(number), context())).status).toBe(400);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

test("rejects stale or malformed version before uploading", async () => {
  expect((await PATCH(request("NAV", { expectedUpdatedAt: "2020-01-01", pdf: new File(["x"], "x.pdf") }), context())).status).toBe(409);
  expect((await PATCH(request("NAV", { expectedUpdatedAt: "" }), context())).status).toBe(400);
  expect(storeOfficialPdf).not.toHaveBeenCalled();
});

test("reference-only update preserves internal FT, amounts, snapshots and existing official PDF", async () => {
  const response = await PATCH(request(" NAV-NEW ", { expectedUpdatedAt: invoice.updatedAt.toISOString() }), context());
  expect(response.status).toBe(200);
  const data = tx.fatura.updateMany.mock.calls[0][0].data;
  expect(Object.keys(data).sort()).toEqual(["metadados", "updatedAt"]);
  expect(JSON.parse(data.metadados)).toEqual({ ...JSON.parse(invoice.metadados), numeroFaturaOficial: "NAV-NEW", sistemaOrigem: "Navision" });
  expect(tx.auditoria.create).toHaveBeenCalledWith({ data: expect.objectContaining({ usuario: "admin@test", idRegisto: 10,
    dadosAntes: expect.stringContaining("NAV-OLD"), dadosDepois: expect.stringContaining("NAV-NEW") }) });
  expect(await response.json()).toMatchObject({ numeroFaturaInterno: invoice.numeroFatura, numeroFaturaDisplay: "NAV-NEW", sistemaOrigem: "Navision" });
  expect(storeOfficialPdf).not.toHaveBeenCalled();
});

test("replacement PDF is atomic with reference and retains previous locator in audit, never in response", async () => {
  const response = await PATCH(request("NAV-NEW", { pdf: new File(["%PDF-"], "official.pdf") }), context());
  expect(response.status).toBe(200);
  expect(storeOfficialPdf).toHaveBeenCalledWith(10, expect.anything(), "admin@test");
  const audit = tx.auditoria.create.mock.calls[0][0].data;
  expect(JSON.parse(audit.dadosAntes).pdfOficial.key).toBe(pdf.key);
  expect(JSON.parse(audit.dadosDepois).pdfOficial.key).toContain("new.bin");
  expect(JSON.stringify(await response.json())).not.toContain("invoice-official/");
});

test("CAS conflicts do not audit a write; audit failure fails the transaction", async () => {
  tx.fatura.updateMany.mockResolvedValue({ count: 0 });
  expect((await PATCH(request(), context())).status).toBe(409);
  expect(tx.auditoria.create).not.toHaveBeenCalled();
  tx.fatura.updateMany.mockResolvedValue({ count: 1 });
  tx.auditoria.create.mockRejectedValueOnce(new Error("audit failed"));
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  expect((await PATCH(request(), context())).status).toBe(500);
  spy.mockRestore();
});

test("download is authenticated, invoice-bound, private and has no raw blob URL", async () => {
  const response = await GET(request(), context());
  expect(readOfficialPdf).toHaveBeenCalledWith(10, pdf);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(await response.text()).toBe("%PDF-test");
  (prisma.fatura.findUnique as jest.Mock).mockResolvedValue({ ...invoice, metadados: null });
  expect((await GET(request(), context())).status).toBe(404);
});

test("rejects amount mutations, wrong content type, duplicate fields and excessive body", async () => {
  expect((await PATCH(request("NAV", { valorTotal: "1" }), context())).status).toBe(400);
  const json = new NextRequest("http://localhost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
  expect((await PATCH(json, context())).status).toBe(415);
  const huge = request(); huge.headers.set("content-length", String(MAX_OFFICIAL_PDF_BYTES + 200000));
  expect((await PATCH(huge, context())).status).toBe(413);
  const form = new FormData(); form.append("numeroFaturaOficial", "A"); form.append("numeroFaturaOficial", "B");
  expect((await PATCH(new NextRequest("http://localhost", { method: "PATCH", body: form }), context())).status).toBe(400);
});

test.each([undefined, "1"])("bounds the actual request stream regardless of Content-Length %s", async contentLength => {
  const cancel = jest.fn();
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(MAX_OFFICIAL_PDF_BYTES + 128 * 1024 + 1)); },
    cancel,
  });
  const headers: Record<string, string> = { "Content-Type": "multipart/form-data; boundary=test" };
  if (contentLength) headers["Content-Length"] = contentLength;
  const req = new NextRequest("http://localhost", { method: "PATCH", headers, body, duplex: "half" });
  expect((await PATCH(req, context())).status).toBe(413);
  expect(cancel).toHaveBeenCalled();
  expect(storeOfficialPdf).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

test("malformed multipart is rejected without changing invoice metadata", async () => {
  const req = new NextRequest("http://localhost", { method: "PATCH", headers: { "Content-Type": "multipart/form-data; boundary=test" }, body: "broken" });
  expect((await PATCH(req, context())).status).toBe(400);
  expect(storeOfficialPdf).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

test("cancelled invoice locks external edits but retains official downloads", async () => {
  (prisma.fatura.findUnique as jest.Mock).mockResolvedValue({ ...invoice, cancelada: true });
  expect((await PATCH(request(), context())).status).toBe(409);
  expect(storeOfficialPdf).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect((await GET(request(), context())).status).toBe(200);
});

test("display prefers external reference without rewriting historical FT", () => {
  expect(invoiceDisplay(invoice)).toMatchObject({ numeroFaturaDisplay: "NAV-OLD", numeroFaturaInterno: invoice.numeroFatura });
  expect(invoiceDisplay({ ...invoice, metadados: null })).toMatchObject({ numeroFaturaDisplay: invoice.numeroFatura, numeroFaturaOficial: null });
});
