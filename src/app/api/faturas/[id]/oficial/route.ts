import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { invoiceDisplay, invoiceMetadata, MAX_OFFICIAL_PDF_BYTES, type OfficialPdfMetadata } from "@/lib/invoice-official";
import { OfficialInvoiceError, readOfficialPdf, storeOfficialPdf } from "@/lib/invoice-official-storage";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

async function authorizedInvoice(context: Context) {
  const access = await getAccessContext();
  if (!access) throw new OfficialInvoiceError("Sessao obrigatoria.", 401);
  // Billing is globally admin-only, including elevated staff, just like /api/faturas.
  // Client portal sessions are deliberately not accepted by this endpoint.
  if (!access.isAdmin) throw new OfficialInvoiceError("Acesso reservado a administradores.", 403);
  const { id } = await context.params;
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new OfficialInvoiceError("ID invalido.");
  const invoice = await prisma.fatura.findUnique({ where: { id: Number(id) } });
  if (!invoice) throw new OfficialInvoiceError("Fatura nao encontrada.", 404);
  return { invoice, access };
}

function failure(error: unknown) {
  if (error instanceof OfficialInvoiceError) return NextResponse.json({ error: error.message }, { status: error.status, headers: privateHeaders });
  if (error && typeof error === "object" && "code" in error && error.code === "P2034") {
    return NextResponse.json({ error: "Conflito de edicao. Atualize a fatura antes de repetir." }, { status: 409, headers: privateHeaders });
  }
  console.error("[faturas/oficial]", error);
  return NextResponse.json({ error: "Nao foi possivel processar o documento oficial." }, { status: 500, headers: privateHeaders });
}

export async function GET(_req: NextRequest, context: Context) {
  try {
    const { invoice } = await authorizedInvoice(context);
    const pdf = invoiceMetadata(invoice.metadados).pdfOficial as OfficialPdfMetadata | undefined;
    if (!pdf) throw new OfficialInvoiceError("Esta fatura nao tem PDF oficial anexado.", 404);
    const bytes = await readOfficialPdf(invoice.id, pdf);
    return new NextResponse(new Uint8Array(bytes), { headers: { ...privateHeaders, "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.filename.replace(/[^a-zA-Z0-9._ -]/g, "_")}"` } });
  } catch (error) { return failure(error); }
}

export async function PATCH(req: NextRequest, context: Context) {
  try {
    const { invoice, access } = await authorizedInvoice(context);
    if (invoice.cancelada) throw new OfficialInvoiceError("A fatura esta cancelada.", 409);
    const maxBodyBytes = MAX_OFFICIAL_PDF_BYTES + 128 * 1024;
    if (Number(req.headers.get("content-length")) > maxBodyBytes) throw new OfficialInvoiceError("Pedido demasiado grande. Limite de PDF: 4 MB.", 413);
    if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) throw new OfficialInvoiceError("Envie os dados em multipart/form-data.", 415);
    let form: FormData;
    // Bound chunked bodies before the multipart parser allocates files in memory.
    const reader = req.body?.getReader();
    const chunks: Buffer[] = [];
    let bodyBytes = 0;
    try {
      if (!reader) throw new OfficialInvoiceError("Formulario invalido.");
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bodyBytes += value.byteLength;
        if (bodyBytes > maxBodyBytes) {
          await reader.cancel().catch(() => {});
          throw new OfficialInvoiceError("Pedido demasiado grande. Limite de PDF: 4 MB.", 413);
        }
        chunks.push(Buffer.from(value));
      }
      form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": req.headers.get("content-type")! } }).formData();
    } catch (error) {
      if (error instanceof OfficialInvoiceError) throw error;
      throw new OfficialInvoiceError("Formulario invalido.");
    } finally { reader?.releaseLock(); }
    if ([...form.keys()].some(key => !["numeroFaturaOficial", "expectedUpdatedAt", "pdf"].includes(key)) ||
      ["numeroFaturaOficial", "expectedUpdatedAt", "pdf"].some(key => form.getAll(key).length > 1)) throw new OfficialInvoiceError("Campos invalidos.");
    const value = form.get("numeroFaturaOficial");
    if (typeof value !== "string" || !value.trim() || value.trim().length > 120 || /[\x00-\x1f\x7f]/.test(value)) throw new OfficialInvoiceError("Indique um numero oficial valido (1 a 120 caracteres).");
    const expected = form.get("expectedUpdatedAt");
    if (expected !== null && (typeof expected !== "string" || !Number.isFinite(Date.parse(expected)))) throw new OfficialInvoiceError("Versao de edicao invalida.");
    if (expected !== null && new Date(String(expected)).getTime() !== invoice.updatedAt.getTime()) throw new OfficialInvoiceError("A fatura foi alterada. Atualize antes de guardar.", 409);
    const file = form.get("pdf");
    if (file !== null && (typeof file === "string" || typeof file.arrayBuffer !== "function")) throw new OfficialInvoiceError("PDF invalido.");
    const before = invoiceMetadata(invoice.metadados);
    const pdf = file ? await storeOfficialPdf(invoice.id, file as File, access.email) : undefined;
    const after = { ...before, numeroFaturaOficial: value.trim(), sistemaOrigem: "Navision", ...(pdf ? { pdfOficial: pdf } : {}) };
    const updated = await prisma.$transaction(async tx => {
      // CAS protects the complete metadata snapshot even when expectedUpdatedAt is omitted.
      const result = await tx.fatura.updateMany({ where: { id: invoice.id, updatedAt: invoice.updatedAt, metadados: invoice.metadados, cancelada: false },
        data: { metadados: JSON.stringify(after), updatedAt: new Date(Math.max(Date.now(), invoice.updatedAt.getTime() + 1)) } });
      if (result.count !== 1) throw new OfficialInvoiceError("A fatura foi alterada. Atualize antes de guardar.", 409);
      await tx.auditoria.create({ data: { tabela: "Fatura", tipoOperacao: "UPDATE", idRegisto: invoice.id,
        usuario: access.email, descricao: `Referencia/PDF externo Navision; utilizador ${access.userId}. Sem emissao fiscal.`,
        dadosAntes: JSON.stringify({ numeroFatura: invoice.numeroFatura, ...before }),
        dadosDepois: JSON.stringify({ numeroFatura: invoice.numeroFatura, ...after }) } });
      return tx.fatura.findUniqueOrThrow({ where: { id: invoice.id } });
    });
    // Old objects are retained: their locators and digests remain in the transactional audit.
    return NextResponse.json({ id: updated.id, updatedAt: updated.updatedAt, ...invoiceDisplay(updated) }, { headers: privateHeaders });
  } catch (error) { return failure(error); }
}
