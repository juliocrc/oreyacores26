import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import { renderWorksheetToPdf } from '@/lib/xlsx-worksheet-render';

it('renders logo anchors as row/column coordinates, not transposed', () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('QUADRO');
  sheet.pageSetup.printArea = 'A1:F10';
  sheet.getColumn(1).width = 5;
  sheet.getColumn(2).width = 15;
  const id = workbook.addImage({ buffer: Buffer.from('test-image') as never, extension: 'png' });
  sheet.addImage(id, 'B4:C6');
  const doc = new jsPDF();
  const image = jest.spyOn(doc, 'addImage').mockReturnValue(doc);
  const layout = renderWorksheetToPdf(doc, sheet, workbook);
  const expected = layout.cellRect(4, 2, 4, 2);
  const bottom = layout.cellRect(7, 4, 7, 4);
  expect(image).toHaveBeenCalledWith(expect.any(String), 'PNG', expected.x, expected.y, bottom.x - expected.x, bottom.y - expected.y);
});

it.each(['☑', '☐'])('renders %s as vectors without sending unsupported glyphs to the PDF font', symbol => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('QUADRO');
  sheet.pageSetup.printArea = 'A1:A1';
  sheet.getCell('A1').value = symbol;
  const doc = new jsPDF();
  const text = jest.spyOn(doc, 'text');
  const line = jest.spyOn(doc, 'line');
  const rect = jest.spyOn(doc, 'rect');
  const layout = renderWorksheetToPdf(doc, sheet, workbook);
  const cell = layout.cellRect(1, 1, 1, 1);
  const side = Math.min(2.2, cell.h * 0.65);
  expect(rect).toHaveBeenCalledWith(cell.x + cell.w / 2 - side / 2, cell.y + cell.h / 2 - side / 2, side, side);
  expect(text).not.toHaveBeenCalled();
  expect(line).toHaveBeenCalledTimes(symbol === '☑' ? 2 : 0);
});

it.each([false, true])('fits plain text to cell width and height while preserving wrapText=%s', wrapText => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('TEXT');
  sheet.pageSetup.printArea = 'A1:B2';
  sheet.getColumn(1).width = 8;
  sheet.getColumn(2).width = 8;
  sheet.getRow(1).height = 8;
  sheet.getRow(2).height = 8;
  sheet.mergeCells('A1:B2');
  const cell = sheet.getCell('A1');
  cell.value = '5017210100016 NAVIO COM NOME MUITO LONGO\nSEGUNDA LINHA';
  cell.font = { size: 24, bold: true };
  cell.alignment = { shrinkToFit: true, wrapText, horizontal: 'center', vertical: 'middle' };
  const before = JSON.stringify(sheet.model);
  const doc = new jsPDF();
  const text = jest.spyOn(doc, 'text');
  const layout = renderWorksheetToPdf(doc, sheet, workbook);
  const rect = layout.cellRect(1, 1, 2, 2);
  expect(doc.getFontSize()).toBeLessThan(24 * layout.scale);
  const lines = text.mock.calls.map(call => call[0] as string);
  expect(lines.length).toBeGreaterThanOrEqual(2);
  if (!wrapText) expect(lines).toEqual(cell.value.split('\n'));
  for (const line of lines) expect(doc.getTextWidth(line)).toBeLessThanOrEqual(rect.w - 1.2 + 0.000001);
  expect(lines.length * doc.getFontSize() * (25.4 / 72) * 1.12).toBeLessThanOrEqual(rect.h - 0.4 + 0.000001);
  expect(JSON.stringify(sheet.model)).toBe(before);
});

it.each([false, true])('does not enlarge fitting text or shrink unflagged text (shrinkToFit=%s)', shrinkToFit => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('TEXT');
  sheet.pageSetup.printArea = 'A1:A1';
  sheet.getColumn(1).width = shrinkToFit ? 40 : 5;
  sheet.getRow(1).height = 30;
  sheet.getCell('A1').value = shrinkToFit ? 'Fits' : 'Long text without fitting enabled';
  sheet.getCell('A1').font = { size: 10 };
  sheet.getCell('A1').alignment = { shrinkToFit };
  const doc = new jsPDF();
  renderWorksheetToPdf(doc, sheet, workbook);
  expect(doc.getFontSize()).toBe(10);
});
