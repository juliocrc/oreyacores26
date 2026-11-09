import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ArticleExpiryResolution from './ArticleExpiryResolution';
import { buildArticleExpirySnapshot, getArticleExpiryReason, getArticleExpiryStatus, getArticleExpiryWarnings, getBooleanArticleExpiryErrors, hasHandFlareValiditySource, resolveArticleNextInspection } from './articleExpiry';
import { buildChecklistInitialValues, buildInspectionChecklistFromQuadro, resolveChecklistArticleValidity } from '../inspectionChecklist';
import type { InspectionData } from './types';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';

const sections = [{ title: 'Pack', fields: [{ name: 'validade_fachos_mao', label: 'Fachos', type: 'date' as const }] }];

it('blocks an H20 R replacement until its storage and actual installation are confirmed', () => {
  const base = { hruAplicavel: 'SIM', hruSubstituido: true, hruReference: '20701002', hruStockId: 44,
    dataInspecao: '2026-10-27', dataProxInspecao: '2027-10-27', hruDataInstalacao: '10/2026',
    hruExpiry: '10/2028', hruValidade: '10/2028' } as unknown as InspectionData;
  expect(getArticleExpiryWarnings(base).some(w => w.articleKey === 'hru-hammar')).toBe(true);
  expect(getArticleExpiryWarnings({ ...base, hruHammarVerified: true }).some(w => w.articleKey === 'hru-hammar')).toBe(false);
  expect(getArticleExpiryWarnings({ ...base, hruHammarVerified: true, hruExpiry: '11/2028' }).some(w => w.articleKey === 'hru-hammar')).toBe(false);
  expect(buildArticleExpirySnapshot({ ...base, hruHammarVerified: true })).toMatchObject({ hruDataInstalacao: '10/2026', hruHammarVerified: true });
});

it('calcula o prazo H20 R a partir da instalação e não da validade do stock', () => {
  const base = { hruAplicavel: 'SIM', hruReference: '20701002', hruDataInstalacao: '10/2026', hruExpiry: '01/2020', dataInspecao: '2026-10-01', dataProxInspecao: '2027-10-01' } as Partial<InspectionData>;
  expect(getArticleExpiryWarnings(base).some(w => w.articleKey === 'hru')).toBe(false);
  expect(getArticleExpiryWarnings({ ...base, hruDataInstalacao: '10/2024' }).some(w => w.articleKey === 'hru')).toBe(true);
  expect(getArticleExpiryWarnings({ ...base, hruDataInstalacao: '' }).some(w => w.articleKey === 'hru-installation')).toBe(true);
});

it('não duplica avisos de validade de uma representação genérica do mesmo HRU', () => {
  const data = { hruAplicavel: 'SIM', hruReference: '20701002', hruDataInstalacao: '10/2026', dataInspecao: '2026-10-29', dataProxInspecao: '2027-10-29', componentes: [{ id: 'hru', type: 'HRU', validade: '01/2020', expiryControlled: true }] } as unknown as InspectionData;
  expect(getArticleExpiryWarnings(data).filter(w => w.articleKey.startsWith('componentes:'))).toEqual([]);
  expect(getArticleExpiryWarnings(data).some(w => w.articleKey === 'hru')).toBe(false);
});

it.each(['2026-03-03', '03/03/2026'])('preserves the historical inspection day in %s', dataInspecao => {
  expect(resolveArticleNextInspection({ dataInspecao })).toBe('2027-03-03');
});

it.each([
  ['03/2027', '2027-03-31', 'ok'],
  ['2027-03', '2027-04-01', 'replace'],
  ['02/2028', '2028-02-29', 'ok'],
  ['2028-02-29T00:00:00.000Z', '2028-02-29', 'ok'],
  ['2027-02-29', '2027-02-28', 'pending'],
  ['2027-03-00', '2027-03-03', 'pending'],
  ['2027-03', '2027-02-30', 'pending'],
])('compares civil calendar dates and rejects invalid days (%s, %s)', (validade, next, status) => {
  expect(getArticleExpiryStatus(validade, next)).toBe(status);
});

