import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PortalPropostasPage from './page';

jest.mock('react', () => ({ ...jest.requireActual('react'), useState: jest.fn(), useMemo: jest.fn(), useEffect: jest.fn(), useCallback: jest.fn() }));

function review(item: Record<string, unknown>) {
  const proposal = { id: 100, createdAt: '2026-10-01T12:00:00Z', navio: { id: 10, nome: 'Own Ship', cliente: 'Own Client' },
    dados: { tipo: 'associacao', navioId: 10, estado: 'PENDENTE', itens: [item] } };
  const states = [[proposal], null, false, false, null, 'PENDENTE', '', 100, null, ''];
  let slot = 0;
  jest.mocked(React.useState).mockImplementation((() => [states[slot++], jest.fn()]) as typeof React.useState);
  jest.mocked(React.useMemo).mockImplementation(factory => factory());
  jest.mocked(React.useCallback).mockImplementation(callback => callback);
  return renderToStaticMarkup(PortalPropostasPage());
}

it('shows the full new EPIRB proposal and exact next date before the administrator decides', () => {
  const html = review({ tipoEquipamento: 'epirb', serial: 'NEW-EPIRB', modo: 'novo', dataProxInspecao: '2020-02-29',
    novoEquipamento: { marca: 'Brand', modelo: 'Model', hexId: '1D0E00000000001', dataValidadeBateria: '2028-06', observacoes: 'No certificate' } });
  for (const text of ['Criar novo equipamento', 'NEW-EPIRB', '29/02/2020', 'Brand', 'Model', 'Hex ID', '1D0E00000000001', 'Validade da bateria', '2028-06', 'No certificate', 'nao emite certificados']) expect(html).toContain(text);
});

it('distinguishes an existing-equipment association and its current ship from a new creation', () => {
  const html = review({ tipoEquipamento: 'colete', serial: 'LJ-22', modo: 'existente', dataProxInspecao: '2027-01-01', existente: { id: 22, shipId: 11 } });
  expect(html).toContain('Associar equipamento existente #22 (navio atual: 11)');
  expect(html).toContain('01/01/2027');
  expect(html).not.toContain('Criar novo equipamento');
});

it('flags legacy missing inspection dates instead of suggesting an invented date', () => {
  expect(review({ tipoEquipamento: 'colete', serial: 'OLD' })).toContain('Em falta: solicitar nova proposta');
});
