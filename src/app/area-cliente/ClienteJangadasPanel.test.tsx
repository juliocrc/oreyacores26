import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ClienteJangadasPanel from './ClienteJangadasPanel';

const raft = {
  id: 10, serial: 'RAFT', brand: 'Brand', model: 'Model', capacity: 6,
  navioId: 20, navioNome: 'SHIP', dataInspecao: '2026-10-01', dataProxInspecao: '2027-10-01',
  status: { label: 'Valida', color: 'green' as const, daysLeft: 100 }, diasParaProxima: 100,
  ultimoCertificadoNumero: 'AZ26-101', certificadoPdfUrl: '/api/certificados/pdf?serial=RAFT',
  quadroPdfUrl: '/api/portal/documentos?jangadaId=10&inspecaoId=101&document=quadro&format=pdf',
};

it.each([null, '558'])('places the saved quadro PDF beside the certificate for preview %s', previewClienteId => {
  const html = renderToStaticMarkup(<ClienteJangadasPanel navios={[{ id: 20, nome: 'SHIP' }]} jangadas={[raft]} previewClienteId={previewClienteId} />);
  expect(html).toContain('Ver certificado PDF');
  expect(html).toContain('Ver quadro de inspeção PDF');
  const href = `${raft.quadroPdfUrl}${previewClienteId ? `&previewClienteId=${previewClienteId}` : ''}`.replace(/&/g, '&amp;');
  expect(html).toContain(`href="${href}" aria-disabled="false"`);
  expect(html.indexOf('Ver certificado PDF')).toBeLessThan(html.indexOf('Ver quadro de inspeção PDF'));
  if (!previewClienteId) expect(html).not.toContain('previewClienteId');
});

it('does not fabricate a quadro link for a raft without a certified saved inspection', () => {
  const html = renderToStaticMarkup(<ClienteJangadasPanel navios={[]} jangadas={[{ ...raft, quadroPdfUrl: null }]} />);
  expect(html).toContain('Ver certificado PDF');
  expect(html).not.toContain('Ver quadro de inspeção PDF');
});

it('hides stale Hammar data and quadro links for SOS but retains the certificate', () => {
  const html = renderToStaticMarkup(<ClienteJangadasPanel navios={[]} jangadas={[{
    ...raft, model: 'SOS', hruReferencia: 'STALE-HAMMAR', hruValidade: '2027-01-01',
  }]} />);
  expect(html).toContain('Ver certificado PDF');
  expect(html).toContain('apenas certificado');
  expect(html).not.toContain('STALE-HAMMAR');
  expect(html).not.toContain('HRU Ref:');
  expect(html).not.toContain('Ver quadro de inspeção PDF');
});
