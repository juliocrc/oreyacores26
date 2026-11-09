import { renderToStaticMarkup } from 'react-dom/server';
import {
  WorkOrderDetail,
  WorkOrdersList,
  workOrderInvoice,
  workOrderMoney,
} from './WorkOrdersWorkspace';

describe('work-order financial display', () => {
  it('does not invent zero amounts for missing or invalid values', () => {
    for (const value of [undefined, null, NaN, Infinity]) {
      expect(workOrderMoney(value)).toBe('Nao registado');
    }
  });

  it('preserves an explicitly recorded zero and formats recorded amounts', () => {
    const format = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
    expect(workOrderMoney(0)).toBe(format.format(0));
    expect(workOrderMoney(1234.56)).toBe(format.format(1234.56));
  });

  it('does not infer unbilled or unpaid from absent metadata', () => {
    expect(workOrderInvoice(undefined)).toBe('Sem dados de faturacao');
    expect(workOrderInvoice(null)).toBe('Sem dados de faturacao');
    expect(workOrderInvoice({})).toBe('Sem dados de faturacao');
  });

  it('shows the recorded invoice and payment status', () => {
    expect(
      workOrderInvoice({
        faturaNumero: 'FT 2026/10',
        faturaId: 7,
        pagamentoStatus: 'Pago Parcialmente',
      }),
    ).toBe('FT 2026/10 / Pago Parcialmente');
    expect(workOrderInvoice({ faturaId: 7 })).toBe('Fatura #7');
    expect(workOrderInvoice({ pagamentoStatus: 'Pago' })).toBe('Pago');
  });
});

describe('work-order entry points', () => {
  it('renders the internal list with accessible filters and the real creation route', () => {
    const html = renderToStaticMarkup(<WorkOrdersList />);
    expect(html).toContain('href="/criar-ot"');
    expect(html).toContain('for="order-search"');
    expect(html).toContain('for="order-status"');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('/portal/ordens-servico');
  });

  it('renders a read-only detail loading state with a return link', () => {
    const html = renderToStaticMarkup(<WorkOrderDetail id={42} />);
    expect(html).toContain('href="/ordens-servico"');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('<form');
  });
});
