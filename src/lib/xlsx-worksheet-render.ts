import type { Cell, Workbook, Worksheet } from "exceljs";
import type jsPDF from "jspdf";

/**
 * Renderização genérica de uma worksheet ExcelJS para um PDF (jsPDF), usada para
 * reproduzir fielmente um template Excel (larguras de coluna, alturas de linha,
 * merges, bordas, fontes, alinhamento e imagens ancoradas).
 *
 * Coordenadas: largura de coluna/altura de linha em mm de "conteúdo"; o conteúdo
 * é depois escalado (fit-to-page) e deslocado pelas margens da página.
 */

export const EMU_PER_MM = 914400 / 25.4;
export const PX_PER_MM = 96 / 25.4;

export type WorksheetLayout = {
  scale: number;
  offsetX: number;
  offsetY: number;
  contentWidth: number;
  contentHeight: number;
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
  colLeft: Map<number, number>;
  colWidth: Map<number, number>;
  rowTop: Map<number, number>;
  rowHeight: Map<number, number>;
  /** Retângulo (mm, página) de uma célula/região. */
  cellRect: (top: number, left: number, bottom: number, right: number) => {
    x: number;
    y: number;
    w: number;
    h: number;
  };
};

export type RenderWorksheetOptions = {
  pageWidthMm?: number;
  pageHeightMm?: number;
  maxScale?: number;
  /** Imagem do logótipo a usar em vez da embutida no template (data URL). */
  logoDataUrl?: string | null;
  /** Não desenhar o logótipo do template. */
  skipLogo?: boolean;
  /** Largura fixa (mm, página) do logótipo; mantém a proporção original e a posição ancorada. */
  logoWidthMm?: number | null;
};

type MergeBounds = { top: number; left: number; bottom: number; right: number };

function toMmFromColumnWidth(width: number | undefined, defaultWidth: number): number {
  const w = Number.isFinite(width) && (width as number) > 0 ? (width as number) : defaultWidth;
  // Fórmula do Excel para largura em pixels, MDW (largura do dígito '0') = 7.
  const px = Math.trunc(((256 * w + Math.trunc(128 / 7)) / 256) * 7);
  return (px * 25.4) / 96;
}

function toMmFromRowHeight(height: number | undefined, defaultHeight: number): number {
  const pt = Number.isFinite(height) && (height as number) > 0 ? (height as number) : defaultHeight;
  return (pt * 25.4) / 72;
}

function getWorksheetDefaults(worksheet: Worksheet) {
  const properties = worksheet.properties || {};
  return {
    defaultColWidth: Number(properties.defaultColWidth) || 9.0546875,
    defaultRowHeight: Number(properties.defaultRowHeight) || 13.2,
  };
}

function columnWidthMm(worksheet: Worksheet, col: number): number {
  const { defaultColWidth } = getWorksheetDefaults(worksheet);
  return toMmFromColumnWidth(worksheet.getColumn(col).width, defaultColWidth);
}

function rowHeightMm(worksheet: Worksheet, row: number): number {
  const { defaultRowHeight } = getWorksheetDefaults(worksheet);
  return toMmFromRowHeight(worksheet.getRow(row).height, defaultRowHeight);
}

/**
 * Retângulo (mm, com origem em A1) de uma região de células — a mesma métrica
 * usada por `computeWorksheetLayout`, mas em coordenadas da folha (sem escala
 * nem margens) para ancorar imagens no Excel com a geometria do PDF.
 */
export function worksheetRegionRectMm(
  worksheet: Worksheet,
  top: number,
  left: number,
  bottom: number,
  right: number,
): { x: number; y: number; w: number; h: number } {
  let x = 0;
  for (let col = 1; col < left; col++) x += columnWidthMm(worksheet, col);
  let w = 0;
  for (let col = left; col <= right; col++) w += columnWidthMm(worksheet, col);
  let y = 0;
  for (let row = 1; row < top; row++) y += rowHeightMm(worksheet, row);
  let h = 0;
  for (let row = top; row <= bottom; row++) h += rowHeightMm(worksheet, row);
  return { x, y, w, h };
}

