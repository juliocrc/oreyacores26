import jsPDF from "jspdf";
import { ABATE_MOTIVOS, ABATE_TIPOS_BARCO, getAbateMotivoCodes } from "@/lib/abate-constants";

export type AbateReportInput = {
  brand?: string;
  model?: string;
  serial?: string;
  capacity?: number | string;
  dataFabrico?: string;
  dataInspecao?: string;
  shipName?: string;
  owner?: string;
  shipFlag?: string;
  shipImo?: string;
  shipCallSign?: string;
  tipoBarco?: string;
  motivo?: string;
  detalhes?: string;
  responsavel?: string;
  signatureBase64?: string;
};

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function formatDateLabel(value: unknown) {
  const raw = asString(value);
  if (!raw) return "—";
  if (/^\d{1,2}\/\d{2,4}$/.test(raw) || /^\d{1,2}-\d{2,4}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("pt-PT");
}

export function buildAbateReportDoc(input: AbateReportInput) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 10;
  const rowH = 5.2;

  const drawCheckbox = (x: number, y: number, checked: boolean) => {
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.25);
    doc.rect(x, y, 4, 4);

    if (checked) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.text("X", x + 1.0, y + 3.1);
    }
  };

  const drawField = (x: number, y: number, w: number, h: number, label: string, value: string) => {
    doc.setDrawColor(70, 70, 70);
    doc.setLineWidth(0.25);
    doc.rect(x, y, w, h);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(80, 80, 80);
    doc.text(label, x + 2, y + 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text(value || "—", x + 2, y + h - 2);
  };

  // Título Principal
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text("FICHA DE ABATE DE JANGADAS SALVA-VIDAS", pageW / 2, margin + 4, { align: "center" });

  let y = margin + 8;

  // Cabeçalho de Identificação (2 colunas)
  const colW = (pageW - margin * 2) / 2;
  const fieldH = 8.5;

  drawField(margin, y, colW, fieldH, "Armador:", asString(input.owner));
  drawField(margin + colW, y, colW, fieldH, "Marca:", asString(input.brand));
  y += fieldH;

  drawField(margin, y, colW, fieldH, "Nome do Navio:", asString(input.shipName));
  drawField(margin + colW, y, colW, fieldH, "Tipo:", asString(input.model));
  y += fieldH;

  drawField(margin, y, colW, fieldH, "Bandeira do Navio:", asString(input.shipFlag));
  drawField(margin + colW, y, colW, fieldH, "Número de Série:", asString(input.serial));
  y += fieldH;

  drawField(margin, y, colW, fieldH, "IMO No.:", asString(input.shipImo));
  drawField(margin + colW, y, colW, fieldH, "Data de Fabrico:", formatDateLabel(input.dataFabrico));
  y += fieldH;

  drawField(margin, y, colW, fieldH, "Call Sign:", asString(input.shipCallSign));
  drawField(margin + colW, y, colW, fieldH, "Capacidade:", asString(input.capacity));
  y += fieldH + 2;

  // Tabela 1: Tipo de Barco
  doc.setFillColor(240, 240, 240);
  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, pageW - margin * 2, 6, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text("Tipo de Barco", margin + 4, y + 4);
  doc.text("Código", margin + 140, y + 4, { align: "center" });
  doc.text("(X)", margin + 175, y + 4, { align: "center" });
  y += 6;

  ABATE_TIPOS_BARCO.forEach((tipo) => {
    const checked = asString(input.tipoBarco) === tipo.label || String(tipo.codigo) === asString(input.tipoBarco);
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, pageW - margin * 2 - 40, rowH);
    doc.rect(margin + pageW - margin * 2 - 40, y, 20, rowH);
    doc.rect(margin + pageW - margin * 2 - 20, y, 20, rowH);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(tipo.label, margin + 2.5, y + 3.8);

    doc.setFont("helvetica", "bold");
    doc.text(String(tipo.codigo), margin + pageW - margin * 2 - 30, y + 3.8, { align: "center" });

    drawCheckbox(margin + pageW - margin * 2 - 20 + (20 - 4) / 2, y + (rowH - 4) / 2, checked);
    y += rowH;
  });

  y += 2;

  // Tabela 2: Motivos de Abate
  doc.setFillColor(240, 240, 240);
  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, pageW - margin * 2, 6, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Motivos de Abate", margin + 4, y + 4);
  doc.text("Código", margin + 140, y + 4, { align: "center" });
  doc.text("(X)", margin + 175, y + 4, { align: "center" });
  y += 6;

  const motivoCodes = getAbateMotivoCodes(input.motivo);
  ABATE_MOTIVOS.forEach((motivo) => {
    const checked = motivoCodes.includes(motivo.codigo);
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, pageW - margin * 2 - 40, rowH);
    doc.rect(margin + pageW - margin * 2 - 40, y, 20, rowH);
    doc.rect(margin + pageW - margin * 2 - 20, y, 20, rowH);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.text(motivo.label, margin + 2.5, y + 3.8);

    doc.setFont("helvetica", "bold");
    doc.text(String(motivo.codigo), margin + pageW - margin * 2 - 30, y + 3.8, { align: "center" });

    drawCheckbox(margin + pageW - margin * 2 - 20 + (20 - 4) / 2, y + (rowH - 4) / 2, checked);
    y += rowH;
  });

  y += 2;

  // Campo 28 — Detalhes do Abate & Carimbo / Assinatura
  const boxH = 26;
  const leftW = pageW - margin * 2 - 75;
  const rightW = 75;

  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, leftW, boxH);
  doc.rect(margin + leftW, y, rightW, boxH);

  // Detalhes (esquerda)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("28. Detalhes do Abate", margin + 3, y + 4.5);

  let detalhesText = asString(input.detalhes);
  if (!detalhesText.toUpperCase().includes("SB 18/08")) {
    detalhesText = `Jangada abatida de acordo com o SB 18/08 Ver.2. ${detalhesText}`.trim();
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(doc.splitTextToSize(detalhesText, leftW - 6), margin + 3, y + 10);

  // Carimbo e Assinatura (direita)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("Carimbo:", margin + leftW + 3, y + 4.5);

  const subY = y + 15;
  doc.line(margin + leftW, subY, pageW - margin, subY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(`Data: ${formatDateLabel(input.dataInspecao)}`, margin + leftW + 3, subY + 4);

  const sigY = subY + 7;
  doc.line(margin + leftW, sigY, pageW - margin, sigY);
  doc.text(`Assinatura: ${asString(input.responsavel)}`, margin + leftW + 3, sigY + 3.5);

  const assinatura = asString(input.signatureBase64);
  if (assinatura && /^data:image\/(png|jpe?g|webp);base64,/.test(assinatura)) {
    try {
      const base64 = assinatura.split(",")[1];
      doc.addImage(base64, "PNG", margin + leftW + 35, sigY + 0.5, 30, 3);
    } catch {
      // ignora
    }
  }

  y += boxH + 3;

  // Rodapé IM.049/00
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text("IM.049/00", pageW / 2, y, { align: "center" });

  return doc;
}

export function abateReportFilename(input: AbateReportInput) {
  const serial = asString(input.serial);
  return `Ficha_Abate_${serial || "Jangada"}.pdf`;
}
