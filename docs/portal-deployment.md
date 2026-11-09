# Portal Deployment Checks

This checklist covers the client portal, official invoices and document templates.
It does not authorize deployment, database changes or live test messages.

## Login Interfaces

- `/portal-cliente` requests a five-digit, single-use code using a registered email
  or phone. The current request form uses email for email addresses and WhatsApp
  for phones, not SMS. Provider acceptance does not prove delivery.
- `/area-cliente/login` accepts NIF plus an already received code. The NIF is an
  identifier, never a password. Both forms use the existing Auth.js client session.
- New codes expire after 1 hour. Configure the existing shared rate limiter before
  deployment; see `pending-activation.md`.
- Email code requests use the global `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` and
  optional `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM` configuration. Configuring only
  the selectable Microsoft 365 sender profiles does not configure login email.
  Phone requests require an operational WhatsApp provider and registered contacts.

## Official Invoices

- The portal filters by the session client's `clienteId`, then requires both a
  Navision reference and uploaded official PDF metadata before taking 10 entries.
  Internal invoices/proformas and reference-only records are not substitutes.
- Totals cover only those displayed entries, excluding cancelled entries from
  financial totals. They are not the full account balance or all invoice history.
- `/api/portal/faturas/[id]/oficial` checks ownership again and streams the file
  with private/no-store headers. Client-supplied ownership/preview selectors cannot
  change that ownership. Admin preview intentionally has no invoice download link.
- Production requires `BLOB_READ_WRITE_TOKEN` and `INVOICE_PDF_ENCRYPTION_KEY`
  (64 hexadecimal characters representing 32 random bytes). Keep the encryption
  key stable and backed up in the server secret manager. Replacing it without a
  separate re-encryption process makes existing PDFs unreadable. Local development
  PDFs do not become production documents automatically.

## Saved Documents

- Portal quadro PDF/XLSX requests use `/api/portal/documentos` with explicit
  `jangadaId`, `inspecaoId`, `document` and `format`. The history portal also uses
  this route for certificate PDF re-rendering. These requests do not issue new
  certificates or register sends. Admin preview is supported only for quadro PDF.
- Saved inspection data must be certified and consistent. Missing or inconsistent
  historical snapshots fail closed; ask the station to recover the archive rather
  than substituting current raft data or another inspection.
- SOS rafts have certificate only: no quadro, Hammar or tests. Stale historical
  HRU/quadro fields must not re-enable those controls.
- The production build command `npm run build:vercel` generates embedded templates.
  Ensure `template certificado orey.xltx` and `template quadro.xlsx` are available
  through the template loader (filesystem or generated embeds). Verify certificate
  PDF, quadro PDF and quadro XLSX with saved fixtures before release.

## Outlook

Local Outlook composition is a `mailto:` hand-off, not server delivery. Set Outlook
as the default MAILTO application on the user's machine, select the From account
manually, and download/attach the selected PDFs manually. The browser cannot force
Outlook, a From account or attachments. No send or delivery history is recorded by
this action. Local composition needs no SMTP/OAuth; server sending does, as described
in `microsoft365-email.md`.
