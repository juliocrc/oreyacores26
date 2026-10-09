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
  const rowH = 7.5;

  const drawCheckbox = (x: number, y: number, checked: boolean) => {
    doc.setDrawColor(50, 50, 50);
    doc.setLineWidth(0.3);
    doc.rect(x, y, 4.4, 4.4);

    if (checked) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text("X", x + 1.1, y + 3.4);
    }
  };

  const drawField = (x: number, y: number, w: number, h: number, label: string, value: string) => {
    doc.setDrawColor(70, 70, 70);
    doc.rect(x, y, w, h);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(90, 90, 90);
    doc.text(label, x + 2, y + 3.4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(value || "—", x + 2, y + h - 2.6);
  };

  const drawSectionTitle = (y: number, label: string) => {
    doc.setFillColor(15, 23, 42);
    doc.rect(margin, y, pageW - margin * 2, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(label, margin + 3, y + 4.8);
    doc.setTextColor(0, 0, 0);
  };

  const drawDropdownRow = (y: number, label: string, checked: boolean) => {
    const x = margin;
    const w = pageW - margin * 2;
    const colCheck = 8;
    const colLabel = w - colCheck - 14;
    const colCode = 14;

    doc.setDrawColor(170, 170, 170);
    doc.setLineWidth(0.2);
    doc.rect(x, y, colLabel, rowH);
    doc.rect(x + colLabel, y, colCheck, rowH);
    doc.rect(x + colLabel + colCheck, y, colCode, rowH);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(label, x + 2.5, y + 4.8);

    drawCheckbox(x + colLabel + (colCheck - 4.4) / 2, y + (rowH - 4.4) / 2, checked);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(label.length > 0 ? `${labelCode(label)}` : "—", x + colLabel + colCheck + (colCode / 2), y + 4.8, { align: "center" });
  };

  const labelCode = (label: string) => {
    const tipo = ABATE_TIPOS_BARCO.find((t) => t.label === label);
    if (tipo) return String(tipo.codigo);
    const motivo = ABATE_MOTIVOS.find((m) => m.label === label);
    if (motivo) return String(motivo.codigo);
    return "";
  };

  // Cabeçalho
  doc.setFillColor(15, 23, 42);
  doc.rect(margin, margin, pageW - margin * 2, 14, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("FICHA DE ABATE DE JANGADAS SALVA-VIDAS", pageW / 2, margin + 5.5, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("IM.049/00 · SB18/08 V2", pageW / 2, margin + 10.5, { align: "center" });
  doc.setTextColor(0, 0, 0);

  let y = margin + 17;

  // Campos do cabeçalho
  drawField(margin, y, 95, 11, "ARMADOR", asString(input.owner));
  drawField(margin + 95, y, 95, 11, "MARCA", asString(input.brand));
  y += 11;
  drawField(margin, y, 95, 11, "NOME DO NAVIO", asString(input.shipName));
  drawField(margin + 95, y, 95, 11, "TIPO", asString(input.model));
  y += 11;
  drawField(margin, y, 95, 11, "BANDEIRA DO NAVIO", asString(input.shipFlag));
  drawField(margin + 95, y, 95, 11, "NÚMERO DE SÉRIE", asString(input.serial));
  y += 11;
  drawField(margin, y, 95, 11, "IMO No.", asString(input.shipImo));
  drawField(margin + 95, y, 95, 11, "DATA DE FABRICO", formatDateLabel(input.dataFabrico));
  y += 11;
  drawField(margin, y, 95, 11, "CALL SIGN", asString(input.shipCallSign));
  drawField(margin + 95, y, 95, 11, "CAPACIDADE", asString(input.capacity));
  y += 11 + 3;

  // Tipo de Barco
  drawSectionTitle(y, "Tipo de Barco");
  y += 7;
  ABATE_TIPOS_BARCO.forEach((tipo) => {
    drawDropdownRow(y, tipo.label, asString(input.tipoBarco) === tipo.label || String(tipo.codigo) === asString(input.tipoBarco));
    y += rowH;
  });

  y += 2;

  // Motivos de Abate
  drawSectionTitle(y, "Motivos de Abate");
  y += 7;
  ABATE_MOTIVOS.forEach((motivo) => {
    drawDropdownRow(y, motivo.label, getAbateMotivoCodes(input.motivo).includes(motivo.codigo));
    y += rowH;
  });

  y += 2;

  // Campo 28 — Detalhes do Abate (com SB18/08 V2 automático)
  drawSectionTitle(y, "28. Detalhes do Abate (incl. SB18/08 V2)");
  y += 7;
  const detalhesBoxH = 32;
  doc.setDrawColor(70, 70, 70);
  doc.rect(margin, y, pageW - margin * 2, detalhesBoxH);

  let detalhesText = asString(input.detalhes);
  if (!detalhesText.toUpperCase().includes("SB18/08 V2")) {
    detalhesText = `[SB18/08 V2] ${detalhesText}`.trim();
  }

  if (detalhesText) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize(detalhesText, pageW - margin * 2 - 6), margin + 3, y + 5);
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("[SB18/08 V2] (descrever o motivo do abate — código 17, 26 ou outro)", margin + 3, y + 5);
    doc.setTextColor(0, 0, 0);
  }
  y += detalhesBoxH + 6;

  // Rodapé — Carimbo, Data, Assinatura
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("Carimbo:", margin, y + 3);
  doc.text("Data:", margin + 120, y + 3);
  doc.text("Assinatura:", margin + 150, y + 3);

  doc.setLineWidth(0.3);
  doc.line(margin + 120, y + 5.5, margin + 148, y + 5.5);
  doc.line(margin + 150, y + 5.5, pageW - margin, y + 5.5);

  const dataAbate = asString(input.dataInspecao) || "";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  if (dataAbate) doc.text(formatDateLabel(dataAbate), margin + 120, y + 5);

  if (asString(input.responsavel)) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);
    doc.text(asString(input.responsavel), margin + 150, y + 5);
    doc.setTextColor(0, 0, 0);
  }

  const assinatura = asString(input.signatureBase64);
  if (assinatura && /^data:image\/(png|jpe?g|webp);base64,/.test(assinatura)) {
    try {
      const base64 = assinatura.split(",")[1];
      doc.addImage(base64, "PNG", margin + 152, y + 1, 34, 4);
    } catch {
      // assinatura inválida — ignora
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(120, 120, 120);
  doc.text(`Centro técnico: OREY · Ficha de Abate IM.049/00 · SB18/08 V2 · S/N ${asString(input.serial) || "—"}`, pageW / 2, 290, { align: "center" });

  return doc;
}

export function abateReportFilename(input: AbateReportInput) {
  const serial = asString(input.serial);
  return `Ficha_Abate_${serial || "Jangada"}.pdf`;
}