/**
 * Converte um ponto (mm, com origem em A1) na âncora ExcelJS
 * (`nativeCol`/`nativeRow` 0-based e offsets em EMU) — o formato aceite por
 * `worksheet.addImage`/`getImages()`.
 */
export function worksheetAnchorAtMm(
  worksheet: Worksheet,
  xMm: number,
  yMm: number,
): { nativeCol: number; nativeColOff: number; nativeRow: number; nativeRowOff: number } {
  let col = 1;
  let offsetX = xMm;
  for (; col <= 1000; col++) {
    const width = columnWidthMm(worksheet, col);
    if (offsetX < width || width <= 0) break;
    offsetX -= width;
  }
  let row = 1;
  let offsetY = yMm;
  for (; row <= 100000; row++) {
    const height = rowHeightMm(worksheet, row);
    if (offsetY < height || height <= 0) break;
    offsetY -= height;
  }
  return {
    nativeCol: col - 1,
    nativeColOff: Math.max(0, Math.round(offsetX * EMU_PER_MM)),
    nativeRow: row - 1,
    nativeRowOff: Math.max(0, Math.round(offsetY * EMU_PER_MM)),
  };
}

function parseCellAddress(address: string): { col: number; row: number } {
  const match = address.match(/^([A-Z]+)(\d+)$/i);
  if (!match) return { col: 1, row: 1 };
  const colLetters = match[1].toUpperCase();
  let col = 0;
  for (let i = 0; i < colLetters.length; i++) {
    col = col * 26 + (colLetters.charCodeAt(i) - 64);
  }
  return { col, row: Number(match[2]) };
}

function cellText(cell: Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return (value as { richText: { text: string }[] }).richText.map((part) => part.text).join("");
    }
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("formula" in value) {
      const result = (value as { result?: unknown }).result;
      return result === undefined || result === null ? "" : String(result);
    }
  }
  return "";
}

