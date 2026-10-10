import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { getAccessContext } from "@/lib/access-control";
import { carregarFaturaPorOrdemServico, resumoFatura } from "@/lib/faturamento";
import { formatIsencaoIva } from "@/lib/iva-isencao-codes";
import { parseOrdemServicoMeta } from "@/lib/ordens-servico";

const TEAL: [number, number, number] = [0.06, 0.46, 0.43];
const DARK: [number, number, number] = [0.13, 0.16, 0.2];
const GRAY: [number, number, number] = [0.45, 0.49, 0.53];
const LIGHT: [number, number, number] = [0.91, 0.96, 0.95];

function formatEuro(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function fitText(text: string, maxWidth: number, font: PDFFont, size: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && font.widthOfTextAtSize(`${trimmed}…`, size) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const order = await prisma.ordemServico.findUnique({
      where: { id },
      include: {
        jangada: {
          select: { serial: true, brand: true, model: true, owner: true, shipNameManual: true },
        },
        cliente: {
          select: { nome: true, numeroCliente: true, nif: true, morada: true, localidade: true, ilha: true },
        },
        serviceStation: { select: { codigo: true, nome: true } },
        tecnico: { select: { nome: true } },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Ordem de serviço não encontrada." }, { status: 404 });
    }

    if (order.status !== "concluida") {
      return NextResponse.json(
        { error: "A fatura só pode ser gerada para ordens de serviço concluídas." },
        { status: 400 },
      );
    }

    const link = await carregarFaturaPorOrdemServico(id);
    const fatura = link?.fatura ?? null;

    const resumo = resumoFatura(link ?? null);
    const ordens = (fatura ? resumo.ordens : [order]) as Array<typeof order>;

    const pecas = Number(order.valorPecas || 0);
    const maoObra = Number(order.valorMaoObra || 0);
    const desconto = Number(order.valorDesconto || 0);
    const subtotal = fatura ? resumo.subtotal : pecas + maoObra - desconto;
    const iva = fatura ? resumo.iva : resumo.isentoIva ? 0 : subtotal * 0.16;
    const total = fatura ? resumo.total : subtotal + iva;

    const nif = resumo.cliente?.nif || null;
    const morada = resumo.cliente?.morada || null;
    const localidade = resumo.cliente?.localidade || null;
    const ilha = resumo.cliente?.ilha || null;
    const tecnicoNome = resumo.tecnico || order.tecnico?.nome || null;
    const dataTrabalho = resumo.dataTrabalho || order.dataConclusao || order.dataAbertura || order.createdAt || null;

    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const MARGIN = 50;
    const PAGE_WIDTH = 595.28;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
    let y = 841.89 - 40;

    const drawText = (text: string, x: number, yy: number, size = 10, opts: { font?: PDFFont; color?: [number, number, number]; align?: "left" | "right"; maxWidth?: number } = {}) => {
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

    // Header band
    page.drawRectangle({ x: 0, y: 841.89 - 110, width: PAGE_WIDTH, height: 110, color: rgb(TEAL[0], TEAL[1], TEAL[2]) });
    drawText("FATURA", MARGIN, 841.89 - 75, 26, { font: fontBold, color: [1, 1, 1] });
    drawText(resumo.issuer, MARGIN, 841.89 - 48, 11, { color: [1, 1, 1] });

    // Meta info right side
    drawText(resumo.numeroFatura, PAGE_WIDTH - MARGIN, 841.89 - 75, 20, { font: fontBold, color: [1, 1, 1], align: "right" });

    y = 841.89 - 130;
    const label = (label: string, value: string, size = 10) => {
      drawText(label, MARGIN, y, size, { font: fontBold, color: GRAY });
      drawText(value, MARGIN + 130, y, size, { color: DARK });
      y -= 18;
    };

    label("Cliente", resumo.clienteNome);
    if (nif) label("NIF", nif);
    if (morada) label("Morada", morada);
    if (localidade || ilha) label("Localidade / Ilha", `${localidade || ""} ${ilha || ""}`.trim());

    y += 6;
    label("Embarcação", resumo.navio);
    label("Jangada", resumo.jangadaLabel);
    if (resumo.jangada?.serial) label("Nº Série Jangada", resumo.jangada.serial);

    y += 6;
    label("Fatura Nº", resumo.numeroFatura);
    label("Data de emissão", formatDate(resumo.emissao));
    label("Data de trabalho", formatDate(dataTrabalho));
    if (tecnicoNome) label("Técnico responsável", tecnicoNome);
    label("Estado de Pagamento", resumo.pagamentoStatus);

    // Table header
    y -= 10;
    page.drawRectangle({ x: MARGIN, y: y - 18, width: CONTENT_WIDTH, height: 24, color: rgb(LIGHT[0], LIGHT[1], LIGHT[2]) });
    drawText("Referência", MARGIN + 6, y - 2, 10, { font: fontBold });
    drawText("Descrição", MARGIN + 130, y - 2, 10, { font: fontBold });
    drawText("Qtd", PAGE_WIDTH - MARGIN - 150, y - 2, 10, { font: fontBold, align: "right" });
    drawText("Valor", PAGE_WIDTH - MARGIN, y - 2, 10, { font: fontBold, align: "right" });
    y -= 32;

    const lineRows: Array<[string, string, string, string]> = [];
    for (const ot of ordens) {
      const meta = parseOrdemServicoMeta(ot.metadados);
      const linhas = Array.isArray(meta.linhas) ? meta.linhas : [];
      const referencia = ot.numeroOrdem || `#${ot.id}`;
      if (linhas.length > 0) {
        for (const l of linhas) {
          const qtd = Number(l.quantidade || 1);
          const unit = Number(l.unitPrice || 0);
          const tot = Number(l.total ?? (qtd * unit));
          lineRows.push([l.referencia || referencia, l.descricao || "Artigo", String(qtd), formatEuro(tot)]);
        }
      }
      const otDesconto = Number(ot.valorDesconto || 0);
      if (otDesconto > 0) {
        lineRows.push([referencia, "Desconto Comercial", "1", `-${formatEuro(otDesconto)}`]);
      }
    }
    if (lineRows.length === 0) {
      lineRows.push([order.numeroOrdem || `#${order.id}`, "Serviços prestados", "1", formatEuro(total)]);
    }

    for (const [ref, desc, qtd, valor] of lineRows) {
      if (y < 60) break;
      drawText(ref, MARGIN + 6, y, 10, { maxWidth: 110 });
      drawText(desc, MARGIN + 130, y, 10, { maxWidth: 240 });
      drawText(qtd, PAGE_WIDTH - MARGIN - 150, y, 10, { align: "right" });
      drawText(valor, PAGE_WIDTH - MARGIN, y, 10, { align: "right" });
      y -= 20;
    }

    // Totals
    y -= 6;
    const totalRows: Array<{ label: string; value: string; bold?: boolean }> = [
      { label: "Subtotal", value: formatEuro(subtotal) },
      { label: "IVA", value: resumo.isentoIva ? formatIsencaoIva(true, resumo.codigoIsencaoIva) : `16%  ${formatEuro(iva)}` },
      { label: "TOTAL", value: formatEuro(total), bold: true },
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

    if (resumo.isentoIva) {
      const mencao = formatIsencaoIva(true, resumo.codigoIsencaoIva);
      drawText(`IVA isento: ${mencao}`, MARGIN, Math.max(y - 8, 70), 9, { font: fontBold, color: DARK });
      if (y - 8 < 70) {
        drawText("Documento gerado eletronicamente. Obrigado pela preferência.", MARGIN, 60, 9, { color: GRAY });
      }
    }

    // Footer
    drawText(
      "Documento gerado eletronicamente. Obrigado pela preferência.",
      MARGIN,
      60,
      9,
      { color: GRAY },
    );

    const pdfBytes = await doc.save();
    const copy = new Uint8Array(pdfBytes.byteLength);
    copy.set(pdfBytes);
    const blob = new Blob([copy], { type: "application/pdf" });

    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename=fatura-${resumo.numeroFatura}.pdf`,
        "Content-Type": "application/pdf",
      },
    });
  } catch (error: unknown) {
    console.error("Erro ao gerar fatura PDF:", error);
    const message = error instanceof Error ? error.message : "Erro ao gerar a fatura PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
