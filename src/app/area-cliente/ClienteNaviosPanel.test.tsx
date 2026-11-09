import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ClienteNaviosPanel from './ClienteNaviosPanel';
import { PORTAL_EQUIPMENT_TYPES } from '@/lib/portal-equipment-proposal';

jest.mock('react', () => ({ ...jest.requireActual('react'), useState: jest.fn(), useMemo: jest.fn(), useRef: jest.fn() }));

const navios = [{ id: 10, nome: 'Ship One' }, { id: 11, nome: 'Ship Two' }];
const coletes = [
  { id: 22, shipId: 10, serial: 'LJ-22', marca: 'Brand', modelo: 'Model One', dataProxInspecao: '2020-02-29' },
  { id: 23, shipId: 11, serial: 'LJ-23', marca: 'Brand', modelo: 'Model Two', dataProxInspecao: null },
];
const shipData = (id = 10) => ({ navio: { id, nome: 'Ship', pirotecnicosBordo: [] },
  equipamentos: { coletes: coletes.filter(item => item.shipId === id), fatos: [], epirbs: [], extintores: [] }, documentos: [] });
let states: unknown[];
let slot: number;
let ref: { current: number };
function render() {
  slot = 0;
  return ClienteNaviosPanel({ navios, coletes });
}
function elements(node: React.ReactNode): React.ReactElement<any>[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);
}
function button(text: string) {
  return elements(render()).find(el => el.type === 'button' && renderToStaticMarkup(el).includes(text))!;
}
function change(id: string, value: string) {
  elements(render()).find(el => el.props.id === id || el.props['aria-label'] === id)!.props.onChange({ target: { value } });
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  states = [];
  ref = { current: 0 };
  jest.mocked(React.useState).mockImplementation(((initial: unknown) => {
    const index = slot++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (value: unknown) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
  }) as typeof React.useState);
  jest.mocked(React.useMemo).mockImplementation(factory => factory());
  jest.mocked(React.useRef).mockReturnValue(ref);
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    return new Response(JSON.stringify(body?.tipo === 'verificar-associacao' ? { itens: [{ novo: false }] } : body?.tipo === 'associacao' ? { success: true } : shipData()));
  });
});
afterEach(() => jest.restoreAllMocks());

it('lists actual coletes under each ship without opening it, with model, serial and saved next inspection date', () => {
  const lists = elements(render()).filter(el => el.type === 'ul');
  const first = renderToStaticMarkup(lists.find(el => el.props['aria-label'] === 'Coletes de Ship One')!);
  const second = renderToStaticMarkup(lists.find(el => el.props['aria-label'] === 'Coletes de Ship Two')!);
  expect(first).toContain('Model One');
  expect(first).toContain('LJ-22');
  expect(first).toContain('29/02/2020');
  expect(first).toContain('Inspecao vencida');
  expect(first).not.toContain('LJ-23');
  expect(second).toContain('LJ-23');
  expect(second).toContain('Sem data registada');
  expect(second).not.toContain('LJ-22');
  expect(fetch).not.toHaveBeenCalled();
});

it('requires a real next inspection date before queuing an association and does not default to today', async () => {
  button('Ship One').props.onClick();
  await flush();
  change('assoc-tipo', 'colete');
  change('assoc-serial', 'LJ-NEW');
  const date = elements(render()).find(el => el.props['aria-label'] === 'Proxima inspecao / recarga')!;
  expect(date.props.value).toBe('');
  expect(date.props.min).toBeUndefined();
  button('Adicionar').props.onClick();
  expect(renderToStaticMarkup(render())).toContain('Indique uma data real');
  expect(button('Submeter associa').props.disabled).toBe(true);
  change('Proxima inspecao / recarga', '2026-02-29');
  button('Adicionar').props.onClick();
  expect(button('Submeter associa').props.disabled).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('submits a historical date in pending proposal metadata, leaving the saved colete date unchanged', async () => {
  button('Ship One').props.onClick();
  await flush();
  change('assoc-tipo', 'colete');
  change('assoc-serial', 'LJ-22');
  change('Proxima inspecao / recarga', '2019-01-02');
  button('Adicionar').props.onClick();
  await flush();
  expect(renderToStaticMarkup(render())).toContain('02/01/2019 (vencida)');
  jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ success: true })));
  button('Submeter associa').props.onClick();
  await flush();
  expect(fetch).toHaveBeenLastCalledWith('/api/portal/propostas', expect.objectContaining({ method: 'POST', body: JSON.stringify({ tipo: 'associacao', navioId: 10,
    itens: [{ tipoEquipamento: 'colete', serial: 'LJ-22', dataProxInspecao: '2019-01-02' }] }) }));
  expect(renderToStaticMarkup(render())).toContain('submetidas para aprovação');
  expect(elements(render()).some(el => el.type === 'input' && el.props.value === '2020-02-29')).toBe(true);
  expect(button('Submeter associa').props.disabled).toBe(true);
});

it('keeps failed proposals queued for correction without changing saved dates', async () => {
  button('Ship One').props.onClick();
  await flush();
  change('assoc-serial', 'NOT-FOUND');
  change('Proxima inspecao / recarga', '2020-01-02');
  button('Adicionar').props.onClick();
  await flush();
  jest.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'Equipment missing' }), { status: 404 }));
  button('Submeter associa').props.onClick();
  await flush();
  const html = renderToStaticMarkup(render());
  expect(html).toContain('Equipment missing');
  expect(html).toContain('NOT-FOUND');
  expect(button('Submeter associa').props.disabled).toBe(false);
});

