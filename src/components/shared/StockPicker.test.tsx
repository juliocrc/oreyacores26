import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StockPickerSelect } from './StockPicker';

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);
}

afterEach(() => jest.restoreAllMocks());

const items = [{ id: 1, referencia: 'REF', descricao: 'Cinta', quantidade: 7, quantidadeReservada: 3, localizacao: 'A-02', foto: '/stock/cinta.jpg', lote: 'HIDDEN' }];

it('shows reference, location, photo and available quantity without lot for non-dated stock', () => {
  const html = renderToStaticMarkup(<StockPickerSelect items={items} value={1} onSelect={jest.fn()} />);
  expect(html).toContain('REF');
  expect(html).toContain('Localizacao: A-02');
  expect(html).toContain('Qtd: 4');
  expect(html).toContain('alt="Foto de REF"');
  expect(html).toContain('src="/stock/cinta.jpg"');
  expect(html).not.toContain('HIDDEN');
});

it('blocks quantity above the chosen row availability without selecting a fallback', () => {
  const setError = jest.fn();
  jest.spyOn(React, 'useState').mockImplementationOnce(() => ['', jest.fn()] as any).mockImplementationOnce(() => [null, setError] as any);
  jest.spyOn(React, 'useMemo').mockImplementation(fn => fn());
  const onSelect = jest.fn();
  const node = StockPickerSelect({ items, onSelect, requiredQuantity: 5 });
  elements(node).find(el => el.type === 'select')!.props.onChange({ target: { value: '1' } });
  expect(onSelect).not.toHaveBeenCalled();
  expect(setError).toHaveBeenCalledWith(expect.stringContaining('disponivel 4, necessita 5'));
});

it('offers catalog thumbnails before selecting an article, without confirming on render', () => {
  const onSelect = jest.fn();
  const html = renderToStaticMarkup(<StockPickerSelect items={items} onSelect={onSelect} />);
  expect(html).toContain('Ver artigos com fotos');
  expect(html).toContain('src="/stock/cinta.jpg"');
  expect(onSelect).not.toHaveBeenCalled();
});
