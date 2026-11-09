import ExcelJS from 'exceljs';
import { ABATE_MOTIVOS, ABATE_TIPOS_BARCO, getAbateMotivoCodes } from '@/lib/abate-constants';
import type { AbateReportInput } from '@/lib/abate-report-pdf';

function asString(value: unknown) {
  return String(value ?? '').trim();
}

function formatDateLabel(value: unknown) {
  const raw = asString(value);
  if (!raw) return '—';
  if (/^\d{1,2}\/\d{2,4}$/.test(raw) || /^\d{1,2}-\d{2,4}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('pt-PT');
}

export function abateReportFilename(input: AbateReportInput) {
  const serial = asString(input.serial) || 'Jangada';
  return `Ficha_Abate_${serial}_${new Date().toISOString().slice(0, 10)}.xlsx`;
}

const thinBorder: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF808080' } };

export async function downloadAbateReportXlsx(input: AbateReportInput) {
  const motivosSelecionados = new Set(getAbateMotivoCodes(input.motivo));

  const selecionaTipoBarco = (entry: { codigo: number; label: string }) => {
    const inputTipoBarco = asString(input.tipoBarco);
    return inputTipoBarco === entry.label || asString(entry.codigo) === inputTipoBarco;
  };

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Abate');

  sheet.columns = [
    { width: 34 },
    { width: 36 },
    { width: 12 },
    { width: 14 },
  ];

  // Título
  sheet.mergeCells('A1:C1');
  const title = sheet.getCell('A1');
  title.value = 'FICHA DE ABATE DE JANGADAS SALVA-VIDAS';
  title.font = { bold: true, size: 14, color: { argb: 'FF000000' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 24;

  const codeCell = sheet.getCell('D1');
  codeCell.value = 'IM.049/00';
  codeCell.font = { bold: true, size: 9, color: { argb: 'FF404040' } };
  codeCell.alignment = { horizontal: 'center', vertical: 'middle' };

  let rowIndex = 3;

  const putPair = (leftLabel: string, leftValue: string, rightLabel: string, rightValue: string) => {
    const row = sheet.getRow(rowIndex++);
    row.getCell(1).value = leftLabel;
    row.getCell(2).value = leftValue;
    row.getCell(3).value = rightLabel;
    row.getCell(4).value = rightValue;
    for (let c = 1; c <= 4; c++) {
      const cell = row.getCell(c);
      cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
      if (c % 2 === 1) {
        cell.font = { bold: true, size: 8, color: { argb: 'FF505050' } };
      } else {
        cell.font = { size: 9, color: { argb: 'FF000000' } };
      }
    }
  };

  putPair('Armador:', asString(input.owner) || '—', 'Marca:', asString(input.brand) || '—');
  putPair('Nome do Navio:', asString(input.shipName) || '—', 'Tipo:', asString(input.model) || '—');
  putPair('Bandeira do Navio:', asString(input.shipFlag) || '—', 'Número de Série:', asString(input.serial) || '—');
  putPair('IMO No.:', asString(input.shipImo) || '—', 'Data de Fabrico:', formatDateLabel(input.dataFabrico));
  putPair('Call Sign:', asString(input.shipCallSign) || '—', 'Capacidade:', asString(input.capacity) || '—');
  putPair('Data da Inspeção:', formatDateLabel(input.dataInspecao), 'Técnico responsável:', asString(input.responsavel) || '—');

  rowIndex += 1;

  // Tipo de barco
  const tipoTitleRow = sheet.getRow(rowIndex++);
  sheet.mergeCells(`A${tipoTitleRow.number}:C${tipoTitleRow.number}`);
  const tipoTitle = tipoTitleRow.getCell(1);
  tipoTitle.value = 'TIPO DE BARCO';
  tipoTitle.font = { bold: true, size: 9, color: { argb: 'FF000000' } };

  const tipoHeader = sheet.getRow(rowIndex++);
  tipoHeader.getCell(1).value = 'Tipo de Barco';
  tipoHeader.getCell(2).value = 'Código';
  tipoHeader.getCell(3).value = '(X)';
  for (let c = 1; c <= 3; c++) {
    const cell = tipoHeader.getCell(c);
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF505050' } };
    cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
    cell.alignment = { horizontal: 'center' };
  }

  for (const tipo of ABATE_TIPOS_BARCO) {
    const row = sheet.getRow(rowIndex++);
    row.getCell(1).value = tipo.label;
    row.getCell(2).value = tipo.codigo;
    row.getCell(3).value = selecionaTipoBarco(tipo) ? 'X' : '';
    for (let c = 1; c <= 3; c++) {
      const cell = row.getCell(c);
      cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
      if (c === 2 || c === 3) cell.alignment = { horizontal: 'center' };
      if (c === 3) cell.font = { bold: true, size: 10 };
    }
  }

  rowIndex += 1;

  // Motivos de abate
  const motivosTitle = sheet.getRow(rowIndex++);
  sheet.mergeCells(`A${motivosTitle.number}:C${motivosTitle.number}`);
  const mTitleCell = motivosTitle.getCell(1);
  mTitleCell.value = 'MOTIVOS DE ABATE';
  mTitleCell.font = { bold: true, size: 9, color: { argb: 'FF000000' } };

  const motivosHeader = sheet.getRow(rowIndex++);
  sheet.mergeCells(`A${motivosHeader.number}:B${motivosHeader.number}`);
  motivosHeader.getCell(1).value = 'Motivo de Abate';
  motivosHeader.getCell(3).value = 'Código';
  motivosHeader.getCell(4).value = '(X)';
  for (let c = 1; c <= 4; c++) {
    const cell = motivosHeader.getCell(c);
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF505050' } };
    cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
    if (c > 2) cell.alignment = { horizontal: 'center' };
  }

  for (const motivo of ABATE_MOTIVOS) {
    const row = sheet.getRow(rowIndex++);
    row.getCell(1).value = motivo.label;
    row.getCell(3).value = motivo.codigo;
    row.getCell(4).value = motivosSelecionados.has(motivo.codigo) ? 'X' : '';
    sheet.mergeCells(`A${row.number}:B${row.number}`);
    for (let c = 1; c <= 4; c++) {
      const cell = row.getCell(c);
      cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
      if (c === 3 || c === 4) cell.alignment = { horizontal: 'center' };
      if (c === 4) cell.font = { bold: true, size: 10 };
    }
  }

  rowIndex += 1;

  // Detalhes
  const detailLabel = sheet.getRow(rowIndex++);
  sheet.mergeCells(`A${detailLabel.number}:D${detailLabel.number}`);
  const dLabelCell = detailLabel.getCell(1);
  dLabelCell.value = '28. Detalhes do Abate';
  dLabelCell.font = { bold: true, size: 9 };

  const detailRow = sheet.getRow(rowIndex++);
  sheet.mergeCells(`A${detailRow.number}:D${detailRow.number}`);
  const detailCell = detailRow.getCell(1);
  detailCell.value = asString(input.detalhes) || '—';
  detailCell.alignment = { wrapText: true, vertical: 'top' };
  detailRow.height = 42;
  detailCell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

  // Carimbo / assinatura
  rowIndex += 1;
  const sigRow = sheet.getRow(rowIndex++);
  sigRow.getCell(1).value = 'Carimbo:';
  sigRow.getCell(3).value = 'Data:';
  sigRow.getCell(4).value = formatDateLabel(input.dataInspecao);
  [1, 3, 4].forEach(c => {
    sigRow.getCell(c).border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
    sigRow.getCell(c).font = { size: 9, bold: c === 1 || c === 3 };
  });

  const sigRow2 = sheet.getRow(rowIndex++);
  sigRow2.getCell(1).value = 'Assinatura:';
  sigRow2.getCell(2).value = asString(input.responsavel) || '—';
  sigRow2.getCell(3).value = 'Assinatura:';
  sigRow2.getCell(4).value = asString(input.responsavel) || '—';
  [1, 2, 3, 4].forEach(c => {
    const cell = sigRow2.getCell(c);
    cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
    cell.font = { size: 9, bold: c === 1 || c === 3 };
  });

  sheet.views = [{ showGridLines: false }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = abateReportFilename(input);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
