import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import EstatisticasPage from '@/app/estatisticas/page';
import NotificacoesPage from '@/app/notificacoes/page';

type TestElementProps = { children?: React.ReactNode; className?: string; onClick: () => void; onChange: (event: { target: { value: string } }) => void };
const elements = (node: React.ReactNode): React.ReactElement<TestElementProps>[] => React.Children.toArray(node).flatMap(child =>
  React.isValidElement<TestElementProps>(child) ? [child, ...elements(child.props.children)] : []);
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
};
const response = (payload: unknown, ok = true) => ({ ok, json: async () => payload }) as Response;
const notification = (id: string) => ({ id, tipo: 'assistencia', titulo: id, descricao: 'Pedido', data: '2026-01-02', link: '/pedidos-assistencia' });
const stats = (id = 2) => ({
  kpis: { totalInspecoes: id, concluidas: 1, rascunhos: 0, condenadas: 0, outros: 0, totalJangadas: id, totalNavios: 0, totalStock: 0, totalOrdens: 0 },
  tests: Object.fromEntries(['wp', 'nap', 'fs', 'gi', 'dl'].map(key => [key, { pass: 3, fail: 1, na: 96 }])),
  brandBreakdown: [], monthlyTrend: [{ month: '2026-01', count: 0 }],
  stations: [{ id: 2, nome: 'Station 2', codigo: 'S2' }, { id: 3, nome: 'Station 3', codigo: 'S3' }], selectedStationId: id,
});

function harness(Page: () => React.JSX.Element) {
  const states: unknown[] = [];
  const refs: { current: unknown }[] = [];
  let stateIndex = 0;
  let refIndex = 0;
  let effect: (() => void | (() => void)) | undefined;
  jest.spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (value: unknown) => { states[index] = value; }];
  }) as typeof React.useState);
  jest.spyOn(React, 'useRef').mockImplementation(((initial: unknown) => {
    const index = refIndex++;
    refs[index] ??= { current: initial };
    return refs[index];
  }) as typeof React.useRef);
  jest.spyOn(React, 'useEffect').mockImplementation(callback => { effect ??= callback; });
  const render = () => { stateIndex = 0; refIndex = 0; return Page(); };
  const html = () => renderToStaticMarkup(render());
  const button = () => elements(render()).find(el => el.type === 'button' && String(el.props.className).includes('shadow-sm'))!;
  render();
  const cleanup = effect!();
  return { render, html, button, cleanup, states };
}

let tick: () => void;
let clearIntervalMock: jest.Mock;
let oldWindow: PropertyDescriptor | undefined;
beforeEach(() => {
  oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  clearIntervalMock = jest.fn();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    setInterval: jest.fn((callback: () => void) => { tick = callback; return 7; }), clearInterval: clearIntervalMock,
  } });
});
afterEach(() => {
  jest.restoreAllMocks();
  if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

it('renders partial notification errors without claiming a successful empty result', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response({ items: [], errors: ['Não foi possível carregar comunicações recebidas.'] }));
  const page = harness(NotificacoesPage);
  await flush();
  expect(page.html()).toContain('role="alert"');
  expect(page.html()).toContain('Não foi possível confirmar todas as notificações');
  expect(page.html()).not.toContain('Não existem notificações');
  page.cleanup?.();
});

it('preserves successful notification sources and uses the scoped payload contract', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response({ items: [notification('Pedido recebido')], errors: ['Fonte indisponível.'] }));
  const page = harness(NotificacoesPage);
  await flush();
  expect(fetchMock).toHaveBeenCalledWith('/api/notificacoes', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }));
  expect(page.html()).toContain('Pedido recebido');
  expect(page.html()).toContain('Fonte indisponível.');
  page.cleanup?.();
});

it.each([response({ error: 'private SQL detail' }, false), response({ pedidos: [] })])('shows a generic error for HTTP/contract failures', async result => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(result);
  const page = harness(NotificacoesPage);
  await flush();
  expect(page.html()).toContain('Não foi possível carregar as notificações');
  expect(page.html()).not.toContain('private SQL detail');
  expect(page.html()).not.toContain('Não existem notificações');
  page.cleanup?.();
});

