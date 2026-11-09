import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Step6B from './Step6B_Reparacoes';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';

jest.mock('./store/useJangadaWizardStore', () => ({ useJangadaWizardStore: jest.fn() }));

it.each(['PASSOU', 'N/A', undefined])('does not claim WP failed for status %s and preserves recorded repairs', testeWP => {
  (useJangadaWizardStore as unknown as jest.Mock).mockReturnValue({
    inspectionData: {
      testes: { testeWP }, repairRequested: true,
      reparacoes: [{ id: 'R', tipo: 'Colagem', descricao: 'Intervenção existente', custo: 10 }],
    },
  });
  const html = renderToStaticMarkup(<Step6B />);
  expect(html).toContain('intervenções preventivas');
  expect(html).toContain('Intervenção existente');
  expect(html).not.toContain('O teste WP reprovou');
  expect(html).not.toContain('Teste WP reprovado.');
});

it('retains failure instructions when WP actually failed', () => {
  (useJangadaWizardStore as unknown as jest.Mock).mockReturnValue({ inspectionData: { testes: { testeWP: 'REPROVOU' } } });
  const html = renderToStaticMarkup(<Step6B />);
  expect(html).toContain('O teste WP reprovou');
  expect(html).toContain('Teste WP reprovado.');
});