function parseColor(color: unknown, fallback: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const argb = (color as { argb?: string } | undefined)?.argb;
  if (!argb || typeof argb !== "string") return fallback;
  const hex = argb.length >= 6 ? argb.slice(-6) : argb.padStart(6, "0");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function getMergeBounds(worksheet: Worksheet): MergeBounds[] {
  const raw = (worksheet as unknown as { _merges?: Record<string, { model?: MergeBounds }> })._merges;
  if (!raw) return [];
  const bounds: MergeBounds[] = [];
  for (const key of Object.keys(raw)) {
    const model = raw[key]?.model;
    if (model && Number.isFinite(model.top)) bounds.push({ ...model });
  }
  return bounds;
}

function getPageMarginsMm(worksheet: Worksheet) {
  const setup = worksheet.pageSetup || {};
  const margins = (setup.margins || {}) as Record<string, number | undefined>;
  const inToMm = (value: number | undefined, fallbackIn: number) =>
    (Number.isFinite(value) ? (value as number) : fallbackIn) * 25.4;
  return {
    left: inToMm(margins.left, 0.25),
    right: inToMm(margins.right, 0.25),
    top: inToMm(margins.top, 0.3),
    bottom: inToMm(margins.bottom, 0.3),
  };
}

function getPrintArea(worksheet: Worksheet): MergeBounds {
  const area = worksheet.pageSetup?.printArea;
  if (typeof area === "string" && area.trim()) {
    const [start, end] = area.split(":");
    const s = parseCellAddress(start.trim());
    const e = end ? parseCellAddress(end.trim()) : s;
    return { top: s.row, left: s.col, bottom: e.row, right: e.col };
  }
  const dims = worksheet.dimensions || { top: 1, left: 1, bottom: 1, right: 1 };
  return { top: dims.top, left: dims.left, bottom: dims.bottom, right: dims.right };
}

export function computeWorksheetLayout(
  worksheet: Worksheet,
  options: RenderWorksheetOptions = {},
): WorksheetLayout {
  const pageWidthMm = options.pageWidthMm ?? 210;
  const pageHeightMm = options.pageHeightMm ?? 297;
  const maxScale = options.maxScale ?? 1;

  const defaults = worksheet.properties || {};
  const defaultColWidth = Number(defaults.defaultColWidth) || 9.0546875;
  const defaultRowHeight = Number(defaults.defaultRowHeight) || 13.2;

  const area = getPrintArea(worksheet);
  const minCol = area.left;
  const maxCol = area.right;
  const minRow = area.top;
  const maxRow = area.bottom;

  const colLeft = new Map<number, number>();
  const colWidth = new Map<number, number>();
  let cursorX = 0;
  for (let col = minCol; col <= maxCol; col++) {
    const width = toMmFromColumnWidth(worksheet.getColumn(col).width, defaultColWidth);
    colLeft.set(col, cursorX);
    colWidth.set(col, width);
    cursorX += width;
  }
  const contentWidth = cursorX;

  const rowTop = new Map<number, number>();
  const rowHeight = new Map<number, number>();
  let cursorY = 0;
  for (let row = minRow; row <= maxRow; row++) {
    const height = toMmFromRowHeight(worksheet.getRow(row).height, defaultRowHeight);
    rowTop.set(row, cursorY);
    rowHeight.set(row, height);
    cursorY += height;
  }
  const contentHeight = cursorY;

  const margins = getPageMarginsMm(worksheet);
  const printableW = pageWidthMm - margins.left - margins.right;
  const printableH = pageHeightMm - margins.top - margins.bottom;
  const scale = Math.min(
    maxScale,
    contentWidth > 0 ? printableW / contentWidth : maxScale,
    contentHeight > 0 ? printableH / contentHeight : maxScale,
  );

  const offsetX = margins.left;
  const offsetY = margins.top;

  const cellRect = (top: number, left: number, bottom: number, right: number) => {
    const x = offsetX + (colLeft.get(left) ?? 0) * scale;
    const y = offsetY + (rowTop.get(top) ?? 0) * scale;
    const rightEdge = offsetX + ((colLeft.get(right) ?? 0) + (colWidth.get(right) ?? 0)) * scale;
    const bottomEdge = offsetY + ((rowTop.get(bottom) ?? 0) + (rowHeight.get(bottom) ?? 0)) * scale;
    return { x, y, w: rightEdge - x, h: bottomEdge - y };
  };

  return {
    scale,
    offsetX,
    offsetY,
    contentWidth,
    contentHeight,
    minCol,
    maxCol,
    minRow,
    maxRow,
    colLeft,
    colWidth,
    rowTop,
    rowHeight,
    cellRect,
  };
}

export function imageSizeFromDataUrl(dataUrl: string): { width: number; height: number } | null {
  const match = dataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (!match) return null;
  const buffer = Buffer.from(match[2], "base64");
  if (/png/i.test(match[1])) {
    if (buffer.length >= 24) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    return null;
  }
  // JPEG: percorrer segmentos até SOF (C0-CF, exceto C4/C8/CC)
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length <= 0) break;
    offset += 2 + length;
  }
  return null;
}

