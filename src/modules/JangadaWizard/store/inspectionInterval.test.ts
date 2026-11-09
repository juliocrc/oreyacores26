import { useJangadaWizardStore } from './useJangadaWizardStore';

it('recalculates automatic dates from a backdated inspection, not today', () => {
  const store = useJangadaWizardStore.getState();
  store.initializeWizard({ brand: 'RFD', model: 'Surviva' });
  store.setInspectionData({ dataInspecao: '2026-03-03' });
  expect(useJangadaWizardStore.getState().inspectionData.dataProxInspecao).toBe('2027-03-03');
  store.setInspectionData({ dataInspecao: '2025-04-15' });
  expect(useJangadaWizardStore.getState().inspectionData.dataProxInspecao).toBe('2026-04-15');
});

it.each(['2027-03-03', '2028-05-10'])('preserves the explicit date %s even when it matched the default', dataProxInspecao => {
  const store = useJangadaWizardStore.getState();
  store.initializeWizard({}, { dataInspecao: '2026-03-03', dataProxInspecao });
  store.setInspectionData({ dataInspecao: '2025-04-15' });
  expect(useJangadaWizardStore.getState().inspectionData.dataProxInspecao).toBe(dataProxInspecao);
  store.initializeWizard({}, { dataInspecao: '2026-03-03' });
  store.setInspectionData({ dataProxInspecao });
  store.setInspectionData({ dataInspecao: '2025-04-15' });
  expect(useJangadaWizardStore.getState().inspectionData.dataProxInspecao).toBe(dataProxInspecao);
});

it.each([
  ['EUROVINIL', 'EASY', null, 4],
  ['VIKING', 'X', { tipoNavio: 'Recreio' }, 3],
  ['RFD', 'X', { tipoNavio: 'Recreio' }, 1],
  ['VIKING', 'X', { tipoNavio: 'Pesca' }, 1],
])('initializes the policy interval for %s %s', (brand, model, shipDetails, years) => {
  useJangadaWizardStore.getState().initializeWizard({ brand, model, shipDetails }, { dataInspecao: '2026-10-24' });
  expect(useJangadaWizardStore.getState().inspectionData.dataProxInspecao).toBe(`${2026 + Number(years)}-10-24`);
});

it('preserves a supplied next inspection date', () => {
  useJangadaWizardStore.getState().initializeWizard({ brand: 'EUROVINIL', model: 'EASY' }, { dataInspecao: '2026-10-24', dataProxInspecao: '2027-03-15' });
  expect(useJangadaWizardStore.getState().inspectionData.dataProxInspecao).toBe('2027-03-15');
});
