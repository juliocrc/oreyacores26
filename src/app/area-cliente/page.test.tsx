import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import AreaClientePage from './page';

jest.mock('next-auth/react', () => ({ useSession: jest.fn(), signOut: jest.fn() }));
jest.mock('next/navigation', () => ({ useSearchParams: jest.fn() }));
jest.mock('./ClienteJangadasPanel', () => ({ __esModule: true, default: () => null }));
jest.mock('./ClienteNaviosPanel', () => ({ __esModule: true, default: () => null }));
jest.mock('./ClienteFichaPanel', () => ({ __esModule: true, default: () => null }));

beforeEach(() => jest.mocked(useSearchParams).mockReturnValue(new URLSearchParams('previewClienteId=7') as never));
afterEach(() => jest.restoreAllMocks());

it('describes the NIF login interface it links to', () => {
  jest.mocked(useSession).mockReturnValue({ status: 'unauthenticated', data: null } as never);
  const html = renderToStaticMarkup(<AreaClientePage />);
  expect(html).toContain('NIF e código temporário');
  expect(html).toContain('href="/area-cliente/login"');
});

it.each(['ADMIN', 'CLIENTE'])('labels limited balances and offers invoice downloads only outside admin preview (%s)', role => {
  jest.mocked(useSession).mockReturnValue({ status: 'authenticated', data: { user: { role, clienteId: 7 } } } as never);
  const resultado = { cliente: { id: 7, nome: 'Client' }, navios: [], jangadas: [], ordensServico: [],
    faturas: [{ id: 10, numeroFatura: 'NAV-10', faturaPdfUrl: '/api/portal/faturas/10/oficial', valorTotal: 100, ordemServicos: [] }],
    resumoFaturas: { totalFaturado: 100, totalRecebido: 0, totalEmDivida: 100 } };
  const values = [false, null, resultado, true, [], {}, false, null];
  jest.spyOn(React, 'useState').mockImplementation((() => [values.shift(), jest.fn()]) as never);
  const html = renderToStaticMarkup(<AreaClientePage />);
  expect(html).toContain('Saldo das faturas apresentadas');
  expect(html).toContain('não representa a conta corrente completa');
  expect(html).toContain('Faturas oficiais recentes (até 10)');
  if (role === 'ADMIN') {
    expect(html).not.toContain('href="/api/portal/faturas/10/oficial"');
    expect(html).toContain('Download disponível apenas na sessão do cliente.');
  } else {
    expect(html).toContain('href="/api/portal/faturas/10/oficial"');
  }
});
