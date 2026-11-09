import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Step2 from './Step2_Checklist';
import { ALL_CHECKLIST_IDS, getChecklistCompletionErrors, getChecklistExceptionWarnings, markUnassessedChecklistOk } from './checklistValidation';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { computeFinishWarnings, persistInspection, finalizeInspectionStandalone } from './finalizeInspection';
import { buildChecklistInitialValues, buildInspectionChecklistFromQuadro, getBooleanChecklistCompletionErrors } from '../inspectionChecklist';
import { getStepProgress } from './progress';
import type { ChecklistItem, InspectionData } from './types';
import { buildCertificatePayload } from './buildCertificatePayload';
import { getArticleExpiryWarnings } from './articleExpiry';
import Step7 from './Step7_Orcamento';

jest.mock('@/lib/app-toast', () => ({ appToast: { error: jest.fn(), success: jest.fn(), warning: jest.fn() } }));
jest.mock('@/lib/offline-sync/client', () => ({ enqueueOfflineSyncOperation: jest.fn() }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/use-whatsapp-allowed', () => ({ useWhatsAppAllowed: () => ({ allowed: false }) }));

const completed = (): Record<string, ChecklistItem> => Object.fromEntries(ALL_CHECKLIST_IDS.map(id => [id, {
  status: 'OK',
  ...(['luz_exterior_bateria', 'luz_interior_bateria'].includes(id) ? { validade: '2035-12' } : {}),
}]));

it.each(['2026-10-25T12:00:00Z', '2032-01-01T12:00:00Z'])('persists historical validity decisions with the clock at %s', async now => {
  jest.useFakeTimers();
  try {
    jest.setSystemTime(new Date(now));
    const store = useJangadaWizardStore.getState();
    store.initializeWizard({ brand: 'RFD', model: 'Surviva' }, { dataInspecao: '2026-03-03' });
    useJangadaWizardStore.setState({ jangadaId: null, shipId: null });
    store.setInspectionData({
      checklist: completed(),
      packItems: { flare: { checklistName: 'flare', name: 'Hand Flare', referencia: 'FLARE', quantidade: 0, validade: '2027-03-03' } },
    });
    expect(computeFinishWarnings(useJangadaWizardStore.getState().inspectionData).filter(w => w.stepKey === 'pack')).toEqual([]);
    await persistInspection({ isFinal: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.dataInspecao).toBe('2026-03-03');
    expect(body.dataProxInspecao).toBe('2027-03-03');
    (fetch as jest.Mock).mockClear();
    store.setInspectionData({ packItems: { flare: { checklistName: 'flare', name: 'Hand Flare', referencia: 'FLARE', quantidade: 0, validade: '2027-03-02' } } });
    await persistInspection({ isFinal: true });
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

beforeEach(() => {
  useJangadaWizardStore.getState().initializeWizard({ id: 1 });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 2 }) });
});

it('renders new visual items as unassessed without recording OK', () => {
  const html = renderToStaticMarkup(<Step2 />);
  expect(html.match(/Por verificar/g)).toHaveLength(ALL_CHECKLIST_IDS.length);
  expect(useJangadaWizardStore.getState().inspectionData.checklist).toEqual({});
});

it('bulk OK changes only unassessed items, immutably and within the group', () => {
  const checklist = {
    a: { status: 'REPROVADO', notes: 'damage', fotos: ['photo'] },
    b: { status: 'SUBSTITUIDO' }, c: { status: 'NA' }, d: { status: 'OK' },
    e: { notes: 'retain' }, f: { status: 'POR_VERIFICAR' }, g: {},
    h: { status: 'OTHER' },
  };
  const result = markUnassessedChecklistOk(checklist, ['a', 'b', 'c', 'd', 'e', 'f', 'h', 'missing'].map(id => ({ id })));
  expect(result.changed).toBe(3);
  for (const id of ['a', 'b', 'c', 'd', 'g', 'h'] as const) expect(result.checklist[id]).toBe(checklist[id]);
  expect(result.checklist.e).toEqual({ status: 'OK', notes: 'retain' });
  expect(checklist.e).toEqual({ notes: 'retain' });
});

it('preserves saved OK, failure, substituted and N/A states on initialization', () => {
  const saved = completed();
  saved.cobertura_exterior = { status: 'REPROVADO' };
  saved.saida_antena = { status: 'SUBSTITUIDO' };
  saved.refletores = { status: 'NA' };
  useJangadaWizardStore.getState().initializeWizard({ id: 1 }, { id: 9, checklistSnapshot: saved });
  renderToStaticMarkup(<Step2 />);
  expect(useJangadaWizardStore.getState().inspectionData.checklist).toEqual(saved);
});

it('blocks missing and failed checklist completion even through direct persistence', async () => {
  expect(computeFinishWarnings(useJangadaWizardStore.getState().inspectionData)).toEqual(expect.arrayContaining([
    expect.objectContaining({ stepKey: 'checklist', isCritical: true }),
  ]));
  await persistInspection({ isFinal: true });
  finalizeInspectionStandalone();
  expect(fetch).not.toHaveBeenCalled();
  const checklist = completed();
  checklist.cobertura_exterior.status = 'REPROVADO';
  useJangadaWizardStore.getState().setInspectionData({ checklist });
  await persistInspection({ isFinal: true });
  expect(fetch).not.toHaveBeenCalled();
});

it('allows draft persistence and navigation with unassessed items', async () => {
  useJangadaWizardStore.getState().setStepByKey('checklist');
  expect(useJangadaWizardStore.getState().nextStep()).toBe(true);
  await persistInspection({ isFinal: false });
  expect(fetch).toHaveBeenCalled();
  const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
  expect(body.status).toBe('Draft');
  expect(body.applyStockMovements).toBe(false);
  expect(body.checklistSnapshot.cobertura_exterior).toBeUndefined();
});

it('accepts recorded replacements and N/A, and keeps abate non-conforming', () => {
  const checklist = completed();
  checklist.cobertura_exterior.status = 'SUBSTITUIDO';
  checklist.saida_antena.status = 'NA';
  expect(getChecklistCompletionErrors({ checklist })).toEqual([]);
  expect(getStepProgress({ checklist } as InspectionData).find(p => p.step === 'checklist')?.complete).toBe(true);
  expect(getChecklistCompletionErrors({ checklist: {}, abate: { ativo: true } } as InspectionData)).toEqual([]);
});

it('persists a conforming completion with valid replacements and N/A', async () => {
  const checklist = completed();
  checklist.cobertura_exterior.status = 'SUBSTITUIDO';
  checklist.saida_antena.status = 'NA';
  useJangadaWizardStore.setState({ jangadaId: null, shipId: null });
  useJangadaWizardStore.getState().setInspectionData({ checklist, dataProxInspecao: '2027-06-01' });
  await persistInspection({ isFinal: true });
  expect(fetch).toHaveBeenCalledTimes(1);
  const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
  expect(body.status).toBe('Concluída');
  expect(body.checklistSnapshot).toMatchObject(checklist);
});

it('uses an explicit empty sentinel, not catalogue membership, for boolean defaults', () => {
  const raft = { artigos: [{ name: 'Apito', quantidade: 1 }] };
  const sections = buildInspectionChecklistFromQuadro(raft);
  const defaults = buildChecklistInitialValues(sections, raft);
  const fields = sections.flatMap(s => s.fields).filter(f => f.type === 'checkbox');
  expect(fields.length).toBeGreaterThan(0);
  for (const field of fields) expect(defaults[field.name]).toBe('');
  const saved = { ...defaults, [fields[0].name]: true, [fields[1].name]: false };
  expect(saved[fields[0].name]).toBe(true);
  expect(saved[fields[1].name]).toBe(false);
  expect(getBooleanChecklistCompletionErrors(sections, saved)).toEqual(expect.arrayContaining([
    expect.stringContaining('falha por resolver'), expect.stringContaining('por verificar'),
  ]));
  expect(getBooleanChecklistCompletionErrors(sections, Object.fromEntries(fields.map(f => [f.name, true])))).toEqual([]);
});

it.each([undefined, '', '  \n\t '])('blocks failed items with no explicit reason (%p), even with observations', async (reason) => {
  const checklist = completed();
  checklist.cobertura_exterior = { status: 'REPROVADO', notes: 'Costuras degradadas', justificacaoNaoSubstituicao: reason };
  useJangadaWizardStore.getState().setInspectionData({ checklist });
  expect(getChecklistCompletionErrors({ checklist })).toHaveLength(1);
  expect(getChecklistExceptionWarnings({ checklist })).toEqual([]);
  await persistInspection({ isFinal: true });
  expect(fetch).not.toHaveBeenCalled();
});

it('persists and reloads a justified failure without changing its failed state', async () => {
  const checklist = completed();
  const item = { status: 'REPROVADO', notes: 'Dano', justificacaoNaoSubstituicao: '  Peça indisponível; substituição adiada pelo cliente.  ', fotos: ['photo'] };
  checklist.cobertura_exterior = item;
  useJangadaWizardStore.setState({ jangadaId: null, shipId: null });
  useJangadaWizardStore.getState().setInspectionData({ checklist, dataProxInspecao: '2027-06-01' });
  expect(getChecklistCompletionErrors({ checklist })).toEqual([]);
  expect(computeFinishWarnings({ checklist, dataProxInspecao: '2027-06-01' }).filter(w => w.stepKey === 'checklist')).toEqual([
    expect.objectContaining({ isCritical: false, text: expect.stringContaining('REPROVADO, não substituído') }),
  ]);
  expect(getChecklistExceptionWarnings({ checklist })[0]).toContain(item.justificacaoNaoSubstituicao.trim());
  expect(getStepProgress({ checklist } as InspectionData).find(p => p.step === 'checklist')?.complete).toBe(true);
  for (const isFinal of [false, true]) {
    (fetch as jest.Mock).mockClear();
    await persistInspection({ isFinal });
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetch as jest.Mock).mock.calls.at(-1)[1].body);
    expect(body.checklistSnapshot.cobertura_exterior).toEqual(item);
    expect(body.status).toBe(isFinal ? 'Concluída' : 'Draft');
    useJangadaWizardStore.getState().initializeWizard({ id: 1 }, { id: 9, dataProxInspecao: body.dataProxInspecao, checklistSnapshot: body.checklistSnapshot });
    useJangadaWizardStore.setState({ jangadaId: null, shipId: null });
    expect(useJangadaWizardStore.getState().inspectionData.checklist.cobertura_exterior).toEqual(item);
  }
  expect(markUnassessedChecklistOk(checklist, ALL_CHECKLIST_IDS.map(id => ({ id }))).checklist.cobertura_exterior).toEqual(item);
});

