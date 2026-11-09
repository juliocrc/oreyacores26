import React from 'react';
import BarcodeScanner from './BarcodeScanner';
import { ReplacementStockPicker, ReplacementStockSelect } from './ReplacementStockPicker';
import { renderToStaticMarkup } from 'react-dom/server';

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);
}

const items = [
  { id: 11, referencia: 'REF', descricao: 'Agua', lote: 'A', quantidade: 5, codigoBarras: '789' },
  { id: 12, referencia: 'REF', descricao: 'Agua', lote: 'B', quantidade: 8 },
  { id: 13, referencia: 'REF', descricao: 'Agua', lote: 'C', quantidade: 0 },
];

afterEach(() => jest.restoreAllMocks());

function picker(query = '', scanning = false, showValidade = true, requiredQuantity = 1, nextInspection?: string) {
  const setQuery = jest.fn();
  const setScanning = jest.fn();
  const setError = jest.fn();
  jest.spyOn(React, 'useState').mockImplementationOnce(() => [query, setQuery] as any).mockImplementationOnce(() => [scanning, setScanning] as any).mockImplementationOnce(() => [null, setError] as any).mockImplementationOnce(() => [false, jest.fn()] as any);
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const node = ReplacementStockPicker({ items, articleLabel: 'Agua', showValidade, requiredQuantity, nextInspection, onSelect, onClose });
  const tree = elements(node);
  return { node, tree, onSelect, onClose, setQuery, setScanning, setError };
}

it('does not confirm on open, typing, or cancellation', () => {
  const before = JSON.stringify(items);
  const { tree, onSelect, onClose, setQuery } = picker();
  tree.find(el => el.type === 'input')!.props.onChange({ target: { value: 'REF' } });
  expect(setQuery).toHaveBeenCalledWith('REF');
  tree.find(el => el.type === 'button' && el.props.children === 'Cancelar')!.props.onClick();
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSelect).not.toHaveBeenCalled();
  expect(JSON.stringify(items)).toBe(before);
});

it('scanning only filters; ambiguous same-reference rows require an explicit choice', () => {
  const first = picker('', true);
  first.tree.find(el => el.type === BarcodeScanner)!.props.onScan('REF');
  expect(first.setQuery).toHaveBeenCalledWith('REF');
  expect(first.onSelect).not.toHaveBeenCalled();
  const next = picker('REF');
  const rowButtons = next.tree.filter(el => el.type === 'button' && String(el.props.className).includes('w-full text-left'));
  expect(rowButtons).toHaveLength(2);
  rowButtons[1].props.onClick();
  expect(next.onSelect).toHaveBeenCalledWith(items[1]);
});

it('a unique barcode narrows to one row but still requires an explicit click', () => {
  const first = picker('', true);
  first.tree.find(el => el.type === BarcodeScanner)!.props.onScan('789');
  expect(first.onSelect).not.toHaveBeenCalled();
  const next = picker('789');
  const rowButtons = next.tree.filter(el => el.type === 'button' && String(el.props.className).includes('w-full text-left'));
  expect(rowButtons).toHaveLength(1);
  expect(next.onSelect).not.toHaveBeenCalled();
  rowButtons[0].props.onClick();
  expect(next.onSelect).toHaveBeenCalledWith(items[0]);
});

it('hides all lot and expiry labels for non-dated articles', () => {
  const html = renderToStaticMarkup(picker('', false, false).node);
  expect(html).not.toMatch(/lote|validade/i);
  expect(html).toContain('Qtd: 5');
});

it('keeps a missing expiry warning for dated articles', () => {
  const html = renderToStaticMarkup(picker().node);
  expect(html).toContain('Validade: N/D');
  expect(html).toContain('Lote: A');
});

it('shows photo, reference, location and net stock before a row is confirmed', () => {
  const onSelect = jest.fn();
  const html = renderToStaticMarkup(<ReplacementStockPicker items={[{ ...items[0], quantidadeReservada: 2, foto: '/stock/agua.jpg', localizacao: 'B-03' }]} articleLabel="Agua" onSelect={onSelect} onClose={jest.fn()} />);
  expect(html).toContain('Foto de REF');
  expect(html).toContain('/stock/agua.jpg');
  expect(html).toContain('Localizacao: B-03');
  expect(html).toContain('Qtd: 3');
  expect(onSelect).not.toHaveBeenCalled();
});

it('keeps the catalog thumbnail in the selected inline field and handles missing photos', () => {
  const html = renderToStaticMarkup(<ReplacementStockSelect items={[{ ...items[0], foto: '/catalog/water.jpg' }]} value={11} onSelect={jest.fn()} />);
  expect(html).toContain('src="/catalog/water.jpg"');
  const fallback = renderToStaticMarkup(<ReplacementStockSelect items={items} value={11} onSelect={jest.fn()} />);
  expect(fallback).toContain('Sem imagem de REF');
});

it('escape and backdrop cancellation leave selection unchanged', () => {
  const result = picker();
  result.node.props.onKeyDown({ key: 'Escape', stopPropagation: jest.fn() });
  result.node.props.onClick();
  expect(result.onClose).toHaveBeenCalledTimes(2);
  expect(result.onSelect).not.toHaveBeenCalled();
});

it.each([true, false])('forwards showValidade=%s from the inline trigger to the modal', showValidade => {
  jest.spyOn(React, 'useState').mockReturnValue([true, jest.fn()]);
  const tree = elements(ReplacementStockSelect({ items, value: 11, onSelect: jest.fn(), showValidade }));
  expect(tree.find(el => el.type === ReplacementStockPicker)!.props.showValidade).toBe(showValidade);
  const trigger = tree.find(el => el.type === 'button')!;
  expect(String(trigger.props.children).includes('Lote:')).toBe(showValidade);
});

