import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Step2 from './Step2_Checklist';
import Step3 from './Step3_Componentes';
import Step4 from './Step4_PackMascara';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';

jest.mock('./store/useJangadaWizardStore', () => ({ useJangadaWizardStore: jest.fn() }));
jest.mock('../rafts/mandatoryPack', () => ({
  getMandatoryPackItemsForRaft: () => [{ checklistName: 'water', label: 'Agua', quantity: 2, quantityLabel: '2', stockReferences: ['WATER'] }],
  isArticleValidityRequired: () => true,
  VALIDITY_REQUIRED_PACK_NAMES: new Set(),
}));

function setup(patch: Record<string, unknown>) {
  (useJangadaWizardStore as unknown as jest.Mock).mockReturnValue({
    inspectionData: { brand: '', model: '', packType: '', artigos: [], globalStock: [], checklist: {}, ...patch },
    setInspectionData: jest.fn(),
  });
}

it('shows the selected catalog image in the visual checklist, separately from inspection evidence', () => {
  setup({
    globalStock: [{ id: 1, referencia: 'COVER', descricao: 'Cobertura', foto: '/catalog/cover.jpg' }],
    checklist: { cobertura_exterior: { stockId: 1, status: 'SUBSTITUIDO', fotos: ['/evidence/damage.jpg'] } },
  });
  const html = renderToStaticMarkup(<Step2 />);
  expect(html).toContain('src="/catalog/cover.jpg"');
  expect(html).toContain('alt="Foto de COVER"');
  expect(html).toContain('src="/evidence/damage.jpg"');
  expect(html).toContain('alt="Evidência 1"');
});

it('shows catalog photos in HRU, light and component fields through the shared selector', () => {
  setup({
    hruAplicavel: 'SIM', hruStockId: 1,
    checklist: { luz_exterior_bateria: { stockId: 2 }, luz_interior_bateria: { status: 'NA' } },
    componentes: [{ id: 'component', stockId: 3, type: 'Valvula', reference: 'VALVE' }],
    globalStock: [
      { id: 1, referencia: 'HRU', descricao: 'Libertador hidrostatico HRU', foto: '/catalog/hru.jpg' },
      { id: 2, referencia: 'LIGHT', descricao: 'Luz exterior', foto: '/catalog/light.jpg' },
      { id: 3, referencia: 'VALVE', descricao: 'Valvula', foto: '/catalog/valve.jpg' },
    ],
  });
  const html = renderToStaticMarkup(<Step3 />);
  for (const name of ['hru', 'light', 'valve']) expect(html).toContain(`src="/catalog/${name}.jpg"`);
});

it('uses the exact selected stock row in the pack, not evidence or the first same-reference row', () => {
  setup({
    packItems: { water: { stockId: 2, referencia: 'WATER', quantidade: 0 } },
    globalStock: [
      { id: 1, referencia: 'WATER', foto: '/catalog/other.jpg' },
      { id: 2, referencia: 'WATER', foto: '/catalog/selected.jpg' },
    ],
  });
  const html = renderToStaticMarkup(<Step4 />);
  expect(html).toContain('src="/catalog/selected.jpg"');
  expect(html).not.toContain('/catalog/other.jpg');
});

it('renders a discreet fallback for an article without a catalog image', () => {
  setup({ packItems: { water: { quantidade: 0 } } });
  expect(renderToStaticMarkup(<Step4 />)).toContain('Sem imagem de Agua');
});
