import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";
import { getAccessContext } from "@/lib/access-control";
import { getCanonicalNavioLocationLabel } from "@/lib/navios-page-helpers";

function formatEuro(value: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(value || 0);
}

function formatDate(val: Date | null | undefined) {
  if (!val) return "";
  const d = new Date(val);
  return isNaN(d.getTime()) ? "" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { id: rawId } = await params;
    const clienteId = Number(rawId);
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return NextResponse.json({ error: "ID de cliente inválido." }, { status: 400 });
    }

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      include: {
        faturas: {
          orderBy: { dataEmissao: "desc" },
          include: {
            ordemServicos: {
              include: {
                ordemServico: {
                  select: {
                    id: true,
                    numeroOrdem: true,
                    valorTotal: true,
                    status: true,
                    jangada: { select: { serial: true, brand: true, model: true, shipNameManual: true } },
                  },
                },
              },
            },
            recibos: { orderBy: { dataEmissao: "asc" } },
            notaCredito: true,
          },
        },
        ordensServico: {
          where: { status: { notIn: ["concluida"] } },
          orderBy: { createdAt: "desc" },
          include: {
            jangada: { select: { serial: true, brand: true, model: true, shipNameManual: true } },
          },
        },
      },
    });

    if (!cliente) {
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Extrato Conta-Corrente");

    worksheet.columns = [
      { header: "", key: "a", width: 16 },
      { header: "", key: "b", width: 22 },
      { header: "", key: "c", width: 40 },
      { header: "", key: "d", width: 18 },
      { header: "", key: "e", width: 16 },
    ];

    worksheet.mergeCells("A1:E1");
    worksheet.getCell("A1").value = `EXTRATO DE CONTA-CORRENTE — ${cliente.nome.toUpperCase()}`;
    worksheet.getCell("A1").font = { bold: true, size: 14, color: { argb: "FFFFFF" } };
    worksheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "0F766E" } };
    worksheet.getRow(1).height = 28;
    worksheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };

    worksheet.addRow([]);
    worksheet.addRow(["NIF:", cliente.nif || "—", "", "Código Cliente:", cliente.numeroCliente || "—"]);
    worksheet.addRow(["Morada:", cliente.morada || "—", "", "Ilha:", (getCanonicalNavioLocationLabel(cliente.ilha) || cliente.ilha) || "—"]);
    worksheet.addRow([]);

    const headerRow = worksheet.addRow(["Data", "Documento", "Embarcação / Descrição", "Estado", "Valor (€)"]);
    headerRow.font = { bold: true, color: { argb: "FFFFFF" } };
    headerRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "334155" } };
    });

    let totalFaturado = 0;
    let totalEmDivida = 0;

    cliente.faturas.forEach((fatura) => {
      const valor = Number(fatura.valorTotal || 0);
      const descricao =
        fatura.ordemServicos.length > 0
          ? fatura.ordemServicos
              .map((l) => {
                const os = l.ordemServico;
                const navio = os.jangada?.shipNameManual || "Sem navio";
                return `${os.numeroOrdem || os.id} · ${navio}`;
              })
              .join(" | ")
          : "Fatura";

      worksheet.addRow([
        formatDate(fatura.dataEmissao),
        fatura.numeroFatura,
        descricao,
        fatura.cancelada ? "Anulada" : fatura.pagamentoStatus,
        formatEuro(valor),
      ]);

      if (!fatura.cancelada) {
        totalFaturado += valor;
        const pago = (fatura.recibos || []).reduce((acc, r) => acc + Number(r.valorPago || 0), 0);
        totalEmDivida += Math.max(0, valor - pago);
      }

      fatura.recibos.forEach((recibo) => {
        worksheet.addRow([
          formatDate(recibo.dataEmissao),
          recibo.numeroRecibo,
          `Recebimento da fatura ${fatura.numeroFatura}`,
          "Pago",
          formatEuro(Number(recibo.valorPago || 0)),
        ]);
      });

      if (fatura.notaCredito) {
        worksheet.addRow([
          formatDate(fatura.notaCredito.dataEmissao),
          fatura.notaCredito.numeroNotaCredito,
          `Anulação da fatura ${fatura.numeroFatura}${fatura.notaCredito.motivo ? ` · ${fatura.notaCredito.motivo}` : ""}`,
          "Anulada",
          formatEuro(-Number(fatura.notaCredito.valorTotal || 0)),
        ]);
      }
    });

    if (cliente.ordensServico.length > 0) {
      worksheet.addRow([]);
      const notaRow = worksheet.addRow(["Ordens de serviço ainda não faturadas"]);
      notaRow.font = { bold: true };
      notaRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FEF3C7" } };
      });
      cliente.ordensServico.forEach((os) => {
        worksheet.addRow([
          formatDate(os.dataAbertura || os.createdAt),
          `OT #${os.numeroOrdem || os.id}`,
          `${os.jangada?.brand || ""} ${os.jangada?.model || ""} (${os.jangada?.shipNameManual || "Sem navio"})`,
          os.status,
          formatEuro(Number(os.valorTotal || 0)),
        ]);
      });
    }

    worksheet.addRow([]);
    worksheet.addRow(["", "", "", "Total Faturado:", formatEuro(totalFaturado)]);
    worksheet.addRow(["", "", "", "Total em Dívida:", formatEuro(totalEmDivida)]);

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `Extrato_Cliente_${cliente.numeroCliente || clienteId}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[GET /api/clientes/[id]/extrato-excel]", error);
    return NextResponse.json({ error: "Erro ao gerar extrato Excel." }, { status: 500 });
  }
}
