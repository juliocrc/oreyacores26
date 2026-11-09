import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Checklist, { ChecklistReplacementPicker, getChecklistReplacementItems } from './Checklist';
import Inspections from './Inspections';
import { ReplacementStockPicker } from '@/components/shared/ReplacementStockPicker';
import BarcodeScanner from '@/components/shared/BarcodeScanner';
import * as inspectionChecklist from './inspectionChecklist';

jest.mock('./inspectionChecklist', () => ({
  ...jest.requireActual('./inspectionChecklist'),
  buildInspectionChecklistFromQuadro: jest.fn(() => [{ title: 'Pack', fields: [
    { name: 'saco_agua', label: 'Agua', type: 'checkbox', packItem: { checklistName: 'saco_agua', label: 'Agua', stockReferences: ['WATER', 'ALT'], articleTokens: ['water'], validityFieldName: 'validade_agua', quantity: 2 } },
    { name: 'validade_agua', label: 'Validade Agua', type: 'date' },
  ] }]),
}));

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);
}

function hooks() {
  const states: any[] = [];
  let index = 0;
  jest.spyOn(React, 'useState').mockImplementation((initial?: unknown) => {
    const key = index++;
    if (!(key in states)) states[key] = typeof initial === 'function' ? initial() : initial;
    return [states[key], (value: any) => { states[key] = typeof value === 'function' ? value(states[key]) : value; }] as [unknown, React.Dispatch<unknown>];
  });
  jest.spyOn(React, 'useMemo').mockImplementation(factory => factory());
  jest.spyOn(React, 'useEffect').mockImplementation(() => {});
  return { states, render: (component: () => React.ReactNode) => { index = 0; return elements(component()); } };
}

const rows = [
  { id: 11, referencia: 'WATER', descricao: 'Drinking water', quantidade: 10, quantidadeReservada: 1, lote: 'A', validade: '2031-06-30', codigoBarras: '789' },
  { id: 12, referencia: 'WATER', descricao: 'Drinking water', quantidade: 8, lote: 'B', validade: '2032-06-30' },
  { id: 13, referencia: 'ALT', descricao: 'Alternative water', quantidade: 3, lote: 'C', validade: null },
  { id: 14, referencia: 'OTHER', descricao: 'Drinking water', quantidade: 20, lote: 'D', validade: '2035-01-01' },
  { id: 15, referencia: 'WATER', descricao: 'Drinking water', quantidade: 5, quantidadeReservada: 5, lote: 'E' },
  { id: 16, referencia: 'WATER', descricao: 'Drinking water', quantidade: 3, quantidadeReservada: 2, lote: 'F' },
];
const config = { fieldLabel: 'Agua', stockReferences: ['WATER', 'ALT'], articleTokens: ['water'], validityFieldName: 'validade_agua', quantity: 2 };

afterEach(() => jest.restoreAllMocks());

it('keeps distinct eligible lot rows, accepts configured alternatives, and excludes reserved or insufficient stock', () => {
  expect(getChecklistReplacementItems(rows, config).map(row => row.id)).toEqual([11, 12, 13]);
  expect(rows[0].quantidade).toBe(10);
});

it('uses the shared lot picker only for dated articles and does not confirm when cancelled', () => {
  const harness = hooks();
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const tree = harness.render(() => ChecklistReplacementPicker({ items: rows, config, onSelect, onClose }));
  const picker = tree.find(el => el.type === ReplacementStockPicker)!;
  expect(picker.props.items.map((row: any) => row.id)).toEqual([11, 12, 13]);
  picker.props.onClose();
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSelect).not.toHaveBeenCalled();
});

it('shows lote and expiry for dated stock but no lot or expiry requirement for ordinary stock', () => {
  const dated = renderToStaticMarkup(<ChecklistReplacementPicker items={rows} config={config} onSelect={() => {}} onClose={() => {}} />);
  expect(dated).toContain('Lote: A');
  expect(dated).toContain('06/2031');
  const ordinary = renderToStaticMarkup(<ChecklistReplacementPicker items={[{ id: 20, referencia: 'WHISTLE', descricao: 'Apito', quantidade: 2 }]} config={{ fieldLabel: 'Apito', stockReferences: ['WHISTLE'], articleTokens: [], quantity: 1 }} onSelect={() => {}} onClose={() => {}} />);
  expect(ordinary).toContain('WHISTLE');
  expect(ordinary).not.toMatch(/Lote:|Validade:|Val:/);
});