export function renderWorksheetToPdf(
  doc: jsPDF,
  worksheet: Worksheet,
  workbook: Workbook,
  options: RenderWorksheetOptions = {},
): WorksheetLayout {
  const layout = computeWorksheetLayout(worksheet, options);
  const { scale } = layout;
  const merges = getMergeBounds(worksheet);
  const mergeByTopLeft = new Map<string, MergeBounds>();
  const slaveSet = new Set<string>();
  for (const bounds of merges) {
    mergeByTopLeft.set(`${bounds.top},${bounds.left}`, bounds);
    for (let r = bounds.top; r <= bounds.bottom; r++) {
      for (let c = bounds.left; c <= bounds.right; c++) {
        if (r === bounds.top && c === bounds.left) continue;
        slaveSet.add(`${r},${c}`);
      }
    }
  }

  // 1. Preenchimentos
  for (let row = layout.minRow; row <= layout.maxRow; row++) {
    for (let col = layout.minCol; col <= layout.maxCol; col++) {
      if (slaveSet.has(`${row},${col}`)) continue;
      const cell = worksheet.getCell(row, col);
      const fill = cell.fill;
      if (fill && fill.type === "pattern" && fill.pattern === "solid" && fill.fgColor) {
        const argb = (fill.fgColor as { argb?: string }).argb;
        if (!argb) continue;
        const [r, g, b] = parseColor(fill.fgColor, [255, 255, 255]);
        const bounds = mergeByTopLeft.get(`${row},${col}`);
        const rect = bounds
          ? layout.cellRect(bounds.top, bounds.left, bounds.bottom, bounds.right)
          : layout.cellRect(row, col, row, col);
        doc.setFillColor(r, g, b);
        doc.rect(rect.x, rect.y, rect.w, rect.h, "F");
      }
    }
  }

  // 2. Imagem (logótipo) embutida no template
  if (!options.skipLogo) {
    const images = worksheet.getImages?.() || [];
    for (const image of images) {
      const imageId = Number(image.imageId);
      const media = Number.isFinite(imageId) ? workbook.getImage?.(imageId) : undefined;
      const range = image.range as
        | { tl?: { nativeCol?: number; nativeRow?: number; nativeColOff?: number; nativeRowOff?: number }; br?: { nativeCol?: number; nativeRow?: number; nativeColOff?: number; nativeRowOff?: number } }
        | undefined;
      let dataUrl: string | null = null;
      if (options.logoDataUrl) {
        dataUrl = options.logoDataUrl;
      } else if (media?.buffer) {
        const ext = (media.extension || "jpeg").toLowerCase();
        const mime = ext === "png" ? "image/png" : "image/jpeg";
        const base64 = Buffer.from(media.buffer as unknown as ArrayBuffer).toString("base64");
        dataUrl = `data:${mime};base64,${base64}`;
      }
      if (!dataUrl || !range?.tl) continue;

      const tlCol = (range.tl.nativeCol ?? 0) + 1;
      const tlRow = (range.tl.nativeRow ?? 0) + 1;
      const tl = layout.cellRect(tlCol, tlRow, tlCol, tlRow);
      const x = tl.x + ((range.tl.nativeColOff ?? 0) / EMU_PER_MM) * scale;
      const y = tl.y + ((range.tl.nativeRowOff ?? 0) / EMU_PER_MM) * scale;

      let width: number;
      let height: number;
      const fixedLogoWidth = options.logoWidthMm;
      if (typeof fixedLogoWidth === "number" && fixedLogoWidth > 0) {
        const size = imageSizeFromDataUrl(dataUrl) || { width: 120, height: 60 };
        const aspect = size.width > 0 ? size.height / size.width : 0.5;
        width = fixedLogoWidth;
        height = width * aspect;
      } else if (range.br) {
        const brCol = (range.br.nativeCol ?? 0) + 1;
        const brRow = (range.br.nativeRow ?? 0) + 1;
        const br = layout.cellRect(brCol, brRow, brCol, brRow);
        const right = br.x + ((range.br.nativeColOff ?? 0) / EMU_PER_MM) * scale;
        const bottom = br.y + ((range.br.nativeRowOff ?? 0) / EMU_PER_MM) * scale;
        width = Math.max(1, right - x);
        height = Math.max(1, bottom - y);
      } else {
        const size = imageSizeFromDataUrl(dataUrl) || { width: 120, height: 60 };
        const maxW = layout.contentWidth * scale * 0.4;
        width = maxW;
        height = (maxW * size.height) / size.width;
      }

      const format = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      try {
        doc.addImage(dataUrl, format, x, y, width, height);
      } catch {
        // Imagem é decorativa; nunca deve impedir a geração.
      }
    }
  }

  // 3. Bordas
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.1);
  for (let row = layout.minRow; row <= layout.maxRow; row++) {
    for (let col = layout.minCol; col <= layout.maxCol; col++) {
      if (slaveSet.has(`${row},${col}`)) continue;
      const bounds = mergeByTopLeft.get(`${row},${col}`);
      const region = bounds ?? { top: row, left: col, bottom: row, right: col };
      const rect = layout.cellRect(region.top, region.left, region.bottom, region.right);

      const edge = (edgeName: "top" | "bottom") => {
        for (let c = region.left; c <= region.right; c++) {
          const b = worksheet.getCell(edgeName === "top" ? region.top : region.bottom, c).border;
          if (b?.[edgeName]?.style) return true;
        }
        return false;
      };
      const edgeV = (edgeName: "left" | "right") => {
        for (let r = region.top; r <= region.bottom; r++) {
          const b = worksheet.getCell(r, edgeName === "left" ? region.left : region.right).border;
          if (b?.[edgeName]?.style) return true;
        }
        return false;
      };

      if (edge("top")) doc.line(rect.x, rect.y, rect.x + rect.w, rect.y);
      if (edge("bottom")) doc.line(rect.x, rect.y + rect.h, rect.x + rect.w, rect.y + rect.h);
      if (edgeV("left")) doc.line(rect.x, rect.y, rect.x, rect.y + rect.h);
      if (edgeV("right")) doc.line(rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + rect.h);
    }
  }

  // 4. Texto
  for (let row = layout.minRow; row <= layout.maxRow; row++) {
    for (let col = layout.minCol; col <= layout.maxCol; col++) {
      if (slaveSet.has(`${row},${col}`)) continue;
      const cell = worksheet.getCell(row, col);
      const text = cellText(cell);
      if (!text) continue;

      const bounds = mergeByTopLeft.get(`${row},${col}`);
      const region = bounds ?? { top: row, left: col, bottom: row, right: col };
      const rect = layout.cellRect(region.top, region.left, region.bottom, region.right);

      const font = cell.font || {};
      const sizePt = (typeof font.size === "number" ? font.size : 10) * scale;
      const style = font.bold && font.italic ? "bolditalic" : font.bold ? "bold" : font.italic ? "italic" : "normal";
      doc.setFont("helvetica", style);
      doc.setFontSize(sizePt);
      const [r, g, b] = parseColor(font.color, [0, 0, 0]);
      doc.setTextColor(r, g, b);

      const padding = 0.6 + (cell.alignment?.indent || 0) * 1.5;
      const horizontal = cell.alignment?.horizontal || "left";
      const maxWidth = Math.max(1, rect.w - padding * 2);
      const normalized = text.replace(/\r\n/g, "\n");
      const wrapped = cell.alignment?.wrapText
        ? doc.splitTextToSize(normalized, maxWidth)
        : normalized.split("\n");
      const lines = Array.isArray(wrapped) ? wrapped : [String(wrapped)];
      const lineMm = sizePt * (25.4 / 72) * 1.12;

      const blockHeight = lines.length * lineMm;
      let startY: number;
      const vertical = cell.alignment?.vertical || "bottom";
      if (vertical === "middle") startY = rect.y + rect.h / 2 - blockHeight / 2 + lineMm * 0.8;
      else if (vertical === "top") startY = rect.y + lineMm * 0.85;
      else startY = rect.y + rect.h - blockHeight + lineMm * 0.85;

      lines.forEach((line, index) => {
        const y = startY + index * lineMm;
        if (horizontal === "center") {
          doc.text(line, rect.x + rect.w / 2, y, { align: "center" });
        } else if (horizontal === "right") {
          doc.text(line, rect.x + rect.w - padding, y, { align: "right" });
        } else {
          doc.text(line, rect.x + padding, y);
        }
      });
    }
  }

  doc.setTextColor(0, 0, 0);
  return layout;
}
