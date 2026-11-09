import { buildLocalEmailUri, MAX_MAILTO_LENGTH } from '../local-email-compose';

it('encodes recipient, Unicode, reserved characters and CRLF without extra headers', () => {
  const uri = buildLocalEmailUri(' owner+raft@example.test ', 'Inspeção & #1?', 'Olá & obrigado\nLinha 2\rLinha 3\r\nFim');
  expect(uri).toBe('mailto:owner%2Braft%40example.test?subject=Inspe%C3%A7%C3%A3o%20%26%20%231%3F&body=Ol%C3%A1%20%26%20obrigado%0D%0ALinha%202%0D%0ALinha%203%0D%0AFim');
  expect([...new URL(uri).searchParams.keys()]).toEqual(['subject', 'body']);
});

it.each(['a@example.test\r\nBcc:x@example.test', 'a@example.test?bcc=x@example.test', 'a%0d%0a@example.test', 'A <a@example.test>', 'a@example.test,b@example.test', 'a@example.test;b@example.test', 'a@example.test#x', ''])('rejects recipient injection: %s', recipient => {
  expect(() => buildLocalEmailUri(recipient, 'Subject', 'Body')).toThrow('email valido');
});

it.each(['Subject\r\nBcc: x@example.test', 'Subject\nextra', 'Subject\u0000'])('rejects subject control characters', subject => {
  expect(() => buildLocalEmailUri('a@example.test', subject, 'Body')).toThrow('controlo');
});

it('measures the encoded URI and never truncates a long message', () => {
  const body = 'ç'.repeat(MAX_MAILTO_LENGTH);
  expect(() => buildLocalEmailUri('a@example.test', 'Subject', body)).toThrow(/Reduza o texto ou copie/);
});

it.each([['', 'Body'], ['Subject', ' ']])('requires subject and message', (subject, body) => {
  expect(() => buildLocalEmailUri('a@example.test', subject, body)).toThrow('Preencha');
});
