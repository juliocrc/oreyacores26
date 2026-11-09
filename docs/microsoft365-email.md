# Microsoft365 Outbound Accounts

The server supports **delegated OAuth2 refresh tokens only** for selected accounts:

| ID | Fixed From and SMTP identity |
| --- | --- |
| `julio` | `julio.correia@orey.com` |
| `tecnica` | `azores.tecnica@orey.com` |

No client-supplied address, credential, tenant, token endpoint, or SMTP host is accepted.
Profile failures never fall back to the other profile or legacy SMTP. Existing callers
that omit `senderAccount` keep their existing global `SMTP_*` behavior.

## Administrator Setup

1. Register a confidential, single-tenant application in Microsoft Entra ID, with an administrator-controlled HTTPS redirect URI used only for initial provisioning. Create a client secret and record its expiry. This implementation does not use application/client-credentials permissions.
2. Add **Office 365 Exchange Online delegated `SMTP.Send`**, not Microsoft Graph `Mail.Send`. Obtain tenant admin consent under the organization's consent policies. Request `offline_access` during the authorization-code flow so a refresh token is issued. Do not use mailbox passwords or app passwords.
3. Confirm that Exchange Online allows OAuth SMTP AUTH for the tenant and each mailbox. Review organization policy, Security Defaults, Conditional Access, licensing, and mailbox SMTP AUTH settings with the tenant administrator; some policies disable SMTP AUTH entirely. Do not enable Basic authentication to work around a policy denial.
4. Provision each token privately using the authorization-code flow with PKCE (`S256`), a cryptographically random validated `state`, the registered redirect URI, and an interactive sign-in for the exact corresponding mailbox. Use `https://login.microsoftonline.com/<tenant-guid>/oauth2/v2.0/authorize` and `/token`, requesting `offline_access https://outlook.office.com/SMTP.Send`. Exchange the code server-side with the client ID, client secret, redirect URI, and PKCE verifier. Never paste tokens into application requests, logs, source control, or browser storage. The application does not expose an OAuth callback/provisioning endpoint.
5. Store the resulting credentials in the deployment's server secret manager:

```dotenv
M365_TENANT_ID=<directory-tenant-guid>
M365_CLIENT_ID=<application-client-guid>
M365_CLIENT_SECRET=<confidential-application-secret>
M365_JULIO_REFRESH_TOKEN=<refresh-token-for-julio.correia@orey.com>
M365_TECNICA_REFRESH_TOKEN=<refresh-token-for-azores.tecnica@orey.com>
```

Optional `M365_JULIO_TENANT_ID`, `M365_JULIO_CLIENT_ID`, `M365_JULIO_CLIENT_SECRET`
and equivalent `M365_TECNICA_*` override shared settings. An explicitly empty override
disables that profile instead of inheriting the shared value. IDs must be GUIDs.
Never prefix secrets with `NEXT_PUBLIC_`.

If the technical address is a shared mailbox without interactive sign-in, an admin
must provision a licensed delegate with explicit **Send As** permission for that
mailbox, and provision its delegated refresh token for the technical profile. SMTP
still uses `azores.tecnica@orey.com` as its XOAUTH2 user and From. Verify this supported
shared-mailbox delegation with the tenant admin; do not substitute another From.

Refresh-token renewal is performed in memory for each send, with no token cache or
automatic persistent rotation. Returned replacement refresh tokens are not stored.
Monitor consent revocations, Conditional Access/session policies, refresh-token
expiry and client-secret expiry. Reauthorize/reprovision secrets when required;
configuration status alone does not prove a token is valid. No automatic retry is
performed, since an SMTP timeout can occur after delivery has been accepted.

## Integration API

All exports below are from `src/lib/email-sender.ts`, for server-side use only:

```ts
type EmailSenderAccount = "julio" | "tecnica";
type EmailSenderAccountOption = {
  id: EmailSenderAccount;
  email: string;
  label: string;
  configured: boolean;
};
isEmailSenderAccount(value: unknown): value is EmailSenderAccount;
getEmailSenderAccounts(): EmailSenderAccountOption[];
isEmailConfigured(senderAccount?: EmailSenderAccount): boolean;
// Existing send options and result are preserved, with one optional field:
sendEmail({ to, subject, text, html, attachments, senderAccount });
// Promise<{ ok: boolean; error?: string }>
```

Validate a present `senderAccount` request field with `isEmailSenderAccount` before
calling the sender; reject invalid values rather than turning them into `undefined`.
Only an omitted selection requests legacy behavior. Runtime invalid selections
(including `null` or empty strings) are rejected by the sender as defense in depth.
Expose metadata and accept selection only inside existing authenticated, authorized
send endpoints. These helpers do not grant authorization or replace route checks.

`getEmailSenderAccounts()` returns only the fixed ID, address, label and configuration
presence boolean, never secrets or provider errors. It performs no provider calls.

Selected sends obtain a token from the fixed Microsoft login host (10-second timeout,
no redirects) with `https://outlook.office.com/SMTP.Send`, then use Nodemailer XOAUTH2
on `smtp.office365.com:587` with required STARTTLS, certificate validation and TLS 1.2+.
SMTP has connection/greeting/idle timeouts and a 30-second overall send deadline.
Selected-path errors are fixed generic messages; provider errors/tokens are not logged.

Microsoft references:
- https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth
- https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission
- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
