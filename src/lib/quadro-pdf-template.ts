import { jsPDF } from 'jspdf';
import type { QuadroTemplateInput } from './quadro-template';
import { buildQuadroFileName, loadFilledQuadroWorksheet } from './quadro-template';
import { renderWorksheetToPdf } from './xlsx-worksheet-render';

/**
 * Quadro de inspeção em PDF: renderiza a MESMA worksheet QUADRO preenchida que
 * dá origem ao .xlsx (loadFilledQuadroWorksheet), pelo que o PDF fica idêntico
 * ao Excel — mesmas células, mesmas validades em MM-AAAA, estação de serviço e
 * nome do técnico em baixo (bloco Assinatura, H81:J82). O printArea A1:J84 com
 * fit-to-page A4 mantém o quadro numa única página A4.
 */
export async function buildQuadroPDFArtifacts(input: QuadroTemplateInput) {
  const { workbook, worksheet } = await loadFilledQuadroWorksheet(input);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  renderWorksheetToPdf(doc, worksheet, workbook, {
    pageWidthMm: 210,
    pageHeightMm: 297,
    maxScale: 1,
  });

  const buffer = Buffer.from(doc.output('arraybuffer'));
  const xlsxName = buildQuadroFileName(input as QuadroTemplateInput & Record<string, unknown>);
  const fileName = `${xlsxName.replace(/\.xlsx$/i, '')}.pdf`;

  return { buffer, fileName };
}
