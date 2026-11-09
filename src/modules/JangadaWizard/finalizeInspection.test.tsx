import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Step8 from './Step8_ResumoFinal';
import { computeFinishWarnings, finalizeInspectionStandalone, persistInspection } from './finalizeInspection';
import { ALL_CHECKLIST_IDS, getChecklistCompletionErrors } from './checklistValidation';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { appToast } from '@/lib/app-toast';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock('@/lib/app-toast', () => ({ appToast: { error: jest.fn(), success: jest.fn(), warning: jest.fn() } }));
jest.mock('@/lib/offline-sync/client', () => ({ enqueueOfflineSyncOperation: jest.fn(() => true) }));
jest.mock('./store/useJangadaWizardStore', () => {
  const actual = jest.requireActual('./store/useJangadaWizardStore').useJangadaWizardStore;
  return { useJangadaWizardStore: Object.assign(jest.fn(() => actual.getState()), actual) };
});

const completeChecklist = () => Object.fromEntries(ALL_CHECKLIST_IDS.map(id => [id, { status: 'NA' }]));
const lotWarnings = (data: any) => computeFinishWarnings(data).filter(w => w.text.includes('stockId'));

beforeEach(() => {
  jest.clearAllMocks();
  useJangadaWizardStore.getState().initializeWizard({ id: 1 });
  useJangadaWizardStore.getState().setGlobalStock([]);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 12, updatedAt: '2026-10-02T00:00:00.000Z', raftUpdatedAt: '2026-10-02T00:00:00.000Z' }) });
});

it.each(['network', 'server', 'missing-id'])('warns against repeating an unconfirmed save (%s)', async failure => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  if (failure === 'network') jest.mocked(global.fetch).mockRejectedValueOnce(new Error('connection lost'));
  else if (failure === 'server') jest.mocked(global.fetch).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'failure' }) } as Response);
  else jest.mocked(global.fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as Response);
  try {
    await persistInspection({ isFinal: false });
    expect(appToast.error).toHaveBeenCalledWith(expect.stringContaining('Consulte o histórico antes de tentar novamente'), 12000);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  } finally {
    jest.restoreAllMocks();
  }
});

it('names each missing assessment and treats both N/A spellings as assessed', () => {
  const checklist = completeChecklist();
  checklist.cobertura_exterior.status = '';
  checklist.saida_antena.status = 'N/A';
  expect(getChecklistCompletionErrors({ checklist })).toEqual(['cobertura exterior: por verificar.']);
  expect(computeFinishWarnings({ checklist, brand: ' ', model: '' })).toEqual(expect.arrayContaining([
    expect.objectContaining({ text: 'Marca da jangada não definida.', stepKey: 'dados' }),
    expect.objectContaining({ text: 'Modelo da jangada não definido.', stepKey: 'dados' }),
  ]));
});

it('merges failed equipment, expiry and missing stock selection per article', () => {
  const warnings = computeFinishWarnings({ dataProxInspecao: '2027-06', checklist: completeChecklist(),
    packItems: { flare: { name: 'Hand Flare', quantidade: 1, validade: '2027-05', lote: 'MANUAL' } },
    componentes: [{ id: 'light', type: 'Luz', estado: 'REPROVADO', validade: '2027-05' }],
    testes: { testeWP: 'REPROVOU', testeNAP: 'N/A' },
  });
  const flare = warnings.filter(w => w.articleKey === 'pack:flare');
  expect(flare).toHaveLength(1);
  expect(flare[0]).toMatchObject({ blocksCompletion: true, text: expect.stringContaining('stockId') });
  expect(flare[0].text).toContain('expira antes');
  const light = warnings.filter(w => w.articleKey === 'componentes:light');
  expect(light).toHaveLength(1);
  expect(light[0].text).toContain('REPROVADO');
  expect(warnings.filter(w => w.stepKey === 'testes')).toEqual([
    expect.objectContaining({ text: 'Teste WP: REPROVOU.' }),
  ]);
});

