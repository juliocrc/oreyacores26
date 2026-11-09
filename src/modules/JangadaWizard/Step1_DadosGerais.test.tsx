import React from 'react';
import Step1 from './Step1_DadosGerais';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';

jest.mock('./store/useJangadaWizardStore', () => {
  const actual = jest.requireActual('./store/useJangadaWizardStore');
  return { useJangadaWizardStore: Object.assign(() => actual.useJangadaWizardStore.getState(), actual.useJangadaWizardStore) };
});

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);
}

function changeInput(value: string, nextValue: string) {
  const input = elements(Step1()).find(el => el.type === 'input' && el.props.value === value)!;
  expect(input).toBeDefined();
  input.props.onChange({ target: { value: nextValue } });
}

beforeEach(() => {
  jest.spyOn(React, 'useMemo').mockImplementation(fn => fn());
  jest.spyOn(React, 'useEffect').mockImplementation(() => {});
  useJangadaWizardStore.getState().initializeWizard({ brand: 'RFD', model: 'Surviva' }, { dataInspecao: '2026-10-25' });
});

afterEach(() => jest.restoreAllMocks());

it('sends only the changed field so the store can calculate a backdated inspection horizon', () => {
  const original = useJangadaWizardStore.getState().setInspectionData;
  const setInspectionData = jest.fn(original);
  useJangadaWizardStore.setState({ setInspectionData });
  try {
    changeInput('2026-10-25', '2026-03-03');
    expect(setInspectionData).toHaveBeenLastCalledWith({ dataInspecao: '2026-03-03' });
    expect(useJangadaWizardStore.getState().inspectionData.dataProxInspecao).toBe('2027-03-03');
    changeInput('2026-03-03', '2025-04-15');
    expect(useJangadaWizardStore.getState().inspectionData.dataProxInspecao).toBe('2026-04-15');
  } finally {
    useJangadaWizardStore.setState({ setInspectionData: original });
  }
});

it('preserves a manually supplied next inspection when the inspection date changes', () => {
  changeInput('2027-10-25', '2028-05-10');
  changeInput('2026-10-25', '2026-03-03');
  changeInput('RFD', 'EUROVINIL');
  changeInput('Surviva', 'EASY');
  expect(useJangadaWizardStore.getState().inspectionData.dataProxInspecao).toBe('2028-05-10');
});

it('delegates brand/model interval exceptions to the store without freezing automatic dates', () => {
  changeInput('RFD', 'EUROVINIL');
  changeInput('Surviva', 'EASY');
  expect(useJangadaWizardStore.getState().inspectionData.dataProxInspecao).toBe('2030-10-25');
  changeInput('2026-10-25', '2026-03-03');
  expect(useJangadaWizardStore.getState().inspectionData.dataProxInspecao).toBe('2030-03-03');
});

it('keeps copied HRU validity aliases synchronized without freezing the automatic horizon', () => {
  useJangadaWizardStore.getState().setInspecoes([{ status: 'Concluida', dataInspecao: '2025-03-03', hruValidade: '02/2031' }]);
  const copy = elements(Step1()).find(el => el.type === 'button' && String(el.props.title).startsWith('Copiar dados'))!;
  copy.props.onClick();
  expect(useJangadaWizardStore.getState().inspectionData).toMatchObject({ hruValidade: '02/2031', hruExpiry: '02/2031' });
  changeInput('2026-10-25', '2026-03-03');
  expect(useJangadaWizardStore.getState().inspectionData.dataProxInspecao).toBe('2027-03-03');
});