it('preserves concrete stock rows and lots sharing a reference through save, reload and certificate payloads', async () => {
  const packItems = {
    first: { checklistName: 'first', name: 'Hand Flare', referencia: 'FLARE', stockId: 41, lote: 'LOT-A', quantidade: 1, validade: '2030-01' },
    second: { checklistName: 'second', name: 'Hand Flare', referencia: 'FLARE', stockId: 42, lote: 'LOT-B', quantidade: 2, validade: '2031-02' },
    whistle: { checklistName: 'whistle', name: 'Apito', referencia: 'WHISTLE', stockId: 43, quantidade: 1 },
  };
  useJangadaWizardStore.setState({ jangadaId: null, shipId: null });
  useJangadaWizardStore.getState().setInspectionData({ checklist: completed(), dataProxInspecao: '2027-06-01', packItems });
  await persistInspection({ isFinal: true });
  expect(fetch).toHaveBeenCalledTimes(1);
  const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
  expect(body.artigosSubstituidos).toEqual([
    expect.objectContaining({ stockId: 41, lote: 'LOT-A', validade: '2030-01' }),
    expect.objectContaining({ stockId: 42, lote: 'LOT-B', validade: '2031-02' }),
    expect.objectContaining({ stockId: 43, lote: null, validade: null }),
  ]);
  expect(body.checklistSnapshot._articleExpiry.packItems).toEqual(packItems);
  useJangadaWizardStore.getState().initializeWizard({ id: 1 }, { id: 2, dataProxInspecao: body.dataProxInspecao, checklistSnapshot: body.checklistSnapshot });
  const reloaded = useJangadaWizardStore.getState().inspectionData;
  expect(reloaded.packItems).toEqual(packItems);
  expect(buildCertificatePayload(reloaded).artigosSubstituidos).toEqual([
    expect.objectContaining({ stockId: 41, lote: 'LOT-A' }),
    expect.objectContaining({ stockId: 42, lote: 'LOT-B' }),
    expect.objectContaining({ stockId: 43, lote: null }),
  ]);
});

