import { NextResponse } from 'next/server';
import { buildOreyCertificateArtifacts, type OreyCertificateTemplateInput } from '@/lib/orey-certificate-template';
import { saveCertificadoToYearFolder, getYearFromDate } from '@/lib/certificados-organizados';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const format = (url.searchParams.get('format') || 'html').toLowerCase();
    const payload = (await request.json()) as OreyCertificateTemplateInput;
    const { buffer, html, fileName } = await buildOreyCertificateArtifacts(payload);

    // Gravação no servidor é OPCIONAL (só quando CERTIFICADOS_SAVE_TO_PUBLIC=true)
    // e nunca bloqueia o download. Na Vercel o filesystem é read-only.
    let savedPath: string | undefined;
    if (
      format === 'xlsx' && buffer &&
      process.env.CERTIFICADOS_SAVE_TO_PUBLIC === 'true'
    ) {
      try {
        const year = getYearFromDate(payload.inspectionDate);
        const saved = await saveCertificadoToYearFolder(year, fileName, buffer, {
          serial: payload.raftSerial || undefined,
          date: payload.inspectionDate ? new Date(payload.inspectionDate) : undefined,
          type: "CERT",
        });
        savedPath = saved.relativePath;
      } catch (saveErr) {
        console.warn('Gravação em public/ ignorada (não bloqueia o download):', saveErr);
      }
    }

    if (format === 'xlsx') {
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Cache-Control': 'no-store',
          ...(savedPath ? { 'X-Orey-Saved-Path': savedPath } : {}),
        },
      });
    }

    return NextResponse.json({ html, fileName });
  } catch (error) {
    console.error('Erro ao gerar certificado Orey:', error);
    return NextResponse.json(
      { error: 'Não foi possível gerar o certificado Orey.' },
      { status: 500 }
    );
  }
}