it('requires stockId, not a universal lot string, for dated or ambiguous replacements', () => {
  const pack = (item: any, globalStock: any[] = []) => ({ packItems: { item }, globalStock });
  expect(lotWarnings(pack({ name: 'Hand Flare', quantidade: 1, validade: '2035-01', lote: 'TEXT' }))).toHaveLength(1);
  expect(lotWarnings(pack({ name: 'Hand Flare', quantidade: 1, validade: '2035-01', stockId: 42 }))).toEqual([]);
  expect(lotWarnings(pack({ name: 'Apito', quantidade: 1, referencia: 'A' }))).toEqual([]);
  expect(lotWarnings(pack({ name: 'Apito', quantidade: 1, referencia: 'A' }, [
    { id: 1, referencia: 'A' }, { id: 2, referencia: 'A' },
  ]))).toHaveLength(1);
  expect(lotWarnings({ orcamento: { linhas: [{ source: 'service', referencia: 'MO', quantidade: 1 }] } })).toEqual([]);
  expect(lotWarnings({ hruAplicavel: 'NAO', hruSubstituido: true })).toEqual([]);
  expect(lotWarnings({ hruAplicavel: 'SIM', hruSubstituido: true, hruExpiry: '2035-01' })).toHaveLength(1);
  expect(lotWarnings({ componentes: [{ id: 'x', type: 'Bateria', estado: 'SUBSTITUIDO', validade: '2035-01' }] })).toHaveLength(1);
});

it('does not merge different articles sharing the same name or reference', () => {
  const warnings = computeFinishWarnings({ dataProxInspecao: '2027-06', packItems: {
    a: { name: 'Hand Flare', referencia: 'F', quantidade: 1, validade: '2027-05', stockId: 41 },
    b: { name: 'Hand Flare', referencia: 'F', quantidade: 1, validade: '2027-05', stockId: 42 },
  } }).filter(w => w.stepKey === 'pack');
  expect(warnings.map(w => w.articleKey)).toEqual(['pack:a', 'pack:b']);
});

it('retains justified exceptions without new expiry blockers and honors abate', () => {
  const data = { dataProxInspecao: '2027-06', checklist: completeChecklist(), packItems: {
    flare: { name: 'Hand Flare', quantidade: 1, validade: '2027-05', stockId: 42, justificacaoNaoSubstituicao: 'Motivo documentado' },
  } };
  expect(computeFinishWarnings(data).filter(w => w.blocksCompletion)).toEqual([]);
  expect(computeFinishWarnings({ ...data, abate: { ativo: true, motivo: 'Danos' } }).filter(w => w.blocksCompletion)).toEqual([]);
  expect(computeFinishWarnings({ ...data, abate: { ativo: true, motivo: '' } }).filter(w => w.blocksCompletion)).toEqual([
    expect.objectContaining({ text: expect.stringContaining('ABATE') }),
  ]);
});

it('opens final document review without saving when invoked from an earlier step', () => {
  useJangadaWizardStore.getState().setStepByKey('dados');
  finalizeInspectionStandalone();
  expect(useJangadaWizardStore.getState().currentStepKey()).toBe('certificados');
  expect(appToast.error).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  const html = renderToStaticMarkup(<Step8 />);
  expect(html).toContain('lista consolidada');
  expect(html).toContain('cobertura exterior: por verificar.');
  expect(html).toContain('Corrigir Passo');
  expect(html).toContain('Requer confirmação');
  expect(html).not.toContain('Impede a conclusão');
});

it('allows final persistence even with missing concrete stock, preserving the draft flow', async () => {
  useJangadaWizardStore.getState().setInspectionData({ checklist: completeChecklist(), dataProxInspecao: '2027-06',
    packItems: { flare: { name: 'Hand Flare', checklistName: 'flare', quantidade: 1, validade: '2035-01', lote: 'TEXT' } },
  });
  await persistInspection({ isFinal: true });
  expect(fetch).toHaveBeenCalled();
  await persistInspection({ isFinal: false });
});

it('marks only the submitted snapshot as server-persisted after a successful response', async () => {
  const store = useJangadaWizardStore.getState();
  store.setInspectionData({ serial: 'SAVED' });
  expect(useJangadaWizardStore.getState().hasServerChanges).toBe(true);
  await persistInspection({ isFinal: false });
  expect(useJangadaWizardStore.getState().hasServerChanges).toBe(false);
  store.setInspectionData({ serial: 'UNSAVED' });
  (fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({ error: 'Locked' }), { status: 409 }));
  await persistInspection({ isFinal: false });
  expect(useJangadaWizardStore.getState().hasServerChanges).toBe(true);
});

