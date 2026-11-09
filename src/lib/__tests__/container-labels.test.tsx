import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ContainerLabels from '@/components/jangadas/ContainerLabels';
import { containerLabelChecklist } from '../container-labels';

const raft = { brand: 'RFD', model: 'SURVIVA MKIV TO', launchType: 'TO', containerModel: 'MK10', containerSize: '3' };
it('shows verified MK IV universal TO labels and does not claim full coverage', () => {
  expect(containerLabelChecklist(raft).labels).toHaveLength(6);
  const html = renderToStaticMarkup(<ContainerLabels raft={raft} />);
  expect(html).toContain('04819001');
  expect(html).toContain('não inclui todos');
});
it.each([{ brand: 'DSB' }, { model: 'SURVIVA MKIII' }, { launchType: 'DL' }, { containerSize: null }, { containerSize: '999' }])('does not guess for %p', fields => {
  expect(containerLabelChecklist({ ...raft, ...fields }).supported).toBe(false);
});
it('matches manufacturer code, shows photo and distinguishes stock lookup errors', () => {
  const stock = [{ id: 4, codigoFabricante: '04819001', referencia: 'LOCAL', quantidade: 3, foto: '/photo.jpg' }];
  const html = renderToStaticMarkup(<ContainerLabels raft={raft} stock={stock} stockStatus="ready" />);
  expect(html).toContain('/photo.jpg');
  expect(html).toContain('Registado: 3 un.');
  expect(html).toContain('Sem correspondência por código');
  expect(renderToStaticMarkup(<ContainerLabels raft={raft} stockStatus="error" />)).toContain('Consulta indisponível');
});
