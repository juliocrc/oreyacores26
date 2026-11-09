import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isSosRaft } from '@/lib/raft-model-rules';
import { withoutSosEquipment } from './sosRules';
import { HRU_STOCK_REFERENCE } from '@/lib/stock-reference-rules';
import { getWizardSteps } from './steps';
import { getStepProgress } from './progress';
import { getAutomaticRaftTests, getTestRecommendations } from '../rafts/testRules';
import { buildCertificatePayload } from './buildCertificatePayload';
import { buildClosureSuggestions } from './containerClosure';
import { buildChecklistInitialValues, buildInspectionChecklistFromQuadro } from '../inspectionChecklist';
import { computeFinishWarnings, persistInspection } from './finalizeInspection';
import { ALL_CHECKLIST_IDS } from './checklistValidation';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import Step3 from './Step3_Componentes';
import Step8 from './Step8_ResumoFinal';
import Step5 from './Step5_Cilindros';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/app-toast', () => ({ appToast: { error: jest.fn(), success: jest.fn(), warning: jest.fn() } }));
jest.mock('@/lib/offline-sync/client', () => ({ enqueueOfflineSyncOperation: jest.fn() }));
jest.mock('./store/useJangadaWizardStore', () => {
  const actual = jest.requireActual('./store/useJangadaWizardStore').useJangadaWizardStore;
  return { useJangadaWizardStore: Object.assign(jest.fn(() => actual.getState()), actual) };
});

const fixture = (): any => ({
  brand: 'PLASTIMO', model: 'SOS', serial: 'SOS-1', dataProxInspecao: '2027-10-01',
  packType: 'Sem pack', responsavel: 'Tecnico', applicableServiceBulletins: [],
  checklist: Object.fromEntries(ALL_CHECKLIST_IDS.map(id => [id, { status: 'NA' }])),
  hruAplicavel: 'SIM', hruReference: 'HAMMAR H20', hruExpiry: '2001-01', hruSubstituido: true,
  testes: { testeWP: 'REPROVOU', testeGI: 'YES', wpCamaraSupInicio: '200', wpTempInicio: '20' },
  testeWP: 'REPROVOU', testeCamaras: { stale: true }, dataUltimoGi: '2001-01',
  componentes: [{ id: 'old-hru', type: 'HRU', estado: 'SUBSTITUIDO', reference: 'HAMMAR H20' }],
  containerClosureItems: [{ kind: 'hru', referencia: 'HRU', quantidade: 1 }],
  cylinder: { serial: 'C1', pesoBruto: '10', dataProxTeste: '2001-01' },
});

it.each(['SURVITEC', 'VIKING', 'LALIZAS', 'ZODIAC', 'PLASTIMO', 'EUROVINIL'])('does not classify %s as SOS by brand alone', brand => {
  expect(isSosRaft({ brand, model: 'SOLAS' })).toBe(false);
});

it('shares explicit model/brand and Arimar serial semantics with documents', () => {
  expect(isSosRaft({ brand: 'EUROVINIL', model: 'Eurovinil SOS' })).toBe(true);
  expect(isSosRaft({ brand: 'ARIMAR', serial: 'AO-123', model: 'Coastal' })).toBe(true);
  expect(isSosRaft({ brand: 'PLASTIMO', serial: 'AO-123', model: 'Coastal' })).toBe(false);
  expect(isSosRaft({ brand: 'SOS' })).toBe(true);
});

it('filters canonical HRU stock references even when old descriptions and kind are missing', () => {
  const data = { ...fixture(), componentes: [{ reference: HRU_STOCK_REFERENCE }],
    containerClosureItems: [{ referencia: HRU_STOCK_REFERENCE }],
    orcamento: { linhas: [{ referencia: HRU_STOCK_REFERENCE }] } };
  expect(withoutSosEquipment(data)).toMatchObject({ componentes: [], containerClosureItems: [], orcamento: { linhas: [] } });
});