it('shows catalog photos for ordinary replacement candidates and the current checklist article', () => {
  const items = [{ ...rows[0], foto: '/catalog/water.jpg' }];
  const ordinary = renderToStaticMarkup(<ChecklistReplacementPicker items={items} config={{ ...config, validityFieldName: undefined }} onSelect={jest.fn()} onClose={jest.fn()} />);
  expect(ordinary).toContain('src="/catalog/water.jpg"');
  const checklist = renderToStaticMarkup(<Checklist raft={{ artigos: [] }} initialValues={{ saco_agua_stockId: 11 }} stockItems={items} onSave={jest.fn()} onClose={jest.fn()} />);
  expect(checklist).toContain('src="/catalog/water.jpg"');
  expect(checklist).toContain('alt="Foto de Agua"');
});

it('ordinary barcode scanning filters without selecting or changing inspection data', () => {
  const harness = hooks();
  const onSelect = jest.fn();
  const props = { items: rows, config: { ...config, validityFieldName: undefined }, onSelect, onClose: jest.fn() };
  let tree = harness.render(() => ChecklistReplacementPicker(props));
  tree.find(el => el.type === 'button' && String(el.props.children).startsWith('Ler codigo'))!.props.onClick();
  tree = harness.render(() => ChecklistReplacementPicker(props));
  tree.find(el => el.type === BarcodeScanner)!.props.onScan('ALT');
  tree = harness.render(() => ChecklistReplacementPicker(props));
  expect(onSelect).not.toHaveBeenCalled();
  const candidates = tree.filter(el => el.type === 'button' && el.key?.includes('13'));
  expect(candidates).toHaveLength(1);
  candidates[0].props.onClick();
  expect(onSelect).toHaveBeenCalledWith(rows[2]);
});

it('Checklist confirms the exact selected row, supersedes stale expiry, allows correction, and clears unknown expiry', async () => {
  const harness = hooks();
  const onItemAction = jest.fn().mockResolvedValue(undefined);
  const onSave = jest.fn();
  const props = { raft: { artigos: [] }, initialValues: { saco_agua: false, validade_agua: '2038-01-01', dataProxInspecao: '2027-06-01' }, stockItems: rows, onItemAction, onSave, onClose: jest.fn() };
  let tree = harness.render(() => Checklist(props));
  await tree.find(el => el.props.title === 'Substituir do stock')!.props.onClick();
  tree = harness.render(() => Checklist(props));
  let picker = tree.find(el => el.type === ChecklistReplacementPicker)!;
  picker.props.onClose();
  expect(harness.states[1].validade_agua).toBe('2038-01-01');
  expect(harness.states[1].saco_agua).toBe(false);
  expect(onItemAction).not.toHaveBeenCalled();
  await tree.find(el => el.props.title === 'Substituir do stock')!.props.onClick();
  tree = harness.render(() => Checklist(props));
  picker = tree.find(el => el.type === ChecklistReplacementPicker)!;
  picker.props.onSelect(rows[1]);
  await Promise.resolve();
  expect(onItemAction).toHaveBeenCalledWith('saco_agua', 'replace', expect.anything(), rows[1]);
  expect(harness.states[1]).toMatchObject({ saco_agua: true, saco_agua_stockId: 12, saco_agua_lote: 'B', validade_agua: '2032-06-30' });
  harness.states[0] = 1;
  tree = harness.render(() => Checklist(props));
  tree.find(el => el.type === 'input' && el.props.type === 'date')!.props.onChange({ target: { value: '2033-01-01' } });
  tree = harness.render(() => Checklist(props));
  tree.find(el => el.type === 'button' && el.props.children?.[0] === 'Concluir')!.props.onClick();
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ saco_agua_stockId: 12, saco_agua_lote: 'B', validade_agua: '2033-01-01' }));
  harness.states[0] = 0;
  tree = harness.render(() => Checklist(props));
  await tree.find(el => el.props.title === 'Substituir do stock')!.props.onClick();
  tree = harness.render(() => Checklist(props));
  tree.find(el => el.type === ChecklistReplacementPicker)!.props.onSelect(rows[2]);
  await Promise.resolve();
  expect(harness.states[1]).toMatchObject({ saco_agua_stockId: 13, saco_agua_lote: 'C', validade_agua: '' });
});

