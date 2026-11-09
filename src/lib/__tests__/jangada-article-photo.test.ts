import { JANGADA_LIGHT_EQUIPMENT, readJangadaLightEquipment, resolveJangadaArticlePhoto } from '../jangada-form';

const stock = [
  { id: 1, referencia: 'RL5', codigoFabricante: 'PN-5', descricao: 'Luz Interior', foto: '/stock/inside.jpg' },
  { id: 2, referencia: 'EXT', codigoFabricante: 'PN-6', descricao: 'Luz Exterior', foto: '/stock/outside.jpg' },
];

it('uses the linked article photo, then stock identity before reference and manufacturer code', () => {
  expect(resolveJangadaArticlePhoto({ foto: '/catalog/article.jpg', stockId: 2 }, stock)).toBe('/catalog/article.jpg');
  expect(resolveJangadaArticlePhoto({ stockId: 2, referencia: 'RL5' }, stock)).toBe('/stock/outside.jpg');
  expect(resolveJangadaArticlePhoto({ referencia: ' rl5 ' }, stock)).toBe('/stock/inside.jpg');
  expect(resolveJangadaArticlePhoto({ codigoFabricante: 'pn-6' }, stock)).toBe('/stock/outside.jpg');
});

it('matches exact names only without an explicit reference and never uses evidence', () => {
  expect(resolveJangadaArticlePhoto({ name: 'luz interior' }, stock)).toBe('/stock/inside.jpg');
  expect(resolveJangadaArticlePhoto({ name: 'Luz' }, stock)).toBeNull();
  expect(resolveJangadaArticlePhoto({ referencia: 'UNKNOWN', name: 'Luz Interior' }, stock)).toBeNull();
  const evidence = { name: 'Unknown', evidencePhotos: ['/evidence.jpg'], fotoAntes: '/before.jpg' };
  expect(resolveJangadaArticlePhoto(evidence, stock)).toBeNull();
});

it('does not choose an arbitrary photo when catalogue identities are ambiguous', () => {
  expect(resolveJangadaArticlePhoto({ referencia: 'RL5' }, [...stock, { ...stock[0], id: 3, foto: '/other.jpg' }])).toBeNull();
  expect(resolveJangadaArticlePhoto({ referencia: 'RL5' }, [...stock, { ...stock[0], id: 3 }])).toBe('/stock/inside.jpg');
  expect(resolveJangadaArticlePhoto({ referencia: 'RL5' }, [{ ...stock[0], foto: ' ' }])).toBeNull();
});

it.each(JANGADA_LIGHT_EQUIPMENT)('resolves $label from the current editable reference without mutating or restoring a cleared field', equipment => {
  const baseline = { inspectionChecklistValues: { [equipment.refKey]: 'RL5' } };
  const edited = { inspectionChecklistValues: { [equipment.refKey]: 'EXT' } };
  const values = readJangadaLightEquipment(edited, equipment);
  expect(resolveJangadaArticlePhoto({ referencia: String(values[equipment.refKey]) }, stock)).toBe('/stock/outside.jpg');
  const cleared = readJangadaLightEquipment({ ...baseline, inspectionChecklistValues: { [equipment.refKey]: '' } }, equipment);
  expect(resolveJangadaArticlePhoto({ referencia: String(cleared[equipment.refKey]) }, stock)).toBeNull();
  expect(baseline.inspectionChecklistValues[equipment.refKey]).toBe('RL5');
});
