import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { carregarFaturaPorOrdemServico, resumoFatura } from "@/lib/faturamento";
import { formatIsencaoIva } from "@/lib/iva-isencao-codes";
import { parseOrdemServicoMeta } from "@/lib/ordens-servico";
import { invoiceMetadata } from "@/lib/invoice-official";
import { getIvaRate } from "@/lib/iva";
import { roundQuoteMoney } from "@/lib/ordem-quote-input";
import { billingRecipient } from "@/lib/billing-recipient";
import { buildBillingDocumentPdf, type BillingDocumentLine } from "@/lib/billing-document-pdf";

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "N\u00e3o registada";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N\u00e3o registada";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sess\u00e3o obrigat\u00f3ria." }, { status: 401 });
    if (!access.isAdmin) return NextResponse.json({ error: "Acesso reservado a administradores." }, { status: 403 });
    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "ID inv\u00e1lido." }, { status: 400 });
    const order = await prisma.ordemServico.findUnique({
      where: { id },
      include: {
        jangada: { select: { serial: true, brand: true, model: true, owner: true, shipNameManual: true } },
        cliente: { select: { nome: true, numeroCliente: true, nif: true, morada: true, localidade: true, ilha: true, modoPagamento: true } },
        serviceStation: { select: { codigo: true, nome: true } },
        tecnico: { select: { nome: true } },
      },
    });
    if (!order) return NextResponse.json({ error: "Ordem de servi\u00e7o n\u00e3o encontrada." }, { status: 404 });
    // Download is read-only: never issue an invoice or allocate its number here.
    const link = await carregarFaturaPorOrdemServico(id);
    const fatura = link?.fatura ?? null;
    if (fatura && invoiceMetadata(fatura.metadados).pdfOficial) {
      return NextResponse.redirect(new URL(`/api/faturas/${fatura.id}/oficial`, req.url), {
        status: 307, headers: { "Cache-Control": "private, no-store" },
      });
    }
    if (!fatura && order.orcamentoStatus !== "Aprovado") return NextResponse.json({ error: "Aprove o orcamento antes de gerar a pro-forma." }, { status: 400 });
    if (fatura?.cancelada) return NextResponse.json({ error: "A fatura associada esta cancelada." }, { status: 400 });
    const recorded = resumoFatura(link ?? null);
    const meta = parseOrdemServicoMeta(order.metadados);
    const recipient = fatura ? billingRecipient(recorded.cliente) : billingRecipient(order.cliente,
      (meta as { destinatarioFaturacao?: unknown }).destinatarioFaturacao);
    const ordens = fatura ? recorded.ordens : [order];
    const subtotal = fatura ? recorded.subtotal : roundQuoteMoney(Math.max(0, Number(order.valorPecas || 0) + Number(order.valorMaoObra || 0) - Number(order.valorDesconto || 0)));
    const exempt = fatura ? recorded.isentoIva : order.isIsentoIva;
    const vat = fatura ? recorded.iva : exempt ? 0 : roundQuoteMoney(subtotal * getIvaRate());
    const total = fatura ? recorded.total : roundQuoteMoney(subtotal + vat);
    // Historical amounts are authoritative. Do not apply today's VAT rate to them.
    const rate = fatura ? (subtotal ? roundQuoteMoney(vat / subtotal * 100) : null) : roundQuoteMoney(getIvaRate() * 100);
    const tax = exempt ? "Isento" : rate == null ? "-" : `${rate}%`;
    const lines: BillingDocumentLine[] = [];
    const details: Array<[string, string]> = fatura
      ? recorded.numerosObra.map(reference => ['Obra / OS', reference])
      : [];
    let discount = 0;
    for (const ot of ordens) {
      const data = parseOrdemServicoMeta(ot.metadados);
      if (!fatura) details.push(["Obra / OS", ot.numeroOrdem]);
      details.push(["Embarca\u00e7\u00e3o", data.shipName || ot.jangada?.shipNameManual || "N\u00e3o registada"]);
      details.push(["Equipamento", data.equipamentoLabel || [ot.jangada?.brand, ot.jangada?.model].filter(Boolean).join(" ") || "N\u00e3o registado"]);
      details.push(["N\u00famero de s\u00e9rie", data.equipamentoSerial || ot.jangada?.serial || "N\u00e3o registado"]);
      const storedLines = data.linhas || [];
      for (const line of storedLines) {
        const quantity = line.quantidade ?? null;
        const unitPrice = line.unitPrice ?? null;
        const gross = (quantity ?? 0) * (unitPrice ?? 0);
        const lineDiscount = roundQuoteMoney(gross * (line.descontoPercentual ?? 0) / 100);
        lines.push({ reference: line.referencia || "", description: line.descricao || "Nao registado", quantity, unitPrice,
          discount: line.descontoPercentual ? lineDiscount : null, tax,
          total: Number(line.total ?? roundQuoteMoney(gross - lineDiscount)) });
      }
      if (!storedLines.length && Number(ot.valorPecas) > 0) lines.push({ reference: ot.numeroOrdem, description: "Servicos e materiais registados", quantity: null, unitPrice: null, discount: null, tax, total: Number(ot.valorPecas) });
      if (Number(ot.valorMaoObra) > 0) lines.push({ reference: ot.numeroOrdem, description: "Mao de obra", quantity: null, unitPrice: null, discount: null, tax, total: Number(ot.valorMaoObra) });
      discount = roundQuoteMoney(discount + Number(ot.valorDesconto || 0));
    }
    // Article discounts are already included in line totals; apply the global discount only once.
    const primary = fatura ? recorded.primary : order;
    details.push(["Data de trabalho", formatDate(primary?.dataConclusao || primary?.dataAbertura || primary?.createdAt)]);
    const payment = fatura ? recorded.cliente?.modoPagamento : order.cliente?.modoPagamento;
    if (payment) details.push(["Pagamento", payment]);
    const number = fatura ? recorded.numeroFatura : order.numeroOrdem;
    const emission = fatura ? recorded.emissao : new Date();
    const bytes = await buildBillingDocumentPdf({ invoice: false, number, date: formatDate(emission), recipient,
      details, lines, subtotal, discount, vat, total,
      exemption: exempt ? formatIsencaoIva(true, fatura ? recorded.codigoIsencaoIva : order.codigoIsencaoIva) : undefined });
    const copy = new Uint8Array(bytes);
    const fileName = `documento-interno-proforma-${number.replace(/[/\\?%*:|"<>]/g, "_")}.pdf`;
    return new NextResponse(new Blob([copy], { type: "application/pdf" }), { status: 200, headers: {
      "Content-Disposition": `attachment; filename=${fileName}`, "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error: unknown) {
    console.error("Erro ao gerar fatura PDF:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao gerar a fatura PDF." }, { status: 500 });
  }
}
