import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WizardLayout from './WizardLayout';
import Step2 from './Step2_Checklist';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { getStepProgress } from './progress';
import { ALL_CHECKLIST_IDS } from './checklistValidation';
import type { ChecklistItem } from './types';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('./useAutoSave', () => ({ useAutoSave: jest.fn() }));
jest.mock('./store/useJangadaWizardStore', () => ({ useJangadaWizardStore: jest.fn() }));
jest.mock('./progress', () => ({ getStepProgress: jest.fn() }));

beforeEach(() => {
  const actual = jest.requireActual('./store/useJangadaWizardStore');
  actual.useJangadaWizardStore.getState().initializeWizard({ id: 1 });
  const state = actual.useJangadaWizardStore.getState();
  const checklist: Record<string, ChecklistItem> = Object.fromEntries(ALL_CHECKLIST_IDS.map(id => [id, { status: 'OK' }]));
  checklist.cobertura_exterior = { status: 'REPROVADO', justificacaoNaoSubstituicao: 'Substituição adiada pelo cliente.' };
  (useJangadaWizardStore as unknown as jest.Mock).mockReturnValue({
    ...state,
    inspectionData: { ...state.inspectionData, checklist },
  });
});

it('labels 100% completion as filled in, not conforming, even with a justified failure', () => {
  (getStepProgress as jest.Mock).mockReturnValue([{ step: 'checklist', percent: 100, complete: true, missing: [] }]);
  const html = renderToStaticMarkup(<WizardLayout><p>Conteudo</p></WizardLayout>);
  expect(html).toContain('Preenchido');
  expect(html).toContain('Preenchimento atual: 100%');
  expect(html).not.toContain('Conforme');
  expect(html).not.toContain('Conformidade atual');
});

it('keeps incomplete progress labelled as pending', () => {
  (getStepProgress as jest.Mock).mockReturnValue([{ step: 'checklist', percent: 50, complete: false, missing: ['Item'] }]);
  const html = renderToStaticMarkup(<WizardLayout><p>Conteudo</p></WizardLayout>);
  expect(html).toContain('1 passo por concluir');
  expect(html).toContain('Preenchimento atual: 50%');
  expect(html).not.toContain('Preenchido');
});

it('does not count a justified failure as conforming in the visual checklist', () => {
  const html = renderToStaticMarkup(<Step2 />);
  expect(html).not.toContain('100% conforme');
  expect(html).toContain('Faltam 1 item');
  expect(html).toContain('96%');
  expect(html).toContain('11/12 verificados');
  expect(html).toContain('1 reprovado');
  expect(html).toContain('Substituição adiada pelo cliente.');
});
