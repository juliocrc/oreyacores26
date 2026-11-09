import { canonicalizeRaftModel } from '../text-normalization';

it.each(['LR05', 'LR 05', 'LR-05', 'DSB LR05', 'DSB LR 05'])('normalizes DSB %s to LR05', model => {
  expect(canonicalizeRaftModel(model, 'DSB')).toBe('LR05');
});
it('preserves distinct variants and other brands', () => {
  expect(canonicalizeRaftModel('LR05L', 'DSB')).toBe('LR05L');
  expect(canonicalizeRaftModel('LR 05 DL', 'DSB')).toBe('LR 05 DL');
  expect(canonicalizeRaftModel('LR 05', 'OTHER')).toBe('LR 05');
});