it('skips tests, stale WP-driven repair and test progress while preserving non-SOS flow', () => {
  const data = fixture();
  expect(getWizardSteps(data).map(s => s.key)).not.toEqual(expect.arrayContaining(['testes', 'reparacoes']));
  expect(getStepProgress(data).some(s => s.step === 'testes')).toBe(false);
  expect(getTestRecommendations(data)).toEqual([]);
  expect(getAutomaticRaftTests(data)).toMatchObject({ testeWP: 'N/A', testeGI: 'N/A', testeNAP: 'N/A', testeFS: 'N/A', testeDL: 'N/A' });
  expect(getWizardSteps({ ...data, model: 'SOLAS' }).map(s => s.key)).toEqual(expect.arrayContaining(['testes', 'reparacoes']));
});

it('excludes stale HRU/tests from certificates, validation, suggestions and worksheet fields without mutating history', () => {
  const data = fixture();
  const original = JSON.stringify(data);
  const payload = buildCertificatePayload(data);
  expect(payload.checklist).toEqual({});
  expect(JSON.stringify(payload)).not.toMatch(/HAMMAR|REPROVOU|wpUpper|hruReference|napTestDone|cylinderHydroTestDate/);
  expect(computeFinishWarnings(data).filter(w => w.articleKey === 'hru' || w.stepKey === 'testes')).toEqual([]);
  expect(computeFinishWarnings(data).filter(w => w.blocksCompletion)).toEqual([]);
  expect(buildClosureSuggestions(data).some(s => s.kind === 'hru')).toBe(false);
  expect(buildInspectionChecklistFromQuadro(data).flatMap(s => s.fields).some(f => f.name.startsWith('plastimo_pressure_test'))).toBe(false);
  const defaults = buildChecklistInitialValues(buildInspectionChecklistFromQuadro(data), data);
  expect(defaults).not.toHaveProperty('wp_rule');
  expect(defaults).not.toHaveProperty('next_gi_date');
  expect(withoutSosEquipment({ ...data, checklist: { plastimo_pressure_test_start_time: '12:00', next_gi_date: '2001-01', hru_serial: 'OLD' } }).checklist).toEqual({});
  expect(JSON.stringify(data)).toBe(original);
  const regular = { ...data, model: 'SOLAS' };
  expect(withoutSosEquipment(regular)).toBe(regular);
  expect(buildCertificatePayload(regular).hruReference).toBe('HAMMAR H20');
});

it('hides the HRU editor and stale HRU summary exceptions', () => {
  useJangadaWizardStore.getState().initializeWizard({ id: 1 });
  useJangadaWizardStore.getState().setInspectionData(fixture());
  expect(renderToStaticMarkup(<Step3 />)).not.toContain('HRU Aplicável');
  expect(renderToStaticMarkup(<Step5 />)).not.toContain('Teste Hidráulico');
  expect(renderToStaticMarkup(<Step8 />)).not.toContain('HRU:');
});

it('omits HRU/test writes during the shared final persistence but retains the source draft', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { removeItem: jest.fn(), setItem: jest.fn() } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { getElementById: () => null } });
  try {
  const store = useJangadaWizardStore.getState();
  store.initializeWizard({ id: 1 });
  store.setInspectionData(fixture());
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 12, updatedAt: '2026-10-02T00:00:00Z', raftUpdatedAt: '2026-10-02T00:00:00Z' }) });
   await persistInspection({ isFinal: true });
  const writes = (fetch as jest.Mock).mock.calls.filter(([, init]) => init?.body).map(([, init]) => JSON.parse(init.body));
  expect(writes).toHaveLength(2);
  expect(writes[0].status).toBe('Concluída');
  expect(writes[0].artigosSubstituidos).toEqual([]);
  for (const body of writes) expect(JSON.stringify(body)).not.toMatch(/HAMMAR|REPROVOU|testeWP|hruReference|hruReferencia|2001-01/);
  expect(useJangadaWizardStore.getState().inspectionData.hruReference).toBe('HAMMAR H20');
  expect(useJangadaWizardStore.getState().currentStepKey()).toBe('certificados');
  expect(useJangadaWizardStore.getState().hasServerChanges).toBe(false);
  } finally {
    jest.restoreAllMocks();
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
