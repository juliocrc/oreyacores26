import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";
import { getAccessContext } from "@/lib/access-control";
import { getIvaRate } from "@/lib/iva";
import { formatIsencaoIva } from "@/lib/iva-isencao-codes";
import { parseOrdemServicoMeta } from "@/lib/ordens-servico";
import { roundQuoteMoney } from "@/lib/ordem-quote-input";
import { billingRecipient } from "@/lib/billing-recipient";

function formatDate(value: Date | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const order = await prisma.ordemServico.findUnique({
      where: { id, ...(!access.isAdmin && (access.allowedStationIds.length || access.stationId) ? {
        serviceStationId: access.allowedStationIds.length ? { in: access.allowedStationIds } : access.stationId,
      } : {}) },
      include: {
        jangada: {
          select: {
            serial: true,
            brand: true,
            model: true,
            owner: true,
            shipNameManual: true,
          },
        },
        cliente: {
          select: {
            nome: true,
            numeroCliente: true,
            nif: true,
            morada: true,
            localidade: true,
            ilha: true,
          },
        },
        serviceStation: {
          select: { codigo: true, nome: true },
        },
        tecnico: {
          select: { nome: true },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Ordem de serviço não encontrada." }, { status: 404 });
    }

    const metaLinhas = parseOrdemServicoMeta(order.metadados).linhas;
    const linhas = Array.isArray(metaLinhas) ? metaLinhas : [];
    const desconto = Number(order.valorDesconto || 0);
    const isentoIva = Boolean(order.isIsentoIva);
    const subtotal = roundQuoteMoney(Math.max(0, Number(order.valorPecas || 0) + Number(order.valorMaoObra || 0) - desconto));
    const iva = isentoIva ? 0 : roundQuoteMoney(subtotal * getIvaRate());
    const total = roundQuoteMoney(subtotal + iva);

    const jangada = order.jangada || null;
    const cliente = billingRecipient(order.cliente,
      (parseOrdemServicoMeta(order.metadados) as { destinatarioFaturacao?: unknown }).destinatarioFaturacao);
    const clienteNome = cliente?.nome || jangada?.owner || "—";
    const navio = jangada?.shipNameManual || "—";

    const workbook = new ExcelJS.Workbook();
    workbook.calcProperties.fullCalcOnLoad = true;
    const worksheet = workbook.addWorksheet("Orçamento");

    worksheet.columns = [
      { header: "", key: "a", width: 34 },
      { header: "", key: "b", width: 60 },
      { header: "", key: "c", width: 16 },
      { header: "", key: "d", width: 16 },
      { header: "", key: "e", width: 20 },
      { header: "", key: "f", width: 18 },
    ];

    worksheet.mergeCells("A1:F1");
    worksheet.getCell("A1").value = "ORÇAMENTO DE INSPEÇÃO / TRABALHO";
    worksheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFF" } };
    worksheet.getCell("A1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "4F46E5" },
    };
    worksheet.getRow(1).height = 28;
    worksheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };

    const headerRows: Array<[string, string]> = [
      ["Nº de Orçamento", order.numeroOrdem || "—"],
      ["Data", formatDate(order.dataAbertura || order.createdAt)],
      ["Estado", order.orcamentoStatus || "Rascunho"],
    ];
    if (order.serviceStation) {
      headerRows.push(["Estação", `${order.serviceStation.codigo || ""} · ${order.serviceStation.nome || ""}`.trim()]);
    }
    headerRows.push(["Cliente", `${clienteNome}${cliente?.nif ? ` (NIF ${cliente.nif})` : ""}`]);
    headerRows.push(["Morada", [cliente.morada, cliente.localidade, cliente.ilha].filter(Boolean).join(", ")]);
    headerRows.push(["Jangada", `${jangada?.brand || ""} ${jangada?.model || ""}`.trim() || "—"]);
    if (jangada?.serial) headerRows.push(["Nº Série", jangada.serial]);
    if (navio) headerRows.push(["Embarcação", navio]);
    if (order.tecnico?.nome) headerRows.push(["Técnico responsável", order.tecnico.nome]);

    let rowIndex = 2;
    headerRows.forEach(([label, value]) => {
      worksheet.getCell(`A${rowIndex}`).value = label;
      worksheet.getCell(`A${rowIndex}`).font = { bold: true };
      worksheet.getCell(`B${rowIndex}`).value = value;
      rowIndex += 1;
    });

    rowIndex += 1;
    worksheet.mergeCells(`A${rowIndex}:F${rowIndex}`);
    worksheet.getCell(`A${rowIndex}`).value = "Detalhe de custos";
    worksheet.getCell(`A${rowIndex}`).font = { bold: true };
    worksheet.getCell(`A${rowIndex}`).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "EEF2FF" },
    };
    rowIndex += 1;

    let firstCostRow = rowIndex;
    const moneyFormat = '#,##0.00 "€"';
    if (linhas.length > 0) {
      worksheet.getCell(`A${rowIndex}`).value = "Ref.";
      worksheet.getCell(`B${rowIndex}`).value = "Descrição";
      worksheet.getCell(`C${rowIndex}`).value = "Qtd";
      worksheet.getCell(`D${rowIndex}`).value = "Desconto (%)";
      worksheet.getCell(`E${rowIndex}`).value = "Preço unitário";
      worksheet.getCell(`F${rowIndex}`).value = "Valor";
      ["A", "B", "C", "D", "E", "F"].forEach((col) => {
        worksheet.getCell(`${col}${rowIndex}`).font = { bold: true };
      });
      rowIndex += 1;
      firstCostRow = rowIndex;

      for (const linha of linhas) {
        worksheet.getCell(`A${rowIndex}`).value = linha.referencia || "—";
        worksheet.getCell(`B${rowIndex}`).value = linha.descricao || "";
        const quantidade = linha.quantidade ?? 1;
        const unitPrice = linha.unitPrice ?? linha.precoUnitario ?? (linha.quantidade == null ? linha.total : 0) ?? 0;
        const descontoPercentual = linha.descontoPercentual ?? 0;
        worksheet.getCell(`C${rowIndex}`).value = quantidade;
        worksheet.getCell(`D${rowIndex}`).value = descontoPercentual;
        worksheet.getCell(`D${rowIndex}`).numFmt = '0.##"%"';
        worksheet.getCell(`D${rowIndex}`).dataValidation = {
          type: "decimal", operator: "between", formulae: [0, 100],
          showErrorMessage: true, error: "Introduza um desconto entre 0 e 100.",
        };
        worksheet.getCell(`E${rowIndex}`).value = unitPrice;
        worksheet.getCell(`E${rowIndex}`).numFmt = moneyFormat;
        worksheet.getCell(`F${rowIndex}`).value = {
          formula: `ROUND(C${rowIndex}*E${rowIndex}*(1-D${rowIndex}/100),2)`,
          result: linha.total ?? roundQuoteMoney(quantidade * unitPrice * (1 - descontoPercentual / 100)),
        };
        worksheet.getCell(`F${rowIndex}`).numFmt = moneyFormat;
        rowIndex += 1;
      }
    }

    const moneyRows: Array<{ label: string; note: string; value: number; bold?: boolean }> = [
      ...(linhas.length === 0 ? [{ label: "Servicos e materiais registados", note: "", value: Number(order.valorPecas || 0) }] : []),
      ...(Number(order.valorMaoObra) > 0 ? [{ label: "Mao de obra", note: "", value: Number(order.valorMaoObra) }] : []),
      ...(desconto > 0 ? [{ label: "Desconto Comercial", note: "", value: -desconto }] : []),
      { label: "Subtotal", note: "", value: subtotal },
      ...(isentoIva ? [] : [{ label: `IVA (${Math.round(getIvaRate() * 100)}%)`, note: "", value: iva }]),
      { label: "TOTAL", note: isentoIva ? (formatIsencaoIva(true, order.codigoIsencaoIva) || "Isento de IVA") : "", value: total, bold: true },
    ];

    let subtotalRow = 0;
    let ivaRow = 0;
    moneyRows.forEach((entry) => {
      worksheet.getCell(`A${rowIndex}`).value = entry.label;
      worksheet.getCell(`B${rowIndex}`).value = entry.note;
      const cell = worksheet.getCell(`F${rowIndex}`);
      if (entry.label === "Subtotal") {
        subtotalRow = rowIndex;
        cell.value = { formula: `ROUND(MAX(0,SUM(F${firstCostRow}:F${rowIndex - 1})),2)`, result: entry.value };
      } else if (entry.label.startsWith("IVA (")) {
        ivaRow = rowIndex;
        cell.value = { formula: `ROUND(F${subtotalRow}*${getIvaRate()},2)`, result: entry.value };
      } else if (entry.label === "TOTAL") {
        cell.value = { formula: `ROUND(F${subtotalRow}${ivaRow ? `+F${ivaRow}` : ""},2)`, result: entry.value };
      } else cell.value = entry.value;
      cell.numFmt = moneyFormat;
      worksheet.getCell(`A${rowIndex}`).font = { bold: Boolean(entry.bold) };
      cell.font = { bold: Boolean(entry.bold) };
      rowIndex += 1;
    });

    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "E5E7EB" } },
          left: { style: "thin", color: { argb: "E5E7EB" } },
          bottom: { style: "thin", color: { argb: "E5E7EB" } },
          right: { style: "thin", color: { argb: "E5E7EB" } },
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename=orcamento-${order.numeroOrdem}.xlsx`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error: unknown) {
    console.error("Erro ao gerar orçamento Excel:", error);
    const message = error instanceof Error ? error.message : "Erro ao gerar o orçamento Excel.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
