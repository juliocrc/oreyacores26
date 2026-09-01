import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";
import { getAccessContext } from "@/lib/access-control";
import { getLembreteCobrancaConfig } from "@/lib/lembretes-cobranca";
import { getCanonicalNavioLocationLabel } from "@/lib/navios-page-helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

function formatEuro(value: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(value || 0);
}

function formatDate(val: Date | null | undefined) {
  if (!val) return "";
  const d = new Date(val);
  return isNaN(d.getTime())
    ? ""
    : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysDiff(a: Date, b: Date) {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS);
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFF" } };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "334155" } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
}

function styleTitleRow(worksheet: ExcelJS.Worksheet, range: string, title: string, color = "0F766E") {
  worksheet.mergeCells(range);
  const cell = worksheet.getCell(range.split(":")[0]);
  cell.value = title;
  cell.font = { bold: true, size: 14, color: { argb: "FFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  worksheet.getRow(Number(cell.row)).height = 28;
}

export async function GET(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const url = new URL(req.url);
    const incluirTodas = url.searchParams.get("todas") === "1";
    const incluirCanceladas = url.searchParams.get("incluirCanceladas") === "1";
    const ilhaFiltroRaw = url.searchParams.get("ilha")?.trim() || null;
    const ilhaFiltro = ilhaFiltroRaw ? (getCanonicalNavioLocationLabel(ilhaFiltroRaw) || ilhaFiltroRaw) : null;

    const config = await getLembreteCobrancaConfig();
    const diasVencimento = config.diasVencimento || 30;

    const faturas = await prisma.fatura.findMany({
      orderBy: [{ dataEmissao: "desc" }, { id: "desc" }],
      include: {
        cliente: { select: { id: true, nome: true, numeroCliente: true, nif: true, ilha: true } },
        ordemServicos: {
          include: {
            ordemServico: {
              select: {
                id: true,
                numeroOrdem: true,
                jangada: { select: { brand: true, model: true, shipNameManual: true } },
              },
            },
          },
        },
        notaCredito: true,
        recibos: { orderBy: { dataEmissao: "asc" } },
      },
    });

    const hoje = new Date();

    const linhas = faturas
      .filter((f) => (incluirCanceladas ? true : !f.cancelada))
      .filter((f) => {
        if (!ilhaFiltro) return true;
        const clienteIlha = f.cliente?.ilha ? (getCanonicalNavioLocationLabel(f.cliente?.ilha) || f.cliente?.ilha) : "";
        return clienteIlha === ilhaFiltro;
      })
      .map((f) => {
        const valorTotal = Number(f.valorTotal || 0);
        const valorPago = (f.recibos || []).reduce((acc, r) => acc + Number(r.valorPago || 0), 0);
        const emDivida = Math.max(0, valorTotal - valorPago);
        const dataEmissao = f.dataEmissao || f.createdAt;
        const dataVencimento = dataEmissao ? addDays(new Date(dataEmissao), diasVencimento) : null;
        const diasAtraso = !f.cancelada && dataVencimento ? Math.max(0, daysDiff(hoje, dataVencimento)) : 0;
        const numeroOrdens = (f.ordemServicos || []).map((l) => l.ordemServico.numeroOrdem || `#${l.ordemServico.id}`);
        const navios = (f.ordemServicos || [])
          .map((l) => l.ordemServico.jangada?.shipNameManual || null)
          .filter(Boolean);
        return {
          id: f.id,
          numeroFatura: f.numeroFatura,
          dataEmissao: dataEmissao ? new Date(dataEmissao) : null,
          dataVencimento,
          diasAtraso,
          clienteNome: f.cliente?.nome || "Cliente particular",
          numeroCliente: f.cliente?.numeroCliente || "",
          nif: f.cliente?.nif || "",
          ilha: (f.cliente?.ilha ? (getCanonicalNavioLocationLabel(f.cliente?.ilha) || f.cliente?.ilha) : "") || "",
          navio: (navios as string[]).join(", ") || "—",
          numeroOrdens: numeroOrdens.join(", ") || "—",
          cancelada: f.cancelada,
          pagamentoStatus: f.cancelada ? "Anulada" : f.pagamentoStatus,
          valorTotal,
          valorPago,
          emDivida,
        };
      })
      .sort((a, b) => b.diasAtraso - a.diasAtraso || b.emDivida - a.emDivida);

    const ativas = linhas.filter((l) => !l.cancelada);
    const aReceber = incluirTodas ? ativas : ativas.filter((l) => l.emDivida > 0);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Orey Técnica Açores";
    workbook.created = new Date();

    const wsReceber = workbook.addWorksheet("Contas a Receber");
    wsReceber.columns = [
      { header: "Nº Fatura", key: "numeroFatura", width: 18 },
      { header: "Data Emissão", key: "dataEmissao", width: 13 },
      { header: "Vencimento", key: "dataVencimento", width: 13 },
      { header: "Dias Vencido", key: "diasAtraso", width: 12 },
      { header: "Cliente", key: "clienteNome", width: 28 },
      { header: "Nº Cliente", key: "numeroCliente", width: 12 },
      { header: "NIF", key: "nif", width: 13 },
      { header: "Ilha", key: "ilha", width: 14 },
      { header: "Embarcação", key: "navio", width: 22 },
      { header: "Ordens", key: "numeroOrdens", width: 18 },
      { header: "Estado", key: "pagamentoStatus", width: 17 },
      { header: "Valor Total (€)", key: "valorTotal", width: 15 },
      { header: "Valor Pago (€)", key: "valorPago", width: 14 },
      { header: "Em Dívida (€)", key: "emDivida", width: 15 },
    ];
    styleTitleRow(wsReceber, "A1:N1", "CONTAS A RECEBER — CONSOLIDADO");
    wsReceber.addRow([]);
    wsReceber.addRow([
      "Gerado em:",
      formatDate(hoje),
      "",
      "",
      incluirTodas ? "Todas as faturas (pagas e em dívida)" : "Apenas faturas em dívida",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    wsReceber.addRow([]);
    styleHeaderRow(wsReceber.addRow(wsReceber.columns.map((c) => c.header as string)));
    wsReceber.views = [{ state: "frozen", ySplit: 4 }];

    let totalFaturadoReceber = 0;
    let totalPagoReceber = 0;
    let totalDividaReceber = 0;
    aReceber.forEach((l) => {
      wsReceber.addRow({
        numeroFatura: l.numeroFatura,
        dataEmissao: formatDate(l.dataEmissao),
        dataVencimento: formatDate(l.dataVencimento),
        diasAtraso: l.diasAtraso > 0 ? l.diasAtraso : "",
        clienteNome: l.clienteNome,
        numeroCliente: l.numeroCliente,
        nif: l.nif,
        ilha: l.ilha,
        navio: l.navio,
        numeroOrdens: l.numeroOrdens,
        pagamentoStatus: l.pagamentoStatus,
        valorTotal: formatEuro(l.valorTotal),
        valorPago: formatEuro(l.valorPago),
        emDivida: formatEuro(l.emDivida),
      });
      totalFaturadoReceber += l.valorTotal;
      totalPagoReceber += l.valorPago;
      totalDividaReceber += l.emDivida;
    });
    const totalRowReceber = wsReceber.addRow([
      "", "", "", "", "", "", "", "", "", "",
      "TOTAL",
      formatEuro(totalFaturadoReceber),
      formatEuro(totalPagoReceber),
      formatEuro(totalDividaReceber),
    ]);
    totalRowReceber.font = { bold: true };
    totalRowReceber.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F0FDFA" } };
    });

    const porClienteMap = new Map<string, { nome: string; numeroCliente: string; ilha: string; nFaturas: number; total: number; pago: number; divida: number }>();
    ativas.forEach((l) => {
      const key = l.clienteNome || "Cliente particular";
      const cur = porClienteMap.get(key) || { nome: key, numeroCliente: l.numeroCliente, ilha: l.ilha, nFaturas: 0, total: 0, pago: 0, divida: 0 };
      cur.nFaturas += 1;
      cur.total += l.valorTotal;
      cur.pago += l.valorPago;
      cur.divida += l.emDivida;
      porClienteMap.set(key, cur);
    });
    const porCliente = Array.from(porClienteMap.values()).sort((a, b) => b.divida - a.divida);

    const wsCliente = workbook.addWorksheet("Faturas por Cliente");
    wsCliente.columns = [
      { header: "Cliente", key: "nome", width: 32 },
      { header: "Nº Cliente", key: "numeroCliente", width: 12 },
      { header: "Ilha", key: "ilha", width: 14 },
      { header: "Nº Faturas", key: "nFaturas", width: 11 },
      { header: "Total Faturado (€)", key: "total", width: 18 },
      { header: "Total Pago (€)", key: "pago", width: 16 },
      { header: "Em Dívida (€)", key: "divida", width: 16 },
    ];
    styleTitleRow(wsCliente, "A1:G1", "FATURAS POR CLIENTE", "1D4ED8");
    wsCliente.addRow([]);
    styleHeaderRow(wsCliente.addRow(wsCliente.columns.map((c) => c.header as string)));
    wsCliente.views = [{ state: "frozen", ySplit: 3 }];

    let cTotalFaturas = 0;
    let cTotalFaturado = 0;
    let cTotalPago = 0;
    let cTotalDivida = 0;
    porCliente.forEach((c) => {
      wsCliente.addRow({
        nome: c.nome,
        numeroCliente: c.numeroCliente,
        ilha: c.ilha,
        nFaturas: c.nFaturas,
        total: formatEuro(c.total),
        pago: formatEuro(c.pago),
        divida: formatEuro(c.divida),
      });
      cTotalFaturas += c.nFaturas;
      cTotalFaturado += c.total;
      cTotalPago += c.pago;
      cTotalDivida += c.divida;
    });
    const totalRowCliente = wsCliente.addRow(["", "", "", cTotalFaturas, formatEuro(cTotalFaturado), formatEuro(cTotalPago), formatEuro(cTotalDivida)]);
    totalRowCliente.font = { bold: true };
    totalRowCliente.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "EFF6FF" } };
    });

    const porIlhaMap = new Map<string, { ilha: string; nFaturas: number; total: number; pago: number; divida: number }>();
    ativas.forEach((l) => {
      const key = l.ilha || "Sem ilha";
      const cur = porIlhaMap.get(key) || { ilha: key, nFaturas: 0, total: 0, pago: 0, divida: 0 };
      cur.nFaturas += 1;
      cur.total += l.valorTotal;
      cur.pago += l.valorPago;
      cur.divida += l.emDivida;
      porIlhaMap.set(key, cur);
    });
    const porIlha = Array.from(porIlhaMap.values()).sort((a, b) => b.divida - a.divida);

    const wsIlha = workbook.addWorksheet("Faturas por Ilha");
    wsIlha.columns = [
      { header: "Ilha", key: "ilha", width: 18 },
      { header: "Nº Faturas", key: "nFaturas", width: 11 },
      { header: "Total Faturado (€)", key: "total", width: 18 },
      { header: "Total Pago (€)", key: "pago", width: 16 },
      { header: "Em Dívida (€)", key: "divida", width: 16 },
    ];
    styleTitleRow(wsIlha, "A1:E1", "FATURAS POR ILHA", "7C3AED");
    wsIlha.addRow([]);
    styleHeaderRow(wsIlha.addRow(wsIlha.columns.map((c) => c.header as string)));
    wsIlha.views = [{ state: "frozen", ySplit: 3 }];

    let iTotalFaturas = 0;
    let iTotalFaturado = 0;
    let iTotalPago = 0;
    let iTotalDivida = 0;
    porIlha.forEach((c) => {
      wsIlha.addRow({
        ilha: c.ilha,
        nFaturas: c.nFaturas,
        total: formatEuro(c.total),
        pago: formatEuro(c.pago),
        divida: formatEuro(c.divida),
      });
      iTotalFaturas += c.nFaturas;
      iTotalFaturado += c.total;
      iTotalPago += c.pago;
      iTotalDivida += c.divida;
    });
    const totalRowIlha = wsIlha.addRow(["", iTotalFaturas, formatEuro(iTotalFaturado), formatEuro(iTotalPago), formatEuro(iTotalDivida)]);
    totalRowIlha.font = { bold: true };
    totalRowIlha.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F5F3FF" } };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const stamp = `${hoje.getFullYear()}${String(hoje.getMonth() + 1).padStart(2, "0")}${String(hoje.getDate()).padStart(2, "0")}`;
    const filename = `Contas_a_Receber_${stamp}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[GET /api/relatorios/contas-a-receber]", error);
    return NextResponse.json({ error: "Erro ao gerar o relatório Excel." }, { status: 500 });
  }
}