it('blocks insufficient replacement expiry despite quantity and retains a justified non-conforming exception', async () => {
  const packItems = { flare: { checklistName: 'flare', name: 'Hand Flare', referencia: 'FLARE', stockId: 42, lote: 'LOT-B', quantidade: 2, validade: '2027-05' } };
  useJangadaWizardStore.setState({ jangadaId: null, shipId: null });
  useJangadaWizardStore.getState().setInspectionData({ checklist: completed(), dataProxInspecao: '2027-06-01', packItems });
  await persistInspection({ isFinal: true });
  expect(fetch).not.toHaveBeenCalled();
  const justified = { ...packItems.flare, justificacaoNaoSubstituicao: 'Cliente adiou a substituicao.' };
  useJangadaWizardStore.getState().setInspectionData({ packItems: { flare: justified } });
  expect(getArticleExpiryWarnings(useJangadaWizardStore.getState().inspectionData)).toEqual([
    expect.objectContaining({ isCritical: false, text: expect.stringContaining('Esta exceção não declara conformidade') }),
  ]);
  await persistInspection({ isFinal: true });
  expect(fetch).toHaveBeenCalledTimes(1);
  const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
  expect(body.checklistSnapshot._articleExpiry.packItems.flare).toEqual(justified);
});

it('does not match a replacement budget line to another stockId with the same reference', () => {
  const data = {
    packItems: { flare: { name: 'Hand Flare', referencia: 'FLARE', stockId: 42, quantidade: 2, validade: '2030-01' } },
    orcamento: { linhas: [{ referencia: 'FLARE', stockId: 41, quantidade: 2 }] },
  };
  expect(computeFinishWarnings(data).filter(w => w.stepKey === 'orcamento')).toEqual([
    expect.objectContaining({ text: expect.stringContaining('sem linha correspondente') }),
  ]);
});

