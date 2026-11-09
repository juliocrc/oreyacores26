import { useJangadaWizardStore as store } from './useJangadaWizardStore';

beforeEach(() => store.getState().initializeWizard({ id: 10, serial: 'RAFT' }, {
  id: 101, dataInspecao: '2026-10-01', dataProxInspecao: '2027-10-01',
}));

const context = { jangadaId: 10, inspecaoId: 101 };

it('does not equate local autosave or isDirty with persistence on the server', () => {
  store.getState().setInspectionData({ owner: 'Changed' });
  store.getState().setLastSaved(new Date());
  store.getState().setIsDirty(false);
  expect(store.getState().isDirty).toBe(false);
  expect(store.getState().hasServerChanges).toBe(true);
  store.getState().markServerPersisted(store.getState().inspectionData, context);
  expect(store.getState().hasServerChanges).toBe(false);
});

it('keeps edits made during an in-flight save pending', () => {
  store.getState().setInspectionData({ owner: 'Submitted' });
  const submitted = store.getState().inspectionData;
  store.getState().setInspectionData({ owner: 'Newer edit' });
  store.getState().markServerPersisted(submitted, context);
  expect(store.getState().pendingServerChanges.data).toBe(true);
});

it('separates late signatures from review and inspection data, including clearing signatures', () => {
  const data = store.getState().inspectionData;
  store.getState().setInspectionData({ signatureBase64: 'signature', orcamento: {
    linhas: [], valorMaoObra: 0, valorDesconto: 0, isIsentoIva: false,
    certificadoRevisao: { status: 'aprovado' },
  } });
  expect(store.getState().pendingServerChanges).toEqual({ data: false, review: true, signatures: true });
  store.getState().markServerPersisted(store.getState().inspectionData, { ...context, sections: ['signatures'] });
  expect(store.getState().pendingServerChanges).toEqual({ data: false, review: true, signatures: false });
  store.getState().setInspectionData({ signatureBase64: '' });
  expect(store.getState().pendingServerChanges.signatures).toBe(true);
  store.getState().markServerPersisted(store.getState().inspectionData, context);
  expect(store.getState().hasServerChanges).toBe(false);
  expect(data.signatureBase64).toBe('');
});

it('does not leave signature-only edits pending forever after saving them', () => {
  store.getState().setInspectionData({ clienteNomeAssinatura: 'Captain' });
  store.getState().markServerPersisted(store.getState().inspectionData, { ...context, sections: ['signatures'] });
  expect(store.getState().hasServerChanges).toBe(false);
});

it('ignores stock hydration and fingerprints objects independently of key order', () => {
  store.getState().setInspectionData({ globalStock: [], checklist: { b: { status: 'OK' }, a: { status: 'OK' } } });
  store.getState().markServerPersisted(store.getState().inspectionData, context);
  store.getState().setInspectionData({ checklist: { a: { status: 'OK' }, b: { status: 'OK' } } });
  expect(store.getState().hasServerChanges).toBe(false);
});

it('does not acknowledge an old request against another raft or inspection', () => {
  const submitted = store.getState().inspectionData;
  store.getState().initializeWizard({ id: 20 });
  store.getState().markServerPersisted(submitted, context);
  expect(store.getState().hasServerChanges).toBe(true);
  expect(store.getState().serverBaseline.data).toBeNull();
});

it('resets local saving status on initialization without losing the server distinction', () => {
  store.getState().setLastSaved(new Date());
  store.getState().setIsDirty(true);
  store.getState().initializeWizard({ id: 10 }, { id: 101 });
  expect(store.getState()).toMatchObject({ isDirty: false, lastSaved: null, hasServerChanges: false });
});