describe('optimistic edit versions', () => {
  const raftToken = '2026-10-01T00:00:00.000Z';
  const inspectionToken = '2026-10-01T01:00:00.000Z';
  const newRaftToken = '2026-10-02T00:00:00.000Z';
  const newInspectionToken = '2026-10-02T01:00:00.000Z';
  let descriptor: PropertyDescriptor | undefined;
  let drafts: Map<string, string>;
  beforeEach(() => {
    descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    drafts = new Map();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      setItem: (key: string, value: string) => drafts.set(key, value),
      getItem: (key: string) => drafts.get(key) ?? null,
      removeItem: (key: string) => drafts.delete(key),
    } });
    useJangadaWizardStore.getState().initializeWizard({ id: 1, updatedAt: raftToken }, { id: 12, updatedAt: inspectionToken });
    useJangadaWizardStore.getState().setInspectionData({ serial: 'LOCAL EDIT' });
  });
  afterEach(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
  const sentBody = (index: number) => JSON.parse((fetch as jest.Mock).mock.calls[index][1].body);

  it('preserves the original tokens and draft on EDIT_CONFLICT without reopening or retrying', async () => {
    (fetch as jest.Mock).mockResolvedValue(response({ code: 'EDIT_CONFLICT', error: 'Conflito: compare os dados.' }, 409));
    await persistInspection({ isFinal: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sentBody(0)).toMatchObject({ expectedUpdatedAt: inspectionToken, expectedRaftUpdatedAt: raftToken });
    expect(JSON.parse(drafts.get('jangada-wizard-draft-1')!)).toMatchObject({
      inspectionData: { serial: 'LOCAL EDIT' },
      editVersions: { expectedUpdatedAt: inspectionToken, expectedRaftUpdatedAt: raftToken },
    });
    expect(useJangadaWizardStore.getState().hasServerChanges).toBe(true);
    expect(appToast.error).toHaveBeenCalledWith('Conflito: compare os dados.', 9000);
  });

  it('uses the token committed by the inspection for the second raft request', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce(response({ id: 12, updatedAt: newInspectionToken, raftUpdatedAt: newRaftToken }))
      .mockResolvedValueOnce(response({ updatedAt: '2026-10-03T00:00:00.000Z' }));
    await persistInspection({ isFinal: false });
    expect(sentBody(1).expectedUpdatedAt).toBe(newRaftToken);
    expect(useJangadaWizardStore.getState().editVersions).toEqual({ expectedUpdatedAt: newInspectionToken, expectedRaftUpdatedAt: '2026-10-03T00:00:00.000Z' });
    expect(useJangadaWizardStore.getState().hasServerChanges).toBe(false);
  });

  it('keeps local changes dirty and the intermediate committed tokens if the second request fails', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce(response({ id: 12, updatedAt: newInspectionToken, raftUpdatedAt: newRaftToken }))
      .mockResolvedValueOnce(response({ code: 'EDIT_CONFLICT', error: 'Outra gravacao intercalada.' }, 409));
    await persistInspection({ isFinal: false });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(useJangadaWizardStore.getState().hasServerChanges).toBe(true);
    expect(JSON.parse(drafts.get('jangada-wizard-draft-1')!)).toMatchObject({
      inspectionData: { serial: 'LOCAL EDIT' },
      editVersions: { expectedUpdatedAt: newInspectionToken, expectedRaftUpdatedAt: newRaftToken },
    });
  });

  it('does not send an unguarded second PUT or clear dirty data when a success response lacks a version', async () => {
    (fetch as jest.Mock).mockResolvedValue(response({ id: 12, updatedAt: newInspectionToken }));
    await persistInspection({ isFinal: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(useJangadaWizardStore.getState().hasServerChanges).toBe(true);
    expect(useJangadaWizardStore.getState().editVersions).toEqual({ expectedUpdatedAt: inspectionToken, expectedRaftUpdatedAt: raftToken });
    expect(drafts.has('jangada-wizard-draft-1')).toBe(true);
  });
});

it('does not mark an offline queue entry as persisted on the server', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { navigator: { onLine: false }, location: { search: '' } } });
  try {
    useJangadaWizardStore.getState().setInspectionData({ serial: 'OFFLINE' });
    await persistInspection({ isFinal: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(useJangadaWizardStore.getState().hasServerChanges).toBe(true);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

it('retains edits made while a submitted snapshot is being saved', async () => {
  const store = useJangadaWizardStore.getState();
  store.setInspectionData({ serial: 'SUBMITTED' });
  (fetch as jest.Mock).mockImplementation(async () => {
    store.setInspectionData({ serial: 'NEWER EDIT' });
    return { ok: true, json: async () => ({ id: 12, updatedAt: '2026-10-02T00:00:00.000Z', raftUpdatedAt: '2026-10-02T00:00:00.000Z' }) };
  });
  await persistInspection({ isFinal: false });
  expect(useJangadaWizardStore.getState().inspectionData.serial).toBe('NEWER EDIT');
  expect(useJangadaWizardStore.getState().pendingServerChanges.data).toBe(true);
});
