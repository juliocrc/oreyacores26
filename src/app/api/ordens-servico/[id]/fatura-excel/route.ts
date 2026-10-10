import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";
import { getAccessContext } from "@/lib/access-control";
import { carregarFaturaPorOrdemServico, resumoFatura } from "@/lib/faturamento";
import { formatIsencaoIva } from "@/lib/iva-isencao-codes";
import { parseOrdemServicoMeta } from "@/lib/ordens-servico";

const ISSUER_NAME = "Orey Técnica - Serviços Navais";

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

    const clienteNome = resumo.clienteNome;
    const nif = resumo.cliente?.nif || null;
    const morada = resumo.cliente?.morada || null;
    const localidade = resumo.cliente?.localidade || null;
    const ilha = resumo.cliente?.ilha || null;
    const navio = resumo.navio;
    const jangadaLabel = resumo.jangadaLabel;
    const serial = resumo.jangada?.serial || null;
    const issuer = resumo.issuer;
    const emissao = resumo.emissao;
    const numeroFatura = resumo.numeroFatura;
    const dataTrabalho = resumo.dataTrabalho || order.dataConclusao || order.dataAbertura || order.createdAt || null;
    const tecnicoNome = resumo.tecnico || order.tecnico?.nome || null;
    const pagamentoStatus = resumo.pagamentoStatus;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Fatura");

    worksheet.columns = [
      { header: "", key: "a", width: 34 },
      { header: "", key: "b", width: 56 },
      { header: "", key: "c", width: 12 },
      { header: "", key: "d", width: 16 },
    ];

    worksheet.mergeCells("A1:D1");
    worksheet.getCell("A1").value = "FATURA";
    worksheet.getCell("A1").font = { bold: true, size: 18, color: { argb: "FFFFFF" } };
    worksheet.getCell("A1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "0F766E" },
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
    issuerRows.push(["Fatura Nº", numeroFatura]);
    issuerRows.push(["Data de emissão", formatDate(emissao)]);
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
    worksheet.getCell(`A${rowIndex}`).value = "Referência";
    worksheet.getCell(`B${rowIndex}`).value = "Descrição";
    worksheet.getCell(`C${rowIndex}`).value = "Qtd";
    worksheet.getCell(`D${rowIndex}`).value = "Valor";
    worksheet.getRow(rowIndex).font = { bold: true };
    worksheet.getRow(rowIndex).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "CCFBF1" },
    };
    const headerRow = rowIndex;
    rowIndex += 1;

    const lineRows: Array<string[]> = [];
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

    lineRows.forEach((row) => {
      row.forEach((value, colIndex) => {
        worksheet.getCell(`${String.fromCharCode(65 + colIndex)}${rowIndex}`).value = value;
      });
      rowIndex += 1;
    });

    const totalRows: Array<{ label: string; value: string; bold?: boolean }> = [
      { label: "Subtotal", value: formatEuro(subtotal) },
      { label: "IVA", value: resumo.isentoIva ? formatIsencaoIva(true, resumo.codigoIsencaoIva) : `16%  ${formatEuro(iva)}` },
      { label: "TOTAL", value: formatEuro(total), bold: true },
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
          fgColor: { argb: "CCFBF1" },
        };
        worksheet.getCell(`D${rowIndex}`).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "CCFBF1" },
        };
      }
      rowIndex += 1;
    });

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
        "Content-Disposition": `attachment; filename=fatura-${numeroFatura}.xlsx`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error: unknown) {
    console.error("Erro ao gerar fatura Excel:", error);
    const message = error instanceof Error ? error.message : "Erro ao gerar a fatura Excel.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
