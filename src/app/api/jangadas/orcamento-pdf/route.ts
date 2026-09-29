import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { getAccessContext } from "@/lib/access-control";

const TEAL: [number, number, number] = [0.06, 0.46, 0.43];
const DARK: [number, number, number] = [0.13, 0.16, 0.2];
const GRAY: [number, number, number] = [0.45, 0.49, 0.53];
const LIGHT: [number, number, number] = [0.91, 0.96, 0.95];

const formatEuro = (value: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(value || 0);

const round = (value: number) => Math.round((value || 0) * 100) / 100;

type OrcamentoLinhaPdf = {
  referencia?: string | null;
  descricao?: string | null;
  quantidade?: number | null;
  total?: number | null;
};

type OrcamentoPdfBody = {
  linhas: OrcamentoLinhaPdf[];
  subtotal: number;
  ivaRate: number;
  isIsentoIva: boolean;
  validadeDias: number;
  dataValidade?: string;
  clienteNome?: string;
  embarcacao?: string;
  jangada?: string;
  serial?: string;
  certificadoNumero?: string;
};

export async function POST(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const body = (await req.json().catch(() => null)) as OrcamentoPdfBody | null;
    if (!body || !Array.isArray(body.linhas) || body.linhas.length === 0) {
      return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
    }

    const linhas = body.linhas.map((l) => ({
      referencia: String(l.referencia || "") || "—",
      descricao: String(l.descricao || ""),
      quantidade: Math.max(1, Number(l.quantidade) || 1),
      total: Number(l.total) || 0,
    }));
    const subtotal = Math.max(0, Number(body.subtotal) || 0);
    const ivaRate = Math.max(0, Number(body.ivaRate) || 0);
    const isIsentoIva = Boolean(body.isIsentoIva);
    const validadeDias = Math.max(1, Number(body.validadeDias) || 15);
    const dataValidade = String(body.dataValidade || new Date().toLocaleDateString("pt-PT"));
    const ivaValor = round(subtotal * ivaRate);
    const totalIva = round(subtotal + ivaValor);

    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const MARGIN = 50;
    const PAGE_WIDTH = 595.28;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
    let y = 841.89 - 40;

    const fitText = (text: string, maxWidth: number, f: PDFFont, size: number) => {
      if (f.widthOfTextAtSize(text, size) <= maxWidth) return text;
      let trimmed = text;
      while (trimmed.length > 1 && f.widthOfTextAtSize(`${trimmed}…`, size) > maxWidth) {
        trimmed = trimmed.slice(0, -1);
      }
      return `${trimmed}…`;
    };

    const drawText = (
      text: string,
      x: number,
      yy: number,
      size = 10,
      opts: { font?: PDFFont; color?: [number, number, number]; align?: "left" | "right"; maxWidth?: number } = {},
    ) => {
      const f = opts.font || font;
      const color = opts.color || DARK;
      let tx = x;
      if (opts.align === "right") {
        tx = x - f.widthOfTextAtSize(text, size);
      }
      if (opts.maxWidth) {
        text = fitText(text, opts.maxWidth, f, size);
      }
      page.drawText(text, { x: tx, y: yy, size, font: f, color: rgb(color[0], color[1], color[2]) });
    };

    page.drawRectangle({ x: 0, y: 841.89 - 110, width: PAGE_WIDTH, height: 110, color: rgb(TEAL[0], TEAL[1], TEAL[2]) });
    drawText("ORÇAMENTO", MARGIN, 841.89 - 75, 26, { font: fontBold, color: [1, 1, 1] });
    drawText("Orey Azores — Serviços de vistoria e certificação", MARGIN, 841.89 - 48, 11, { color: [1, 1, 1] });

    const referenciaOrcamento = body.certificadoNumero
      ? `INS-${body.certificadoNumero}`
      : `SÉRIE ${body.serial || ""}`;
    drawText(referenciaOrcamento, PAGE_WIDTH - MARGIN, 841.89 - 75, 20, { font: fontBold, color: [1, 1, 1], align: "right" });

    y = 841.89 - 130;
    const label = (lbl: string, val: string) => {
      drawText(lbl, MARGIN, y, 10, { font: fontBold, color: GRAY });
      drawText(val, MARGIN + 130, y, 10, { color: DARK });
      y -= 18;
    };

    label("Cliente", String(body.clienteNome || "—"));
    label("Embarcação", String(body.embarcacao || "—"));
    label("Jangada", String(body.jangada || "—"));
    if (body.serial) label("Nº Série Jangada", body.serial);
    label("Data de emissão", new Date().toLocaleDateString("pt-PT"));
    label("Validade", `até ${dataValidade} (${validadeDias} dias)`);

    y -= 10;
    page.drawRectangle({ x: MARGIN, y: y - 18, width: CONTENT_WIDTH, height: 24, color: rgb(LIGHT[0], LIGHT[1], LIGHT[2]) });
    drawText("Referência", MARGIN + 6, y - 2, 10, { font: fontBold });
    drawText("Descrição", MARGIN + 130, y - 2, 10, { font: fontBold });
    drawText("Qtd", PAGE_WIDTH - MARGIN - 150, y - 2, 10, { font: fontBold, align: "right" });
    drawText("Valor", PAGE_WIDTH - MARGIN, y - 2, 10, { font: fontBold, align: "right" });
    y -= 32;

    for (const linha of linhas) {
      if (y < 100) break;
      drawText(linha.referencia || "—", MARGIN + 6, y, 10, { maxWidth: 110 });
      drawText(linha.descricao || "", MARGIN + 130, y, 10, { maxWidth: 240 });
      drawText(String(linha.quantidade ?? 1), PAGE_WIDTH - MARGIN - 150, y, 10, { align: "right" });
      drawText(formatEuro(linha.total || 0), PAGE_WIDTH - MARGIN, y, 10, { align: "right" });
      y -= 20;
    }

    y -= 6;
    const totalRows: Array<{ label: string; value: string; bold?: boolean }> = [
      { label: "Subtotal", value: formatEuro(subtotal) },
      { label: "IVA", value: isIsentoIva ? "Isento" : `${Math.round(ivaRate * 100)}%  ${formatEuro(ivaValor)}` },
      { label: "TOTAL", value: formatEuro(totalIva), bold: true },
    ];
    for (const entry of totalRows) {
      drawText(entry.label, PAGE_WIDTH - MARGIN - 220, y, entry.bold ? 12 : 10, { font: entry.bold ? fontBold : font, align: "right", color: GRAY });
      drawText(entry.value, PAGE_WIDTH - MARGIN, y, entry.bold ? 13 : 10, { font: entry.bold ? fontBold : font, align: "right" });
      if (entry.bold) {
        page.drawRectangle({ x: PAGE_WIDTH - MARGIN - 220, y: y - 4, width: 220, height: 22, color: rgb(TEAL[0], TEAL[1], TEAL[2]) });
        drawText(entry.label, PAGE_WIDTH - MARGIN - 214, y, 12, { font: fontBold, color: [1, 1, 1], align: "right" });
        drawText(entry.value, PAGE_WIDTH - MARGIN - 6, y, 13, { font: fontBold, color: [1, 1, 1], align: "right" });
      }
      y -= entry.bold ? 30 : 20;
    }

    drawText(`Orçamento válido até ${dataValidade}. Aguardamos a sua resposta (SIM para aprovar ou NÃO para solicitar alterações).`, MARGIN, Math.max(y - 10, 60), 9, { color: GRAY });
    drawText("Documento gerado eletronicamente. Obrigado pela preferência.", MARGIN, 60, 9, { color: GRAY });

    const pdfBytes = await doc.save();
    const copy = new Uint8Array(pdfBytes.byteLength);
    copy.set(pdfBytes);

    return new NextResponse(copy, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=orcamento-${String(body.serial || "inspecao").replace(/[^\w.-]/g, "")}.pdf`,
      },
    });
  } catch (error) {
    console.error("Erro ao gerar orçamento PDF:", error);
    return NextResponse.json({ error: "Erro ao gerar o orçamento PDF." }, { status: 500 });
  }
}