it('does not overwrite a recorded certificate failure with catalogue conformity', () => {
  const data = useJangadaWizardStore.getState().inspectionData;
  const checklist = { lanterna: false, lanterna_justificacaoNaoSubstituicao: 'Avariada' };
  const payload = buildCertificatePayload({ ...data, checklist } as unknown as InspectionData);
  expect(payload.checklist.lanterna).toBe(false);
  expect(payload.checklist.lanterna_justificacaoNaoSubstituicao).toBe('Avariada');
  const justified = buildCertificatePayload({ ...data, packItems: {
    torch: { checklistName: 'torch', name: 'Lanterna', quantidade: 0, justificacaoNaoSubstituicao: 'Avariada' },
  } });
  expect(justified.checklist.lanterna).toBeUndefined();
});

it('keeps budget rows and prices distinct for two lots with the same reference', () => {
  const effects: Array<() => void> = [];
  const effectSpy = jest.spyOn(React, 'useEffect').mockImplementation(effect => { effects.push(effect as () => void); });
  const storeSpy = jest.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) => getSnapshot());
  try {
    useJangadaWizardStore.getState().setInspectionData({
      packItems: {
        first: { checklistName: 'first', name: 'Hand Flare', referencia: 'FLARE', stockId: 41, lote: 'LOT-A', quantidade: 1 },
        second: { checklistName: 'second', name: 'Hand Flare', referencia: 'FLARE', stockId: 42, lote: 'LOT-B', quantidade: 2 },
      },
      globalStock: [
        { id: 41, referencia: 'FLARE', descricao: 'Hand Flare', lote: 'LOT-A', precoVenda: 5, quantidade: 10, validade: '2030-01', categoria: null, codigoFabricante: null },
        { id: 42, referencia: 'FLARE', descricao: 'Hand Flare', lote: 'LOT-B', precoVenda: 9, quantidade: 10, validade: '2031-02', categoria: null, codigoFabricante: null },
      ],
      orcamento: {
        linhas: [{ id: 'pack-FLARE', stockId: 41, referencia: 'FLARE', descricao: 'Hand Flare', quantidade: 1, unitPrice: 6, total: 6, source: 'pack' }],
        valorMaoObra: 0, valorDesconto: 0, isIsentoIva: false,
      },
    });
    renderToStaticMarkup(<Step7 />);
    effects.forEach(effect => effect());
    const lines = useJangadaWizardStore.getState().inspectionData.orcamento!.linhas.filter(l => l.source === 'pack');
    expect(lines).toEqual([
      expect.objectContaining({ stockId: 41, quantidade: 1, unitPrice: 6 }),
      expect.objectContaining({ stockId: 42, quantidade: 2, unitPrice: 9 }),
    ]);
    expect(new Set(lines.map(l => l.id)).size).toBe(2);
  } finally {
    effectSpy.mockRestore();
    storeSpy.mockRestore();
  }
});

it('never uses a reason to bypass an unassessed item or another unjustified failure', () => {
  const checklist = completed();
  checklist.cobertura_exterior = { justificacaoNaoSubstituicao: 'Não substituído' };
  expect(getChecklistCompletionErrors({ checklist })).toEqual([expect.stringContaining('por verificar')]);
  checklist.cobertura_exterior.status = 'REPROVADO';
  checklist.saida_antena = { status: 'REPROVADO' };
  expect(getChecklistCompletionErrors({ checklist })).toEqual([expect.stringContaining('sem justificação')]);
});

it.each([undefined, '', ' \n ', 'Peça indisponível'])('requires a per-item reason for boolean failures (%p) and retains false', (reason) => {
  const sections = buildInspectionChecklistFromQuadro();
  const fields = sections.flatMap(s => s.fields).filter(f => f.type === 'checkbox');
  const values = Object.fromEntries(fields.map(f => [f.name, true])) as Record<string, unknown>;
  const key = fields[0].name;
  values[key] = false;
  values[`${key}_justificacaoNaoSubstituicao`] = reason;
  expect(getBooleanChecklistCompletionErrors(sections, values)).toHaveLength(reason?.trim() ? 0 : 1);
  const snapshot = JSON.parse(JSON.stringify(values));
  expect(snapshot[key]).toBe(false);
  expect(snapshot[`${key}_justificacaoNaoSubstituicao`]).toBe(reason);
  values[key] = '';
  expect(getBooleanChecklistCompletionErrors(sections, values)).toEqual([expect.stringContaining('por verificar')]);
});
