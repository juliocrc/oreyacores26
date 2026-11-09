import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import JangadaEquipmentHistory from './JangadaEquipmentHistory';

afterEach(() => jest.restoreAllMocks());

it('renders a self-contained loading panel without requiring page state', () => {
  const html = renderToStaticMarkup(<JangadaEquipmentHistory jangadaId={7} refreshKey={1} />);
  expect(html).toContain('Histórico de equipamentos');
  expect(html).toContain('A carregar histórico');
});

it('renders author, time and reference/quantity/validity before and after', () => {
  jest.spyOn(React, 'useState')
    .mockImplementationOnce(() => [{ items: [{ id: 9, quando: '2026-10-25T10:00:00Z', quem: 'ana@orey.pt', origem: 'Artigo da ficha',
      alteracoes: [{ campo: 'artigo', antes: { referencia: 'OLD', quantidade: 1, validade: '2027-01-01' }, depois: { referencia: 'NEW', quantidade: 0, validade: '2030-01-01' } }],
    }], nextCursor: 9 }, jest.fn()] as never)
    .mockImplementationOnce(() => [null, jest.fn()] as never)
    .mockImplementationOnce(() => [false, jest.fn()] as never);
  const html = renderToStaticMarkup(<JangadaEquipmentHistory jangadaId={7} />);
  for (const text of ['ana@orey.pt', '25/10/2026', 'Antes', 'Depois', 'Referência: OLD', 'Referência: NEW', 'Quantidade: 1', 'Quantidade: 0', '2027-01-01', '2030-01-01', 'Carregar mais']) expect(html).toContain(text);
  expect(html).toContain('MuiTableContainer');
});

it('shows an empty state rather than inventing historical data', () => {
  jest.spyOn(React, 'useState')
    .mockImplementationOnce(() => [{ items: [], nextCursor: null }, jest.fn()] as never)
    .mockImplementationOnce(() => [null, jest.fn()] as never)
    .mockImplementationOnce(() => [false, jest.fn()] as never);
  expect(renderToStaticMarkup(<JangadaEquipmentHistory jangadaId={7} />)).toContain('Sem alterações de equipamentos registadas.');
});