it.each([
  ['2027-02', 'replace'],
  ['2027-03-02', 'replace'],
  ['02/03/2027', 'replace'],
  ['2027-03-03', 'ok'],
  ['03/03/2027', 'ok'],
  ['2027-03', 'ok'],
  ['03/2027', 'ok'],
  ['2027-08', 'ok'],
  ['2027-09', 'ok'],
])('keeps the historical decision for %s independent of the current clock', (validade, status) => {
  jest.useFakeTimers();
  try {
    for (const now of ['2026-10-25T12:00:00Z', '2032-01-01T12:00:00Z']) {
      jest.setSystemTime(new Date(now));
      const data = {
        dataInspecao: '2026-03-03',
        packItems: { flares: { name: 'Hand Flare', quantidade: 0, validade } },
        componentes: [{ type: 'Bateria', validade }],
        checklist: { luz_interior_bateria: { status: 'OK', validade } },
        hruAplicavel: 'SIM', hruExpiry: validade,
      } as unknown as InspectionData;
      const next = resolveArticleNextInspection(data);
      expect(next).toBe('2027-03-03');
      expect(getArticleExpiryStatus(validade, next)).toBe(status);
      expect(getBooleanArticleExpiryErrors(sections, { validade_fachos_mao: validade }, next)).toHaveLength(status === 'ok' ? 0 : 1);
      expect(getArticleExpiryWarnings(data)).toHaveLength(status === 'ok' ? 1 : 4);
      expect(getArticleExpiryWarnings({ ...data, dataProxInspecao: '2028-03-03' })).toHaveLength(4);
    }
  } finally {
    jest.useRealTimers();
  }
});

it('keeps unknown dates blank even when matching stock has an expiry', () => {
  const datedStock = { validade: '2028-06-01' };
  const raft = { brand: 'RFD', model: 'Surviva MKIII', artigos: [{ name: 'Red Hand Flares', validade: '' }], stock: [datedStock] };
  const initial = buildChecklistInitialValues(buildInspectionChecklistFromQuadro(raft), raft);
  expect(initial.validade_fachos_mao).toBe('');
  expect(resolveChecklistArticleValidity(initial, 'validade_fachos_mao', null, raft.artigos[0])).toBe('');
  expect(resolveChecklistArticleValidity({}, 'validade_fachos_mao', {}, { validade: '2032-01-01' })).toBe('');
  expect(resolveChecklistArticleValidity({ validade_fachos_mao: '' }, 'validade_fachos_mao', null, datedStock)).toBe('');
  expect(getArticleExpiryStatus('', '2027-06-01')).toBe('pending');
});

it.each([
  ['RFD', 'Surviva SOLAS', undefined, '2027-06'],
  ['Lalizas', 'Leisure', { tipoNavio: 'recreio' }, '2029-06'],
  ['RFD', 'Surviva', { tipoNavio: 'recreio' }, '2027-06'],
  ['Eurovinil', 'Easy', undefined, '2030-06'],
])('uses the actual interval for %s %s without changing model exceptions', (brand, model, shipDetails, expected) => {
  const next = resolveArticleNextInspection({ dataInspecao: '2026-06-15', brand, model, shipDetails });
  expect(next.slice(0, 7)).toBe(expected);
  expect(getArticleExpiryReason('2027-05', next)).toContain('expira antes');
});

it('honors an explicit next inspection and leaves unknown inspection dates pending', () => {
  expect(resolveArticleNextInspection({ dataInspecao: '2026-06', dataProxInspecao: '2028-03-15' })).toBe('2028-03-15');
  expect(resolveArticleNextInspection({})).toBe('');
  expect(resolveArticleNextInspection({ dataInspecao: 'invalid' })).toBe('');
});

it('uses a corrected replacement expiry and preserves explicit clearing', () => {
  const replacement = { validade: '2030-01' };
  expect(resolveChecklistArticleValidity({ validade_fachos_mao: '2027-06' }, 'validade_fachos_mao', replacement)).toBe('2027-06');
  expect(resolveChecklistArticleValidity({ validade_fachos_mao: '' }, 'validade_fachos_mao', replacement)).toBe('');
});

