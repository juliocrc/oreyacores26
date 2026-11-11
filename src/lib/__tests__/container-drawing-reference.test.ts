import { containerDrawingReference } from '../container-drawing-reference';

it('keeps the two MK14 size 17 cradle drawings distinct', () => {
  const result = containerDrawingReference({ brand: 'DSB', containerModel: 'MK 14', containerSize: '17' });
  expect(result?.dimensions).toContain('803 mm');
  expect(result?.dimensions).toContain('725 mm');
  expect(result?.associations.join(' ')).toContain('LR 07 L DL');
});

it('shows the user-confirmed SeaSava Plus association only for 10 and 12 persons', () => {
  const raft = { brand: 'RFD', model: 'SEASAVA PLUS', containerModel: 'MK16', containerSize: '2' };
  expect(containerDrawingReference({ ...raft, capacity: 10 })?.userAssociation).toContain('indicada pelo utilizador');
  expect(containerDrawingReference({ ...raft, capacity: 12 })?.userAssociation).toBeTruthy();
  expect(containerDrawingReference({ ...raft, capacity: 6 })?.userAssociation).toBeNull();
  expect(containerDrawingReference({ ...raft, model: 'SEASAVA PLUS R', capacity: 10 })?.userAssociation).toBeNull();
});

it('requires an identified container and warns about RFD applicability', () => {
  expect(containerDrawingReference({ brand: 'DSB', containerModel: 'MK14' })).toBeNull();
  expect(containerDrawingReference({ brand: 'OTHER', containerModel: 'MK14', containerSize: '14' })).toBeNull();
  expect(containerDrawingReference({ brand: 'RFD', containerModel: 'MK14', containerSize: '14' })?.brandNote).toContain('não está comprovada');
  expect(containerDrawingReference({ brand: 'DSB', containerModel: 'MK16', containerSize: '2' })?.associations).toEqual([]);
});
