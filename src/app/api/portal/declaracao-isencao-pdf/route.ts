import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/auth";
import { syncEmittedDocumentToOneDrive } from "@/lib/onedrive-sync";
import { emitirDeclaracaoIsencaoIva } from "@/lib/declaracao-isencao-iva";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const clienteId = searchParams.get("clienteId");
    const navioId = searchParams.get("navioId");

    let clienteNome = searchParams.get("cliente") || "Armador";
    let clienteNif = searchParams.get("nif") || "—";
    let clienteMorada = searchParams.get("morada") || "—";
    let navioNome = searchParams.get("navio") || "Embarcação";
    let tipoPesca = searchParams.get("tipoPesca") || "";

    if (clienteId) {
      const c = await prisma.cliente.findUnique({ where: { id: Number(clienteId) } });
      if (c) {
        clienteNome = c.nome;
        clienteNif = c.nif || "—";
        clienteMorada = c.morada || "—";
      }
    }

    if (session.user.role === "CLIENTE") {
      const ownClientId = Number(session.user.clienteId);
      if (!ownClientId) return NextResponse.json({ error: "Conta de cliente sem associação válida." }, { status: 403 });
      const ownClient = await prisma.cliente.findUnique({ where: { id: ownClientId } });
      if (!ownClient) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
      clienteNome = ownClient.nome;
      clienteNif = ownClient.nif || "—";
      clienteMorada = ownClient.morada || "—";
    }

    if (navioId) {
      const n = await prisma.navio.findUnique({ where: { id: Number(navioId), }, select: { id: true, nome: true, tipoPesca: true, clienteId: true } });
      if (!n) return NextResponse.json({ error: "Navio não encontrado." }, { status: 404 });
      if (n) {
        if (session.user.role === "CLIENTE" && Number(session.user.clienteId) !== n.clienteId) {
          return NextResponse.json({ error: "O navio não pertence ao cliente autenticado." }, { status: 403 });
        }
        navioNome = n.nome;
        tipoPesca = n.tipoPesca || "";
      }
    }

    if (!navioId) {
      return NextResponse.json({ error: "É obrigatório indicar o navio da declaração." }, { status: 400 });
    }

    const declaration = await emitirDeclaracaoIsencaoIva({
      clienteNome,
      clienteNif,
      navioNome,
      codigoIsencaoIva: searchParams.get("codigoIsencaoIva"),
      origem: "cliente",
      emitidoPorId: String(session.user.id),
    });

    // Verificar se é embarcação de pesca
    const isPesca = tipoPesca && tipoPesca.toLowerCase() !== "não aplicável" && tipoPesca.toLowerCase() !== "outro";
    if (!isPesca && navioId) {
      // Se não for pesca, rejeitar a emissão da isenção de IVA
      return NextResponse.json(
        { error: "A declaração de isenção de IVA só pode ser emitida para embarcações de pesca." },
        { status: 400 }
      );
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
    drawText("DECLARAÇÃO DE ISENÇÃO DE IVA", MARGIN, 841.89 - 65, 20, { font: fontBold, color: [1, 1, 1] });
    drawText(declaration.numeroCompleto, PAGE_WIDTH - MARGIN, 841.89 - 65, 12, { font: fontBold, color: [1, 1, 1], align: "right" });
    drawText("Embarcação de Pesca Comercial · Regime de Isenção", MARGIN, 841.89 - 85, 11, { color: [0.9, 0.95, 0.95] });

    y = 841.89 - 140;
    drawText(`Data: ${new Date().toLocaleDateString("pt-PT")}`, MARGIN, y, 10, { font: fontBold });
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
    drawText(`Tipo / Atividade: ${tipoPesca || "Pesca Comercial"}`, MARGIN + 10, y, 10);
    y -= 30;

    drawText("Fundamentação Legal da Isenção:", MARGIN, y, 11, { font: fontBold });
    y -= 18;
    const isencaoTexto = 
      "Declara-se para os devidos efeitos fiscais que a embarcação acima identificada dedica-se à atividade " +
      "da pesca comercial, enquadrando-se nos normativos legais de isenção de IVA aplicáveis aos fornecimentos " +
      "de bens e prestação de serviços destinados a embarcações que exercem a pesca comercial (Artigo 14.º do CIVA " +
      "ou legislação equivalente aplicável na Região Autónoma dos Açores).";
    
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
    const fileName = `declaracao-isencao-iva-${declaration.numeroCompleto.replace(/\//g, "-")}-${navioNome.replace(/\s+/g, "_")}.pdf`;
    const syncResult = await syncEmittedDocumentToOneDrive({
      kind: "declaracao-iva",
      shipName: navioNome,
      fileName,
      buffer: Buffer.from(copy),
    });
    const blob = new Blob([copy], { type: "application/pdf" });

    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename=${fileName}`,
        "X-Declaration-Number": declaration.numeroCompleto,
        "X-OneDrive-Synced": String(syncResult.synced),
        "Content-Type": "application/pdf",
      },
    });
  } catch (err: any) {
    console.error("[GET /api/portal/declaracao-isencao-pdf]", err);
    return NextResponse.json({ error: err?.message || "Erro ao gerar declaração de isenção de IVA." }, { status: 500 });
  }
}
