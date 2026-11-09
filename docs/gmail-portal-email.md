# Gmail Portal Email

Production code delivery uses the server's global SMTP configuration, not the
Outlook desktop app or the selectable Microsoft 365 profiles.

The intended sender is `assistenciaoreyazores@gmail.com`:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=assistenciaoreyazores@gmail.com
SMTP_FROM=assistenciaoreyazores@gmail.com
SMTP_PASS=
```

Enable 2-Step Verification for that Google account. Create an app password at
https://myaccount.google.com/apppasswords, named for this application. Store it
privately as a sensitive `SMTP_PASS` environment variable in Vercel Production.
Do not use the ordinary account password and do not put either password in chat,
source control, browser storage or logs. Redeploy after saving the secret.

The public portal accepts an existing email or phone number as an identifier. A
phone lookup still delivers the code to the email already stored on that client's
record, never to a newly declared address or automatically by WhatsApp. Without a
stored email the request is assigned to assistance for manual code delivery.

Gmail connections require STARTTLS. SMTP availability checks indicate configuration
presence, not that Google accepted the credentials. Validate delivery only with an
authorized recipient; do not repeatedly request codes after an uncertain send.

Each rate-limited request for a registered client's access is saved as an assistance
request with origin `portal_acesso` and appears in the internal notifications feed.
It records the channel and delivery status but never the access code. The contact
is explicitly marked as not yet authenticated. Missing email configuration does
not replace an existing access code. The administrator can generate a new code in
the client's ficha and communicate it through an authorized channel.
