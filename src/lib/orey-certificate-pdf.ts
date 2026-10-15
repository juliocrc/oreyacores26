import jsPDF from "jspdf";
import ExcelJS from "exceljs";
import { loadTemplateBuffer } from "@/lib/template-loader";
import {
  applyCertificateMerges,
  fillTemplate,
  type OreyCertificateTemplateInput,
} from "@/lib/orey-certificate-template";
import { imageSizeFromDataUrl, renderWorksheetToPdf } from "@/lib/xlsx-worksheet-render";

type XlsxLoadArg = Parameters<ExcelJS.Xlsx["load"]>[0];

export type OreyCertificatePdfStamp = {
  /** Imagem do carimbo oficial (data URL). */
  imageDataUrl?: string | null;
  /** Nome da estação de serviço escrito em texto por cima do carimbo. */
  stationName?: string | null;
};

export type OreyCertificatePdfVerification = {
  /** QR code (data URL) da página pública de verificação. */
  qr?: string | null;
  /** Hash de integridade do certificado. */
  hash?: string | null;
};

export type BuildOreyCertificatePdfOptions = {
  stamp?: OreyCertificatePdfStamp;
  verification?: OreyCertificatePdfVerification;
};

function isImageDataUrl(value?: string | null): value is string {
  return typeof value === "string" && /^data:image\/(png|jpe?g|webp);base64,/i.test(value);
}

function imageFormat(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "JPEG";
}

/** Lê o template OREY, preenche-o e devolve a worksheet pronta a renderizar. */
async function loadFilledCertificateWorksheet(input: OreyCertificateTemplateInput) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await loadTemplateBuffer("template certificado orey.xltx")) as unknown as XlsxLoadArg);
  const worksheet = workbook.getWorksheet("CERTIFICADO") || workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("Folha CERTIFICADO não encontrada no template Orey.");
  }
  applyCertificateMerges(worksheet);
  fillTemplate(worksheet, input);
  return { workbook, worksheet };
}

/**
 * Gera o certificado PDF reconstruindo fielmente o template Excel
 * (`template certificado orey.xltx`): preenche as células identificadas pelo
 * `fillTemplate` e desenha a folha inteira (colunas, linhas, merges, bordas,
 * fontes e logótipo) num PDF A4.
 *
 * Por cima do layout, aplica o carimbo oficial (com o nome da estação em texto)
 * e, quando disponível, o QR/hash de verificação.
 */
export async function buildOreyCertificatePdfBuffer(
  input: OreyCertificateTemplateInput,
  options: BuildOreyCertificatePdfOptions = {},
): Promise<Buffer> {
  const { workbook, worksheet } = await loadFilledCertificateWorksheet(input);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const layout = renderWorksheetToPdf(doc, worksheet, workbook, { pageWidthMm: 210, pageHeightMm: 297, maxScale: 1 });

  // Carimbo oficial na área "For authorized servicing station" (colunas I..L, linhas ~63..69).
  const stampImage = options.stamp?.imageDataUrl;
  const stationName = String(options.stamp?.stationName ?? "").trim();
  const stampRegion = layout.cellRect(62, 9, 69, 12);
  if (isImageDataUrl(stampImage)) {
    const size = imageSizeFromDataUrl(stampImage) || { width: 574, height: 265 };
    const aspect = size.width > 0 ? size.height / size.width : 265 / 574;
    let width = stampRegion.w * 0.92;
    let height = width * aspect;
    if (height > stampRegion.h) {
      height = stampRegion.h;
      width = aspect > 0 ? height / aspect : stampRegion.w;
    }
    const x = stampRegion.x + (stampRegion.w - width) / 2;
    const y = stampRegion.y + (stampRegion.h - height) / 2;
    try {
      doc.addImage(stampImage, imageFormat(stampImage), x, y, width, height);
    } catch {
      // Carimbo é opcional: nunca deve impedir a geração.
    }

    if (stationName) {
      // Nome da estação em texto real, colado por cima do carimbo, com o mesmo
      // tamanho das letras do certificado.
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      const lines = doc.splitTextToSize(stationName, Math.max(10, width * 0.94));
      const lineHeight = 9 * (25.4 / 72) * 1.1;
      const startY = y + height / 2 - ((lines.length - 1) * lineHeight) / 2 + lineHeight * 0.35;
      lines.forEach((line: string, index: number) => {
        doc.text(line, x + width / 2, startY + index * lineHeight, { align: "center" });
      });
    }
  } else if (stationName) {
    // Sem imagem de carimbo: ainda assim inscreve o nome da estação.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(stationName, stampRegion.x + stampRegion.w / 2, stampRegion.y + stampRegion.h / 2, { align: "center" });
  }

  // QR + hash de verificação no canto inferior direito (lado direito do rodapé).
  const qr = options.verification?.qr;
  const hash = String(options.verification?.hash ?? "").trim();
  if (isImageDataUrl(qr)) {
    const qrRegion = layout.cellRect(72, 10, 76, 12);
    const qrSize = Math.max(8, Math.min(qrRegion.w, qrRegion.h) * 0.85);
    const qrX = qrRegion.x + qrRegion.w - qrSize;
    const qrY = qrRegion.y + Math.max(0, (qrRegion.h - qrSize) / 2);
    try {
      doc.addImage(qr, "PNG", qrX, qrY, qrSize, qrSize);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5);
      doc.setTextColor(90, 90, 90);
      doc.text("Verificar autenticidade", qrX - 1, qrY + 3, { align: "right" });
      if (hash) doc.text(`Hash: ${hash}`, qrX - 1, qrY + 6, { align: "right" });
      doc.setTextColor(0, 0, 0);
    } catch {
      // QR opcional.
    }
  }

  const output = doc.output("arraybuffer") as ArrayBuffer;
  return Buffer.from(output);
}
