import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";
import { getAccessContext } from "@/lib/access-control";
import { carregarFaturaPorOrdemServico, resumoFatura } from "@/lib/faturamento";

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
        { error: "O recibo só pode ser gerado para ordens de serviço concluídas." },
        { status: 400 },
      );
    }

    const link = await carregarFaturaPorOrdemServico(id);
    const fatura = link?.fatura ?? null;
    if (!fatura?.recibos?.length) return NextResponse.json({ error: "Nao existe recibo registado para esta ordem." }, { status: 404 });
    if (fatura.cancelada) return NextResponse.json({ error: "A fatura associada esta cancelada." }, { status: 400 });
    const resumo = resumoFatura(link ?? null);
    const ordens = (fatura ? resumo.ordens : [order]) as Array<typeof order>;

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
    const pagamentoStatus = resumo.pagamentoStatus;
    const foiPago = pagamentoStatus === "Pago" || pagamentoStatus === "Pago Parcialmente";

    const reciboRegistado = fatura?.recibos?.[0] ?? null;
    const numeroRecibo = reciboRegistado.numeroRecibo;
    const valorRecibo = Number(reciboRegistado.valorPago);
    const dataRecibo = reciboRegistado.dataEmissao;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Recibo");

    worksheet.columns = [
      { header: "", key: "a", width: 34 },
      { header: "", key: "b", width: 56 },
      { header: "", key: "c", width: 12 },
      { header: "", key: "d", width: 16 },
    ];

    worksheet.mergeCells("A1:D1");
    worksheet.getCell("A1").value = "RECIBO";
    worksheet.getCell("A1").font = { bold: true, size: 18, color: { argb: "FFFFFF" } };
    worksheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "0F766E" } };
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
    issuerRows.push(["Recibo Nº", numeroRecibo]);
    issuerRows.push(["Data de emissão", formatDate(dataRecibo)]);
    issuerRows.push(["Fatura / Ordem", numeroFatura]);
    issuerRows.push(["Data de trabalho", formatDate(dataTrabalho)]);
    issuerRows.push(["Embarcação", navio]);
    issuerRows.push(["Jangada", jangadaLabel]);
    if (serial) issuerRows.push(["Nº Série Jangada", serial]);
    if (tecnicoNome) issuerRows.push(["Técnico responsável", tecnicoNome]);
    issuerRows.push(["Estado de Pagamento", pagamentoStatus]);

    issuerRows.forEach(([label, value]) => {
      worksheet.getCell(`A${rowIndex}`).value = label;
      worksheet.getCell(`A${rowIndex}`).font = { bold: true };
      worksheet.getCell(`B${rowIndex}`).value = value;
      rowIndex += 1;
    });

    rowIndex += 1;
    const descricaoServicos = ordens
      .map((ot) => `${ot.numeroOrdem || `#${ot.id}`} — ${ot.jangada ? `${ot.jangada.brand || ""} ${ot.jangada.model || ""}`.trim() || "jangada" : "serviço"} (MDO ${formatEuro(Number(ot.valorMaoObra || 0))}; MAT ${formatEuro(Number(ot.valorPecas || 0))})`)
      .join(" | ") || "Serviços prestados";

    const reciboRows: Array<[string, string]> = [
      ["Montante recebido (em numerário, cheque ou transferência)", formatEuro(valorRecibo)],
      ["Respeitante à fatura", `Fatura Nº ${numeroFatura} de ${formatDate(dataRecibo)}`],
      ["Descrição dos serviços", descricaoServicos],
    ];
    reciboRows.forEach(([label, value]) => {
      worksheet.getCell(`A${rowIndex}`).value = label;
      worksheet.getCell(`A${rowIndex}`).font = { bold: true };
      worksheet.getCell(`B${rowIndex}`).value = value;
      rowIndex += 1;
    });

    rowIndex += 1;
    worksheet.mergeCells(`A${rowIndex}:C${rowIndex}`);
    worksheet.getCell(`A${rowIndex}`).value = "TOTAL RECEBIDO";
    worksheet.getCell(`A${rowIndex}`).font = { bold: true, size: 13 };
    worksheet.getCell(`D${rowIndex}`).value = formatEuro(valorRecibo);
    worksheet.getCell(`D${rowIndex}`).font = { bold: true, size: 13 };
    worksheet.getCell(`A${rowIndex}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "CCFBF1" } };
    worksheet.getCell(`D${rowIndex}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "CCFBF1" } };
    rowIndex += 1;

    if (!foiPago) {
      rowIndex += 1;
      worksheet.mergeCells(`A${rowIndex}:D${rowIndex}`);
      worksheet.getCell(`A${rowIndex}`).value = `NOTA: Este recibo documenta o montante da fatura ${numeroFatura}. O pagamento encontra-se "${pagamentoStatus}". O recibo definitivo será emitido após liquidação.`;
      worksheet.getCell(`A${rowIndex}`).font = { italic: true, color: { argb: "B45309" } };
    }

    rowIndex += 2;
    worksheet.mergeCells(`A${rowIndex}:B${rowIndex}`);
    worksheet.getCell(`A${rowIndex}`).value = "O Recibos (Orey Técnica)";
    rowIndex += 1;
    worksheet.getCell(`A${rowIndex}`).value = "____________________________________";
    rowIndex += 2;
    worksheet.mergeCells(`C${rowIndex}:D${rowIndex}`);
    worksheet.getCell(`C${rowIndex}`).value = "O Cliente";
    rowIndex += 1;
    worksheet.getCell(`C${rowIndex}`).value = "____________________________________";

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
        "Content-Disposition": `attachment; filename=recibo-${numeroRecibo}.xlsx`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error: unknown) {
    console.error("Erro ao gerar recibo Excel:", error);
    const message = error instanceof Error ? error.message : "Erro ao gerar o recibo Excel.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