it('skips overlapping polls, ignores superseded responses, and cancels on unmount', async () => {
  const first = deferred();
  const second = deferred();
  const third = deferred();
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
  const page = harness(NotificacoesPage);
  tick();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  first.resolve(response({ items: [notification('first')], errors: [] }));
  await flush();
  const refresh = page.button().props.onClick;
  tick();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  refresh();
  expect((fetchMock.mock.calls[1][1]?.signal as AbortSignal).aborted).toBe(true);
  third.resolve(response({ items: [notification('latest')], errors: [] }));
  await flush();
  second.resolve(response({ items: [notification('obsolete')], errors: ['obsolete error'] }));
  await flush();
  expect(page.html()).toContain('latest');
  expect(page.html()).not.toContain('obsolete');
  page.cleanup?.();
  expect(clearIntervalMock).toHaveBeenCalledWith(7);
});

it('does not update notifications after cancellation even if fetch ignores abort', async () => {
  const pending = deferred();
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockReturnValue(pending.promise);
  const page = harness(NotificacoesPage);
  page.cleanup?.();
  const before = JSON.stringify(page.states);
  pending.resolve(response({ items: [notification('late')], errors: [] }));
  await flush();
  expect((fetchMock.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
  expect(JSON.stringify(page.states)).toBe(before);
});

it('renders rates without NA and gives zero months zero-height bars', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(stats()));
  const page = harness(EstatisticasPage);
  await flush();
  const html = page.html();
  expect(html).toContain('75% Aprovados');
  expect(html).toContain('4 avaliados; 96 N/A');
  expect(html).toContain('height:0%');
  page.cleanup?.();
});

it('renders all brands with expandable model/capacity tables and explicit unknowns', async () => {
  const payload = { ...stats(), brandBreakdown: Array.from({ length: 10 }, (_, i) => ({
    brand: `Brand ${i}`, count: 2, models: [
      { model: 'Registered model', capacity: 10, count: 1 },
      { model: 'Modelo desconhecido', capacity: null, count: 1 },
    ],
  })) };
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(payload));
  const page = harness(EstatisticasPage);
  await flush();
  const html = page.html();
  expect(html.match(/<details /g)).toHaveLength(10);
  expect(html).toContain('Brand 9');
  expect(html).toContain('2 jangadas');
  expect(html).toContain('Registered model');
  expect(html).toContain('10 pessoas');
  expect(html).toContain('Modelo desconhecido');
  expect(html).toContain('Lotação desconhecida');
  expect(html).toContain('scope="col"');
  page.cleanup?.();
});

it('does not let an old station response overwrite the latest statistics', async () => {
  const old = deferred();
  const latest = deferred();
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(stats())).mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
  const page = harness(EstatisticasPage);
  await flush();
  const change = elements(page.render()).find(el => el.type === 'select')!.props.onChange;
  change({ target: { value: '2' } });
  change({ target: { value: '3' } });
  latest.resolve(response(stats(3)));
  await flush();
  old.resolve(response(stats(2)));
  await flush();
  expect(page.states[2]).toEqual(stats(3));
  expect(fetchMock.mock.calls[2][0]).toBe('/api/estatisticas?stationId=3');
  expect((fetchMock.mock.calls[1][1]?.signal as AbortSignal).aborted).toBe(true);
  page.cleanup?.();
});

it('clears stale station data and never displays backend error details after refresh failure', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(stats())).mockResolvedValueOnce(response({ error: 'private SQL' }, false));
  const page = harness(EstatisticasPage);
  await flush();
  page.button().props.onClick();
  await flush();
  expect(page.states[2]).toBeNull();
  expect(page.html()).toContain('Falha ao carregar estatísticas');
  expect(page.html()).not.toContain('private SQL');
  page.cleanup?.();
});
