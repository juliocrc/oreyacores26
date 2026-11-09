import { canUseEmailSenderProfiles } from '../email-sender-access';

it.each(['julio.correia@orey.com', ' JULIO.CORREIA@OREY.COM\t'])('authorizes only the normalized authenticated email: %s', email => {
  expect(canUseEmailSenderProfiles(email)).toBe(true);
});

it.each([null, undefined, '', 'Julio Correia', 'azores.tecnica@orey.com', 'admin@orey.com', 'julio.correia@orey.com.evil', 'julio.correia+admin@orey.com'])('rejects other identities: %s', email => {
  expect(canUseEmailSenderProfiles(email)).toBe(false);
});
