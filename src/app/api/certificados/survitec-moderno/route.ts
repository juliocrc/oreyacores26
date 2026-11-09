import { NextResponse } from 'next/server';
import { buildSurvitecModernReportHtml } from '@/lib/survitec-modern-report-template';
import { resolveSavedInspectionDocument, buildSavedInspectionPayload, InspectionDocumentError } from '@/lib/saved-inspection-documents';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const payload = buildSavedInspectionPayload(await resolveSavedInspectionDocument(await request.json())).template;
    const { html, fileName } = buildSurvitecModernReportHtml(payload);

    // Note: Survitec moderno returns HTML only (no buffer). 
    // If buffer is available in future, save to year folder:
    // if (buffer) { const year = getYearFromDate(payload.inspectionDate); await saveCertificadoToYearFolder(year, fileName, buffer); }

    return NextResponse.json({ html, fileName });
  } catch (error) {
    if (error instanceof InspectionDocumentError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Erro ao gerar relatório moderno Survitec:', error);
    return NextResponse.json(
      { error: 'Não foi possível gerar o relatório de inspeção moderno.' },
      { status: 500 }
    );
  }
}
