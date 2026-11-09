import { NextResponse } from 'next/server';
import { getAccessContext } from '@/lib/access-control';
import { resolveSavedInspectionDocument, buildSavedInspectionPayload, InspectionDocumentError } from '@/lib/saved-inspection-documents';
import { buildOreyCertificatePdfBuffer } from '@/lib/orey-certificate-pdf';
import { buildQuadroPDFArtifacts } from '@/lib/quadro-pdf-template';
import type { OreyCertificateTemplateInput } from '@/lib/orey-certificate-template';
import type { QuadroTemplateInput } from '@/lib/quadro-template';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const runtime = 'nodejs';

// Deliberately separate from emission: no verification registration, stamp, storage or sync.
export async function POST(request: Request) {
  try {
    if (!await getAccessContext()) return NextResponse.json({ error: 'Sessao obrigatoria.' }, { status: 401 });
    const body = await request.json();
    if (!body || !['certificado', 'quadro'].includes(body.document) || !['saved', 'draft'].includes(body.source)) {
      return NextResponse.json({ error: 'Documento ou origem invalida.' }, { status: 400 });
    }
    const saved = body.source === 'saved'
      ? buildSavedInspectionPayload(await resolveSavedInspectionDocument(body)) : null;
    if (!saved && (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload))) {
      return NextResponse.json({ error: 'Payload de rascunho obrigatorio.' }, { status: 400 });
    }
    const payload = { ...(saved ? body.document === 'quadro' ? saved.quadro : saved.template : body.payload),
      verificationHash: undefined, verificationQr: undefined };
    const buffer = body.document === 'quadro'
      ? (await buildQuadroPDFArtifacts(payload as QuadroTemplateInput)).buffer
      : await buildOreyCertificatePdfBuffer(payload as OreyCertificateTemplateInput);
    // The browser PDF viewer can download/print: the file itself must identify
    // this as a preview, not only the surrounding interface.
    const pdf = await PDFDocument.load(buffer);
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    for (const page of pdf.getPages()) {
      const label = 'PRE-VISUALIZACAO - NAO EMITIDO';
      const size = 10;
      page.drawText(label, {
        x: Math.max(8, (page.getWidth() - font.widthOfTextAtSize(label, size)) / 2),
        y: 12, size, font, color: rgb(0.65, 0.12, 0.12),
      });
    }
    return new NextResponse(new Uint8Array(await pdf.save()), { headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="preview-${body.document}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Preview-Source': body.source,
      'X-Document-Status': 'preview-not-issued',
      'X-Inspection-Id': body.source === 'saved' ? String(body.inspecaoId) : '',
      'X-Inspection-Date': String(payload.inspectionDate || ''),
    } });
  } catch (error) {
    if (error instanceof InspectionDocumentError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'JSON invalido.' }, { status: 400 });
    console.error('[documentos/preview]', error);
    return NextResponse.json({ error: 'Nao foi possivel gerar a pre-visualizacao.' }, { status: 500 });
  }
}
