import jsPDF from "jspdf";
import {
  loadFilledQuadroWorkbook,
  type QuadroTemplateInput,
} from "@/lib/quadro-template";
import { imageSizeFromDataUrl, renderWorksheetToPdf } from "@/lib/xlsx-worksheet-render";
import { isImageDataUrl, imageFormat } from "@/lib/orey-certificate-pdf";

export type QuadroPdfStamp = {
  /** Imagem do carimbo oficial (data URL). */
  imageDataUrl?: string | null;
  /** Nome da estação de serviço escrito em texto por cima do carimbo. */
  stationName?: string | null;
};

export type QuadroPdfVerification = {
  /** QR code (data URL) da página pública de verificação. */
  qr?: string | null;
  /** Hash de integridade do quadro. */
  hash?: string | null;
};

export type BuildQuadroPdfOptions = {
  stamp?: QuadroPdfStamp;
  verification?: QuadroPdfVerification;
};

/**
 * Gera o Quadro de Inspeção PDF reconstruindo fielmente o template Excel
 * (`template quadro.xlsx`): preenche as células identificadas pelo
 * `buildQuadroInspectionArtifacts` e desenha a folha inteira (colunas, linhas,
 * merges, bordas, fontes e logótipo) num PDF A4.
 *
 * Por cima do layout, aplica o carimbo oficial (com o nome da estação em texto)
 * e, quando disponível, o QR/hash de verificação.
 */
export async function buildQuadroInspectionPdfBuffer(
  input: QuadroTemplateInput,
  options: BuildQuadroPdfOptions = {},
): Promise<Buffer> {
  const { workbook, worksheet } = await loadFilledQuadroWorkbook(input);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const layout = renderWorksheetToPdf(doc, worksheet, workbook, {
    pageWidthMm: 210,
    pageHeightMm: 297,
    maxScale: 1,
    // Logótipo OREY no cabeçalho: largura fixa de 45 mm, proporção original
    logoWidthMm: 45,
  });

  // Carimbo oficial na área de assinatura (ajustar coordenadas conforme template quadro)
  const stampImage = options.stamp?.imageDataUrl;
  const stationName = String(options.stamp?.stationName ?? "").trim();
  
  // Área de assinatura no template quadro - ajustar coordenadas conforme template
  // Assumindo área similar ao certificado: linhas 70-75, colunas H-J
  const stampRegion = layout.cellRect(72, 8, 78, 10);
  
  const stampImageUrl = options.stamp?.imageDataUrl;
  if (isImageDataUrl(stampImageUrl)) {
    const stampImage = stampImageUrl!;
    const size = imageSizeFromDataUrl(stampImage) || { width: 574, height: 265 };
    const aspect = size.width > 0 ? size.height / size.width : 265 / 574;
    const naturalWidth = (size.width * 25.4) / 300 * layout.scale;
    let width = Math.min(naturalWidth, stampRegion.w * 0.95);
    let height = width * aspect;
    if (height > stampRegion.h * 0.95) {
      height = stampRegion.h * 0.95;
      width = height / aspect;
    }
    const x = stampRegion.x + (stampRegion.w - width) / 2;
    const y = stampRegion.y + (stampRegion.h - height) / 2;
    try {
      doc.addImage(stampImage, imageFormat(stampImage), x, y, width, height);
    } catch {
      // Carimbo opcional
    }
  } else if (options.stamp?.stationName) {
    // Sem imagem de carimbo: ainda assim inscreve o nome da estação.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(options.stamp.stationName!, stampRegion.x + stampRegion.w / 2, stampRegion.y + stampRegion.h / 2, { align: "center" });
  }

  // QR + hash de verificação
  const qr = options.verification?.qr;
  const hash = String(options.verification?.hash ?? "").trim();
  if (isImageDataUrl(options.verification?.qr)) {
    const qrRegion = layout.cellRect(5, 1, 10, 3);
    const side = Math.min(qrRegion.w, qrRegion.h);
    const qrX = qrRegion.x;
    const qrY = qrRegion.y + qrRegion.h - side;
    try {
      doc.addImage(options.verification!.qr!, "PNG", qrX, qrY, side, side);

      const noteRegion = layout.cellRect(12, 2, 12, 5);
      const noteX = qrX + side + 2;
      const noteCenterY = noteRegion.y + noteRegion.h / 2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5);
      doc.setTextColor(90, 90, 90);
      doc.text("Verificar autenticidade", noteX, noteCenterY - 0.8, { align: "left" });
      if (hash) doc.text(`Hash: ${hash}`, noteX, noteCenterY + 1.8, { align: "left" });
      doc.setTextColor(0, 0, 0);
    } catch {
      // QR opcional
    }
  }

  const output = doc.output("arraybuffer") as ArrayBuffer;
  return Buffer.from(output);
}