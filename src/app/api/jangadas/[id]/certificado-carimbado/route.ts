import { NextResponse } from 'next/server';
import { getAccessContext } from '@/lib/access-control';
import { buildCarimbadoCertificatePdf } from '@/lib/certificate-carimbado-pdf';
import { saveExternalCertificadoToNavioFolder } from '@/lib/certificados-organizados';
import { logAuditoria } from '@/lib/auditoria';
import { resolveSavedInspectionDocument, InspectionDocumentError } from '@/lib/saved-inspection-documents';

export const runtime = 'nodejs';

/** Emit only the selected saved inspection, never live raft data or a draft. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: 'Sessão obrigatória.' }, { status: 401 });
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'ID de jangada inválido.' }, { status: 400 });
    const body = await request.json().catch(() => null);
    const source = await resolveSavedInspectionDocument({ jangadaId: id, inspecaoId: body?.inspecaoId });
    const built = await buildCarimbadoCertificatePdf(source);
    let savedPath: string | undefined;
    try {
      const saved = await saveExternalCertificadoToNavioFolder(built.input.shipName || 'Sem navio', built.fileName, built.buffer, {
        serial: built.input.raftSerial || undefined,
        date: built.input.inspectionDate ? new Date(built.input.inspectionDate) : undefined,
      });
      savedPath = saved.relativePath;
    } catch (error) {
      console.warn('[certificado-carimbado] Erro ao gravar:', error);
    }
    await logAuditoria({
      tabela: 'Jangada', tipoOperacao: 'UPDATE', idRegisto: id,
      usuario: access.email || String(access.userId) || 'sistema',
      descricao: `Emissão do certificado carimbado da inspeção ${body.inspecaoId}.`,
      dadosDepois: { inspecaoId: body.inspecaoId, certNumber: built.input.certNumber,
        verificationHash: built.input.verificationHash, savedPath },
    }).catch(() => {});
    return new NextResponse(new Uint8Array(built.buffer), { headers: {
      'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${built.fileName}"`,
      'Cache-Control': 'no-store', ...(savedPath ? { 'X-Orey-Saved-Path': savedPath } : {}),
    } });
  } catch (error) {
    if (error instanceof InspectionDocumentError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[POST /api/jangadas/[id]/certificado-carimbado]', error);
    return NextResponse.json({ error: 'Não foi possível gerar o certificado carimbado.' }, { status: 500 });
  }
}
