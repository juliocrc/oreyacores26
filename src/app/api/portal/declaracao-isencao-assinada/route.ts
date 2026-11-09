import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { DeclaracaoIvaError } from "@/lib/declaracao-isencao-iva";
import { resolveIvaDeclaration } from "@/lib/declaracao-isencao-iva-request";
import { MAX_OFFICIAL_PDF_BYTES, type OfficialPdfMetadata } from "@/lib/invoice-official";
import { OfficialInvoiceError } from "@/lib/secure-pdf-storage";
import { readSignedIvaPdf, storeSignedIvaPdf } from "@/lib/iva-signed-storage";
import { signedIvaDisplay } from "@/lib/iva-signed-metadata";

export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

async function resolve(req: NextRequest, upload: boolean) {
  const params = new URL(req.url).searchParams;
  if (!params.has("declaracaoId") || [...params.keys()].some(key => key !== "declaracaoId")) {
    throw new DeclaracaoIvaError("Indique apenas o ID da declaracao emitida.", 400);
  }
  const result = await resolveIvaDeclaration(params, false, upload);
  const row = result.declaration;
  if (!row?.numeroCompleto || !row.numeroSequencial || !row.snapshotJson) {
    throw new DeclaracaoIvaError("Declaracao numerada obrigatoria.", 409);
  }
  return { row, actor: "actor" in result ? result.actor : undefined };
}

function failure(error: unknown) {
  if (error instanceof DeclaracaoIvaError || error instanceof OfficialInvoiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers: privateHeaders });
  }
  // Provider errors may contain storage URLs or credentials. Never serialize or log them.
  return NextResponse.json({ error: "Nao foi possivel processar o PDF assinado." }, { status: 500, headers: privateHeaders });
}

export async function GET(req: NextRequest) {
  try {
    const { row } = await resolve(req, false);
    if (!row.pdfAssinadoMeta) throw new DeclaracaoIvaError("Sem PDF assinado anexado.", 404);
    const pdf = JSON.parse(row.pdfAssinadoMeta) as OfficialPdfMetadata;
    const bytes = await readSignedIvaPdf(row.id, pdf);
    await resolve(req, false);
    return new NextResponse(new Uint8Array(bytes), { headers: { ...privateHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.filename.replace(/[^a-zA-Z0-9._ -]/g, "_")}"` } });
  } catch (error) { return failure(error); }
}

export async function POST(req: NextRequest) {
  try {
    const { row, actor } = await resolve(req, true);
    const maxBodyBytes = MAX_OFFICIAL_PDF_BYTES + 128 * 1024;
    if (Number(req.headers.get("content-length")) > maxBodyBytes) throw new DeclaracaoIvaError("Limite de PDF: 4 MB.", 413);
    const contentType = req.headers.get("content-type");
    if (!contentType?.startsWith("multipart/form-data")) throw new DeclaracaoIvaError("Envie multipart/form-data.", 415);
    const reader = req.body?.getReader();
    const chunks: Buffer[] = [];
    let length = 0;
    let form: FormData;
    try {
      if (!reader) throw new DeclaracaoIvaError("Formulario obrigatorio.", 400);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxBodyBytes) {
          await reader.cancel().catch(() => {});
          throw new DeclaracaoIvaError("Limite de PDF: 4 MB.", 413);
        }
        chunks.push(Buffer.from(value));
      }
      form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": contentType } }).formData();
    } catch (error) {
      if (error instanceof DeclaracaoIvaError) throw error;
      throw new DeclaracaoIvaError("Formulario invalido.", 400);
    } finally { reader?.releaseLock(); }
    if ([...form.keys()].some(key => !["pdf", "expectedSha256"].includes(key)) ||
      ["pdf", "expectedSha256"].some(key => form.getAll(key).length !== 1)) throw new DeclaracaoIvaError("Campos invalidos.", 400);
    const file = form.get("pdf");
    if (!file || typeof file === "string") throw new DeclaracaoIvaError("PDF obrigatorio.", 400);
    const previous = signedIvaDisplay(row.pdfAssinadoMeta);
    if (form.get("expectedSha256") !== (previous?.sha256 ?? "")) throw new DeclaracaoIvaError("O anexo foi alterado. Atualize antes de repetir.", 409);
    const pdf = await storeSignedIvaPdf(row.id, file, actor!);
    // Storage first: a failed upload must not change metadata. Recheck mutable access.
    await resolve(req, true);
    const updated = await prisma.declaracaoIsencaoIva.updateMany({
      where: { id: row.id, clienteId: row.clienteId, navioId: row.navioId,
        pdfAssinadoMeta: row.pdfAssinadoMeta, updatedAt: row.updatedAt },
      data: { pdfAssinadoMeta: JSON.stringify(pdf), updatedAt: new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1)) },
    });
    if (updated.count !== 1) throw new DeclaracaoIvaError("O anexo foi alterado. Atualize antes de repetir.", 409);
    return NextResponse.json({ id: row.id, pdfAssinado: signedIvaDisplay(JSON.stringify(pdf)) }, { headers: privateHeaders });
  } catch (error) { return failure(error); }
}
