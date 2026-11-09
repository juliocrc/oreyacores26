const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

/** A responsive, email-client-safe shell for messages composed in the communications centre. */
export function buildCommunicationEmailHtml(message: string, subject: string): string {
  const safeMessage = escapeHtml(message).replace(/\r?\n/g, "<br>");
  const safeSubject = escapeHtml(subject);

  return `<!doctype html>
<html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1e293b">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:32px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,.10)">
      <tr><td style="padding:28px 32px;background:linear-gradient(135deg,#0f172a,#1d4ed8);color:#ffffff">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#bfdbfe">Orey Técnica</p>
        <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:700">${safeSubject}</h1>
      </td></tr>
      <tr><td style="padding:32px;font-size:16px;line-height:1.7;color:#334155">${safeMessage}</td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.55">
        <strong style="color:#334155">Orey Técnica — Serviços Navais, Lda</strong><br>
        Esta mensagem foi enviada através do Gestor Naval Orey.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
