import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";
import { getAccessContext } from "@/lib/access-control";
import { carregarFaturaPorOrdemServico, resumoFatura } from "@/lib/faturamento";
import { formatIsencaoIva } from "@/lib/iva-isencao-codes";

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    if (!access.isAdmin) return NextResponse.json({ error: "Acesso reservado a administradores." }, { status: 403 });

    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) {
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
        { error: "A nota de crédito só pode ser emitida para faturas de ordens de serviço concluídas." },
        { status: 400 },
      );
    }

    const link = await carregarFaturaPorOrdemServico(id);
    const fatura = link?.fatura ?? null;
    if (!fatura?.notaCredito) return NextResponse.json({ error: "Nao existe nota de credito registada para esta ordem." }, { status: 404 });
    const resumo = resumoFatura(link ?? null);
    const ordens = (fatura ? resumo.ordens : [order]) as Array<typeof order>;

    const pecas = Number(order.valorPecas || 0);
    const maoObra = Number(order.valorMaoObra || 0);
    const desconto = Number(order.valorDesconto || 0);
    const subtotal = fatura ? resumo.subtotal : pecas + maoObra - desconto;
    const iva = fatura ? resumo.iva : resumo.isentoIva ? 0 : subtotal * 0.16;
    const total = fatura ? resumo.total : subtotal + iva;

    const clienteNome = resumo.clienteNome;
    const nif = resumo.cliente?.nif || null;
    const morada = resumo.cliente?.morada || null;
    const localidade = resumo.cliente?.localidade || null;
    const ilha = resumo.cliente?.ilha || null;
    const navio = resumo.navio;
    const jangadaLabel = resumo.jangadaLabel;
    const serial = resumo.jangada?.serial || null;
    const issuer = resumo.issuer;
    const numeroFatura = resumo.numeroFatura;
    const dataTrabalho = resumo.dataTrabalho || order.dataConclusao || order.dataAbertura || order.createdAt || null;
    const tecnicoNome = resumo.tecnico || order.tecnico?.nome || null;

    const notaCreditoRegistada = fatura?.notaCredito ?? null;
    const numeroNotaCredito = notaCreditoRegistada.numeroNotaCredito;
    const dataEmissaoNC = notaCreditoRegistada.dataEmissao;
    const motivo = notaCreditoRegistada.motivo || "";

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Nota de Crédito");

    worksheet.columns = [
      { header: "", key: "a", width: 34 },
      { header: "", key: "b", width: 56 },
      { header: "", key: "c", width: 12 },
      { header: "", key: "d", width: 16 },
    ];

    worksheet.mergeCells("A1:D1");
    worksheet.getCell("A1").value = "NOTA DE CRÉDITO";
    worksheet.getCell("A1").font = { bold: true, size: 18, color: { argb: "FFFFFF" } };
    worksheet.getCell("A1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "B91C1C" },
    };
    worksheet.getRow(1).height = 30;
    worksheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };

    let rowIndex = 2;
    const issuerRows: Array<[string, string]> = [
      ["Fornecedor", issuer],
      ["Cliente", clienteNome],
    ];
    if (nif) issuerRows.push(["NIF Cliente", nif]);
    if (morada) issuerRows.push(["Morada", morada]);
    if (localidade || ilha) issuerRows.push(["Localidade / Ilha", `${localidade || ""} ${ilha || ""}`.trim()]);
    issuerRows.push(["Nota de Crédito Nº", numeroNotaCredito]);
    issuerRows.push(["Fatura de Referência Nº", numeroFatura]);
    issuerRows.push(["Data de emissão", formatDate(dataEmissaoNC)]);
    issuerRows.push(["Data de trabalho", formatDate(dataTrabalho)]);
    issuerRows.push(["Embarcação", navio]);
    issuerRows.push(["Jangada", jangadaLabel]);
    if (serial) issuerRows.push(["Nº Série Jangada", serial]);
    if (tecnicoNome) issuerRows.push(["Técnico responsável", tecnicoNome]);
    issuerRows.push(["Motivo", motivo]);

    issuerRows.forEach(([label, value]) => {
      worksheet.getCell(`A${rowIndex}`).value = label;
      worksheet.getCell(`A${rowIndex}`).font = { bold: true };
      worksheet.getCell(`B${rowIndex}`).value = value;
      rowIndex += 1;
    });

    rowIndex += 1;
    worksheet.getCell(`A${rowIndex}`).value = "Referência";
    worksheet.getCell(`B${rowIndex}`).value = "Descrição";
    worksheet.getCell(`C${rowIndex}`).value = "Qtd";
    worksheet.getCell(`D${rowIndex}`).value = "Valor";
    worksheet.getRow(rowIndex).font = { bold: true };
    worksheet.getRow(rowIndex).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FEE2E2" },
    };
    const headerRow = rowIndex;
    rowIndex += 1;

    const lineRows: Array<string[]> = [];
    for (const ot of ordens) {
      const otPecas = Number(ot.valorPecas || 0);
      const otMaoObra = Number(ot.valorMaoObra || 0);
      const otDesconto = Number(ot.valorDesconto || 0);
      const referencia = ot.numeroOrdem || `#${ot.id}`;
      lineRows.push([referencia, "Mão-de-obra (trabalhos executados)", "1", `-${formatEuro(otMaoObra)}`]);
      lineRows.push([referencia, "Peças / materiais", "1", `-${formatEuro(otPecas)}`]);
      if (otDesconto > 0) {
        lineRows.push([referencia, "Desconto (reposto)", "1", formatEuro(otDesconto)]);
      }
    }
    if (lineRows.length === 0) {
      lineRows.push([order.numeroOrdem || `#${order.id}`, "Serviços prestados", "1", `-${formatEuro(total)}`]);
    }

    lineRows.forEach((row) => {
      row.forEach((value, colIndex) => {
        worksheet.getCell(`${String.fromCharCode(65 + colIndex)}${rowIndex}`).value = value;
      });
      rowIndex += 1;
    });

    const totalRows: Array<{ label: string; value: string; bold?: boolean }> = [
      { label: "Subtotal", value: `-${formatEuro(subtotal)}` },
      { label: "IVA", value: resumo.isentoIva ? formatIsencaoIva(true, resumo.codigoIsencaoIva) : `-${formatEuro(iva)}` },
      { label: "TOTAL (crédito)", value: `-${formatEuro(total)}`, bold: true },
      ...(resumo.isentoIva
        ? [{ label: "Motivo isenção IVA", value: formatIsencaoIva(true, resumo.codigoIsencaoIva), bold: false }]
        : []),
    ];
    totalRows.forEach((entry) => {
      worksheet.getCell(`A${rowIndex}`).value = "";
      worksheet.getCell(`B${rowIndex}`).value = entry.label;
      worksheet.getCell(`D${rowIndex}`).value = entry.value;
      if (entry.bold) {
        worksheet.getCell(`B${rowIndex}`).font = { bold: true };
        worksheet.getCell(`D${rowIndex}`).font = { bold: true };
        worksheet.getCell(`B${rowIndex}`).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FEE2E2" },
        };
        worksheet.getCell(`D${rowIndex}`).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FEE2E2" },
        };
      }
      rowIndex += 1;
    });

    rowIndex += 1;
    worksheet.mergeCells(`A${rowIndex}:D${rowIndex}`);
    worksheet.getCell(`A${rowIndex}`).value =
      "Documento de compensação que anula, total ou parcialmente, a fatura de referência. Sem pagamento em duplicado.";
    worksheet.getCell(`A${rowIndex}`).font = { italic: true, color: { argb: "6B7280" } };
    worksheet.getCell(`A${rowIndex}`).alignment = { wrapText: true, vertical: "top" };
    worksheet.getRow(rowIndex).height = 28;

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === headerRow) return;
      if (rowNumber > 1) {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin", color: { argb: "E5E7EB" } },
            left: { style: "thin", color: { argb: "E5E7EB" } },
            bottom: { style: "thin", color: { argb: "E5E7EB" } },
            right: { style: "thin", color: { argb: "E5E7EB" } },
          };
        });
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename=nota-credito-${numeroNotaCredito}.xlsx`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error: unknown) {
    console.error("Erro ao gerar nota de crédito Excel:", error);
    const message = error instanceof Error ? error.message : "Erro ao gerar a nota de crédito.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
