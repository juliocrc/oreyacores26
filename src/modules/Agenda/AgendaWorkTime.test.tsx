import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AgendaWorkTime from './AgendaWorkTime';

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<{ children?: React.ReactNode }>(child)
    ? [child, ...elements(child.props.children)] : []);
}

const summary = { eventId: 3, ordemId: 7, estimatedMinutes: 180, actualMinutes: 30, source: 'metadados.timeEntries', entries: [{ durationMinutes: 30 }], activeEntry: null, status: 'pausada', updatedAt: '2026-10-20T12:00:00Z', canEdit: true };
let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => summary });
  jest.spyOn(global, 'fetch').mockImplementation(fetchMock);
  jest.spyOn(React, 'useEffect').mockImplementation(() => {});
  jest.spyOn(React, 'useRef').mockImplementation(value => ({ current: value }));
});
afterEach(() => jest.restoreAllMocks());

function view(data: object = summary, props = { eventId: 3, ordemId: undefined as number | undefined }) {
  const setResult = jest.fn();
  jest.spyOn(React, 'useState')
    .mockImplementationOnce(() => [{ eventId: 3, data }, setResult] as any)
    .mockImplementationOnce(() => ['', jest.fn()] as any)
    .mockImplementationOnce(() => [0, jest.fn()] as any)
    .mockImplementationOnce(() => [false, jest.fn()] as any)
    .mockImplementationOnce(() => [Date.parse('2026-10-20T12:00:00Z'), jest.fn()] as any);
  const node = AgendaWorkTime(props);
  return { node, tree: elements(node), setResult };
}

it('shows estimate, accumulated real time, variance and explicit OT link', () => {
  const html = renderToStaticMarkup(view().node);
  expect(html).toContain('Estimado: 180 min');
  expect(html).toContain('Real: 30.0 min');
  expect(html).toContain('Desvio: -150.0 min');
  expect(html).toContain('/ordens-servico/7');
});

it('does not present an empty OT timer as measured zero', () => {
  const html = renderToStaticMarkup(view({ ...summary, entries: [], actualMinutes: 0 }).node);
  expect(html).toContain('Real: indisponivel');
  expect(html).not.toContain('Desvio:');
});

it('requires association confirmation even when an explicit OT ID is supplied', async () => {
  const { tree } = view({ eventId: 3, ordemId: null, estimatedMinutes: 180, canEdit: true }, { eventId: 3, ordemId: 42 });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(tree.filter(el => el.type === 'button').map(el => el.props.children)).toEqual(['Associar OT']);
  tree.find(el => el.type === 'form')!.props.onSubmit({ preventDefault: jest.fn() });
  await Promise.resolve();
  expect(fetchMock).toHaveBeenCalledWith('/api/agenda/3/time', expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'link', ordemId: 42 }) }));
});

it('resumes paused work and permits completing without a running interval', () => {
  const { tree } = view();
  const buttons = tree.filter(el => el.type === 'button');
  expect(buttons.find(el => el.props.children === 'Retomar')!.props.disabled).toBe(false);
  expect(buttons.find(el => el.props.children === 'Pausar')!.props.disabled).toBe(true);
  expect(buttons.find(el => el.props.children === 'Concluir')!.props.disabled).toBe(false);
});

it('only enables pause and complete while running, and includes running elapsed time', () => {
  const { tree, node } = view({ ...summary, status: 'em_progresso', activeEntry: { startedAt: '2026-10-20T11:29:00Z' }, measuredAt: '2026-10-20T11:59:00Z' });
  expect(tree.find(el => el.type === 'button' && el.props.children === 'Iniciar')!.props.disabled).toBe(true);
  expect(tree.find(el => el.type === 'button' && el.props.children === 'Pausar')!.props.disabled).toBe(false);
  expect(renderToStaticMarkup(node)).toContain('Real: 31.0 min');
});

it.each([{ ...summary, canEdit: false }, { ...summary, status: 'concluida' }, { ...summary, status: 'cancelada' }])('hides mutations for readonly or closed work', data => {
  expect(view(data).tree.some(el => el.type === 'button')).toBe(false);
});

it('sends the OT revision and prevents a double-click from posting twice', async () => {
  const { tree } = view();
  const button = tree.find(el => el.type === 'button' && el.props.children === 'Concluir')!;
  button.props.onClick();
  button.props.onClick();
  await Promise.resolve();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith('/api/agenda/3/time', expect.objectContaining({ body: JSON.stringify({ action: 'complete', updatedAt: summary.updatedAt }) }));
});

it('does not render the previous event data after switching event IDs', () => {
  const html = renderToStaticMarkup(view(summary, { eventId: 4, ordemId: undefined }).node);
  expect(html).not.toContain('/ordens-servico/7');
  expect(html).toContain('A carregar tempos');
});
