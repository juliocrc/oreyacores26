import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";
import { getAccessContext } from "@/lib/access-control";
import { getIvaRate } from "@/lib/iva";

function formatEuro(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function formatDateStr(value?: string | null) {
  if (!value) return "";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return String(value);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export async function GET(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const inspecaoId = Number(searchParams.get("inspecaoId"));

    if (!Number.isFinite(inspecaoId) || inspecaoId <= 0) {
      return NextResponse.json({ error: "ID de inspeção inválido." }, { status: 400 });
    }

    const inspecao = await prisma.inspecao.findUnique({
      where: { id: inspecaoId },
      include: {
        artigos: true,
      },
    });

    if (!inspecao) {
      return NextResponse.json({ error: "Inspeção não encontrada." }, { status: 404 });
    }

    const jangada = inspecao.jangadaId
      ? await prisma.jangada.findUnique({
          where: { id: inspecao.jangadaId },
          select: {
            id: true,
            serial: true,
            brand: true,
            model: true,
            owner: true,
            shipNameManual: true,
          },
        })
      : null;
    const ordem = await prisma.ordemServico.findFirst({
      where: { inspecaoId: inspecao.id },
      include: {
        cliente: { select: { nome: true, nif: true, localidade: true, ilha: true } },
      },
    });

    const artigos = inspecao.artigos || [];

    // Obter os preços de venda atuais do stock para cada referência de artigo substituído
    const referencias = artigos.map((a) => a.referencia).filter(Boolean) as string[];
    const stockItems = referencias.length > 0 ? await prisma.stock.findMany({
      where: { referencia: { in: referencias } },
      select: { referencia: true, precoVenda: true },
    }) : [];

    const precoMap = new Map<string, number>();
    stockItems.forEach((s) => {
      if (s.referencia) precoMap.set(s.referencia, Number(s.precoVenda || 0));
    });

    let valorPecas = 0;
    const artigosCalculados = artigos.map((art) => {
      const qtd = Number(art.quantidade || 1);
      const unitPrice = (art.referencia && precoMap.has(art.referencia)) 
        ? precoMap.get(art.referencia)! 
        : 25.0; // fallback padrão se o artigo não estiver catalogado no stock
      const sub = qtd * unitPrice;
      valorPecas += sub;
      return {
        ...art,
        quantidade: qtd,
        precoUnitario: unitPrice,
        subtotal: sub,
      };
    });

    if (ordem && Number(ordem.valorPecas || 0) > 0) {
      valorPecas = Number(ordem.valorPecas);
    }

    const valorMaoObra = Number(ordem?.valorMaoObra || 0);
    const valorDesconto = Number(ordem?.valorDesconto || 0);
    const isentoIva = Boolean(ordem?.isIsentoIva);
    const subtotalGeral = Math.max(0, valorPecas + valorMaoObra - valorDesconto);
    const ivaRate = getIvaRate();
    const iva = isentoIva ? 0 : subtotalGeral * ivaRate;
    const total = subtotalGeral + iva;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Orçamento Histórico");

    worksheet.columns = [
      { header: "", key: "a", width: 34 },
      { header: "", key: "b", width: 44 },
      { header: "", key: "c", width: 12 },
      { header: "", key: "d", width: 18 },
      { header: "", key: "e", width: 18 },
    ];

    worksheet.mergeCells("A1:E1");
    worksheet.getCell("A1").value = `ORÇAMENTO — INSPEÇÃO HISTÓRICA (CERT. Nº ${inspecao.certificadoNumero || "N/D"})`;
    worksheet.getCell("A1").font = { bold: true, size: 14, color: { argb: "FFFFFF" } };
    worksheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "0D9488" } };
    worksheet.getRow(1).height = 28;
    worksheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };

    worksheet.addRow([]);
    worksheet.addRow(["Data da Inspeção:", formatDateStr(inspecao.dataInspecao), "", "Próxima Inspeção:", formatDateStr(inspecao.dataProxInspecao)]);
    worksheet.addRow(["Certificado Nº:", inspecao.certificadoNumero || "—", "", "Responsável:", ordem?.tecnicoResponsavel || "—"]);
    worksheet.addRow(["Jangada / Marca:", `${jangada?.brand || ""} ${jangada?.model || ""}`.trim(), "", "Nº de Série:", jangada?.serial || "—"]);
    worksheet.addRow(["Armador / Cliente:", ordem?.cliente?.nome || jangada?.owner || "—", "", "Navio:", jangada?.shipNameManual || "—"]);
    worksheet.addRow([]);

    const headerRow = worksheet.addRow(["Artigo / Consumível Substituído", "Referência / Lote", "Qtd", "Preço Unit. (€)", "Subtotal (€)"]);
    headerRow.font = { bold: true, color: { argb: "FFFFFF" } };
    headerRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "334155" } };
    });

    if (artigosCalculados.length === 0) {
      worksheet.addRow(["Sem artigos ou consumíveis substituídos registados nesta inspeção.", "", "", "", ""]);
    } else {
      artigosCalculados.forEach((art) => {
        worksheet.addRow([
          art.name,
          `${art.referencia || "—"} / ${art.codigoFabricante || "—"}`,
          art.quantidade,
          formatEuro(art.precoUnitario),
          formatEuro(art.subtotal),
        ]);
      });
    }

    worksheet.addRow([]);
    worksheet.addRow(["", "", "", "Mão-de-Obra:", formatEuro(valorMaoObra)]);
    worksheet.addRow(["", "", "", "Peças / Materiais:", formatEuro(valorPecas)]);
    if (valorDesconto > 0) {
      worksheet.addRow(["", "", "", "Desconto:", `-${formatEuro(valorDesconto)}`]);
    }
    worksheet.addRow(["", "", "", "Subtotal:", formatEuro(subtotalGeral)]);
    worksheet.addRow(["", "", "", `IVA (${(ivaRate * 100).toFixed(0)}%):`, formatEuro(iva)]);
    
    const totalRow = worksheet.addRow(["", "", "", "TOTAL:", formatEuro(total)]);
    totalRow.font = { bold: true, size: 12 };

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `Orcamento_Inspecao_${inspecao.certificadoNumero || inspecao.id}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[GET /api/ordens-servico/orcamento-historico]", error);
    return NextResponse.json({ error: "Erro ao gerar orçamento histórico." }, { status: 500 });
  }
}
