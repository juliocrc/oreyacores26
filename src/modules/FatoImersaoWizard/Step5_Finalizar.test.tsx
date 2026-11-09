import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Step5_Finalizar from './Step5_Finalizar';
import { useFatoImersaoWizardStore } from './store/useFatoImersaoWizardStore';
import { FATO_CHECKLIST_ITEMS } from '@/lib/fatos-imersao-checklist';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock('./store/useFatoImersaoWizardStore', () => {
  const actual = jest.requireActual('./store/useFatoImersaoWizardStore');
  const hook = () => actual.useFatoImersaoWizardStore.getState();
  hook.getState = actual.useFatoImersaoWizardStore.getState;
  return { useFatoImersaoWizardStore: hook };
});

beforeEach(() => useFatoImersaoWizardStore.getState().reset());

it('apresenta a checklist completa e não oferece aprovação com itens em falta', () => {
  const html = renderToStaticMarkup(<Step5_Finalizar onPrev={() => {}} />);
  expect(html).toContain('Pendente / intervenção necessária');
  expect(html).toContain('Por verificar');
  expect(html).not.toContain('emitir certificado aprovado');
});

it('exige rastreabilidade antes de permitir confirmar a emissão', () => {
  useFatoImersaoWizardStore.getState().setInspectionData({
    checklist: Object.fromEntries(FATO_CHECKLIST_ITEMS.map(item => [item.key, 'OK'])),
    leakMetodo: 'soap_air', leakResultado: 'OK', inspectorNome: 'Técnico', dataProxInspecao: '2028-01-01',
  });
  const html = renderToStaticMarkup(<Step5_Finalizar onPrev={() => {}} />);
  expect(html).toContain('emitir certificado aprovado');
  expect(html).toContain('disabled');
  expect(html).toContain('Manual:');
});