it('blocks the chosen insufficient row with an actionable error, not another batch', () => {
  const result = picker('789', false, false, 6);
  const row = result.tree.find(el => el.type === 'button' && String(el.props.className).includes('w-full text-left'))!;
  row.props.onClick();
  expect(result.onSelect).not.toHaveBeenCalled();
  expect(result.setError).toHaveBeenCalledWith(expect.stringMatching(/disponivel 5, necessita 6.*Reduza/));
  expect(renderToStaticMarkup(result.node)).toContain('Stock insuficiente');
});

it('does not allow missing expiry to satisfy a supplied inspection horizon', () => {
  const result = picker('789', false, true, 1, '2030-01-01');
  result.tree.find(el => el.type === 'button' && String(el.props.className).includes('w-full text-left'))!.props.onClick();
  expect(result.onSelect).not.toHaveBeenCalled();
  expect(result.setError).toHaveBeenCalledWith(expect.stringContaining('Validade em falta'));
});

it('forwards quantity and horizon without confirming when opening', () => {
  jest.spyOn(React, 'useState').mockReturnValue([true, jest.fn()]);
  const onSelect = jest.fn();
  const modal = elements(ReplacementStockSelect({ items, onSelect, requiredQuantity: 7, nextInspection: '2030-02-01' })).find(el => el.type === ReplacementStockPicker)!;
  expect(modal.props).toMatchObject({ requiredQuantity: 7, nextInspection: '2030-02-01' });
  expect(onSelect).not.toHaveBeenCalled();
});

it('shows an empty state rather than offering unavailable stock', () => {
  const { tree, onSelect } = picker('REF C');
  expect(tree.some(el => el.props.role === 'status')).toBe(true);
  expect(onSelect).not.toHaveBeenCalled();
});

it.each([false, true])('permits an undated H20 R only after physical verification (%s)', confirmed => {
  const setError = jest.fn();
  jest.spyOn(React, 'useState').mockImplementationOnce(() => ['', jest.fn()] as any)
    .mockImplementationOnce(() => [false, jest.fn()] as any)
    .mockImplementationOnce(() => [null, setError] as any)
    .mockImplementationOnce(() => [confirmed, jest.fn()] as any);
  const onSelect = jest.fn();
  const item = { id: 44, referencia: '20701002', descricao: 'Libertador Hidrostático HAMMAR H20', quantidade: 1, validade: null };
  const node = ReplacementStockPicker({ items: [item], articleLabel: 'HRU', showValidade: true, nextInspection: '2027-10-01', allowH20R: true, onSelect, onClose: jest.fn() });
  const row = elements(node).find(el => el.type === 'button' && String(el.props.className).includes('w-full text-left'))!;
  row.props.onClick();
  if (confirmed) expect(onSelect).toHaveBeenCalledWith(item);
  else { expect(onSelect).not.toHaveBeenCalled(); expect(setError).toHaveBeenCalledWith(expect.stringContaining('Confirme o modelo')); }
});

it.each([false, true])('requires confirmation before selecting a zero-stock line (%s)', confirmed => {
  const originalWindow = (globalThis as any).window;
  (globalThis as any).window = { confirm: jest.fn(() => confirmed) };
  try {
    jest.spyOn(React, 'useState').mockImplementationOnce(() => ['', jest.fn()] as any)
      .mockImplementationOnce(() => [false, jest.fn()] as any)
      .mockImplementationOnce(() => [null, jest.fn()] as any)
      .mockImplementationOnce(() => [false, jest.fn()] as any);
    const item = { id: 13, referencia: 'REF', descricao: 'Agua', quantidade: 0, validade: '2031-01' };
    const onSelect = jest.fn();
    const node = ReplacementStockPicker({ items: [item], articleLabel: 'Agua', showValidade: true, nextInspection: '2030-01-01', allowDeficit: true, onSelect, onClose: jest.fn() });
    const row = elements(node).find(el => el.type === 'button' && String(el.props.className).includes('w-full text-left'))!;
    row.props.onClick();
    expect((globalThis as any).window.confirm).toHaveBeenCalledTimes(1);
    if (confirmed) expect(onSelect).toHaveBeenCalledWith(item);
    else expect(onSelect).not.toHaveBeenCalled();
  } finally { (globalThis as any).window = originalWindow; }
});

it('still blocks an expired lot even when deficit selection is allowed', () => {
  const originalWindow = (globalThis as any).window;
  (globalThis as any).window = { confirm: jest.fn(() => true) };
  try {
    const setError = jest.fn();
    jest.spyOn(React, 'useState').mockImplementationOnce(() => ['', jest.fn()] as any)
      .mockImplementationOnce(() => [false, jest.fn()] as any)
      .mockImplementationOnce(() => [null, setError] as any)
      .mockImplementationOnce(() => [false, jest.fn()] as any);
    const onSelect = jest.fn();
    const node = ReplacementStockPicker({ items: [{ id: 1, referencia: 'REF', quantidade: 0, validade: '2020-01' }], articleLabel: 'Agua', showValidade: true, nextInspection: '2030-01-01', allowDeficit: true, onSelect, onClose: jest.fn() });
    elements(node).find(el => el.type === 'button' && String(el.props.className).includes('w-full text-left'))!.props.onClick();
    expect(onSelect).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledWith(expect.stringContaining('Validade insuficiente'));
    expect((globalThis as any).window.confirm).not.toHaveBeenCalled();
  } finally { (globalThis as any).window = originalWindow; }
});