it.each([
  ['2027-05', 'replace', 'expira antes'],
  ['2027-06-14', 'replace', 'expira antes'],
  ['2027-06-15', 'ok', ''],
  ['2027-06-30', 'ok', ''],
  ['2027-06', 'ok', ''],
  ['06/2027', 'ok', ''],
  ['2027-11', 'ok', ''],
  ['2027-12', 'ok', ''],
  ['2028-01', 'ok', ''],
])('checks expiry %s through the next inspection, inclusive', (expiry, status, reason) => {
  expect(getArticleExpiryStatus(expiry, '2027-06-15')).toBe(status);
  expect(getArticleExpiryReason(expiry, '2027-06-15')).toContain(reason);
});

it('does not let replacement flags bypass validation but accepts a correction covering the next inspection', () => {
  const values = { validade_fachos_mao: '2027-06-14', validade_fachos_mao_substituido: true };
  expect(getBooleanArticleExpiryErrors(sections, values, '2027-06-15')).toHaveLength(1);
  const html = renderToStaticMarkup(<ArticleExpiryResolution name="Fachos" validade={values.validade_fachos_mao} nextInspection="2027-06-15" replaced reason="" onReasonChange={() => {}} />);
  expect(html).toContain('textarea');
  expect(html).toContain('continua com validade insuficiente');
  expect(getBooleanArticleExpiryErrors(sections, { ...values, validade_fachos_mao_justificacaoNaoSubstituicao: 'Excecao documentada' }, '2027-06-15')).toEqual([]);
  expect(getBooleanArticleExpiryErrors(sections, { ...values, validade_fachos_mao: '2027-06-15' }, '2027-06-15')).toEqual([]);
});

it('retains warnings for insufficient replacement dates and persists per-item exceptions', () => {
  const data = {
    dataProxInspecao: '2029-06-15',
    packItems: { flares: { name: 'Red Hand Flares', quantidade: 2, validade: '2029-05', justificacaoNaoSubstituicao: 'Excecao documentada' } },
    componentes: [{ type: 'Bateria', estado: 'SUBSTITUIDO', validade: '2029-06-14' }],
  } as unknown as InspectionData;
  const warnings = getArticleExpiryWarnings(data);
  expect(warnings).toEqual(expect.arrayContaining([
    expect.objectContaining({ text: expect.stringContaining('expira antes'), isCritical: false }),
    expect.objectContaining({ text: expect.stringContaining('expira antes'), isCritical: true }),
  ]));
  const snapshot = JSON.parse(JSON.stringify(buildArticleExpirySnapshot(data)));
  expect(snapshot.packItems.flares.justificacaoNaoSubstituicao).toBe('Excecao documentada');
  expect(getArticleExpiryWarnings({ ...data, ...snapshot })).toEqual(warnings);
  useJangadaWizardStore.getState().initializeWizard({ id: 1 }, { id: 2, checklistSnapshot: { _articleExpiry: snapshot } });
  expect(useJangadaWizardStore.getState().inspectionData.packItems.flares.justificacaoNaoSubstituicao).toBe('Excecao documentada');
});

it.each(['Fachos de M\u00e3o', 'Fogos de M\u00e3o', 'Handflare', 'Red Hand Flares', 'Hand-flare'])('recognizes validity recorded on %s', name => {
  expect(hasHandFlareValiditySource([{ name, validade: '2028-06' }], {})).toBe(true);
});

it('clears unsupported legacy flare dates but preserves matching saved corrections', () => {
  const values = { validade_fachos_mao: '2028-06-01' };
  expect(hasHandFlareValiditySource([], values)).toBe(false);
  expect(hasHandFlareValiditySource([{ name: 'Hand Flare', validade: '' }], values)).toBe(false);
  expect(hasHandFlareValiditySource([], values, { fachos_mao: { validade: '06/2028' } })).toBe(true);
  expect(hasHandFlareValiditySource([], values, { fachos_mao: { validade: 'invalid' } })).toBe(false);
  expect(hasHandFlareValiditySource([], values, { _articleExpiry: { packItems: { flares: { name: 'Hand Flare', validade: '2028-06' } } } })).toBe(true);
  expect(hasHandFlareValiditySource([], values, { _articleExpiry: { packItems: { flares: { name: 'Hand Flare', validade: '2029-06' } } } })).toBe(false);
});
