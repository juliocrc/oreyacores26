import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import ExcelJS from "exceljs";
import { loadTemplateBuffer } from "@/lib/template-loader";

export type BillingDocumentLine = {
  reference: string;
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  discount: number | null;
  tax: string;
  total: number;
};

export type BillingDocument = {
  invoice: boolean;
  number: string;
  date: string;
  recipient: { nome: string; nif: string; morada: string; localidade: string; ilha: string };
  details: Array<[string, string]>;
  lines: BillingDocumentLine[];
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  exemption?: string;
};

export const billingMoney = (value: number) => new Intl.NumberFormat("pt-PT", {
  style: "currency", currency: "EUR",
}).format(value);

// Read the certificate's anchored image, not a visually similar public logo.
export async function loadBillingCertificateLogo() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await loadTemplateBuffer("template certificado orey.xltx") as never);
  const sheet = workbook.getWorksheet("CERTIFICADO") || workbook.worksheets[0];
  const anchor = sheet.getImages().slice().sort((a, b) => a.range.tl.nativeRow - b.range.tl.nativeRow || a.range.tl.nativeCol - b.range.tl.nativeCol)[0];
  if (!anchor) throw new Error("Logotipo do certificado Orey nao encontrado.");
  const image = workbook.getImage(Number(anchor.imageId));
  const bytes = image.buffer ? Buffer.from(image.buffer as unknown as Uint8Array) : Buffer.from(String(image.base64).replace(/^data:[^,]+,/, ""), "base64");
  return { bytes, extension: image.extension };
}

