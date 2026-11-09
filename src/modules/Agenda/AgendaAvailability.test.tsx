import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AgendaAvailability from './AgendaAvailability';

const data = {
  timeZone: 'Atlantic/Azores', weekStart: '2030-01-07', weekEnd: '2030-01-13', unassignedMinutes: 90,
  technicians: [{ id: 1, nome: 'Ana', days: [{ date: '2030-01-07', freeMinutes: 0, occupiedMinutes: 480, availableMinutes: 420, overbookedMinutes: 60 }], totals: { availableMinutes: 420, occupiedMinutes: 480, freeMinutes: 0, overbookedMinutes: 60 } }],
  suggestions: [{ start: '2030-01-07T10:00:00Z', end: '2030-01-07T13:00:00Z', responsavel: 'Ana' }], warnings: ['Carga elevada'],
};
const key = 'date=2030-01-07&durationMinutes=180';
afterEach(() => jest.restoreAllMocks());

it('renders weekly capacity, overbooking and unassigned work from the API', () => {
  jest.spyOn(React, 'useState').mockImplementationOnce(() => [{ key, data }, jest.fn()] as any);
  const html = renderToStaticMarkup(<AgendaAvailability date="2030-01-07" />);
  for (const text of ['Capacidade semanal', 'Ana', '7h00', '8h00', '1h00', 'Sem responsável: 1h30', 'Carga elevada']) expect(html).toContain(text);
});

it('choosing a suggestion only passes it to the form and discloses revalidation', () => {
  jest.spyOn(React, 'useState').mockImplementationOnce(() => [{ key, data }, jest.fn()] as any).mockImplementationOnce(() => [0, jest.fn()] as any);
  jest.spyOn(React, 'useEffect').mockImplementation(() => {});
  const onSelect = jest.fn();
  const tree = AgendaAvailability({ date: '2030-01-07', onSelect });
  function elements(node: React.ReactNode): React.ReactElement<any>[] {
    return React.Children.toArray(node).flatMap(child => React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);
  }
  elements(tree).find(element => element.type === 'button')!.props.onClick();
  expect(onSelect).toHaveBeenCalledWith(data.suggestions[0]);
  const html = renderToStaticMarkup(tree);
  expect(html).toContain('2030-01-07 09:00');
  expect(html).toContain('não reserva');
  expect(html).toContain('volta a validar ao guardar');
});

it('aborts on cleanup and ignores a late response even when the transport ignores abort', async () => {
  let effect: (() => void | (() => void)) | undefined;
  let resolve: (value: unknown) => void = () => {};
  const update = jest.fn();
  jest.spyOn(React, 'useState').mockImplementationOnce(() => [{ key: '' }, update] as any).mockImplementationOnce(() => [0, jest.fn()] as any);
  jest.spyOn(React, 'useEffect').mockImplementation(fn => { effect = fn as typeof effect; });
  const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(() => new Promise(done => { resolve = done; }) as any);
  (global as any).window = { setInterval: jest.fn(), clearInterval: jest.fn() };
  try {
    AgendaAvailability({ stationId: 2, date: '2030-01-07', responsavel: 'Ana', raftSerial: 'R1', excludeId: 7 });
    const cleanup = effect!();
    expect(fetchMock.mock.calls[0][0]).toContain('responsavel=Ana&raftSerial=R1&excludeId=7');
    expect(fetchMock.mock.calls[0][0]).toContain('stationId=2');
    const signal = fetchMock.mock.calls[0][1]!.signal!;
    if (typeof cleanup === 'function') cleanup();
    expect(signal.aborted).toBe(true);
    resolve({ ok: true, json: async () => data });
    await Promise.resolve();
    await Promise.resolve();
    expect(update).not.toHaveBeenCalled();
  } finally { delete (global as any).window; }
});

it('does not display stale suggestions for a new date or technician', () => {
  jest.spyOn(React, 'useState').mockImplementationOnce(() => [{ key, data }, jest.fn()] as any);
  const html = renderToStaticMarkup(<AgendaAvailability date="2030-01-08" onSelect={jest.fn()} />);
  expect(html).toContain('A consultar');
  expect(html).not.toContain('2030-01-07 09:00');
});

it('shows errors with retry instead of claiming no capacity', () => {
  jest.spyOn(React, 'useState').mockImplementationOnce(() => [{ key, error: 'Falha de rede' }, jest.fn()] as any);
  const html = renderToStaticMarkup(<AgendaAvailability date="2030-01-07" />);
  expect(html).toContain('role="alert"');
  expect(html).toContain('Falha de rede');
  expect(html).toContain('Tentar novamente');
});

it('requires a concrete station when the page is in all-stations mode', () => {
  const html = renderToStaticMarkup(<AgendaAvailability stationId={null} date="2030-01-07" />);
  expect(html).toContain('Selecione uma estação');
  expect(html).not.toContain('A consultar');
});

it('does not show results belonging to a different station', () => {
  jest.spyOn(React, 'useState').mockImplementationOnce(() => [{ key: `${key}&stationId=2`, data }, jest.fn()] as any);
  const html = renderToStaticMarkup(<AgendaAvailability stationId={3} date="2030-01-07" />);
  expect(html).toContain('A consultar');
  expect(html).not.toContain('Ana');
});

it('shares only a successful scoped response with the page roster', async () => {
  let effect: (() => void | (() => void)) | undefined;
  const onLoad = jest.fn();
  jest.spyOn(React, 'useEffect').mockImplementation(fn => { effect = fn as typeof effect; });
  jest.spyOn(React, 'useState').mockImplementationOnce(() => [{ key: '' }, jest.fn()] as any).mockImplementationOnce(() => [0, jest.fn()] as any);
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => data } as Response);
  (global as any).window = { setInterval: jest.fn(), clearInterval: jest.fn() };
  try {
    AgendaAvailability({ stationId: 2, date: '2030-01-07', onLoad });
    const cleanup = effect!();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(onLoad).toHaveBeenCalledWith(data);
    if (typeof cleanup === 'function') cleanup();
  } finally { delete (global as any).window; }
});
