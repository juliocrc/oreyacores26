export type InvoiceBalance = {
  id: number;
  valorPago: number;
  valorPendente: number;
  cancelada?: boolean;
  pagamentoHistoricoSemRecibo?: boolean;
};

export function summarizeInvoiceBalances<T extends InvoiceBalance>(invoices: T[]) {
  const active = [...new Map(invoices.map(invoice => [invoice.id, invoice])).values()]
    .filter(invoice => !invoice.cancelada);
  return {
    active,
    outstanding: active.filter(invoice => invoice.valorPendente > 0),
    reconciliation: active.filter(invoice => invoice.pagamentoHistoricoSemRecibo),
    totalOutstanding: active.reduce((sum, invoice) => sum + Math.round(invoice.valorPendente * 100), 0) / 100,
  };
}
