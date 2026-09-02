import nodemailer from "nodemailer";

function criarTransporter(): nodemailer.Transporter | null {
  if (!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const transporter = criarTransporter();
  if (!transporter) return { ok: false, error: "Email não configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASS." };
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"Orey Açores — Gestor Naval" <${process.env.SMTP_USER}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return { ok: true };
  } catch (error) {
    console.error("[email-sender] Erro ao enviar e-mail:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Erro ao enviar e-mail." };
  }
}
