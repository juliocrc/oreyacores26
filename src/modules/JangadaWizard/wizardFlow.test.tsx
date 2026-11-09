import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getSavedStepKey, getStepIndexByKey, getWizardSteps, needsRepair } from './steps';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { getStepProgress } from './progress';
import Step8, { getSummaryExceptionRows } from './Step8_ResumoFinal';
import type { InspectionData } from './types';
import WizardLayout from './WizardLayout';
import Step10 from './Step10_Historico';
import Step9 from './Step9_Certificados';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock('./useAutoSave', () => ({ useAutoSave: jest.fn() }));
jest.mock('./store/useJangadaWizardStore', () => {
  const actual = jest.requireActual('./store/useJangadaWizardStore').useJangadaWizardStore;
  return { useJangadaWizardStore: Object.assign(jest.fn(() => actual.getState()), actual) };
});

const keys = (data: Partial<InspectionData> = {}, hideOrcamento = false) => getWizardSteps(data as InspectionData, { hideOrcamento }).map(s => s.key);
const store = useJangadaWizardStore;

beforeEach(() => {
  store.setState({ currentStep: 1, hideOrcamento: false, isSaving: false, inspectionData: {} as InspectionData, inspecoes: [] });
});

it.each(['dados', 'resumo', 'certificados'])('offers a single save/finalize button only at the last step, current=%s', key => {
  store.getState().setStepByKey(key);
  const html = renderToStaticMarkup(<WizardLayout>{key === 'resumo' ? <Step8 /> : key === 'certificados' ? <Step9 /> : <p>Dados</p>}</WizardLayout>);
  const buttons = html.match(/<button\b[\s\S]*?<\/button>/g) || [];
  expect(buttons.filter(button => button.includes('Guardar e finalizar inspeção'))).toHaveLength(key === 'certificados' ? 1 : 0);
  expect(buttons.some(button => /Fechar Inspeção e Gravar|Finalizar Inspeção/.test(button))).toBe(false);
  if (key === 'certificados') expect(html).toContain('Ver certificado');
});

it('disables finalization while the single server save is in progress', () => {
  store.getState().setStepByKey('certificados');
  store.setState({ isSaving: true });
  const html = renderToStaticMarkup(<WizardLayout><Step9 /></WizardLayout>);
  const button = (html.match(/<button\b[\s\S]*?<\/button>/g) || []).find(button => button.includes('A guardar…'));
  expect(button).toContain('disabled');
});

it('orders the final workflow and keeps history outside steps and progress', () => {
  expect(keys({ applicableServiceBulletins: [] })).toEqual([
    'dados', 'checklist', 'componentes', 'pack', 'cilindros', 'testes', 'contentor', 'orcamento', 'resumo', 'certificados',
  ]);
  expect(keys({}, true)).toContain('artigos');
  expect(keys({}, true)).not.toContain('orcamento');
  expect(getStepProgress({} as InspectionData).map(p => p.step)).not.toContain('historico');
  expect(keys({ abate: { ativo: true } as InspectionData['abate'] })).toEqual(['dados', 'checklist', 'resumo', 'certificados']);
});

it('puts applicable or unknown bulletins before checklist, only omitting confirmed empty results', () => {
  expect(keys().slice(0, 3)).toEqual(['dados', 'boletins', 'checklist']);
  expect(keys({ applicableServiceBulletins: [{ id: 'B' }] as InspectionData['applicableServiceBulletins'] }).slice(0, 3)).toEqual(['dados', 'boletins', 'checklist']);
  expect(keys({ applicableServiceBulletins: [] })).not.toContain('boletins');
  expect(keys({ applicableServiceBulletins: [], serviceBulletinsApplied: { B: 'APLICADO' } })).toContain('boletins');
  store.getState().initializeWizard({ id: 1 });
  expect(store.getState().inspectionData.applicableServiceBulletins).toBeUndefined();
});

it('keeps repairs after WP passes when records exist or preventive registration was chosen', () => {
  const data = { testes: { testeWP: 'PASSOU' }, reparacoes: [{ id: 'R', descricao: 'Colagem' }] } as InspectionData;
  expect(needsRepair(data)).toBe(true);
  expect(keys(data).slice(6)).toEqual(['testes', 'reparacoes', 'contentor', 'orcamento', 'resumo', 'certificados']);
  expect(keys({ repairRequested: true })).toContain('reparacoes');
  expect(keys()).not.toContain('reparacoes');
});

it('preserves the active key when conditional steps change, and remaps quote/article roles', () => {
  store.getState().setStepByKey('resumo');
  store.getState().setInspectionData({ repairRequested: true, applicableServiceBulletins: [] });
  expect(store.getState().currentStepKey()).toBe('resumo');
  store.getState().setStepByKey('orcamento');
  store.getState().setHideOrcamento(true);
  expect(store.getState().currentStepKey()).toBe('artigos');
  store.getState().setHideOrcamento(false);
  expect(store.getState().currentStepKey()).toBe('orcamento');
  store.getState().setStepByKey('reparacoes');
  store.getState().setInspectionData({ repairRequested: false });
  expect(store.getState().currentStepKey()).toBe('contentor');
  store.getState().prevStep();
  expect(store.getState().currentStepKey()).toBe('testes');
  store.getState().nextStep(true);
  expect(store.getState().currentStepKey()).toBe('contentor');
});

