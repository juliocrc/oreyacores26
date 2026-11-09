const encodeBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const wrap = (value: string) => value.match(/.{1,76}/g)?.join('\r\n') || '';

/** Builds an unsent RFC 5322 message with the generated spreadsheet attached. */
export function buildThirdPartyEmail(clientName: string, clientId: number, attachment: Uint8Array, userName?: string | null): string {
  if (!Number.isSafeInteger(clientId) || clientId <= 0 || !attachment.length) throw new Error('Ficha de terceiro inválida.');
  const name = clientName.replace(/[\r\n\x00-\x1f\x7f]/g, ' ').trim().slice(0, 200) || `Cliente ${clientId}`;
  const subject = `Pedido de criação de terceiro — ${name}`;
  const sender = String(userName || '').replace(/[\r\n\x00-\x1f\x7f]/g, ' ').trim().slice(0, 200);
  const body = `Bom dia,\r\n\r\nSolicito a criação do terceiro ${name}.\r\n\r\nSegue em anexo a respetiva ficha de terceiro.\r\n\r\nObrigado.\r\n\r\nCom os melhores cumprimentos,\r\n${sender ? `${sender}\r\n` : ''}Orey Tecnica- Serviços Navais, Lda`;
  const encoder = new TextEncoder();
  const boundary = `orey-third-party-${crypto.randomUUID()}`;
  return [
    'To: terceiros@orey.com', `Subject: =?UTF-8?B?${encodeBase64(encoder.encode(subject))}?=`,
    'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    wrap(encodeBase64(encoder.encode(body))), `--${boundary}`,
    'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="ficha_terceiro_${clientId}.xlsx"`, '',
    wrap(encodeBase64(attachment)), `--${boundary}--`, '',
  ].join('\r\n');
}
