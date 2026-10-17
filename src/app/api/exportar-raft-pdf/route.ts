import { NextResponse } from 'next/server';
import { buildQuadroPDFArtifacts } from '@/lib/quadro-pdf-template';
import { saveQuadroToNavioFolder } from '@/lib/certificados-organizados';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { buffer, fileName } = await buildQuadroPDFArtifacts(payload);

    // Gravação no servidor é OPCIONAL (só quando CERTIFICADOS_SAVE_TO_PUBLIC=true)
    // e nunca bloqueia o download. Na Vercel o filesystem é read-only.
    const shipName = (payload as Record<string, unknown>).shipName as string | undefined;
    const raftSerial = (payload as Record<string, unknown>).raftSerial as string | undefined;
    const inspectionDate = (payload as Record<string, unknown>).inspectionDate as string | undefined;
    let savedPath: string | undefined;
    if (shipName && buffer && process.env.CERTIFICADOS_SAVE_TO_PUBLIC === 'true') {
      try {
        const saved = await saveQuadroToNavioFolder(shipName, fileName, buffer, {
          serial: raftSerial,
          date: inspectionDate ? new Date(inspectionDate) : undefined,
        });
        savedPath = saved.relativePath;
      } catch (saveErr) {
        console.warn('Gravação em public/ ignorada (não bloqueia o download):', saveErr);
      }
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
        ...(savedPath ? { 'X-Orey-Saved-Path': savedPath } : {}),
      },
    });
  } catch (error) {
    console.error('Erro ao gerar quadro PDF:', error);
    return NextResponse.json(
      { error: 'Não foi possível gerar o quadro PDF.' },
      { status: 500 }
    );
  }
}