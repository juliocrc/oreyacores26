import nodemailer from "nodemailer";

export type EmailSenderAccount = "julio" | "tecnica";
export type EmailSenderAccountOption = {
  id: EmailSenderAccount;
  email: string;
  label: string;
  configured: boolean;
};

const senderAccounts = {
  julio: { email: "julio.correia@orey.com", label: "Julio Correia" },
  tecnica: { email: "azores.tecnica@orey.com", label: "Orey Tecnica Acores" },
} as const;
const smtpScope = "https://outlook.office.com/SMTP.Send";

export function isEmailSenderAccount(value: unknown): value is EmailSenderAccount {
  return value === "julio" || value === "tecnica";
}

function profileConfig(id: EmailSenderAccount) {
  const tenantId = (id === "julio" ? process.env.M365_JULIO_TENANT_ID : process.env.M365_TECNICA_TENANT_ID) ?? process.env.M365_TENANT_ID;
  const clientId = (id === "julio" ? process.env.M365_JULIO_CLIENT_ID : process.env.M365_TECNICA_CLIENT_ID) ?? process.env.M365_CLIENT_ID;
  const clientSecret = (id === "julio" ? process.env.M365_JULIO_CLIENT_SECRET : process.env.M365_TECNICA_CLIENT_SECRET) ?? process.env.M365_CLIENT_SECRET;
  const refreshToken = id === "julio" ? process.env.M365_JULIO_REFRESH_TOKEN : process.env.M365_TECNICA_REFRESH_TOKEN;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!tenantId || !uuid.test(tenantId) || !clientId || !uuid.test(clientId) ||
      !clientSecret?.trim() || !refreshToken?.trim()) return null;
  return { tenantId, clientId, clientSecret, refreshToken };
}

// Safe metadata only. Configuration presence is not a live authorization check.
export function getEmailSenderAccounts(): EmailSenderAccountOption[] {
  return (Object.keys(senderAccounts) as EmailSenderAccount[]).map((id) => ({
    id, email: senderAccounts[id].email, label: senderAccounts[id].label,
    configured: isEmailConfigured(id),
  }));
}

async function profileTransporter(id: EmailSenderAccount): Promise<nodemailer.Transporter | null> {
  const config = profileConfig(id);
  if (!config) return null;
  const response = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      scope: smtpScope,
    }),
  });
  // Never surface provider response bodies, which may contain credentials or tokens.
  if (!response.ok) throw new Error("Microsoft365 authorization failed");
  const token: unknown = await response.json();
  if (!token || typeof token !== "object" || !("access_token" in token) ||
      typeof token.access_token !== "string" || !token.access_token.trim() ||
      !("token_type" in token) || typeof token.token_type !== "string" ||
      token.token_type.toLowerCase() !== "bearer") {
    throw new Error("Invalid Microsoft365 token response");
  }
  return nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    requireTLS: true,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    logger: false,
    debug: false,
    auth: { type: "OAuth2", user: senderAccounts[id].email, accessToken: token.access_token },
  });
}

function criarTransporter(): nodemailer.Transporter | null {
  if (!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    ...(process.env.SMTP_HOST === "smtp.gmail.com" ? {
      requireTLS: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    } : {}),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export function isEmailConfigured(senderAccount?: EmailSenderAccount): boolean {
  if (senderAccount !== undefined) {
    return isEmailSenderAccount(senderAccount) && profileConfig(senderAccount) !== null;
  }
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export type EmailAttachment = {
  filename: string;
  content: Buffer | string;
  contentType?: string;
};

export async function sendEmail(opts: {
  senderAccount?: EmailSenderAccount;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
}): Promise<{ ok: boolean; error?: string }> {
  const selected = opts.senderAccount !== undefined;
  if (selected && !isEmailSenderAccount(opts.senderAccount)) {
    return { ok: false, error: "Conta de email invalida." };
  }
  let transporter: nodemailer.Transporter | null = null;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    transporter = selected ? await profileTransporter(opts.senderAccount!) : criarTransporter();
    if (!transporter) return { ok: false, error: selected
      ? "Conta Microsoft365 nao configurada. Contacte o administrador."
      : "Email não configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASS." };
    const sending = transporter.sendMail({
      from: selected ? senderAccounts[opts.senderAccount!].email
        : process.env.SMTP_FROM || `"Orey Tecnica- Serviços Navais, Lda — Gestor Naval" <${process.env.SMTP_USER}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    if (selected) {
      await Promise.race([sending, new Promise<never>((_, reject) => {
        deadline = setTimeout(() => {
          transporter?.close();
          reject(new Error("Microsoft365 SMTP timeout"));
        }, 30_000);
      })]);
    } else {
      await sending;
    }
    return { ok: true };
  } catch (error) {
    if (selected) return { ok: false, error: "Nao foi possivel enviar pela conta Microsoft365 selecionada. Contacte o administrador." };
    console.error("[email-sender] Erro ao enviar e-mail:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Erro ao enviar e-mail." };
  } finally {
    if (deadline) clearTimeout(deadline);
    if (selected) transporter?.close();
  }
}
