import { isServiceResourceReference, normalizeStockReferenceByRule } from '@/lib/stock-reference-rules';
import { stockItemSupportsValidity } from '@/lib/stock-validity';
import { formatStockOptionLabel, getReplacementStockItems, getStockSelectionError } from '@/lib/stock-picker';
import { resolveLotStock } from '@/lib/ordens-servico';

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));

describe('service resources without stock', () => {
  it.each(['L-DSB', 'L-CIL', 'L-CER', 'ES012741', 'ES000001', ' es012741 ', 'l-dsb'])('recognizes %s without product-name remapping', async referencia => {
    expect(isServiceResourceReference(referencia)).toBe(true);
    expect(normalizeStockReferenceByRule(referencia, 'Cilindro bateria com validade')).toBe(referencia.trim());
    expect(stockItemSupportsValidity({ referencia, descricao: 'Bateria com validade' })).toBe(false);
    const item = { id: 1, referencia, quantidade: 0, validade: null };
    expect(getStockSelectionError(item, { showValidade: true, nextInspection: '2027-03-03' })).toBeNull();
    expect(formatStockOptionLabel(item)).toContain('Recurso');
    expect(formatStockOptionLabel(item)).not.toContain('Sem Stock');
    expect(getReplacementStockItems([{ ...item, quantidade: 10 }])).toEqual([]);
    const db = { stock: { findMany: jest.fn(), findUnique: jest.fn() } };
    expect(await resolveLotStock(db as never, { referencia, stockId: 999 }, 1)).toBeNull();
    expect(db.stock.findMany).not.toHaveBeenCalled();
  });

  it.each(['ES', 'ES012741-A', 'XES012741', '30202048', 'LITHIUM'])('does not classify physical article %s as a resource', referencia => {
    expect(isServiceResourceReference(referencia)).toBe(false);
    expect(getStockSelectionError({ id: 1, referencia, quantidade: 0 })).toContain('Stock insuficiente');
  });

  it('still validates quantities for resources', () => {
    expect(getStockSelectionError({ id: 1, referencia: 'ES012741' }, { requiredQuantity: 0 })).not.toBeNull();
  });
});
