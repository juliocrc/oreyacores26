import { NextResponse } from 'next/server';
import { requirePortalClienteId, resolveSavedInspectionDocument, buildSavedInspectionPayload, InspectionDocumentError } from '@/lib/saved-inspection-documents';
import { buildOreyCertificatePdfBuffer } from '@/lib/orey-certificate-pdf';
import { buildQuadroPDFArtifacts } from '@/lib/quadro-pdf-template';
import { buildQuadroInspectionArtifacts } from '@/lib/quadro-template';
import { getStampDataUrl } from '@/lib/certificate-stamp';
import { toDateKey } from '@/lib/date-utils';
import { isSosDocumentRaft, SOS_DOCUMENT_NOTICE } from '@/lib/raft-document-rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    const params = new URL(request.url).searchParams;
    const previewClienteId = params.get('previewClienteId');
    await requirePortalClienteId(previewClienteId);
    const keys = ['jangadaId', 'inspecaoId', 'document', 'format'];
    if (Array.from(params.keys()).some(key => ![...keys, 'previewClienteId'].includes(key)) || keys.some(key => params.getAll(key).length !== 1) ||
        params.getAll('previewClienteId').length > 1 ||
        (previewClienteId != null && (params.get('document') !== 'quadro' || params.get('format') !== 'pdf')) ||
        !['jangadaId', 'inspecaoId'].every(key => /^[1-9]\d*$/.test(params.get(key) || '') && Number.isSafeInteger(Number(params.get(key)))) ||
        !['certificado', 'quadro'].includes(params.get('document') || '') ||
        !['pdf', 'xlsx'].includes(params.get('format') || '') ||
        (params.get('document') === 'certificado' && params.get('format') !== 'pdf')) {
      throw new InspectionDocumentError('Seletores de documento invalidos.', 400);
    }
    const source = await resolveSavedInspectionDocument({ jangadaId: params.get('jangadaId'), inspecaoId: params.get('inspecaoId') }, { audience: 'cliente', previewClienteId });
    const payload = buildSavedInspectionPayload(source);
    const document = params.get('document')!;
    if (document === 'quadro' && isSosDocumentRaft(source.jangada)) throw new InspectionDocumentError(SOS_DOCUMENT_NOTICE, 400);
    const format = params.get('format')!;
    // Re-render saved data only: no emission, verification registration, storage or stock writes.
    const buffer = document === 'certificado'
      ? await buildOreyCertificatePdfBuffer(payload.template, { stamp: {
        imageDataUrl: getStampDataUrl(source.station?.codigo), stationName: source.station?.nome,
      } })
      : format === 'pdf' ? (await buildQuadroPDFArtifacts(payload.quadro)).buffer
        : (await buildQuadroInspectionArtifacts(payload.quadro)).buffer;
    return new NextResponse(new Uint8Array(buffer), { headers: {
      ...headers,
      'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${document}-inspecao-${params.get('inspecaoId')}.${format}"`,
      'X-Inspection-Id': params.get('inspecaoId')!,
      'X-Inspection-Date': toDateKey(source.lastInspecao?.dataInspecao),
    } });
  } catch (error) {
    if (error instanceof InspectionDocumentError) return NextResponse.json({ error: error.message, missingMetadata: error.missingMetadata }, { status: error.status, headers });
    console.error('[portal/documentos]', error);
    return NextResponse.json({ error: 'Nao foi possivel descarregar o documento.' }, { status: 500, headers });
  }
}
