export const MAX_MAILTO_LENGTH = 2000;

export function buildLocalEmailUri(recipient: string, subject: string, body: string): string {
  const to = recipient.trim();
  // Accept one plain address only, never mailto headers or an address list.
  if (!/^[a-z0-9.!#$&'*+\-/=?^_`{|}~]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(to) || /[%\x00-\x20\x7f]/.test(to)) {
    throw new Error('Indique um unico email valido, sem nomes, listas ou cabecalhos.');
  }
  if (/[\x00-\x1f\x7f]/.test(subject)) throw new Error('O assunto nao pode conter quebras de linha ou caracteres de controlo.');
  if (!subject.trim() || !body.trim()) throw new Error('Preencha o assunto e a mensagem.');
  const normalizedBody = body.replace(/\r\n|\r|\n/g, '\r\n');
  const uri = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(normalizedBody)}`;
  if (uri.length > MAX_MAILTO_LENGTH) {
    throw new Error('Mensagem demasiado longa para abrir por mailto (limite de 2000 caracteres codificados). Reduza o texto ou copie o destinatario, assunto e mensagem para um novo email no Outlook. Descarregue os documentos abaixo, quando aplicavel, e anexe-os manualmente. Nada foi enviado.');
  }
  return uri;
}
