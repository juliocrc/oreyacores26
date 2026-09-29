/**
 * Utilitário de Notificações por Email para Alertas de Validade e Inspeções
 * Integra com Nodemailer para envio automático de avisos aos armadores/clientes.
 */

import nodemailer from "nodemailer";

export interface AlertEmailOptions {
  to: string;
  subject: string;
  raftSerial: string;
  shipName: string;
  expiryDate: string;
}

export async function sendInspectionExpiryAlert(options: AlertEmailOptions): Promise<boolean> {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.example.com",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
  });

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.log("[EmailAlerts] SMTP não configurado. Alerta simulado para:", options.to);
    return true;
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Orey Açores - Estação de Serviço" <noreply@orey.pt>',
      to: options.to,
      subject: options.subject || `Aviso de Inspeção: Jangada ${options.raftSerial} (${options.shipName})`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
          <h2 style="color: #004085;">Aviso de Validade / Inspeção de Jangada</h2>
          <p>Exmo(a). Sr(a). Armador/Responsável pelo navio <strong>${options.shipName}</strong>,</p>
          <p>Informamos que a jangada salva-vidas com o número de série <strong>${options.raftSerial}</strong> tem inspeção prevista/expira em <strong>${options.expiryDate}</strong>.</p>
          <p>Por favor contacte a nossa estação de serviço para agendar a revisão obrigatória.</p>
          <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;" />
          <p style="font-size: 12px; color: #666;">Orey Açores - Serviços Marítimos</p>
        </div>
      `,
    });
    return true;
  } catch (e) {
    console.error("[EmailAlerts] Erro ao enviar email de alerta:", e);
    return false;
  }
}
