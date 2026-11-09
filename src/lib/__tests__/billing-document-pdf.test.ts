import { PDFDocument, PDFPage } from "pdf-lib";
import ExcelJS from "exceljs";
import { buildBillingDocumentPdf, loadBillingCertificateLogo, type BillingDocument } from "@/lib/billing-document-pdf";
import { loadTemplateBuffer } from "@/lib/template-loader";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const sample: BillingDocument = {
  invoice: false, number: "OT-2026/42", date: "26/10/2026",
  recipient: { nome: "Cliente de demonstracao - dados sinteticos", nif: "Nao registado", morada: "Morada de demonstracao", localidade: "", ilha: "" },
  details: [["Obra / OS", "OT-2026/42"], ["Embarcacao", "Navio de demonstracao"], ["Numero de serie", "SERIE-DEMO-42"]],
  lines: [{ reference: "DEMO-01", description: "Inspecao e manutencao de equipamento de salvamento", quantity: 2, unitPrice: 50, discount: null, tax: "16%", total: 100 }],
  subtotal: 90, discount: 10, vat: 14.4, total: 104.4,
};

it("uses the exact certificate image bytes and preserves its aspect ratio", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await loadTemplateBuffer("template certificado orey.xltx") as never);
  const original = workbook.getImage(Number(workbook.getWorksheet("CERTIFICADO")!.getImages()[0].imageId));
  const asset = await loadBillingCertificateLogo();
  expect(asset.bytes).toEqual(Buffer.from(original.buffer as unknown as Uint8Array));
  const draw = jest.spyOn(PDFPage.prototype, "drawImage");
  try {
    await buildBillingDocumentPdf(sample);
    const [image, options] = draw.mock.calls[0];
    expect(options!.width! / options!.height!).toBeCloseTo(image.width / image.height, 6);
    expect(options!.width).toBeLessThanOrEqual(145);
    expect(options!.height).toBeLessThanOrEqual(44);
  } finally { draw.mockRestore(); }
});

it("renders repeated table headings, footers and complete long names within the printable area", async () => {
  const long: BillingDocument = { ...sample,
    subtotal: 6490, vat: 1038.4, total: 7528.4,
    recipient: { ...sample.recipient, nome: "Cliente com nome muito longo ".repeat(12), morada: "Morada de demonstracao longa ".repeat(12) },
    lines: Array.from({ length: 65 }, (_, i) => ({ ...sample.lines[0], description: `Artigo-${i} com descricao longa de manutencao e inspecao de equipamento de seguranca`, reference: "REFERENCIA-SEM-ESPACOS-".repeat(3) })),
  };
  const draw = jest.spyOn(PDFPage.prototype, "drawText");
  try {
    const bytes = await buildBillingDocumentPdf(long);
    const doc = await PDFDocument.load(bytes);
    const calls = draw.mock.calls;
    const pageCount = doc.getPageCount();
    expect(pageCount).toBeGreaterThan(2);
    expect(calls.filter(([s]) => s === "PRO FORMA - N\u00e3o constitui documento fiscal.")).toHaveLength(pageCount);
    expect(calls.filter(([s]) => s === "Artigo / Refer\u00eancia").length).toBeGreaterThan(1);
    expect(calls.some(([s]) => s.includes("Artigo-64"))).toBe(true);
    expect(calls.some(([s]) => s.includes("..."))).toBe(false);
    for (const [value, options] of calls) {
      expect(options!.x).toBeGreaterThanOrEqual(39);
      expect(options!.x! + options!.font!.widthOfTextAtSize(value, options!.size!)).toBeLessThanOrEqual(556);
      expect(options!.y).toBeGreaterThanOrEqual(39);
      expect(options!.y).toBeLessThanOrEqual(802);
    }
    if (process.env.PROFORMA_SAMPLE_DIR) {
      await writeFile(path.join(process.env.PROFORMA_SAMPLE_DIR, "proforma-long.pdf"), bytes);
      await writeFile(path.join(process.env.PROFORMA_SAMPLE_DIR, "proforma-standard.pdf"), await buildBillingDocumentPdf(sample));
      await writeFile(path.join(process.env.PROFORMA_SAMPLE_DIR, "proforma-exempt.pdf"), await buildBillingDocumentPdf({ ...sample,
        lines: sample.lines.map(line => ({ ...line, tax: "Isento" })), vat: 0, total: 90,
        exemption: "Amostra de isencao - motivo conforme registo do documento.",
      }));
    }
  } finally { draw.mockRestore(); }
});

it("splits a single article longer than a page without losing its end", async () => {
  const draw = jest.spyOn(PDFPage.prototype, "drawText");
  try {
    const bytes = await buildBillingDocumentPdf({ ...sample, lines: [{ ...sample.lines[0], description: "Descricao extensa ".repeat(1000) + "FIM-ARTIGO" }] });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
    expect(draw.mock.calls.some(([s]) => s.includes("FIM-ARTIGO"))).toBe(true);
  } finally { draw.mockRestore(); }
});
