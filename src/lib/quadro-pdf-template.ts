import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import type { QuadroTemplateInput } from './quadro-template';
import { collectSubstitutedArticles } from './quadro-template';

function formatMonthYearSlash(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (match) return `${match[2]}/${match[1]}`;
  const ptDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ptDate) return `${String(Number(ptDate[2])).padStart(2, '0')}/${ptDate[3]}`;
  const mmYYYY = raw.match(/^(\d{2})[\/-](\d{4})$/);
  if (mmYYYY) return `${mmYYYY[1]}/${mmYYYY[2]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return `${String(parsed.getMonth() + 1).padStart(2, '0')}/${parsed.getFullYear()}`;
}

function formatMonthYear(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (match) return `${match[2]}-${match[1]}`;
  const mmYYYY = raw.match(/^(\d{2})\/(\d{4})$/);
  if (mmYYYY) return `${mmYYYY[1]}-${mmYYYY[2]}`;
  return raw;
}

function getDaysRemaining(validadeStr: string, refDate: Date): number | null {
  if (!validadeStr) return null;
  const [vYear, vMonth] = validadeStr.split('-').map(Number);
  if (!vYear || !vMonth) return null;
  const expDate = new Date(vYear, (vMonth || 1) - 1, 1);
  const diffTime = expDate.getTime() - refDate.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export async function buildQuadroPDFArtifacts(input: QuadroTemplateInput) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const checklist = input.checklist || {};
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 15;

  // Helper functions
  const addText = (text: string, x: number, yPos: number, options: { fontSize?: number; fontStyle?: string; color?: [number, number, number] } = {}) => {
    doc.setFontSize(options.fontSize || 10);
    doc.setFont('helvetica', options.fontStyle || 'normal');
    if (options.color) doc.setTextColor(...options.color); else doc.setTextColor(0);
    doc.text(text, x, yPos);
  };

  const addLine = (yPos: number) => {
    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    doc.line(15, yPos, pageWidth - 15, yPos);
  };

  // Header
  addText('QUADRO DE INSPEÇÃO DE JANGADA SALVA-VIDAS', pageWidth / 2, y, { fontSize: 14, fontStyle: 'bold', color: [30, 64, 175] });
  y += 8;
  addLine(y);
  y += 5;

  // Identification block
  const leftCol = 15;
  const rightCol = pageWidth / 2 + 5;
  const colWidth = pageWidth / 2 - 20;

  const addField = (label: string, value: string, x: number, yPos: number) => {
    addText(label, x, yPos, { fontSize: 8, fontStyle: 'bold', color: [100, 116, 139] });
    addText(value || '—', x, yPos + 4, { fontSize: 9, fontStyle: 'normal' });
  };

  addField('Nº Obra', input.numeroObra || '—', leftCol, y);
  addField('Certificado Nº', input.certNumber || '—', rightCol, y);
  y += 12;

  addField('Navio', input.shipName || '—', leftCol, y);
  addField('Marca', input.brand || '—', rightCol, y);
  y += 12;

  addField('Modelo', input.raftModel || '—', leftCol, y);
  addField('Lotação', input.raftCapacity ? `${input.raftCapacity} P` : '—', rightCol, y);
  y += 12;

  addField('Nº Série', input.raftSerial || '—', leftCol, y);
  addField('Data Fabrico', formatMonthYear(input.manufactureDate) || '—', rightCol, y);
  y += 12;

  addField('Data Inspeção', formatMonthYearSlash(input.inspectionDate) || '—', leftCol, y);
  addField('Próx. Inspeção', formatMonthYearSlash(input.nextInspectionDate) || '—', rightCol, y);
  y += 12;

  addField('Tipo Pack', input.packType || '—', leftCol, y);
  y += 12;

  addLine(y);
  y += 5;

  // Cylinder block
  addText('CILINDRO DE INSUFLAÇÃO', leftCol, y, { fontSize: 10, fontStyle: 'bold', color: [30, 64, 175] });
  y += 7;
  addField('Nº Série', input.cylinderSerial || '—', leftCol, y);
  addField('Peso Bruto', input.cylinderGrossWeight ? `${Number(String(input.cylinderGrossWeight).replace(',', '.')).toFixed(3)} kg` : '—', rightCol, y);
  y += 10;
  addField('Tara', input.cylinderTare ? `${Number(String(input.cylinderTare).replace(',', '.')).toFixed(3)} kg` : '—', leftCol, y);
  addField('CO2', input.cylinderCo2 ? `${Number(String(input.cylinderCo2).replace(',', '.')).toFixed(3)} kg` : '—', rightCol, y);
  y += 10;
  addField('N2', input.cylinderN2 ? `${Number(String(input.cylinderN2).replace(',', '.')).toFixed(3)} kg` : '—', leftCol, y);
  addField('Teste Hidrostático', formatMonthYearSlash(input.cylinderHydroTestDate) || '—', rightCol, y);
  y += 12;

  addLine(y);
  y += 5;

  // WP Test block
  addText('ENSAIO WP (PRESSÃO DE TRABALHO)', leftCol, y, { fontSize: 10, fontStyle: 'bold', color: [30, 64, 175] });
  y += 7;

  if (input.wpStartTime || input.wpUpperStart || input.wpLowerStart) {
    addField('Horário', `${input.wpStartTime || '—'} → ${input.wpEndTime || '—'}`, leftCol, y);
    addField('Unidade', input.pressureUnit || 'inh2o', rightCol, y);
    y += 10;
    addField('Câmara Sup. (Início/Fim)', `${input.wpUpperStart || '—'} / ${input.wpUpperEnd || '—'}`, leftCol, y);
    addField('Queda Sup.', String(input.wpUpperDropPercent ? `${input.wpUpperDropPercent}%` : (input.wpUpperDrop || '—')), rightCol, y);
    y += 10;
    addField('Câmara Inf. (Início/Fim)', `${input.wpLowerStart || '—'} / ${input.wpLowerEnd || '—'}`, leftCol, y);
    addField('Queda Inf.', String(input.wpLowerDropPercent ? `${input.wpLowerDropPercent}%` : (input.wpLowerDrop || '—')), rightCol, y);
    y += 12;
  }

  addLine(y);
  y += 5;

  // Pack consumíveis table
  addText('CONSUMÍVEIS DO PACK DE EMERGÊNCIA', leftCol, y, { fontSize: 10, fontStyle: 'bold', color: [30, 64, 175] });
  y += 7;

  const packItems = [
    { key: 'farmacia', label: 'Farmácia / First Aid Kit', ref: 'ref_farmacia', qty: 'qtd_farmacia', val: 'validade_farmacia' },
    { key: 'comprimidos', label: 'Comprimidos Enjoo', ref: 'ref_comprimidos', qty: 'qtd_comprimidos', val: 'validade_comprimidos' },
    { key: 'paraquedas', label: 'Foguetes Paraquedas', ref: 'ref_paraquedas', qty: 'qtd_paraquedas', val: 'validade_paraquedas' },
    { key: 'fachos', label: 'Fachos de Mão', ref: 'ref_fachos', qty: 'qtd_fachos', val: 'validade_fachos_mao' },
    { key: 'potes', label: 'Potes de Fumo', ref: 'ref_potes', qty: 'qtd_potes', val: 'validade_potes_fumo' },
    { key: 'lanterna', label: 'Lanterna', ref: 'ref_lanterna', qty: 'qtd_lanterna', val: 'validade_lanterna' },
    { key: 'pilhas', label: 'Pilhas Lanterna', ref: 'ref_bateria', qty: 'qtd_pilhas_lanterna', val: 'validade_pilhas_lanterna' },
    { key: 'bateria_litio', label: 'Bateria Lítio', ref: 'ref_bateria_litio', qty: 'qtd_bateria_litio', val: 'validade_bateria' },
    { key: 'cinta_fecho', label: 'Cinta de Fecho', ref: 'ref_cinta_fecho', qty: 'qtd_cinta_fecho', val: '' },
    { key: 'jogo_reparacao', label: 'Jogo Reparação', ref: 'ref_jogo_reparacao', qty: 'qtd_jogo_reparacao', val: '' },
    { key: 'luz_ext', label: 'Luz Exterior', ref: '', qty: '', val: 'validade_luzes_exteriores' },
    { key: 'luz_int', label: 'Luz Interior', ref: '', qty: '', val: 'validade_bateria' },
    { key: 'agua', label: 'Saco de Água', ref: 'ref_agua', qty: '', val: 'validade_agua' },
    { key: 'racoes', label: 'Rações Alimentares', ref: 'ref_racoes', qty: '', val: 'validade_racoes' },
  ];

  const tableBody = packItems.map(item => {
    const val = item.val ? checklist[item.val] : '';
    const ref = item.ref ? checklist[item.ref] : '';
    const qty = item.qty ? checklist[item.qty] : '';
    
    const valFormatted = val ? formatMonthYear(val) : '—';
    const days = val ? getDaysRemaining(String(val), input.inspectionDate ? new Date(input.inspectionDate) : new Date()) : null;
    const daysStr = days !== null ? (days < 0 ? `Expirado ${Math.abs(days)}d` : days <= 30 ? `⚠ ${days}d` : `${days}d`) : '—';
    
    let status = '—';
    if (days !== null) {
      if (days < 0) status = 'EXPIRADO';
      else if (days <= 30) status = 'CRÍTICO';
      else if (days <= 90) status = 'ATENÇÃO';
      else status = 'OK';
    }
    
    return [
      item.label,
      ref || '—',
      qty || '—',
      valFormatted,
      daysStr,
      status,
    ];
  });

  (doc as any).autoTable({
    startY: y,
    head: [['Artigo', 'Ref.', 'Qtd', 'Validade', 'Dias', 'Estado']],
    body: tableBody,
    theme: 'striped',
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 7, fontStyle: 'bold' },
    styles: { fontSize: 7, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 25, halign: 'center' },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 22, halign: 'center' },
    },
    didParseCell: (hook: any) => {
      if (hook.section === 'body' && hook.column.index === 5) {
        const status = hook.cell.raw;
        if (status === 'EXPIRADO') {
          hook.cell.styles.fillColor = [254, 242, 242];
          hook.cell.styles.textColor = [220, 38, 38];
          hook.cell.styles.fontStyle = 'bold';
        } else if (status === 'CRÍTICO') {
          hook.cell.styles.fillColor = [255, 247, 237];
          hook.cell.styles.textColor = [234, 88, 12];
          hook.cell.styles.fontStyle = 'bold';
        } else if (status === 'ATENÇÃO') {
          hook.cell.styles.fillColor = [255, 251, 235];
          hook.cell.styles.textColor = [217, 119, 6];
          hook.cell.styles.fontStyle = 'bold';
        } else if (status === 'OK') {
          hook.cell.styles.fillColor = [240, 253, 244];
          hook.cell.styles.textColor = [22, 163, 74];
        }
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Substituted articles section
  const substitutedArticles = collectSubstitutedArticles(input);
  if (substitutedArticles.length > 0) {
    if (y > pageHeight - 60) {
      doc.addPage();
      y = 15;
    }

    addText('ARTIGOS SUBSTITUÍDOS NA INSPEÇÃO', leftCol, y, { fontSize: 10, fontStyle: 'bold', color: [5, 150, 105] });
    y += 7;

    const substitutedBody = substitutedArticles.map(article => [
      article.label,
      article.reference,
      String(article.quantity),
      article.validity || '—',
    ]);

    (doc as any).autoTable({
      startY: y,
      head: [['Artigo', 'Referência', 'Qtd', 'Validade']],
      body: substitutedBody,
      theme: 'striped',
      headStyles: { fillColor: [5, 150, 105], textColor: 255, fontSize: 7, fontStyle: 'bold' },
      styles: { fontSize: 7, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 62 },
        1: { cellWidth: 42, halign: 'center' },
        2: { cellWidth: 12, halign: 'center' },
        3: { cellWidth: 30, halign: 'center' },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Signature
  if (y > pageHeight - 40) {
    doc.addPage();
    y = 15;
  }
  
  addLine(y);
  y += 5;
  addText('OREY TÉCNICA – 50937', leftCol, y, { fontSize: 9, fontStyle: 'bold' });
  y += 6;
  addText(`Técnico: ${(input as any).technician || '________________________'}`, leftCol, y);
  y += 6;
  addText(`Data: ${formatMonthYearSlash(input.inspectionDate) || '________________'}`, leftCol, y);

  const buffer = Buffer.from(doc.output('arraybuffer'));
  const fileName = `quadro_${(input.raftSerial || 'jangada').replace(/[^a-zA-Z0-9]/g, '_')}_${formatMonthYearSlash(input.inspectionDate).replace('/', '-')}.pdf`;
  
  return { buffer, fileName };
}