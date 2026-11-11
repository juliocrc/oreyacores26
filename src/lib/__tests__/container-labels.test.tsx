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
it.each([{ brand: 'DSB' }, { launchType: 'DL' }, { containerSize: null }, { containerSize: '999' }])('does not guess for %p', fields => {
  expect(containerLabelChecklist({ ...raft, ...fields }).supported).toBe(false);
});
it('does not guess MK III DL with unknown container size', () => {
  expect(containerLabelChecklist({ ...raft, model: 'SURVIVA MKIII', launchType: 'DL', containerSize: '999' }).supported).toBe(false);
});
it('matches manufacturer code, shows photo and distinguishes stock lookup errors', () => {
  const stock = [{ id: 4, codigoFabricante: '04819001', referencia: 'LOCAL', quantidade: 3, foto: '/photo.jpg' }];
  const html = renderToStaticMarkup(<ContainerLabels raft={raft} stock={stock} stockStatus="ready" />);
  expect(html).toContain('/photo.jpg');
  expect(html).toContain('Registado: 3 un.');
  expect(html).toContain('Sem correspondência por código');
  expect(renderToStaticMarkup(<ContainerLabels raft={raft} stockStatus="error" />)).toContain('Consulta indisponível');
});

it('identifies the verified MK III throwover labels for all known container sizes', () => {
  const mk3 = { ...raft, model: 'SURVIVA MKIII TO' };
  expect(containerLabelChecklist(mk3).labels).toEqual(expect.arrayContaining([
    expect.objectContaining({ reference: '20765001', position: 5 }),
    expect.objectContaining({ reference: '04819001', position: 1 }),
    expect.objectContaining({ reference: '43869001', position: 9 }),
    expect.objectContaining({ reference: '15384001', position: 15 }),
    expect.objectContaining({ reference: '50976001', position: 16 }),
    expect.objectContaining({ reference: '43409001', position: 19 }),
  ]));
  // MK10 size 3/4 also includes the RFD trademark label.
  expect(containerLabelChecklist(mk3).labels).toEqual(expect.arrayContaining([
    expect.objectContaining({ reference: '06231001', position: 8 }),
  ]));
  // Other known container sizes are supported without guessing.
  expect(containerLabelChecklist({ ...mk3, containerSize: '6' }).supported).toBe(true);
  expect(containerLabelChecklist({ ...mk3, containerModel: 'MK14', containerSize: '14' }).supported).toBe(true);
  expect(containerLabelChecklist({ ...mk3, containerModel: 'MK16', containerSize: '2' }).supported).toBe(true);
  // Unknown sizes remain unsupported.
  expect(containerLabelChecklist({ ...mk3, containerSize: '999' }).supported).toBe(false);
});

it('identifies MK III Davit Launch labels', () => {
  const mk3dl = { ...raft, model: 'SURVIVA MKIII DL', launchType: 'DL', containerModel: 'MK10', containerSize: '3' };
  expect(containerLabelChecklist(mk3dl).supported).toBe(true);
  expect(containerLabelChecklist(mk3dl).labels).toEqual(expect.arrayContaining([
    expect.objectContaining({ reference: '20085011', position: 1 }),
    expect.objectContaining({ reference: '20085021', position: 2 }),
    expect.objectContaining({ reference: '20085031', position: 3 }),
    expect.objectContaining({ reference: '20924011', position: 4 }),
    expect.objectContaining({ reference: '20924021', position: 5 }),
    expect.objectContaining({ reference: '20879001', position: 6 }),
  ]));
  // MK10 size 3/4 DL also includes the RFD trademark label at position 7.
  expect(containerLabelChecklist(mk3dl).labels).toEqual(expect.arrayContaining([
    expect.objectContaining({ reference: '06231001', position: 7 }),
  ]));
  // Other known sizes use the general RFD trademark at position 11.
  const mk14dl = { ...mk3dl, containerModel: 'MK14', containerSize: '14' };
  expect(containerLabelChecklist(mk14dl).supported).toBe(true);
  expect(containerLabelChecklist(mk14dl).labels).toEqual(expect.arrayContaining([
    expect.objectContaining({ reference: '20958011', position: 11 }),
  ]));
  // Unknown sizes remain unsupported.
  expect(containerLabelChecklist({ ...mk3dl, containerSize: '999' }).supported).toBe(false);
});

it('uses the MK IV DL table and the distinct MK20 launch references', () => {
  const dl = { ...raft, model: 'SURVIVA MKIV DL', launchType: 'DL', containerSize: '4' };
  expect(containerLabelChecklist(dl).labels).toEqual(expect.arrayContaining([
    expect.objectContaining({ reference: '50906002', quantity: 1 }),
    expect.objectContaining({ reference: '20085021', quantity: 2 }),
  ]));
  const mk20 = containerLabelChecklist({ ...dl, containerModel: 'MK20', containerSize: '7' });
  expect(mk20.labels).toEqual(expect.arrayContaining([expect.objectContaining({ reference: '45425011' })]));
  expect(mk20.labels.some(label => label.reference === '41144001')).toBe(false);
  expect(containerLabelChecklist({ ...dl, containerSize: '3' }).supported).toBe(false);
});

it('does not guess SeaSava Plus / Plus R stickers without a manual', () => {
  const plus = { ...raft, brand: 'RFD', model: 'SEASAVA PLUS', launchType: 'TO', containerModel: 'MK10', containerSize: '3' };
  const plusR = { ...raft, brand: 'RFD', model: 'SEASAVA PLUS R', launchType: 'TO', containerModel: 'MK10', containerSize: '3' };
  expect(containerLabelChecklist(plus).supported).toBe(false);
  expect(containerLabelChecklist(plusR).supported).toBe(false);
  expect(containerLabelChecklist(plus).labels).toEqual([]);
  expect(containerLabelChecklist(plusR).labels).toEqual([]);
});
