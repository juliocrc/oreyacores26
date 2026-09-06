import { NextResponse } from 'next/server';
import { buildQuadroPDFArtifacts } from '@/lib/quadro-pdf-template';
import { saveQuadroToNavioFolder } from '@/lib/certificados-organizados';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { buffer, fileName } = await buildQuadroPDFArtifacts(payload);

    // Guardar no folder organizado por navio (NAVIOS/{navio}/)
    const shipName = (payload as Record<string, unknown>).shipName as string | undefined;
    const raftSerial = (payload as Record<string, unknown>).raftSerial as string | undefined;
    const inspectionDate = (payload as Record<string, unknown>).inspectionDate as string | undefined;
    if (shipName && buffer) {
      await saveQuadroToNavioFolder(shipName, fileName, buffer, {
        serial: raftSerial,
        date: inspectionDate ? new Date(inspectionDate) : undefined,
      });
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
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