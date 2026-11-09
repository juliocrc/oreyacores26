import prisma from "@/lib/prisma";
import { getAuthSession } from "@/auth";
import { getAccessContext } from "@/lib/access-control";
import { emitirDeclaracaoIsencaoIva } from "../declaracao-isencao-iva";
import { resolveIvaDeclaration } from "../declaracao-isencao-iva-request";
import { GET, POST } from "@/app/api/portal/declaracao-isencao-pdf/route";
import { NextRequest } from "next/server";
import { syncEmittedDocumentToOneDrive } from "../onedrive-sync";
import { GET as signedGET, POST as signedPOST } from "@/app/api/portal/declaracao-isencao-assinada/route";
import { PDFDocument } from "pdf-lib";
import { put, list } from "@vercel/blob";
import { canEditPath } from "@/lib/user-permissions";

jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("@vercel/blob", () => ({ put: jest.fn(), list: jest.fn() }));

jest.mock("@/lib/prisma", () => ({ __esModule: true, default: {
  $transaction: jest.fn(), navio: { findUnique: jest.fn() },
  declaracaoIsencaoIva: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
} }));
jest.mock("@/auth", () => ({ getAuthSession: jest.fn() }));
jest.mock("@/lib/access-control", () => ({ getAccessContext: jest.fn() }));
jest.mock("@/lib/user-permissions", () => ({ canEditPath: jest.fn(() => false), canViewPath: () => true }));
jest.mock("../onedrive-sync", () => ({ syncEmittedDocumentToOneDrive: jest.fn() }));
jest.mock("../declaracao-isencao-iva-docx", () => ({ gerarDeclaracaoIsencaoIvaDocx: jest.fn(async () => Buffer.from("docx")), nomeFicheiroDeclaracao: () => "declaracao.docx" }));

type Row = Record<string, any>;
let rows: Row[];
let ship: Row;
const params = (extra: Record<string, string> = {}) => new URLSearchParams({ navioId: "10", idempotencyKey: "request-1", ...extra });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(put).mockReset();
  jest.mocked(canEditPath).mockReturnValue(false);
  rows = [];
  ship = { id: 10, nome: "Original ship", matricula: "REG-1", tipoPesca: "Local", cfr: "CFR-1", serviceStationId: 3,
    clienteId: 7, cliente: { id: 7, nome: "Original client", nif: null, morada: "Original address" } };
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: "u7", role: "CLIENTE", clienteId: 7 } } as never);
  jest.mocked(getAccessContext).mockResolvedValue(null);
  (prisma.navio.findUnique as jest.Mock).mockImplementation(async () => ship);
  (prisma.declaracaoIsencaoIva.findUnique as jest.Mock).mockImplementation(async ({ where }: any) => {
    const row = rows.find(r => where.id ? r.id === where.id : r.idempotencyKey === where.idempotencyKey);
    return row ? { ...row } : null;
  });
  (prisma.declaracaoIsencaoIva.findFirst as jest.Mock).mockImplementation(async ({ where }: any) =>
    [...rows].filter(r => r.ano === where.ano).sort((a, b) => b.numeroSequencial - a.numeroSequencial)[0] as never ?? null);
  (prisma.declaracaoIsencaoIva.create as jest.Mock).mockImplementation(async ({ data }: any) => {
    if (rows.some(r => (r.ano === data.ano && r.numeroSequencial === data.numeroSequencial) || r.idempotencyKey === data.idempotencyKey)) throw { code: "P2002" };
    const row = { ...data, id: rows.length + 1, pdfAssinadoMeta: null, updatedAt: new Date() };
    rows.push(row);
    return row;
  });
  jest.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma));
  (prisma.declaracaoIsencaoIva.updateMany as jest.Mock).mockImplementation(async ({ where, data }) => {
    const row = rows.find(r => Object.entries(where).every(([key, value]) =>
      value instanceof Date ? r[key].getTime() === value.getTime() : r[key] === value));
    if (!row) return { count: 0 };
    Object.assign(row, data);
    return { count: 1 };
  });
});

