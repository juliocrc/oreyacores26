import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import * as XLSX from 'xlsx';
import nodemailer from 'nodemailer';
import { requireAdminOrBypass } from '../_lib';

interface PrismaModelDelegate {
  findMany: () => Promise<Array<Record<string, unknown>>>
}

const prismaDelegates = prisma as unknown as Record<string, PrismaModelDelegate | undefined>;

export async function POST() {
  const auth = await requireAdminOrBypass();
  if (!auth.ok) return new Response('Não autorizado', { status: auth.status });

  try {
    const modelNames = Object.keys(prisma).filter(
      (key) => !key.startsWith('_') && !key.startsWith('$') && typeof prismaDelegates[key]?.findMany === 'function'
    );

    const wb = XLSX.utils.book_new();

    for (const model of modelNames) {
      const records = await prismaDelegates[model]!.findMany();

      const cleanedRecords = records.map((record) => {
        const cleaned: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(record)) {
          if (value instanceof Date) {
            cleaned[key] = value.toISOString();
          } else if (typeof value === 'object' && value !== null) {
            cleaned[key] = JSON.stringify(value);
          } else {
            cleaned[key] = value;
          }
        }
        return cleaned;
      });

      const ws = XLSX.utils.json_to_sheet(cleanedRecords);
      const sheetName = model.substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_tabelas_${timestamp}.xlsx`;

    const adminEmailString = process.env.AUTH_ADMIN_EMAILS || 'julio.correia@orey.com';
    const adminEmails = adminEmailString.split(',').map(e => e.trim());

    const hasSmtpConfig = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

    if (hasSmtpConfig) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM || `"Gestor Naval Deluxe" <${process.env.SMTP_USER}>`,
        to: adminEmails.join(','),
        subject: `Cópia de Segurança das Tabelas - ${new Date().toLocaleDateString('pt-PT')}`,
        text: `Olá,\n\nSegue em anexo a cópia de segurança em formato Excel (.xlsx) das tabelas do banco de dados do Gestor Naval Deluxe.\n\nData de criação: ${new Date().toLocaleString('pt-PT')}\n\nCumprimentos,\nGestor Naval Deluxe`,
        attachments: [
          {
            filename,
            content: excelBuffer,
          }
        ],
      });

      return NextResponse.json({
        success: true,
        message: `Cópia de segurança enviada com sucesso para ${adminEmails.join(', ')} por e-mail.`,
        simulated: false,
      });
    }

    // Fallback: SMTP not configured, return base64 for browser download
    const base64Data = excelBuffer.toString('base64');
    return NextResponse.json({
      success: true,
      message: `Cópia de segurança em Excel criada. Como os detalhes de SMTP não estão configurados nas variáveis de ambiente (.env), o descarregamento do backup foi iniciado localmente como alternativa.`,
      simulated: true,
      filename,
      fileData: base64Data,
    });
  } catch (error) {
    console.error('Error generating/sending Excel backup:', error);
    return NextResponse.json({ error: (error as Error).message || 'Error processing backup email request' }, { status: 500 });
  }
}
