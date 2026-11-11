import { canonicalizeRaftModel, raftModelWithoutBrand } from '../text-normalization';

it('removes the matching brand prefix without confusing it with the model', () => {
  expect(canonicalizeRaftModel('EUROVINIL SD INTL', 'EUROVINIL')).toBe('SD INTL');
  expect(canonicalizeRaftModel('ZODIAC OPEN', 'ZODIAC')).toBe('OPEN');
  expect(raftModelWithoutBrand('EUROVINIL-PLUS', 'EUROVINIL')).toBe('EUROVINIL-PLUS');
  expect(raftModelWithoutBrand('RFD', 'RFD')).toBe('RFD');
  expect(raftModelWithoutBrand('OTHER SD INTL', 'EUROVINIL')).toBe('OTHER SD INTL');
});