it.each(PORTAL_EQUIPMENT_TYPES)('offers the existing creation fields for unknown %s serials, queues full data and creates nothing directly', async tipo => {
  button('Ship One').props.onClick();
  await flush();
  change('assoc-tipo', tipo);
  change('assoc-serial', 'NEW-SERIAL');
  change('Proxima inspecao / recarga', '2020-01-02');
  jest.mocked(fetch).mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify(body.tipo === 'verificar-associacao' ? { itens: [{ novo: true }] } : { success: true }));
  });
  button('Adicionar').props.onClick();
  await flush();
  let html = renderToStaticMarkup(render());
  expect(html).toContain('Ficha de novo equipamento');
  expect(html).toContain('Nada sera criado antes da aprovacao');
  expect(button('Submeter associa').props.disabled).toBe(true);
  change('Novo: Marca', 'Brand');
  change('Novo: Modelo', 'Model');
  if (tipo === 'jangada') {
    change('Novo: Capacidade (pessoas)', '6');
    change('Novo: Data de fabrico', '2020-02');
    change('Novo: Tipo de pack', 'SOLAS A');
  }
  if (tipo === 'epirb') {
    change('Novo: Hex ID', '1d0e00000000001');
    change('Novo: Validade da bateria', '2028-06');
  }
  if (tipo === 'extintor') {
    change('Novo: Capacidade (kg)', '6');
    change('Novo: Agente extintor', 'CO2');
  }
  if (tipo === 'fato') {
    change('Novo: Material', 'Neoprene');
    change('Novo: Tamanho', 'L');
  }
  button('Adicionar ficha a proposta').props.onClick();
  await flush();
  html = renderToStaticMarkup(render());
  expect(html).toContain('Criar novo:');
  expect(html).toContain('Brand');
  expect(html).not.toContain('<fieldset');
  button('Submeter associa').props.onClick();
  await flush();
  const calls = jest.mocked(fetch).mock.calls;
  const [url, init] = calls[calls.length - 1];
  expect(url).toBe('/api/portal/propostas');
  const body = JSON.parse(String(init?.body));
  expect(body).toMatchObject({ tipo: 'associacao', navioId: 10, itens: [{ tipoEquipamento: tipo, serial: 'NEW-SERIAL', dataProxInspecao: '2020-01-02', novoEquipamento: tipo === 'jangada' ? { brand: 'Brand', model: 'Model', capacity: 6 } : { marca: 'Brand', modelo: 'Model' } }] });
  if (tipo === 'epirb') expect(body.itens[0].novoEquipamento).toMatchObject({ hexId: '1D0E00000000001', dataValidadeBateria: '2028-06' });
  expect(calls.every(([url]) => url === '/api/portal/navios/10' || url === '/api/portal/propostas')).toBe(true);
});

it('blocks incomplete new raft data and does not invent required fields', async () => {
  button('Ship One').props.onClick();
  await flush();
  change('assoc-serial', 'NEW-RAFT');
  change('Proxima inspecao / recarga', '2020-01-02');
  jest.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ itens: [{ novo: true }] })));
  button('Adicionar').props.onClick();
  await flush();
  button('Adicionar ficha a proposta').props.onClick();
  await flush();
  expect(renderToStaticMarkup(render())).toContain('Campo obrigatorio: Marca');
  expect(button('Submeter associa').props.disabled).toBe(true);
});

it('does not attach new field data when a serial becomes known during form completion', async () => {
  button('Ship One').props.onClick();
  await flush();
  change('assoc-tipo', 'colete');
  change('assoc-serial', 'NEW-LJ');
  change('Proxima inspecao / recarga', '2020-01-02');
  jest.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ itens: [{ novo: true }] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ itens: [{ novo: false }] })));
  button('Adicionar').props.onClick();
  await flush();
  change('Novo: Marca', 'Do not overwrite');
  button('Adicionar ficha a proposta').props.onClick();
  await flush();
  expect(renderToStaticMarkup(render())).toContain('a ficha nova nao sera aplicada');
  expect(button('Submeter associa').props.disabled).toBe(true);
});

it('prevents duplicate items and clears creation fields on serial/type changes', async () => {
  button('Ship One').props.onClick();
  await flush();
  change('assoc-tipo', 'colete');
  change('assoc-serial', 'LJ-22');
  change('Proxima inspecao / recarga', '2020-01-02');
  button('Adicionar').props.onClick();
  await flush();
  change('assoc-serial', 'LJ-22');
  change('Proxima inspecao / recarga', '2020-01-02');
  button('Adicionar').props.onClick();
  expect(renderToStaticMarkup(render())).toContain('Equipamento repetido');
  change('assoc-serial', 'NEW-LJ');
  jest.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ itens: [{ novo: true }] })));
  button('Adicionar').props.onClick();
  await flush();
  expect(renderToStaticMarkup(render())).toContain('<fieldset');
  change('assoc-tipo', 'epirb');
  expect(renderToStaticMarkup(render())).not.toContain('<fieldset');
});

it('does not display stale equipment or allow associating to a newly selected ship after a failed load', async () => {
  button('Ship One').props.onClick();
  await flush();
  jest.mocked(fetch).mockResolvedValue(new Response('{}', { status: 403 }));
  button('Ship Two').props.onClick();
  await flush();
  expect(elements(render()).some(el => el.props.id === 'assoc-serial')).toBe(false);
});

it('ignores a slower response from the previously selected ship', async () => {
  let resolveFirst!: (value: Response) => void;
  jest.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; }))
    .mockResolvedValueOnce(new Response(JSON.stringify(shipData(11))));
  button('Ship One').props.onClick();
  button('Ship Two').props.onClick();
  await flush();
  resolveFirst(new Response(JSON.stringify(shipData(10))));
  await flush();
  expect(elements(render()).some(el => el.type === 'input' && el.props.value === '2020-02-29')).toBe(false);
});
