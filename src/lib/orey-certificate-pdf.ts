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

/**
 * Limpa a área G48:J49 do template (nome da estação). No certificado carimbado
 * o nome já consta no carimbo oficial, pelo que a célula do template daria
 * origem a uma repetição do nome.
 */
function clearStationNameArea(worksheet: ExcelJS.Worksheet) {
  for (let row = 48; row <= 49; row += 1) {
    for (let col = 7; col <= 10; col += 1) {
      const cell = worksheet.getCell(row, col);
      if (cell.isMerged && cell.master && cell.master.address !== cell.address) continue;
      cell.value = null;
    }
  }
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
  clearStationNameArea(worksheet);
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

  // No certificado carimbado o nome da estação consta já no carimbo oficial,
  // pelo que a área G48:J49 do template é limpa (ver clearStationNameArea) para
  // não repetir o nome.

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const layout = renderWorksheetToPdf(doc, worksheet, workbook, {
    pageWidthMm: 210,
    pageHeightMm: 297,
    maxScale: 1,
    // Logótipo OREY no cabeçalho: largura fixa de 45 mm, proporção original
    // (sem o esticar à caixa ancorada do template, que o achatava para ~6:1 -> 4.3:1).
    logoWidthMm: 45,
  });

  // Carimbo oficial ajustado ao tamanho das letras da área de assinatura (células I..L)
  const stampImage = options.stamp?.imageDataUrl;
  const stationName = String(options.stamp?.stationName ?? "").trim();
  const stampRegion = layout.cellRect(61, 9, 61, 12); // Células I61:L61
  if (isImageDataUrl(stampImage)) {
    const size = imageSizeFromDataUrl(stampImage) || { width: 574, height: 265 };
    const aspect = size.width > 0 ? size.height / size.width : 265 / 574;
    // Ajustado para o tamanho das letras (altura máxima ~5mm, proporcional ao texto da linha)
    let height = Math.min(stampRegion.h * 1.2, 7);
    let width = height / aspect;
    if (width > stampRegion.w * 0.95) {
      width = stampRegion.w * 0.95;
      height = width * aspect;
    }
    const x = stampRegion.x + (stampRegion.w - width) / 2;
    const y = stampRegion.y + (stampRegion.h - height) / 2;
    try {
      doc.addImage(stampImage, imageFormat(stampImage), x, y, width, height);
    } catch {
      // Carimbo opcional
    }
  } else if (stationName) {
    // Sem imagem de carimbo: ainda assim inscreve o nome da estação.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(stationName, stampRegion.x + stampRegion.w / 2, stampRegion.y + stampRegion.h / 2, { align: "center" });
  }

  // QR + hash de verificação: colocado acima do rótulo "Flag of Ship:" (coluna A,
  // linhas 54..58), dimensionado para caber nessa zona sem sobrepor o texto SOLAS
  // (que começa na coluna B) nem o bloco dos dados do navio em baixo.
  const qr = options.verification?.qr;
  const hash = String(options.verification?.hash ?? "").trim();
  if (isImageDataUrl(qr)) {
    const qrRegion = layout.cellRect(54, 1, 58, 1);
    const side = Math.min(qrRegion.w, qrRegion.h);
    const qrX = qrRegion.x;
    const qrY = qrRegion.y + qrRegion.h - side;
    try {
      doc.addImage(qr, "PNG", qrX, qrY, side, side);

      const noteRegion = layout.cellRect(57, 2, 58, 12);
      const noteX = qrX + side + 1.5;
      const noteCenterY = noteRegion.y + noteRegion.h / 2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5);
      doc.setTextColor(90, 90, 90);
      doc.text("Verificar autenticidade", noteX, noteCenterY - 0.8, { align: "left" });
      if (hash) doc.text(`Hash: ${hash}`, noteX, noteCenterY + 1.8, { align: "left" });
      doc.setTextColor(0, 0, 0);
    } catch {
      // QR opcional.
    }
  }

  const output = doc.output("arraybuffer") as ArrayBuffer;
  return Buffer.from(output);
}
