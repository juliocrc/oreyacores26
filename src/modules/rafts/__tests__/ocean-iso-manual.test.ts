import { getMandatoryPackItemsForRaft } from '../mandatoryPack';
import { findRaftTechnicalModel } from '../raftModelData';

it('não sugere o pack offshore ou um pack não confirmado para Ocean ISO UltraLite', () => {
  for (const packType of ['OFFSHORE', 'SOLAS B', 'ISO-RAFT']) {
    expect(getMandatoryPackItemsForRaft({ brand: 'Ocean Safety', model: 'ISO UltraLite', capacity: 8, packType })).toEqual([]);
  }
});

it('não confunde os kits standard e UltraLite', () => {
  const ultra = findRaftTechnicalModel('Ocean Safety', 'ISO UltraLite');
  expect(ultra?.serviceItems?.map(item => item.reference)).toEqual(expect.arrayContaining(['OSL8015S', 'OSL8015L']));
  expect(ultra?.serviceItems?.map(item => item.reference)).not.toContain('OSL8010S');
  expect(findRaftTechnicalModel('Ocean Safety', 'ISO')?.serviceItems?.map(item => item.reference)).toContain('OSL8010L');
});
