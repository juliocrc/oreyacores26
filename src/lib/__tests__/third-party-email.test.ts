import { buildThirdPartyEmail } from '../third-party-email';

it('prepares an unsent email with the exact spreadsheet attached and a fixed recipient', () => {
  const bytes = new Uint8Array([80, 75, 3, 4, 0, 255]);
  const eml = buildThirdPartyEmail('José Ávila', 7, bytes);
  expect(eml).toContain('To: terceiros@orey.com\r\n');
  expect(eml).toContain('filename="ficha_terceiro_7.xlsx"');
  expect(eml).toContain(btoa(String.fromCharCode(...bytes)));
  expect(eml).not.toContain('Bcc:');
});

it('prevents header injection and rejects an empty attachment', () => {
  expect(buildThirdPartyEmail('Nome\r\nBcc: evil@example.com', 7, new Uint8Array([1]))).not.toContain('\r\nBcc:');
  expect(() => buildThirdPartyEmail('Cliente', 7, new Uint8Array())).toThrow();
});

it('includes the logged-in name and company in the message body', () => {
  const eml = buildThirdPartyEmail('Cliente', 7, new Uint8Array([1]), 'João Correia');
  const encoded = eml.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, '');
  const body = new TextDecoder().decode(Uint8Array.from(atob(encoded), char => char.charCodeAt(0)));
  expect(body).toContain('Com os melhores cumprimentos,\r\nJoão Correia\r\nOrey Tecnica- Serviços Navais, Lda');
});
