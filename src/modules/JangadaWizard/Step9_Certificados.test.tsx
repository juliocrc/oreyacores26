import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Step9 from './Step9_Certificados';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import InspectionDocumentPreview from '@/components/jangadas/InspectionDocumentPreview';

jest.mock('./store/useJangadaWizardStore', () => ({ useJangadaWizardStore: jest.fn() }));
jest.mock('./buildCertificatePayload', () => ({ buildCertificatePayload: () => ({ raftSerial: 'DRAFT' }) }));

beforeEach(() => {
  jest.mocked(useJangadaWizardStore).mockReturnValue({
    inspectionData: { serial: 'DRAFT', model: 'Regular' }, jangadaId: 10, inspecaoId: null, hasServerChanges: true,
  });
});
afterEach(() => jest.restoreAllMocks());

it('offers document previews before registration, without issuance, upload or signature-save actions', () => {
  jest.spyOn(React, 'useMemo').mockImplementation(factory => factory());
  const tree = Step9();
  const html = renderToStaticMarkup(tree);
  expect(html).toContain('antes de registar a inspeção');
  expect(html).toContain('Ver certificado');
  expect(html).toContain('Ver quadro');
  expect(html).not.toMatch(/Emissão de Certificados|Gerar Certificado|Guardar assinaturas|Guardar Certificado Externo|Enviar certificado/);
  const preview = React.Children.toArray(tree.props.children).find(node => React.isValidElement(node) && node.type === InspectionDocumentPreview) as React.ReactElement<React.ComponentProps<typeof InspectionDocumentPreview>>;
  expect(preview.props.inspecaoId).toBeNull();
  expect(preview.props.draftPayload).toEqual({ raftSerial: 'DRAFT' });
});

it('does not offer a quadro for an SOS raft', () => {
  jest.mocked(useJangadaWizardStore).mockReturnValue({ inspectionData: { model: 'SOS' }, jangadaId: 10, inspecaoId: null });
  const html = renderToStaticMarkup(<Step9 />);
  expect(html).toContain('Ver certificado');
  expect(html).not.toContain('Ver quadro');
});
