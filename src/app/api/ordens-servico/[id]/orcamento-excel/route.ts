import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";
import { getAccessContext } from "@/lib/access-control";
import { getIvaRate } from "@/lib/iva";
import { formatIsencaoIva } from "@/lib/iva-isencao-codes";
import { parseOrdemServicoMeta } from "@/lib/ordens-servico";

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

    const pecas = Number(order.valorPecas || 0);
    const maoObra = Number(order.valorMaoObra || 0);
    const desconto = Number(order.valorDesconto || 0);
    const isentoIva = Boolean(order.isIsentoIva);
    const subtotal = pecas + maoObra - desconto;
    const iva = isentoIva ? 0 : subtotal * getIvaRate();
    const total = subtotal + iva;

    const jangada = order.jangada || null;
    const cliente = order.cliente || null;
    const clienteNome = cliente?.nome || jangada?.owner || "—";
    const navio = jangada?.shipNameManual || "—";

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Orçamento");

    worksheet.columns = [
      { header: "", key: "a", width: 34 },
      { header: "", key: "b", width: 60 },
      { header: "", key: "c", width: 16 },
      { header: "", key: "d", width: 16 },
    ];

    worksheet.mergeCells("A1:D1");
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
    worksheet.mergeCells(`A${rowIndex}:D${rowIndex}`);
    worksheet.getCell(`A${rowIndex}`).value = "Detalhe de custos";
    worksheet.getCell(`A${rowIndex}`).font = { bold: true };
    worksheet.getCell(`A${rowIndex}`).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "EEF2FF" },
    };
    rowIndex += 1;

    const metaLinhas = parseOrdemServicoMeta(order.metadados).linhas;
    const linhas = Array.isArray(metaLinhas) ? metaLinhas : [];

    if (linhas.length > 0) {
      worksheet.getCell(`A${rowIndex}`).value = "Ref.";
      worksheet.getCell(`B${rowIndex}`).value = "Descrição";
      worksheet.getCell(`C${rowIndex}`).value = "Qtd";
      worksheet.getCell(`D${rowIndex}`).value = "Valor";
      ["A", "B", "C", "D"].forEach((col) => {
        worksheet.getCell(`${col}${rowIndex}`).font = { bold: true };
      });
      rowIndex += 1;

      for (const linha of linhas) {
        worksheet.getCell(`A${rowIndex}`).value = linha.referencia || "—";
        worksheet.getCell(`B${rowIndex}`).value = linha.descricao || "";
        worksheet.getCell(`C${rowIndex}`).value = linha.quantidade ?? 1;
        worksheet.getCell(`D${rowIndex}`).value = formatEuro((linha.quantidade ?? 1) * (linha.unitPrice ?? 0));
        rowIndex += 1;
      }
    }

    const moneyRows: Array<{ label: string; note: string; value: number; bold?: boolean }> = [
      { label: "Inspeção de Jangada", note: "", value: maoObra },
      { label: "Peças / Materiais", note: "", value: pecas },
      { label: "Desconto", note: "", value: -desconto },
      { label: "Subtotal", note: "", value: subtotal },
      { label: "IVA (16%)", note: isentoIva ? formatIsencaoIva(true, order.codigoIsencaoIva) : "16%", value: iva },
      { label: "TOTAL", note: "", value: total, bold: true },
    ];

    moneyRows.forEach((entry) => {
      worksheet.getCell(`A${rowIndex}`).value = entry.label;
      worksheet.getCell(`B${rowIndex}`).value = entry.note;
      worksheet.getCell(`C${rowIndex}`).value = formatEuro(entry.value);
      worksheet.getCell(`A${rowIndex}`).font = { bold: Boolean(entry.bold) };
      worksheet.getCell(`C${rowIndex}`).font = { bold: Boolean(entry.bold) };
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