export async function buildBillingDocumentPdf(input: BillingDocument): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const asset = await loadBillingCertificateLogo();
  const logo = asset.extension === "png" ? await doc.embedPng(asset.bytes) : await doc.embedJpg(asset.bytes);
  const W = 595.28, H = 841.89, M = 40, right = W - M, width = W - M * 2;
  const ink = rgb(0.09, 0.16, 0.23), muted = rgb(0.39, 0.44, 0.49), teal = rgb(0.06, 0.46, 0.43);
  let page = doc.addPage([W, H]);
  let y = H - M;
  // Standard PDF fonts cannot encode arbitrary Unicode. Preserve supported names
  // and replace only unsupported glyphs rather than failing the whole download.
  const clean = (value: string) => Array.from(value.replace(/\s/g, " ")).map(char => {
    try { normal.encodeText(char); return char; } catch { return "?"; }
  }).join("");
  const text = (value: string, x: number, yy: number, size = 9, strong = false, color = ink, alignRight = false) => {
    const content = clean(value);
    const font = strong ? bold : normal;
    page.drawText(content, { x: alignRight ? x - font.widthOfTextAtSize(content, size) : x, y: yy, size, font, color });
  };
  const wrap = (value: string, maxWidth: number, size = 9, strong = false) => {
    const font = strong ? bold : normal;
    const result: string[] = [];
    let line = "";
    for (const word of clean(value).split(" ")) {
      if (line && font.widthOfTextAtSize(`${line} ${word}`, size) > maxWidth) { result.push(line); line = ""; }
      for (const char of (line ? " " : "") + word) {
        if (font.widthOfTextAtSize(line + char, size) > maxWidth && line) { result.push(line); line = ""; }
        line += char;
      }
    }
    if (line) result.push(line);
    return result.length ? result : ["-"];
  };
  const title = input.invoice ? "DOCUMENTO INTERNO" : "PRO FORMA";
  const header = () => {
    const scale = Math.min(145 / logo.width, 44 / logo.height);
    page.drawImage(logo, { x: M, y: H - M - logo.height * scale, width: logo.width * scale, height: logo.height * scale });
    text(title, right, H - M - 19, 23, true, teal, true);
    y = H - M - 52;
    for (const line of wrap(input.number, width, 10, true)) { text(line, right, y, 10, true, ink, true); y -= 13; }
    text(`Data de emiss\u00e3o: ${input.date}`, right, y, 9, false, muted, true);
    y -= 24;
    page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 1.5, color: teal });
    y -= 20;
  };
  const nextPage = () => { page = doc.addPage([W, H]); header(); };
  const ensure = (height: number) => { if (y - height < 72) nextPage(); };
  header();
  text("Documento interno / pro-forma. Nao e uma fatura fiscal certificada.", M, y, 8, true, muted);
  y -= 16;
  const continuationY = y;
  text("Orey T\u00e9cnica, Servi\u00e7os Navais Lda.", M, y, 10, true);
  y -= 15;
  text("Zona Industrial dos Port\u00f5es Vermelhos, Armaz\u00e9m 19", M, y, 8, false, muted);
  y -= 13;
  text("NIF: 501117334 | azores.tecnica@orey.com", M, y, 8, false, muted);
  y -= 28;
  const field = (label: string, value: string, strong = false) => {
    if (!value) return;
    const lines = wrap(value, width - 106, 9, strong);
    for (let i = 0; i < lines.length; i++) {
      ensure(14);
      if (i === 0) text(label, M, y, 8, true, muted);
      text(lines[i], M + 106, y, 9, strong);
      y -= 14;
    }
    y -= 3;
  };
  field("CLIENTE", input.recipient.nome || "N\u00e3o registado", true);
  field("NIF", input.recipient.nif || "N\u00e3o registado");
  field("Morada", input.recipient.morada || "N\u00e3o registada");
  field("Localidade / Ilha", [input.recipient.localidade, input.recipient.ilha].filter(Boolean).join(" / "));
  y -= 12;
  for (const [label, value] of input.details) field(label, value);
  y -= 14;
  // Fixed, non-overlapping columns. Reference and description share the wide
  // article column; every other column is right-aligned within its own bounds.
  const ends = [M + 219, M + 251, M + 323, M + 379, M + 426, right];
  const starts = [M, M + 219, M + 251, M + 323, M + 379, M + 426];
  const tableHead = () => {
    page.drawRectangle({ x: M, y: y - 23, width, height: 23, color: teal });
    ["Artigo / Refer\u00eancia", "Qtd", "Pre\u00e7o unit.", "Desc.", "IVA", "Total"].forEach((label, i) => text(label, i ? ends[i] - 5 : M + 6, y - 15, 8, true, rgb(1, 1, 1), i > 0));
    y -= 23;
  };
  ensure(50);
  tableHead();
  for (const item of input.lines) {
    const description = wrap(item.description || "Nao registado", 205);
    const reference = item.reference ? wrap(item.reference, 205, 7) : [];
    const content = [...description.map(value => ({ value, ref: false })), ...reference.map(value => ({ value, ref: true }))];
    const values = ["", item.quantity == null ? "-" : String(item.quantity), item.unitPrice == null ? "-" : billingMoney(item.unitPrice), item.discount == null ? "-" : billingMoney(item.discount), item.tax, billingMoney(item.total)];
    const numeric = values.map((v, i) => i ? wrap(v, ends[i] - starts[i] - 10, 8) : []);
    const count = Math.max(content.length, ...numeric.map(lines => lines.length));
    const rowHeight = count * 13 + 12;
    if (y - rowHeight < 72 && rowHeight <= continuationY - 23 - 72) { nextPage(); tableHead(); }
    let offset = 0;
    while (offset < count) {
      if (y - 30 < 72) { nextPage(); tableHead(); }
      const capacity = Math.max(1, Math.floor((y - 84) / 13));
      const take = Math.min(count - offset, capacity);
      const height = take * 13 + 12;
      page.drawRectangle({ x: M, y: y - height, width, height, color: rgb(0.96, 0.97, 0.98) });
      for (let n = 0; n < take; n++) {
        const index = offset + n, yy = y - 15 - n * 13;
        if (content[index]) text(content[index].value, M + 6, yy, content[index].ref ? 7 : 9, false, content[index].ref ? muted : ink);
        numeric.forEach((lines, col) => { if (lines[index]) text(lines[index], ends[col] - 5, yy, 8, col === 5, ink, true); });
      }
      y -= height;
      page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 0.4, color: rgb(0.84, 0.87, 0.89) });
      offset += take;
    }
  }
  const exemption = input.exemption ? wrap(input.exemption, width, 8) : [];
  ensure(132 + exemption.length * 12);
  y -= 25;
  for (const [label, value] of [["Desconto comercial", input.discount], ["Subtotal l\u00edquido", input.subtotal], ["IVA", input.vat]] as const) {
    text(label, right - 230, y, 9, false, muted);
    text(billingMoney(value), right - 8, y, 10, false, ink, true);
    y -= 20;
  }
  page.drawRectangle({ x: right - 242, y: y - 25, width: 242, height: 34, color: teal });
  text("TOTAL EUR", right - 230, y - 13, 10, true, rgb(1, 1, 1));
  text(billingMoney(input.total), right - 8, y - 13, 15, true, rgb(1, 1, 1), true);
  y -= 49;
  for (const line of exemption) { text(line, M, y, 8, false, muted); y -= 12; }
  const pages = doc.getPages();
  pages.forEach((p, index) => {
    page = p;
    page.drawLine({ start: { x: M, y: 54 }, end: { x: right, y: 54 }, thickness: 0.5, color: muted });
    text(input.invoice ? "DOCUMENTO INTERNO - Nao constitui documento fiscal." : "PRO FORMA - N\u00e3o constitui documento fiscal.", M, 40, 8, true, muted);
    text(`${index + 1} / ${pages.length}`, right, 40, 8, false, muted, true);
  });
  return doc.save();
}
