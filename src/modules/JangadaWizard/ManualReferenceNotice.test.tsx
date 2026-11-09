import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ManualReferenceNotice from './ManualReferenceNotice';

it('links to the external library without claiming a verified manual edition', () => {
  const html = renderToStaticMarkup(<ManualReferenceNotice brand="RFD" model="SeaSava Plus" topic="testes" />);
  expect(html).toContain('Surviva MK III');
  expect(html).toContain('secção aplicável');
  expect(html).toContain('/api/manuais/biblioteca');
  expect(html).toContain('pasta geral');
});
it('asks to confirm unknown models and directs repair staff to the repair chapter', () => {
  const html = renderToStaticMarkup(<ManualReferenceNotice brand="Outro" model="Desconhecido" topic="reparacoes" />);
  expect(html).toContain('modelo por confirmar');
  expect(html).toContain('secção aplicável');
});
it('uses Eurovinil sections without assigning an ambiguous ISO generation', () => {
  const html = renderToStaticMarkup(<ManualReferenceNotice brand="Eurovinil" model="ISO Type 1" topic="testes" />);
  expect(html).toContain('modelo por confirmar');
  expect(html).toContain('a numeração varia entre manuais');
  expect(html).toContain('manuais diferentes');
});
it('alerts to Ocean ISO cylinder generation and individual confirmation', () => {
  const html = renderToStaticMarkup(<ManualReferenceNotice brand="Ocean Safety" model="Ocean ISO Ultralite" topic="testes" />);
  expect(html).toContain('02/2020');
  expect(html).toContain('antes e depois de 2013');
  expect(html).toContain('não selecione carga');
});
it('shows the Viking NAP pressure test procedure from section 2.2.3', () => {
  const html = renderToStaticMarkup(<ManualReferenceNotice brand="VIKING" model="DKR" topic="testes" />);
  expect(html).toContain('VIKING — secção 2.2.3');
  expect(html).toContain('NAP test');
  expect(html).toContain('294 mbar');
});
it('shows Eurovinil Syntesy service test and NAP procedure', () => {
  const html = renderToStaticMarkup(<ManualReferenceNotice brand="Eurovinil" model="Syntesy" topic="testes" />);
  expect(html).toContain('EUROVINIL LEISURE SYNTESY');
  expect(html).toContain('0,5 bar');
  expect(html).toContain('0,206 bar');
});
it('shows Surviva MK III NAP double-working-pressure', () => {
  const html = renderToStaticMarkup(<ManualReferenceNotice brand="RFD" model="Surviva MK III" topic="testes" />);
  expect(html).toContain('NAP/pressure test');
  expect(html).toContain('duas vezes a pressão de trabalho');
  expect(html).toContain('2,8 psi');
});
it('shows Marine MK IV NAP double-working-pressure', () => {
  const html = renderToStaticMarkup(<ManualReferenceNotice brand="RFD" model="Surviva MK IV" topic="testes" />);
  expect(html).toContain('Marine MK IV');
  expect(html).toContain('throw-over');
  expect(html).toContain('duas vezes a pressão de trabalho');
  expect(html).toContain('193-221 mb');
});