it('restores saved keys ahead of numeric positions, including role aliases and old history', () => {
  const data = {} as InspectionData;
  expect(getSavedStepKey(data, { currentStepKey: 'resumo', currentStep: 2 })).toBe('resumo');
  expect(getSavedStepKey(data, { currentStep: 12 })).toBe('resumo');
  store.getState().setHideOrcamento(true);
  store.getState().setStepByKey(getSavedStepKey(data, { currentStepKey: 'orcamento' }));
  expect(store.getState().currentStepKey()).toBe('artigos');
  store.getState().setStepByKey('historico');
  expect(store.getState().currentStepKey()).toBe('resumo');
  expect(getStepIndexByKey(getWizardSteps(data), 'missing')).toBe(0);
  store.getState().setInspectionData({ applicableServiceBulletins: [] });
  store.getState().setStepByKey('boletins');
  expect(store.getState().currentStepKey()).toBe('checklist');
});

it('retains supplied saved repairs when initializing an inspection whose WP now passes', () => {
  store.getState().initializeWizard({ id: 1, testeWP: 'PASSOU' }, { reparacoes: [{ id: 'R', descricao: 'Colagem registada' }] });
  expect(keys(store.getState().inspectionData)).toContain('reparacoes');
});

it('merges failed checklist and expiry problems into one row without declaring conformity', () => {
  const data = {
    dataProxInspecao: '2027-01-01',
    checklist: { luz_exterior_bateria: { status: 'REPROVADO', validade: '2026-01', justificacaoNaoSubstituicao: 'Cliente recusou.' } },
    packItems: { agua: { name: 'Água potável', checklistName: 'validade_agua', quantidade: 1, validade: '2026-02' } },
    hruAplicavel: 'NAO',
  } as unknown as InspectionData;
  const rows = getSummaryExceptionRows(data);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ problem: expect.stringContaining('REPROVADO'), justification: 'Cliente recusou.', decision: 'Não substituído (exceção registada)' });
  expect(rows[0].problem).toContain('expira antes');
  expect(rows[1].decision).toContain('Substituído; validade ainda por resolver');
  store.setState({ inspectionData: data });
  const html = renderToStaticMarkup(<Step8 />);
  expect(html).toContain('Exceções e decisões por artigo');
  expect(html).toContain('não declara conformidade nem elimina a reprovação');
  expect(html.match(/Cliente recusou\./g)).toHaveLength(1);
  expect(html).not.toContain('Tudo Perfeito!');
});

it('keeps missing validity pending even when a justification exists and excludes genuinely valid articles', () => {
  const rows = getSummaryExceptionRows({ dataProxInspecao: '2027-01', checklist: {
    luz_exterior_bateria: { status: 'OK', justificacaoNaoSubstituicao: 'Por confirmar.' },
    luz_interior_bateria: { status: 'OK', validade: '2028-01' },
  } } as unknown as InspectionData);
  expect(rows).toHaveLength(1);
  expect(rows[0].problem).toContain('falta/inválida');
});

it.each(['dados', 'testes', 'resumo', 'certificados'])('opens history and returns without changing saved step %s', key => {
  store.getState().setStepByKey(key);
  const originalStep = store.getState().currentStep;
  const values: unknown[] = [];
  let cursor = 0;
  jest.spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    const index = cursor++;
    if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
    return [values[index], (next: unknown) => { values[index] = next; }];
  }) as typeof React.useState);
  jest.spyOn(React, 'useEffect').mockImplementation(() => {});
  jest.spyOn(React, 'useMemo').mockImplementation(fn => fn());
  jest.spyOn(React, 'useCallback').mockImplementation(fn => fn);
  jest.spyOn(React, 'useRef').mockImplementation((initial: unknown) => ({ current: initial }));
  const elements = (node: React.ReactNode): React.ReactElement<any>[] => React.Children.toArray(node).flatMap(child =>
    React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);
  const render = () => { cursor = 0; return elements(WizardLayout({ children: <p>Inspeção ativa</p> })); };
  try {
    let tree = render();
    const history = tree.find(el => el.type === 'button' && el.props['aria-pressed'] === false)!;
    expect(history.props.disabled).not.toBe(true);
    history.props.onClick();
    tree = render();
    const historyPanel = tree.find(el => el.type === Step10)!;
    expect(historyPanel).toBeDefined();
    expect(tree.some(el => el.type === 'button' && el.props.children === 'Seguinte')).toBe(false);
    const historyTree = elements(Step10(historyPanel.props));
    const back = historyTree.find(el => el.type === 'button' && renderToStaticMarkup(<>{el.props.children}</>).includes('Voltar à inspeção'))!;
    back.props.onClick();
    expect(render().some(el => el.type === Step10)).toBe(false);
    expect(store.getState().currentStep).toBe(originalStep);
    expect(store.getState().currentStepKey()).toBe(key);
  } finally {
    jest.restoreAllMocks();
  }
});
