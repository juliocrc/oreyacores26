import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PortalInspectionDocuments, { type PortalInspection } from './PortalInspectionDocuments';

const inspection: PortalInspection = { id: 101, certificadoNumero: 'AZ-101', dataInspecao: '2026-10-01', dataProxInspecao: '2027-10-01', documentStatus: 'valido', referenceDate: '2026-10-25', downloadable: true };

afterEach(() => jest.restoreAllMocks());

it('shows the exact selector, explicit reference date, status and the three downloads', () => {
  const html = renderToStaticMarkup(<PortalInspectionDocuments jangadaId={10} inspecoes={[inspection]} />);
  expect(html).toContain('Inspecao exata');
  expect(html).toContain('value="101"');
  expect(html).toContain('AZ-101');
  expect(html).toContain('Valido');
  expect(html).toContain('25/10/2026');
  for (const label of ['Certificado PDF', 'Quadro PDF', 'Quadro XLSX']) expect(html).toContain(label);
  expect(html).not.toContain('disabled=""');
});

it('disables every download for an uncertified inspection', () => {
  const html = renderToStaticMarkup(<PortalInspectionDocuments jangadaId={10} inspecoes={[{ ...inspection, documentStatus: 'indisponivel', downloadable: false }]} />);
  expect(html).toContain('Indisponivel');
  expect(html.match(/disabled=""/g)).toHaveLength(3);
});

it('offers only the certificate for SOS with a visible explanation', () => {
  const html = renderToStaticMarkup(<PortalInspectionDocuments jangadaId={10} inspecoes={[inspection]} raft={{ model: 'SOS' }} />);
  expect(html).toContain('Certificado PDF');
  expect(html).toContain('apenas certificado');
  expect(html).not.toContain('Quadro PDF');
  expect(html).not.toContain('Quadro XLSX');
});

it('uses only the selected exact IDs and displays server errors without a legacy fallback', async () => {
  const setError = jest.fn();
  const values = [['102', jest.fn()], ['', setError], [false, jest.fn()]];
  jest.spyOn(React, 'useState').mockImplementation((() => values.shift()) as never);
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, json: async () => ({ error: 'Historico inconsistente.' }) } as never);
  const tree = PortalInspectionDocuments({ jangadaId: 10, inspecoes: [inspection, { ...inspection, id: 102 }] });
  // The selected inspection block contains the download buttons.
  const fragment = React.Children.toArray(tree.props.children).find(child => React.isValidElement(child) && child.type === React.Fragment) as React.ReactElement<{ children: React.ReactNode }>;
  const downloads = React.Children.toArray(fragment.props.children).find(child => React.isValidElement(child) && child.type === 'div') as React.ReactElement<{ children: React.ReactNode }>;
  const button = React.Children.toArray(downloads.props.children)[0] as React.ReactElement<{ onClick: () => void }>;
  button.props.onClick();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith('/api/portal/documentos?jangadaId=10&inspecaoId=102&document=certificado&format=pdf', { cache: 'no-store' });
  expect(setError).toHaveBeenCalledWith('Historico inconsistente.');
});
