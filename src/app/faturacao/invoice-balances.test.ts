import { summarizeInvoiceBalances } from "./invoice-balances";

describe("summarizeInvoiceBalances", () => {
  it("sums remaining balances, not invoice face values or order totals", () => {
    const result = summarizeInvoiceBalances([
      { id: 1, valorTotal: 100, valorPago: 40, valorPendente: 60 },
      { id: 2, valorTotal: 200, valorPago: 200, valorPendente: 0 },
      { id: 3, valorTotal: 50, valorPago: 0, valorPendente: 50 },
    ]);
    expect(result.totalOutstanding).toBe(110);
    expect(result.outstanding.map(invoice => invoice.id)).toEqual([1, 3]);
  });

  it("counts grouped invoices once and excludes cancelled invoices", () => {
    const invoice = { id: 1, valorPago: 20, valorPendente: 80 };
    const result = summarizeInvoiceBalances([invoice, invoice,
      { id: 2, valorPago: 0, valorPendente: 999, cancelada: true },
    ]);
    expect(result.totalOutstanding).toBe(80);
    expect(result.active).toEqual([invoice]);
  });

  it("keeps historical paid invoices in reconciliation without inventing receipts or debt", () => {
    const invoice = { id: 1, pagamentoStatus: "Pago", valorPago: 0, valorPendente: 0, pagamentoHistoricoSemRecibo: true };
    const result = summarizeInvoiceBalances([invoice]);
    expect(result.totalOutstanding).toBe(0);
    expect(result.reconciliation).toEqual([invoice]);
    expect(result.outstanding).toEqual([]);
  });

  it("adds amounts in cents without floating point residue", () => {
    expect(summarizeInvoiceBalances([
      { id: 1, valorPago: 0, valorPendente: 0.1 },
      { id: 2, valorPago: 0, valorPendente: 0.2 },
    ]).totalOutstanding).toBe(0.3);
  });
});
