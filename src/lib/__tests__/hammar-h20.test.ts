import { hammarH20RExpiry, isHammarH20RReference, validateHammarH20R } from '../hammar-h20';

it('only recognises the confirmed stock reference', () => {
  expect(isHammarH20RReference('20701002')).toBe(true);
  expect(isHammarH20RReference('20909266')).toBe(false);
  expect(isHammarH20RReference('H20 RX')).toBe(false);
});
it('calculates 24 months from the actual installation month', () => {
  expect(hammarH20RExpiry('10/2026')).toBe('10/2028');
  expect(hammarH20RExpiry('12/2026')).toBe('12/2028');
  expect(hammarH20RExpiry('')).toBe('');
});
it('requires verification and a real installation month and caps expiry', () => {
  const data = { verified: true, installation: '10/2026', inspectionDate: '2026-10-27', expiry: '10/2028' };
  expect(validateHammarH20R(data)).toBeNull();
  expect(validateHammarH20R({ ...data, verified: false })).not.toBeNull();
  expect(validateHammarH20R({ ...data, installation: '' })).not.toBeNull();
  expect(validateHammarH20R({ ...data, installation: '11/2026' })).not.toBeNull();
  expect(validateHammarH20R({ ...data, expiry: '11/2028' })).not.toBeNull();
  expect(validateHammarH20R({ ...data, expiry: '09/2028' })).toBeNull();
});