it("rejects ineligible vessels before allocating a number and does not require a NIF", async () => {
  ship.tipoPesca = "outro";
  await expect(resolveIvaDeclaration(params(), true)).rejects.toMatchObject({ status: 400 });
  expect(prisma.$transaction).not.toHaveBeenCalled();
  ship.tipoPesca = "Local";
  await expect(resolveIvaDeclaration(params(), true)).resolves.toHaveProperty("declaration.numeroSequencial", 1);
});

it("uses actual ownership, not a matching owner name or supplied client fields", async () => {
  ship.clienteId = 8;
  ship.proprietario = "Original client";
  await expect(resolveIvaDeclaration(params({ cliente: "Original client" }), true)).rejects.toMatchObject({ status: 403 });
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it("requires both station access and edit permission for staff issuance", async () => {
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: "2", role: "USER" } } as never);
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, allowedStationIds: [3], permissions: {} } as never);
  await expect(resolveIvaDeclaration(params(), true)).rejects.toMatchObject({ status: 403 });
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, allowedStationIds: [9], permissions: {} } as never);
  await expect(resolveIvaDeclaration(params({ historico: "1" }), false)).rejects.toMatchObject({ status: 403 });
});

it("reprints and retries the original snapshot and date after live data changes", async () => {
  const first = await resolveIvaDeclaration(params(), true);
  ship.nome = "Changed"; ship.tipoPesca = "outro"; ship.cliente.morada = "Changed";
  const retry = await resolveIvaDeclaration(params(), true);
  const reprint = await resolveIvaDeclaration(new URLSearchParams({ declaracaoId: String(first.declaration!.id) }), false);
  expect(retry).toEqual(first);
  expect(reprint).toEqual(first);
  expect(rows).toHaveLength(1);
});

it("rejects globally reused tokens with different request identity", async () => {
  await resolveIvaDeclaration(params(), true);
  await expect(resolveIvaDeclaration(params({ codigoIsencaoIva: "M04" }), true)).rejects.toMatchObject({ status: 409 });
  jest.mocked(getAuthSession).mockResolvedValue({ user: { id: "admin", role: "ADMIN" } } as never);
  jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true } as never);
  await expect(resolveIvaDeclaration(params(), true)).rejects.toMatchObject({ status: 409 });
});

it("handles simultaneous duplicate submissions through unique conflicts (mocked database)", async () => {
  const result = await Promise.all([resolveIvaDeclaration(params(), true), resolveIvaDeclaration(params(), true)]);
  expect(result[0].declaration!.id).toBe(result[1].declaration!.id);
  expect(rows).toHaveLength(1);
});

it("allocates distinct annual numbers under contention and restarts in a new year", async () => {
  const base = { clienteId: 7, navioId: 10, emitidoPorId: "7", origem: "cliente", ano: 2026 };
  const result = await Promise.all([emitirDeclaracaoIsencaoIva({ ...base, idempotencyKey: "a" }), emitirDeclaracaoIsencaoIva({ ...base, idempotencyKey: "b" })]);
  expect(result.map(r => r.numeroCompleto).sort()).toEqual(["0001/2026", "0002/2026"]);
  expect((await emitirDeclaracaoIsencaoIva({ ...base, ano: 2027, idempotencyKey: "c" })).numeroCompleto).toBe("0001/2027");
});

it("keeps legacy GET downloads idempotent and reprints without storage side effects", async () => {
  const req = () => new NextRequest("http://localhost/api/portal/declaracao-isencao-pdf?navioId=10");
  const first = await GET(req());
  expect(first.status).toBe(200);
  expect((await GET(req())).headers.get("X-Declaration-Number")).toBe(first.headers.get("X-Declaration-Number"));
  const reprint = await GET(new NextRequest(`http://localhost/api/portal/declaracao-isencao-pdf?declaracaoId=${rows[0].id}`));
  expect(reprint.status).toBe(200);
  expect(rows).toHaveLength(1);
  expect(syncEmittedDocumentToOneDrive).not.toHaveBeenCalled();
});

