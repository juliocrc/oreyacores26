import { getApplicableServiceBulletinsForRaft } from '@/modules/rafts/serviceBulletins';

const hasBulletin = (raft: Parameters<typeof getApplicableServiceBulletinsForRaft>[0]) =>
  getApplicableServiceBulletinsForRaft(raft).some(item => item.id === 'rfd-ferryman-inflation-foam-65-13');

test('avisa para Ferryman RFD com lotação indicada', () => {
  for (const capacity of [50, 65, 100, 130]) {
    expect(hasBulletin({ brand: 'RFD', model: 'Ferryman', capacity })).toBe(true);
  }
});

test('não presume modelo, lotação ou marca', () => {
  expect(hasBulletin({ brand: 'RFD', model: 'Ferryman' })).toBe(false);
  expect(hasBulletin({ brand: 'RFD', model: 'Surviva MKIV', capacity: 65 })).toBe(false);
  expect(hasBulletin({ brand: 'RFD', model: 'Ferryman', capacity: 25 })).toBe(false);
  expect(hasBulletin({ brand: 'Outra', model: 'Ferryman', capacity: 65 })).toBe(false);
  expect(hasBulletin({ brand: 'RFD', model: 'Ferryman', capacity: 49 })).toBe(false);
  expect(hasBulletin({ brand: 'RFD', model: 'Ferryman', capacity: 131 })).toBe(false);
  expect(hasBulletin({ brand: 'RFD', capacity: 65 })).toBe(false);
});