it('Inspections selection captures stock ID, lot and selected expiry without inheriting old dates', () => {
  const harness = hooks();
  harness.render(Inspections);
  // Seed the standalone replacement dialog; effects are intentionally disabled.
  harness.states[8] = { saco_agua: false, validade_agua: '2038-01-01' };
  harness.states[13] = { ...config, sourceFieldName: 'saco_agua', articleName: 'Agua' };
  harness.states[14] = rows;
  let tree = harness.render(Inspections);
  const picker = tree.find(el => el.type === ChecklistReplacementPicker)!;
  picker.props.onClose();
  expect(harness.states[8].validade_agua).toBe('2038-01-01');
  harness.states[13] = { ...config, sourceFieldName: 'saco_agua', articleName: 'Agua' };
  tree = harness.render(Inspections);
  tree.find(el => el.type === ChecklistReplacementPicker)!.props.onSelect(rows[1]);
  expect(harness.states[8]).toMatchObject({ saco_agua_stockId: 12, saco_agua_lote: 'B', validade_agua: '2032-06-30' });
  expect(harness.states[16].saco_agua).toMatchObject({ stockId: 12, lote: 'B', validade: '2032-06-30' });
  harness.states[13] = { ...config, sourceFieldName: 'saco_agua', articleName: 'Agua' };
  tree = harness.render(Inspections);
  tree.find(el => el.type === ChecklistReplacementPicker)!.props.onSelect(rows[2]);
  expect(harness.states[8]).toMatchObject({ saco_agua_stockId: 13, saco_agua_lote: 'C', validade_agua: '' });
  expect(harness.states[16].saco_agua).toMatchObject({ stockId: 13, lote: 'C', validade: '' });
  harness.states[13] = { ...config, sourceFieldName: 'saco_agua', articleName: 'Agua' };
  tree = harness.render(Inspections);
  tree.find(el => el.type === ChecklistReplacementPicker)!.props.onSelect(rows[3]);
  expect(harness.states[16].saco_agua.stockId).toBe(13);
  expect(harness.states[8].validade_agua).toBe('');
});

it('Inspections serializes the selected lot and explicitly corrected expiry in snapshot and replacement payload', async () => {
  const harness = hooks();
  harness.render(Inspections);
  harness.states[5] = true;
  harness.states[7] = { ...harness.states[7], date: '2026-06-01', raftId: '1', jangadaSerial: 'TEST' };
  harness.states[8] = { saco_agua: false, validade_agua: '2038-01-01', dataProxInspecao: '2027-06-01' };
  harness.states[9] = true;
  harness.states[12] = { id: 1, serial: 'TEST', artigos: [] };
  harness.states[13] = { ...config, sourceFieldName: 'saco_agua', articleName: 'Agua' };
  harness.states[14] = rows;
  let tree = harness.render(Inspections);
  tree.find(el => el.type === ChecklistReplacementPicker)!.props.onSelect(rows[1]);
  tree = harness.render(Inspections);
  tree.find(el => el.type === 'input' && el.props['aria-label'] === 'Validade: Agua')!.props.onChange({ target: { value: '2033-01' } });
  tree = harness.render(Inspections);
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, json: async () => ({ error: 'Mock API stops after serialization' }) } as Response);
  const originalAlert = globalThis.alert;
  globalThis.alert = jest.fn();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await tree.find(el => el.type === 'form')!.props.onSubmit({ preventDefault: jest.fn() });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]!.body));
    expect(body.checklistSnapshot).toMatchObject({ saco_agua_stockId: 12, saco_agua_lote: 'B', validade_agua: '2033-01-01' });
    expect(body.artigosSubstituidos).toEqual([expect.objectContaining({ stockId: 12, lote: 'B', validade: '2033-01-01', referencia: 'WATER', quantidade: 2 })]);
  } finally { globalThis.alert = originalAlert; }
});