it("survives storage failure and POST retries return the same declaration", async () => {
  jest.mocked(syncEmittedDocumentToOneDrive).mockRejectedValue(new Error("offline"));
  const request = () => new NextRequest("http://localhost/api/portal/declaracao-isencao-pdf", { method: "POST", body: JSON.stringify({ navioId: 10, idempotencyKey: "post-1", format: "docx" }) });
  const first = await POST(request());
  expect(first.status).toBe(200);
  expect((await POST(request())).headers.get("X-Declaration-Id")).toBe(first.headers.get("X-Declaration-Id"));
  expect(rows).toHaveLength(1);
});

it("does not reprint old rows without verified IDs or disclose a transferred vessel", async () => {
  rows.push({ id: 1 });
  await expect(resolveIvaDeclaration(new URLSearchParams({ declaracaoId: "1" }), false)).rejects.toMatchObject({ status: 409 });
  rows = [];
  await resolveIvaDeclaration(params(), true);
  ship.clienteId = 8;
  await expect(resolveIvaDeclaration(new URLSearchParams({ declaracaoId: "1" }), false)).rejects.toMatchObject({ status: 403 });
});

it("requires a POST token and lists persisted IDs without allocating", async () => {
  const missing = params(); missing.delete("idempotencyKey");
  await expect(resolveIvaDeclaration(missing, true)).rejects.toMatchObject({ status: 400 });
  const first = await resolveIvaDeclaration(params(), true);
  jest.mocked(prisma.declaracaoIsencaoIva.findMany).mockResolvedValue(rows as never);
  const calls = jest.mocked(prisma.$transaction).mock.calls.length;
  const result = await resolveIvaDeclaration(params({ historico: "1" }), false);
  expect(result.history![0].id).toBe(first.declaration!.id);
  expect(prisma.declaracaoIsencaoIva.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { navioId: 10, clienteId: 7, snapshotJson: { not: null } } }));
  expect(jest.mocked(prisma.$transaction).mock.calls).toHaveLength(calls);
});

it("renders both DOCX copies with the persisted number, date and legal snapshot", async () => {
  const { gerarDeclaracaoIsencaoIvaDocx } = jest.requireActual("../declaracao-isencao-iva-docx");
  const JSZip = (await import("jszip")).default;
  const result = await resolveIvaDeclaration(params(), true);
  const buffer = await gerarDeclaracaoIsencaoIvaDocx({ ...result.declaration, ...result.snapshot });
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")!.async("string");
  expect(xml.split(`Requisição Nº ${result.declaration!.numeroCompleto}`)).toHaveLength(3);
  expect(xml).toContain("Original client");
  expect(xml).toContain("CFR-1");
  expect(xml).not.toContain("ATCUD:");
  expect(xml).toContain(result.snapshot!.isencaoInfo.norma);
});

