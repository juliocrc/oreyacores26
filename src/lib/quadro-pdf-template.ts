import ExcelJS from 'exceljs';
import { isSosDocumentRaft, SOS_DOCUMENT_NOTICE } from './raft-document-rules';
import { jsPDF } from 'jspdf';
import { buildQuadroInspectionArtifacts, type QuadroTemplateInput } from './quadro-template';
import { computeWorksheetLayout, renderWorksheetToPdf } from './xlsx-worksheet-render';

export async function buildQuadroPDFArtifacts(input: QuadroTemplateInput) {
  if (isSosDocumentRaft(input)) throw new Error(SOS_DOCUMENT_NOTICE);
  // Render the emitted workbook, rather than maintaining a second document layout.
  const artifacts = await buildQuadroInspectionArtifacts(input);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(artifacts.buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidthMm = doc.internal.pageSize.getWidth();
  const pageHeightMm = doc.internal.pageSize.getHeight();
  const marginX = 6.35;
  const marginY = 8.89;
  const width = pageWidthMm - 2 * marginX;
  const height = pageHeightMm - 2 * marginY;
  // The PDF contains only the QUADRO print area; article annexes remain in Excel.
  const worksheet = workbook.getWorksheet('QUADRO');
  if (!worksheet) throw new Error('Folha QUADRO em falta no modelo de inspecao.');
  const layout = computeWorksheetLayout(worksheet);
  renderWorksheetToPdf(doc, worksheet, workbook, {
    pageWidthMm,
    pageHeightMm,
    maxScale: Math.min(1, width / layout.contentWidth, height / layout.contentHeight),
    contentBox: { x: marginX, y: marginY, width, height },
    fitCellText: true,
  });

  return {
    buffer: Buffer.from(doc.output('arraybuffer')),
    fileName: artifacts.fileName.replace(/\.xlsx$/i, '.pdf'),
  };
}
