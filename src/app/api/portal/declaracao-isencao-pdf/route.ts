import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { syncEmittedDocumentToOneDrive } from "@/lib/onedrive-sync";
import { DeclaracaoIvaError } from "@/lib/declaracao-isencao-iva";
import { resolveIvaDeclaration } from "@/lib/declaracao-isencao-iva-request";
import { gerarDeclaracaoIsencaoIvaDocx, nomeFicheiroDeclaracao } from "@/lib/declaracao-isencao-iva-docx";
import { ivaDeclarationText } from "@/lib/iva-declaration-text";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => handle(req, false);
export const POST = (req: NextRequest) => handle(req, true);

async function handle(req: NextRequest, post: boolean) {
  try {
    const { searchParams } = new URL(req.url);
    if (post) {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new DeclaracaoIvaError("Pedido invalido.", 400);
      for (const key of ["navioId", "clienteId", "codigoIsencaoIva", "origem", "idempotencyKey", "format", "declaracaoId"]) {
        if (body[key] !== undefined) searchParams.set(key, String(body[key]));
      }
      if (req.headers.has("Idempotency-Key")) searchParams.set("idempotencyKey", req.headers.get("Idempotency-Key")!);
    }
    const result = await resolveIvaDeclaration(searchParams, post);
    if ("history" in result) return NextResponse.json(result.history, { headers: { "Cache-Control": "private, no-store" } });
    const { declaration, snapshot } = result;
    const clienteNome = declaration.clienteNome || "Armador";
    const clienteNif = declaration.clienteNif || "—";
    const navioNome = declaration.navioNome || "Embarcação";
    const { clienteMorada, tipoPesca } = snapshot;
    const docx = searchParams.get("format") === "docx";
    if (docx) {
      const buffer = await gerarDeclaracaoIsencaoIvaDocx({ ...declaration, ...snapshot });
      const fileName = nomeFicheiroDeclaracao(declaration.numeroCompleto);
      if (post) await syncEmittedDocumentToOneDrive({ kind: "declaracao-iva", shipName: navioNome, fileName, buffer }).catch(() => null);
      return new NextResponse(new Uint8Array(buffer), { headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "X-Declaration-Id": String(declaration.id), "X-Declaration-Number": declaration.numeroCompleto,
        "X-Declaration-Date": declaration.dataEmissao.toISOString(),
        "Cache-Control": "private, no-store",
      } });
    }

    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const MARGIN = 50;
    const PAGE_WIDTH = 595.28;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
    let y = 841.89 - 50;

    const drawText = (text: string, x: number, yy: number, size = 10, opts: { font?: any; color?: [number, number, number]; align?: "left" | "right" } = {}) => {
      const f = opts.font || font;
      const color = opts.color || [0.13, 0.16, 0.2];
      let tx = x;
      if (opts.align === "right") {
        tx = x - f.widthOfTextAtSize(text, size);
      }
      page.drawText(text, { x: tx, y: yy, size, font: f, color: rgb(color[0], color[1], color[2]) });
    };

    // Header
    page.drawRectangle({ x: 0, y: 841.89 - 100, width: PAGE_WIDTH, height: 100, color: rgb(0.06, 0.46, 0.43) });
    drawText("DECLARAÇÃO DE ISENÇÃO DE IVA", MARGIN, 841.89 - 65, 16, { font: fontBold, color: [1, 1, 1] });
    drawText(declaration.numeroCompleto, PAGE_WIDTH - MARGIN, 841.89 - 65, 12, { font: fontBold, color: [1, 1, 1], align: "right" });
    drawText("Embarcação de Pesca Comercial · Regime de Isenção", MARGIN, 841.89 - 85, 11, { color: [0.9, 0.95, 0.95] });

    y = 841.89 - 140;
    drawText(`Data: ${declaration.dataEmissao.toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" })}`, MARGIN, y, 10, { font: fontBold });
    y -= 25;

    drawText("Identificação do Armador / Proprietário:", MARGIN, y, 11, { font: fontBold });
    y -= 18;
    drawText(`Nome / Entidade: ${clienteNome}`, MARGIN + 10, y, 10);
    y -= 16;
    drawText(`NIF: ${clienteNif}`, MARGIN + 10, y, 10);
    y -= 16;
    drawText(`Morada: ${clienteMorada}`, MARGIN + 10, y, 10);
    y -= 25;

    drawText("Identificação da Embarcação:", MARGIN, y, 11, { font: fontBold });
    y -= 18;
    drawText(`Nome da Embarcação: ${navioNome}`, MARGIN + 10, y, 10);
    y -= 16;
    drawText(`Matrícula: ${declaration.navioMatricula || "—"} | CFR: ${snapshot.navioCfr || "—"}`, MARGIN + 10, y, 10);
    y -= 16;
    drawText(`Tipo / Atividade: ${tipoPesca || "Pesca Comercial"}`, MARGIN + 10, y, 10);
    y -= 30;

    drawText("Fundamentação Legal da Isenção:", MARGIN, y, 11, { font: fontBold });
    y -= 18;
    drawText(`${snapshot.isencaoInfo.code}: ${snapshot.isencaoInfo.norma}`, MARGIN, y, 10);
    y -= 16;
    const isencaoTexto = ivaDeclarationText(snapshot.isencaoInfo.norma);
    
    page.drawText(isencaoTexto, {
      x: MARGIN,
      y: y - 35,
      size: 10,
      font,
      color: rgb(0.2, 0.2, 0.2),
      maxWidth: CONTENT_WIDTH,
      lineHeight: 14,
    });

    y -= 120;
    drawText("O Armador / Representante Legal,", PAGE_WIDTH - MARGIN - 200, y, 10, { font: fontBold });
    y -= 40;
    drawText("________________________________________", PAGE_WIDTH - MARGIN - 220, y, 10);

    const pdfBytes = await doc.save();
    const copy = new Uint8Array(pdfBytes.byteLength);
    copy.set(pdfBytes);
    const fileName = `declaracao-isencao-iva-${declaration.numeroCompleto.replace(/\//g, "-")}.pdf`;
    const syncResult = post ? await syncEmittedDocumentToOneDrive({
      kind: "declaracao-iva",
      shipName: navioNome,
      fileName,
      buffer: Buffer.from(copy),
    }).catch(() => ({ synced: false })) : { synced: false };
    const blob = new Blob([copy], { type: "application/pdf" });

    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename=${fileName}`,
        "X-Declaration-Number": declaration.numeroCompleto,
        "X-Declaration-Id": String(declaration.id),
        "X-Declaration-Date": declaration.dataEmissao.toISOString(),
        "Cache-Control": "private, no-store",
        "X-OneDrive-Synced": String(syncResult.synced),
        "Content-Type": "application/pdf",
      },
    });
  } catch (err: any) {
    console.error("[GET /api/portal/declaracao-isencao-pdf]", err);
    return NextResponse.json({ error: err instanceof DeclaracaoIvaError ? err.message : "Erro ao gerar declaração de isenção de IVA." }, { status: err instanceof DeclaracaoIvaError ? err.status : 500 });
  }
}