describe("externally signed IVA PDFs", () => {
  const originalEnv = { ...process.env };
  let bytes: Uint8Array;
  const request = (file?: File, expectedSha256 = "", extra: Record<string, string> = {}) => {
    const form = new FormData();
    form.set("pdf", file ?? new File([bytes as BlobPart], "signed.pdf", { type: "application/pdf" }));
    form.set("expectedSha256", expectedSha256);
    Object.entries(extra).forEach(([key, value]) => form.set(key, value));
    return new NextRequest("http://localhost/api/portal/declaracao-isencao-assinada?declaracaoId=1", { method: "POST", body: form });
  };
  const download = () => signedGET(new NextRequest("http://localhost/api/portal/declaracao-isencao-assinada?declaracaoId=1"));
  beforeAll(async () => { const doc = await PDFDocument.create(); doc.addPage(); bytes = await doc.save(); });
  beforeEach(async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    process.env.INVOICE_PDF_ENCRYPTION_KEY = "12".repeat(32);
    await resolveIvaDeclaration(params(), true);
  });
  afterEach(() => { process.env = { ...originalEnv }; jest.restoreAllMocks(); });

  it("uploads, lists and downloads separately without changing the fiscal original", async () => {
    const original = { ...rows[0] };
    const response = await signedPOST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const display = await response.json();
    expect(display.pdfAssinado.filename).toBe("signed.pdf");
    expect(JSON.stringify(display)).not.toMatch(/iva-signed|encrypted-blob|test-token|uploadedBy|https:/);
    const [key, payload] = jest.mocked(put).mock.calls[0];
    expect(key).toMatch(/^iva-signed\/1\//);
    expect(Buffer.from(payload as Buffer).includes(Buffer.from("%PDF-"))).toBe(false);
    jest.mocked(list).mockResolvedValue({ blobs: [{ pathname: key, url: "https://blob.test/encrypted" }] } as never);
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(payload as BodyInit));
    const downloaded = await download();
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(Buffer.from(bytes));
    jest.mocked(prisma.declaracaoIsencaoIva.findMany).mockResolvedValue(rows as never);
    const history = await resolveIvaDeclaration(params({ historico: "1" }), false);
    expect(history.history![0].pdfAssinado).toEqual(display.pdfAssinado);
    expect(JSON.stringify(history.history)).not.toContain("iva-signed/");
    const reprint = await GET(new NextRequest("http://localhost/api/portal/declaracao-isencao-pdf?declaracaoId=1"));
    expect(reprint.status).toBe(200);
    expect(reprint.headers.get("X-Declaration-Number")).toBe(original.numeroCompleto);
    expect(reprint.headers.get("X-Declaration-Date")).toBe(original.dataEmissao.toISOString());
    for (const key of ["snapshotJson", "numeroCompleto", "numeroSequencial", "ano", "dataEmissao", "clienteId", "navioId"]) expect(rows[0][key]).toEqual(original[key]);
    expect(prisma.declaracaoIsencaoIva.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: {
      pdfAssinadoMeta: expect.any(String), updatedAt: expect.any(Date),
    } }));
    expect(syncEmittedDocumentToOneDrive).not.toHaveBeenCalled();
  });

  it("rejects other clients and both old/new owners after a vessel transfer", async () => {
    jest.mocked(getAuthSession).mockResolvedValue({ user: { id: "u8", role: "CLIENTE", clienteId: 8 } } as never);
    expect((await signedPOST(request())).status).toBe(403);
    expect((await download()).status).toBe(403);
    ship.clienteId = 8;
    expect((await download()).status).toBe(403);
    jest.mocked(getAuthSession).mockResolvedValue({ user: { id: "u7", role: "CLIENTE", clienteId: 7 } } as never);
    expect((await signedPOST(request())).status).toBe(403);
    expect((await download()).status).toBe(403);
    expect(put).not.toHaveBeenCalled();
  });

  it("allows admin preview, but requires edit permission and both stations for staff uploads", async () => {
    jest.mocked(getAuthSession).mockResolvedValue({ user: { id: "staff", role: "USER" } } as never);
    jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, allowedStationIds: [3], permissions: {} } as never);
    expect((await download()).status).toBe(404);
    expect((await signedPOST(request())).status).toBe(403);
    jest.mocked(canEditPath).mockReturnValue(true);
    expect((await signedPOST(request())).status).toBe(200);
    ship.serviceStationId = 9;
    expect((await download()).status).toBe(403);
    jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, allowedStationIds: [9], permissions: {} } as never);
    expect((await download()).status).toBe(403);
    ship.serviceStationId = 3;
    jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: false, allowedStationIds: [9], permissions: {} } as never);
    expect((await download()).status).toBe(403);
    jest.mocked(getAccessContext).mockResolvedValue({ isAdmin: true } as never);
    expect((await signedPOST(request(undefined, JSON.parse(rows[0].pdfAssinadoMeta).sha256))).status).toBe(200);
  });

  it.each([
    ["forged.pdf", "not PDF", "application/pdf", 400],
    ["broken.pdf", "%PDF-broken", "application/pdf", 400],
    ["wrong.pdf", "%PDF-broken", "text/html", 415],
    ["big.pdf", new Uint8Array(4 * 1024 * 1024 + 1), "application/pdf", 413],
  ])("rejects corrupt/mislabeled/oversized %s without metadata changes", async (name, content, type, status) => {
    expect((await signedPOST(request(new File([content], name, { type })))).status).toBe(status);
    expect(rows[0].pdfAssinadoMeta).toBeNull();
    expect(put).not.toHaveBeenCalled();
    expect(prisma.declaracaoIsencaoIva.updateMany).not.toHaveBeenCalled();
  });

  it("bounds actual streamed bytes even with a false small content-length", async () => {
    const cancel = jest.fn();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 128 * 1024 + 1)); }, cancel });
    const req = new NextRequest("http://localhost/api/portal/declaracao-isencao-assinada?declaracaoId=1", {
      method: "POST", body: stream, duplex: "half", headers: { "Content-Type": "multipart/form-data; boundary=test", "Content-Length": "1" },
    } as never);
    expect((await signedPOST(req)).status).toBe(413);
    expect(cancel).toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("storage failure leaves existing attachment and snapshot untouched", async () => {
    await signedPOST(request());
    const before = { ...rows[0] };
    jest.mocked(put).mockRejectedValueOnce(new Error("provider https://secret.test token=secret"));
    const response = await signedPOST(request(undefined, JSON.parse(rows[0].pdfAssinadoMeta).sha256));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(/secret|https:/);
    expect(rows[0]).toEqual(before);
  });

  it("CAS rejects simultaneous uploads instead of overwriting the winner", async () => {
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    let count = 0;
    jest.mocked(put).mockImplementation(async () => { if (++count === 2) release(); await barrier; return {} as never; });
    const responses = await Promise.all([signedPOST(request()), signedPOST(request())]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    expect(rows[0].pdfAssinadoMeta).toBeTruthy();
    expect((await signedPOST(request())).status).toBe(409);
  });

  it("rejects missing declaration IDs, arbitrary client IDs and fiscal multipart fields", async () => {
    expect((await signedGET(new NextRequest("http://localhost/api/portal/declaracao-isencao-assinada?navioId=10"))).status).toBe(400);
    expect((await signedGET(new NextRequest("http://localhost/api/portal/declaracao-isencao-assinada?declaracaoId=1&clienteId=7"))).status).toBe(400);
    expect((await signedPOST(request(undefined, "", { numeroCompleto: "forged" }))).status).toBe(400);
    rows[0].snapshotJson = null;
    expect((await signedPOST(request())).status).toBe(409);
    expect(put).not.toHaveBeenCalled();
  });

  it("requires a session and an existing numbered declaration", async () => {
    jest.mocked(getAuthSession).mockResolvedValue(null);
    expect((await signedPOST(request())).status).toBe(401);
    expect((await download()).status).toBe(401);
    jest.mocked(getAuthSession).mockResolvedValue({ user: { id: "u7", role: "CLIENTE", clienteId: 7 } } as never);
    expect((await signedGET(new NextRequest("http://localhost/api/portal/declaracao-isencao-assinada?declaracaoId=999"))).status).toBe(404);
    rows[0].numeroSequencial = 0;
    expect((await signedPOST(request())).status).toBe(409);
    expect(put).not.toHaveBeenCalled();
  });

  it("rechecks ownership after storage before persisting metadata", async () => {
    jest.mocked(put).mockImplementation(async () => { ship.clienteId = 8; return {} as never; });
    expect((await signedPOST(request())).status).toBe(403);
    expect(rows[0].pdfAssinadoMeta).toBeNull();
    expect(prisma.declaracaoIsencaoIva.updateMany).not.toHaveBeenCalled();
  });
});
