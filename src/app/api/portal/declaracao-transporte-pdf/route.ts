import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const clienteId = searchParams.get("clienteId");
    const navioId = searchParams.get("navioId");
    const serial = searchParams.get("serial") || "S/N";
    const brand = searchParams.get("brand") || "—";
    const model = searchParams.get("model") || "—";
    const transportadora = searchParams.get("transportadora") || "Transportadora";
    const guia = searchParams.get("guia") || "N/A";

    let clienteNome = searchParams.get("cliente") || "Armador";
    let clienteNif = searchParams.get("nif") || "—";
    let clienteMorada = searchParams.get("morada") || "—";
    let clienteIlha = searchParams.get("ilha") || "";
    let navioNome = searchParams.get("navio") || "Embarcação";

    if (clienteId) {
      const c = await prisma.cliente.findUnique({ where: { id: Number(clienteId) } });
      if (c) {
        clienteNome = c.nome;
        clienteNif = c.nif || "—";
        clienteMorada = c.morada || "—";
        clienteIlha = c.ilha || "";
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
      clienteIlha = ownClient.ilha || "";
    }

    if (navioId) {
      const n = await prisma.navio.findUnique({ where: { id: Number(navioId) }, select: { id: true, nome: true, clienteId: true } });
      if (!n) return NextResponse.json({ error: "Navio não encontrado." }, { status: 404 });
      if (n) {
        if (session.user.role === "CLIENTE" && Number(session.user.clienteId) !== n.clienteId) {
          return NextResponse.json({ error: "O navio não pertence ao cliente autenticado." }, { status: 403 });
        }
        navioNome = n.nome;
      }
    }

    if (serial !== "S/N" && navioId) {
      const jangada = await prisma.jangada.findFirst({
        where: { serial, shipId: Number(navioId) },
        select: { id: true },
      });
      if (!jangada) return NextResponse.json({ error: "A jangada não está associada ao navio indicado." }, { status: 400 });
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
    drawText("DECLARAÇÃO DE TRANSPORTE", MARGIN, 841.89 - 65, 20, { font: fontBold, color: [1, 1, 1] });
    drawText("Envio de Jangada Salva-Vidas para Estação de Serviço", MARGIN, 841.89 - 85, 11, { color: [0.9, 0.95, 0.95] });

    y = 841.89 - 140;
    drawText(`Data: ${new Date().toLocaleDateString("pt-PT")}`, MARGIN, y, 10, { font: fontBold });
    y -= 25;

    drawText("Identificação do Remetente (Armador / Proprietário):", MARGIN, y, 11, { font: fontBold });
    y -= 18;
    drawText(`Nome / Entidade: ${clienteNome}`, MARGIN + 10, y, 10);
    y -= 16;
    drawText(`NIF: ${clienteNif}`, MARGIN + 10, y, 10);
    y -= 16;
    drawText(`Morada: ${clienteMorada} ${clienteIlha ? `(${clienteIlha})` : ""}`, MARGIN + 10, y, 10);
    y -= 16;
    drawText(`Embarcação Associada: ${navioNome}`, MARGIN + 10, y, 10);
    y -= 25;

    drawText("Identificação do Equipamento:", MARGIN, y, 11, { font: fontBold });
    y -= 18;
    drawText(`Equipamento: Jangada Salva-Vidas`, MARGIN + 10, y, 10);
    y -= 16;
    drawText(`Marca / Modelo: ${brand} ${model}`, MARGIN + 10, y, 10);
    y -= 16;
    drawText(`Número de Série (S/N): ${serial}`, MARGIN + 10, y, 10);
    y -= 25;

    drawText("Dados do Transporte:", MARGIN, y, 11, { font: fontBold });
    y -= 18;
    drawText(`Transportadora / Operador: ${transportadora}`, MARGIN + 10, y, 10);
    y -= 16;
    drawText(`Guia de Transporte / Referência: ${guia}`, MARGIN + 10, y, 10);
    y -= 30;

    drawText("Declaração:", MARGIN, y, 11, { font: fontBold });
    y -= 18;
    const declaracaoTexto = 
      "Declara-se para os devidos efeitos legais que o equipamento acima identificado é enviado à ordem " +
      "de Orey Técnica, Serviços Navais Lda. (Zona Industrial dos Portões Vermelhos, Armazém 19, 9560-350 Cabouco) " +
      "para efeitos de inspeção periódica obrigatória, manutenção e certificação regulamentar.";
    
    page.drawText(declaracaoTexto, {
      x: MARGIN,
      y: y - 35,
      size: 10,
      font,
      color: rgb(0.2, 0.2, 0.2),
      maxWidth: CONTENT_WIDTH,
      lineHeight: 14,
    });

    y -= 110;
    drawText("O Armador / Representante,", PAGE_WIDTH - MARGIN - 180, y, 10, { font: fontBold });
    y -= 40;
    drawText("________________________________________", PAGE_WIDTH - MARGIN - 220, y, 10);

    const pdfBytes = await doc.save();
    const copy = new Uint8Array(pdfBytes.byteLength);
    copy.set(pdfBytes);
    const blob = new Blob([copy], { type: "application/pdf" });

    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename=declaracao-transporte-${serial}.pdf`,
        "Content-Type": "application/pdf",
      },
    });
  } catch (err: any) {
    console.error("[GET /api/portal/declaracao-transporte-pdf]", err);
    return NextResponse.json({ error: err?.message || "Erro ao gerar declaração de transporte." }, { status: 500 });
  }
}
