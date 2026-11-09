import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EquipmentReferenceSelect, InspectionResponsibleField, inspectionResponsibleName } from './JangadaDetailFields';
import { jangadaSaveChanges } from '@/lib/jangada-form';

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<{ children?: React.ReactNode }>(child)
    ? [child, ...elements(child.props.children)] : []);
}

afterEach(() => jest.restoreAllMocks());

it.each([
  [{ responsavel: 'Saved Inspector' }, 'Saved Inspector'],
  [{ checklistSnapshot: { responsavel: 'Snapshot Inspector' } }, 'Snapshot Inspector'],
  [{ ordensServico: [{ tecnicoResponsavel: 'Order Inspector', tecnico: { nome: 'Renamed' } }] }, 'Order Inspector'],
  [{ ordensServico: [{ tecnico: { nome: 'One' } }, { tecnico: { nome: 'Two' } }] }, ''],
  [{}, ''],
])('reads only the inspection technician, never the logged-in user: %j', (inspection, expected) => {
  expect(inspectionResponsibleName(inspection)).toBe(expected);
  const html = renderToStaticMarkup(<InspectionResponsibleField editing={false} inspection={{ id: 190, ...inspection }} onChange={jest.fn()} />);
  expect(html).toContain(expected || '—');
  expect(html).not.toContain('<select');
});

it('preserves the historical name on edit and saves only an explicit technician choice with the inspection version', () => {
  const onChange = jest.fn();
  const technicians = [{ id: 7, nome: 'Allowed Technician' }];
  jest.spyOn(React, 'useState').mockImplementationOnce(() => [technicians, jest.fn()] as any)
    .mockImplementationOnce(() => [false, jest.fn()] as any);
  jest.spyOn(React, 'useEffect').mockImplementation(() => {});
  const node = InspectionResponsibleField({ editing: true, inspection: {
    id: 190, updatedAt: '2026-10-01T00:00:00.000Z', checklistSnapshot: { responsavel: 'Retired Inspector' },
  }, stationId: 2, onChange });
  const tree = elements(node);
  expect(tree.find(el => el.type === 'option')!.props.children).toBe('Retired Inspector');
  expect(tree.find(el => el.type === 'select')!.props.value).toBe('');
  expect(onChange).not.toHaveBeenCalled();
  tree.find(el => el.type === 'select')!.props.onChange({ target: { value: '7' } });
  expect(onChange).toHaveBeenCalledWith({ inspecaoId: 190, tecnicoId: 7, nome: 'Allowed Technician', expectedUpdatedAt: '2026-10-01T00:00:00.000Z' });
  const selection = onChange.mock.calls[0][0];
  expect(jangadaSaveChanges({ inspectionResponsible: selection }, {})).toEqual({ inspectionResponsible: selection });
});

it('loads only real active technicians from the raft station and never automatically selects one', async () => {
  const setTechnicians = jest.fn();
  const onChange = jest.fn();
  let effect: (() => void) | undefined;
  jest.spyOn(React, 'useState').mockImplementationOnce(() => [[], setTechnicians] as any)
    .mockImplementationOnce(() => [false, jest.fn()] as any);
  jest.spyOn(React, 'useEffect').mockImplementation(callback => { effect = callback; });
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ stations: [
    { id: 2, tecnicos: [{ id: 7, nome: 'Allowed', ativo: true }, { id: 8, nome: 'Inactive', ativo: false }, { id: -1000, nome: 'Fallback' }] },
    { id: 3, tecnicos: [{ id: 9, nome: 'Other Station', ativo: true }] },
  ] }) } as Response);
  InspectionResponsibleField({ editing: true, inspection: { id: 190 }, stationId: 2, onChange });
  effect!();
  await new Promise(resolve => setImmediate(resolve));
  expect(fetchMock).toHaveBeenCalledWith('/api/tecnicos?serviceStationId=2', { cache: 'no-store' });
  expect(setTechnicians).toHaveBeenLastCalledWith([{ id: 7, nome: 'Allowed', ativo: true }]);
  expect(onChange).not.toHaveBeenCalled();
});

const items = [
  { id: 4, referencia: 'A10', descricao: 'Valvula de alivio', quantidade: 0 },
  { id: 5, referencia: '007', descricao: 'Cabeca de disparo', quantidade: 2 },
  { id: 6, referencia: 'L-DSB', descricao: 'Recurso de ensaio', quantidade: 0 },
];

it.each(['A10', 'alivio', 'VALVULA'])('searches references and names without selecting or consuming stock: %s', query => {
  const onChange = jest.fn();
  const setQuery = jest.fn();
  jest.spyOn(React, 'useState').mockImplementationOnce(() => [query, setQuery] as any);
  const node = EquipmentReferenceSelect({ items, label: 'Valvulas', value: '007', onChange });
  const tree = elements(node);
  const options = tree.filter(el => el.type === 'option');
  expect(options.map(option => option.props.value)).toEqual(['', '007', 'A10']);
  expect(onChange).not.toHaveBeenCalled();
  tree.find(el => el.type === 'input')!.props.onChange({ target: { value: query } });
  expect(onChange).not.toHaveBeenCalled();
  tree.find(el => el.type === 'select')!.props.onChange({ target: { value: 'A10' } });
  expect(onChange).toHaveBeenCalledWith('A10');
  expect(jangadaSaveChanges({ valvulasAlivio: 'A10' }, { valvulasAlivio: '007' })).toEqual({ valvulasAlivio: 'A10' });
  expect(items[0].quantidade).toBe(0);
});

it('keeps zero-stock resources, exact references and the empty choice, including a missing historical reference', () => {
  const html = renderToStaticMarkup(<EquipmentReferenceSelect items={items} label="Disparo" value="OLD-REF" onChange={jest.fn()} />);
  expect(html).toContain('value="007"');
  expect(html).toContain('value="L-DSB"');
  expect(html).toContain('value="A10"');
  expect(html).toContain('value=""');
  expect(html).toContain('value="OLD-REF" selected');
});