it('Inspections ordinary article selection does not introduce lot or expiry fields', () => {
  const harness = hooks();
  harness.render(Inspections);
  harness.states[13] = { fieldLabel: 'Apito', articleName: 'Apito', sourceFieldName: 'apito', stockReferences: ['WHISTLE'], articleTokens: [], quantity: 1 };
  const item = { id: 20, referencia: 'WHISTLE', descricao: 'Apito', quantidade: 2, lote: 'IGNORE', validade: '2034-01-01' };
  harness.states[14] = [item];
  const tree = harness.render(Inspections);
  tree.find(el => el.type === ChecklistReplacementPicker)!.props.onSelect(item);
  expect(harness.states[8]).toEqual({ apito: true, apito_stockId: 20 });
  expect(harness.states[16].apito).not.toHaveProperty('lote');
  expect(harness.states[16].apito).not.toHaveProperty('validade');
});

it.each([
  { status: 'FALHA', expected: false, reason: '', allowed: false },
  { status: 'FALHA', expected: false, reason: 'Falha documentada apos substituicao', allowed: true },
  { status: '', expected: '', reason: 'Nao dispensa verificacao', allowed: false },
  { status: 'OK', expected: true, reason: '', allowed: true },
])('preserves replacement status $status with reason "$reason" during completion', async ({ status, expected, reason, allowed }) => {
  const harness = hooks();
  harness.render(Inspections);
  harness.states[5] = true;
  harness.states[7] = { ...harness.states[7], date: '2026-06-01', raftId: '1', jangadaSerial: 'TEST' };
  harness.states[8] = { dataProxInspecao: '2027-06-01', saco_agua_justificacaoNaoSubstituicao: reason };
  harness.states[9] = true;
  harness.states[12] = { id: 1, serial: 'TEST', artigos: [] };
  harness.states[13] = { ...config, sourceFieldName: 'saco_agua', articleName: 'Agua' };
  harness.states[14] = rows;
  let tree = harness.render(Inspections);
  tree.find(el => el.type === ChecklistReplacementPicker)!.props.onSelect(rows[1]);
  expect(harness.states[8].saco_agua).toBe(true);
  tree = harness.render(Inspections);
  tree.find(el => el.type === 'select' && el.props['aria-label'] === 'Estado: Agua')!.props.onChange({ target: { value: status } });
  tree = harness.render(Inspections);
  expect(harness.states[8].saco_agua).toBe(expected);
  expect(harness.states[16].saco_agua.stockId).toBe(12);
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, json: async () => ({ error: 'Mock API stops after serialization' }) } as Response);
  const originalAlert = globalThis.alert;
  globalThis.alert = jest.fn();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await tree.find(el => el.type === 'form')!.props.onSubmit({ preventDefault: jest.fn() });
    if (allowed) {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(String(fetchMock.mock.calls[0][1]!.body));
      expect(body.checklistSnapshot.saco_agua).toBe(expected);
      expect(body.artigosSubstituidos[0].stockId).toBe(12);
    } else {
      expect(fetchMock).not.toHaveBeenCalled();
      expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining(status === '' ? 'por verificar' : 'falta justifica'));
    }
  } finally { globalThis.alert = originalAlert; }
});

it('Checklist completion callback omits lot and expiry for a non-expiring selection', async () => {
  await jest.mocked(inspectionChecklist.buildInspectionChecklistFromQuadro).withImplementation(() => [{ title: 'Pack', fields: [
    { name: 'apito', label: 'Apito', type: 'checkbox', packItem: { checklistName: 'apito', stockReferences: ['WHISTLE'], articleTokens: [], quantity: 1 } as any },
  ] }], async () => {
  const harness = hooks();
  const onSave = jest.fn();
  const item = { id: 20, referencia: 'WHISTLE', descricao: 'Apito', quantidade: 2, lote: 'IGNORE', validade: '2034-01-01' };
  const props = { raft: {}, stockItems: [item], onSave, onClose: jest.fn() };
  let tree = harness.render(() => Checklist(props));
  await tree.find(el => el.props.title === 'Substituir do stock')!.props.onClick();
  tree = harness.render(() => Checklist(props));
  tree.find(el => el.type === ChecklistReplacementPicker)!.props.onSelect(item);
  tree = harness.render(() => Checklist(props));
  tree.find(el => el.type === 'button' && el.props.children?.[0] === 'Concluir')!.props.onClick();
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ apito: true, apito_stockId: 20 }));
  expect(onSave.mock.calls[0][0]).not.toHaveProperty('apito_lote');
  expect(onSave.mock.calls[0][0]).not.toHaveProperty('validade_apito');
  });
});
