import { NextResponse } from 'next/server';
import { buildOreyCertificateArtifacts, type OreyCertificateTemplateInput } from '@/lib/orey-certificate-template';
import { saveCertificadoToYearFolder, getYearFromDate } from '@/lib/certificados-organizados';
import { syncEmittedDocumentToOneDrive } from '@/lib/onedrive-sync';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const format = (url.searchParams.get('format') || 'html').toLowerCase();
    const payload = (await request.json()) as OreyCertificateTemplateInput;
    const { buffer, html, fileName } = await buildOreyCertificateArtifacts(payload);

    let savedPath: string | undefined;

    // Sincronização direta com OneDrive (certificados e pasta do navio)
    if (format === 'xlsx' && buffer) {
      try {
        const syncRes = await syncEmittedDocumentToOneDrive({
          kind: 'certificado',
          fileName,
          buffer,
          shipName: payload.shipName || undefined,
        });
        if (syncRes.synced && syncRes.filePath) {
          savedPath = syncRes.filePath;
        }
      } catch (syncErr) {
        console.warn('[certificados/orey] Erro ao sincronizar OneDrive:', syncErr);
      }

      // Gravação local em public/ opcional em dev
      if (process.env.CERTIFICADOS_SAVE_TO_PUBLIC === 'true') {
        try {
          const year = getYearFromDate(payload.inspectionDate);
          const saved = await saveCertificadoToYearFolder(year, fileName, buffer, {
            serial: payload.raftSerial || undefined,
            date: payload.inspectionDate ? new Date(payload.inspectionDate) : undefined,
            type: "CERT",
          });
          if (!savedPath) savedPath = saved.relativePath;
        } catch (saveErr) {
          console.warn('Gravação em public/ ignorada:', saveErr);
        }
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