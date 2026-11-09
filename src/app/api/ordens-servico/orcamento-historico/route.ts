import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";
import { getAccessContext } from "@/lib/access-control";
import { getIvaRate } from "@/lib/iva";
import { parseOrdemServicoMeta } from "@/lib/ordens-servico";
import { roundQuoteMoney } from "@/lib/ordem-quote-input";

function formatEuro(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
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
    if (!access.isAdmin) return NextResponse.json({ error: "Acesso reservado a administradores." }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const inspecaoId = Number(searchParams.get("inspecaoId"));

    if (!Number.isSafeInteger(inspecaoId) || inspecaoId <= 0) {
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

    if (!ordem) return NextResponse.json({ error: "Nao existe orcamento registado associado a esta inspecao." }, { status: 404 });
    const linhas = parseOrdemServicoMeta(ordem.metadados).linhas || [];
    const artigosCalculados = (inspecao.artigos || []).map((art) => {
      // Historical exports use recorded quote prices, never today's catalogue or a default price.
      const matches = linhas.filter(line => art.referencia ? line.referencia === art.referencia : line.descricao === art.name);
      const unitPrice = matches.length === 1 && matches[0].unitPrice != null ? Number(matches[0].unitPrice) : null;
      const qtd = Number(art.quantidade ?? 1);
      return {
        ...art,
        quantidade: qtd,
        precoUnitario: unitPrice,
        subtotal: unitPrice == null ? null : roundQuoteMoney(qtd * unitPrice),
      };
    });

    const valorPecas = Number(ordem.valorPecas);

    const valorMaoObra = Number(ordem?.valorMaoObra || 0);
    const valorDesconto = Number(ordem?.valorDesconto || 0);
    const isentoIva = Boolean(ordem?.isIsentoIva);
    const subtotalGeral = roundQuoteMoney(Math.max(0, valorPecas + valorMaoObra - valorDesconto));
    const ivaRate = getIvaRate();
    const iva = isentoIva ? 0 : roundQuoteMoney(subtotalGeral * ivaRate);
    const total = roundQuoteMoney(subtotalGeral + iva);

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
           art.precoUnitario == null ? "Nao registado" : formatEuro(art.precoUnitario),
           art.subtotal == null ? "Nao registado" : formatEuro(art.subtotal),
        ]);
      });
    }

    worksheet.addRow([]);
    worksheet.addRow(["", "", "", "Inspeção de Jangada:", formatEuro(valorMaoObra)]);
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
