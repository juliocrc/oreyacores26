import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Step3 from './Step3_Componentes';
import Step8 from './Step8_ResumoFinal';
import { getArticleExpiryWarnings, isComponentExpiryControlled } from './articleExpiry';
import { computeFinishWarnings, persistInspection } from './finalizeInspection';
import { ALL_CHECKLIST_IDS } from './checklistValidation';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import type { ComponenteItem } from './types';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/app-toast', () => ({ appToast: { error: jest.fn(), success: jest.fn(), warning: jest.fn() } }));
jest.mock('@/lib/offline-sync/client', () => ({ enqueueOfflineSyncOperation: jest.fn() }));
jest.mock('./store/useJangadaWizardStore', () => {
  const actual = jest.requireActual('./store/useJangadaWizardStore');
  // SSR otherwise reads Zustand's initial snapshot instead of this test's fixture.
  return { useJangadaWizardStore: Object.assign(() => actual.useJangadaWizardStore.getState(), actual.useJangadaWizardStore) };
});

type Component = ComponenteItem & { expiryControlled?: boolean };

function component(expiryControlled: boolean | undefined, validade: string): Component {
  return { id: 'valve', type: 'Valve Test', reference: 'VALVE', stockId: 42, serialLote: '', estado: 'SUBSTITUIDO', validade, ...(expiryControlled === undefined ? {} : { expiryControlled }) };
}

beforeEach(() => {
  const store = useJangadaWizardStore.getState();
  store.initializeWizard({ brand: 'RFD', model: 'Surviva', serial: 'RAFT', packType: 'SOLAS A' });
  useJangadaWizardStore.setState({ jangadaId: null, shipId: null });
  store.setInspectionData({
    dataInspecao: '2026-06-01', dataProxInspecao: '2027-06-01',
    responsavel: 'Técnico', applicableServiceBulletins: [],
    checklist: Object.fromEntries(ALL_CHECKLIST_IDS.map(id => [id, { status: id.startsWith('luz_') ? 'NA' : 'OK' }])),
    packItems: {}, globalStock: [], componentes: [], testes: {} as never,
    cylinder: { serial: 'CYLINDER', pesoBruto: '10' } as never,
    hruAplicavel: 'SIM', hruReference: '20701002', hruDataInstalacao: '06/2026', hruExpiry: '2035-12', hruValidade: '2035-12',
  });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 2 }) });
});

it.each([
  [false, ''],
  [false, 'invalid'],
  [undefined, ''],
] as const)('non-dated components (%s, %s) have no expiry warnings and can finalize', async (flag, validity) => {
  const item = component(flag, validity);
  expect(isComponentExpiryControlled(item)).toBe(false);
  useJangadaWizardStore.getState().setInspectionData({ componentes: [item] });
  const data = useJangadaWizardStore.getState().inspectionData;
  expect(getArticleExpiryWarnings(data)).toEqual([]);
  expect(computeFinishWarnings(data).filter(w => w.isCritical)).toEqual([]);
  const step3 = renderToStaticMarkup(<Step3 />);
  expect(step3).toContain('Todos conformes');
  expect(step3).not.toContain('Requer aten\u00e7\u00e3o');
  const summary = renderToStaticMarkup(<Step8 />);
  expect(summary).not.toContain('Falta definir a validade em');
  expect(summary).not.toContain('Valve Test:');
  await persistInspection({ isFinal: true });
  expect(fetch).toHaveBeenCalledTimes(1);
  const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
  expect(body.status).toBe('Conclu\u00edda');
  expect(body.checklistSnapshot._articleExpiry.componentes).toEqual([item]);
});

it.each([
  [true, ''],
  [true, 'invalid'],
  [true, '2027-05'],
  [undefined, 'invalid'],
  [undefined, '2027-05'],
] as const)('dated components (%s, %s) require attention and cannot finalize unresolved', async (flag, validity) => {
  const item = component(flag, validity);
  expect(isComponentExpiryControlled(item)).toBe(true);
  useJangadaWizardStore.getState().setInspectionData({ componentes: [item] });
  const data = useJangadaWizardStore.getState().inspectionData;
  expect(getArticleExpiryWarnings(data)).toEqual([expect.objectContaining({ stepKey: 'componentes', isCritical: true })]);
  expect(computeFinishWarnings(data).filter(w => w.stepKey === 'componentes')).toEqual([expect.objectContaining({ isCritical: true })]);
  const step3 = renderToStaticMarkup(<Step3 />);
  expect(step3).toContain('Requer aten\u00e7\u00e3o');
  expect(step3).not.toContain('Todos conformes');
  const alertCount = step3.match(/<p class="text-lg font-black text-amber-700[^"]*">([\s\S]*?)<\/p>/)?.[1];
  expect(alertCount).toMatch(/^1(?:<|$)/);
  const summary = renderToStaticMarkup(<Step8 />);
  expect(summary).toContain('aria-label="Exceções consolidadas"');
  expect(summary).toContain('>Valve Test</button>');
  await persistInspection({ isFinal: true });
  expect(fetch).not.toHaveBeenCalled();
});

it.each([true, undefined])('accepts same-month expiry covering the next inspection, including legacy components (flag=%s)', async flag => {
  useJangadaWizardStore.getState().setInspectionData({ componentes: [component(flag, '2027-06')] });
  expect(getArticleExpiryWarnings(useJangadaWizardStore.getState().inspectionData)).toEqual([]);
  expect(renderToStaticMarkup(<Step3 />)).toContain('Todos conformes');
  await persistInspection({ isFinal: true });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each(['', 'invalid'])('does not allow a justification to bypass missing/invalid required expiry (%s)', async validity => {
  useJangadaWizardStore.getState().setInspectionData({ componentes: [{ ...component(true, validity), justificacaoNaoSubstituicao: 'Exception recorded' }] });
  expect(getArticleExpiryWarnings(useJangadaWizardStore.getState().inspectionData)[0].isCritical).toBe(true);
  await persistInspection({ isFinal: true });
  expect(fetch).not.toHaveBeenCalled();
});

it('keeps a required component pending when the next inspection is missing', async () => {
  useJangadaWizardStore.getState().setInspectionData({ componentes: [component(true, '2030-01')], dataProxInspecao: '' });
  expect(renderToStaticMarkup(<Step3 />)).toContain('Requer aten\u00e7\u00e3o');
  await persistInspection({ isFinal: true });
  expect(fetch).not.toHaveBeenCalled();
});
