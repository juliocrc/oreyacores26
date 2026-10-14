import jsPDF from "jspdf";
import { DRINKING_WATER_STOCK_REFERENCE, FOOD_RATIONS_STOCK_REFERENCE } from "./stock-reference-rules";

export type InspectionCertificateInput = {
  certNumber?: string;
  inspectionDate?: string;
  shipName?: string;
  raftModel?: string;
  raftSerial?: string;
  status?: string;
  technician?: string;
  checklist?: Record<string, unknown>;
  technicianName?: string;
  technicianSignature?: string;
  clientName?: string;
  clientSignature?: string;
  /** Carimbo oficial (imagem data URL) aplicado na área de assinatura do certificado. */
  stampImage?: string;
  /** Hash de integridade do certificado (sha256 truncado) para verificação pública. */
  verificationHash?: string;
  /** QR code (imagem data URL) que aponta para a página pública de verificação. */
  verificationQr?: string;
};

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function asChecked(value: unknown) {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["", "false", "0", "nao", "não", "not_ok"].includes(normalized)) return false;
  }
  return Boolean(value);
}

function formatDateLabel(value: unknown) {
  const raw = asString(value);
  if (!raw) return "—";
  if (/^\d{1,2}\/\d{2,4}$/.test(raw) || /^\d{1,2}-\d{2,4}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("pt-PT");
}

function formatValidityShort(value: unknown) {
  const raw = asString(value);
  if (!raw) return "";
  if (/^\d{1,2}[/-]\d{2,4}$/.test(raw)) return raw.replace("/", "-");
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return `${String(parsed.getMonth() + 1).padStart(2, "0")}-${parsed.getFullYear()}`;
}

export function buildInspectionCertificateDoc(input: InspectionCertificateInput) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 10;
  const checklist = input.checklist || {};
  const rowHeight = 12;

  const drawCheckbox = (cellX: number, y: number, cellW: number, cellH: number, checked: boolean) => {
    const boxSize = 4.8;
    const boxX = cellX + (cellW - boxSize) / 2;
    const boxY = y + (cellH - boxSize) / 2;

    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.35);
    doc.rect(boxX, boxY, boxSize, boxSize);

    if (checked) {
      doc.setLineWidth(0.6);
      doc.line(boxX + 0.9, boxY + 2.7, boxX + 2.0, boxY + 3.9);
      doc.line(boxX + 2.0, boxY + 3.9, boxX + 4.0, boxY + 1.1);
      doc.setLineWidth(0.2);
    }
  };

  const drawHeaderCell = (x: number, y: number, w: number, h: number, label: string, value: string) => {
    doc.setDrawColor(90, 90, 90);
    doc.rect(x, y, w, h);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(label, x + 2, y + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(value || "—", x + 2, y + h - 3);
  };

  const drawSectionTitle = (y: number, pt: string, en: string) => {
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(margin, y, pageW - margin * 2, 9, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(pt.toUpperCase(), margin + 3, y + 3.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(en, margin + 3, y + 7.5);
    doc.setTextColor(0, 0, 0);
  };

  const drawRow = (y: number, pt: string, en: string, checked: boolean, refValue?: string, validity?: string) => {
    const x = margin;
    const w = pageW - margin * 2;
    const colCheck = 10;
    const colRef = 40;
    const colVal = 26;
    const colLabel = w - colCheck - colRef - colVal;

    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.2);
    doc.rect(x, y, colLabel, rowHeight);
    doc.rect(x + colLabel, y, colCheck, rowHeight);
    doc.rect(x + colLabel + colCheck, y, colRef, rowHeight);
    doc.rect(x + colLabel + colCheck + colRef, y, colVal, rowHeight);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(pt, x + 2.5, y + 4.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(en, x + 2.5, y + 9);

    drawCheckbox(x + colLabel, y, colCheck, rowHeight, checked);

    if (refValue) {
      doc.setFillColor(248, 250, 252); // soft grey slate-50
      doc.rect(x + colLabel + colCheck + 0.1, y + 0.1, colRef - 0.2, rowHeight - 0.2, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(refValue, x + colLabel + colCheck + (colRef / 2), y + 7.5, { align: "center" });
    }

    if (validity) {
      doc.setFillColor(240, 253, 244); // soft green-50
      doc.rect(x + colLabel + colCheck + colRef + 0.1, y + 0.1, colVal - 0.2, rowHeight - 0.2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text(validity, x + colLabel + colCheck + colRef + (colVal / 2), y + 7.5, { align: "center" });
    }
  };

  doc.setDrawColor(70, 70, 70);
  doc.rect(margin, margin, pageW - margin * 2, 277);

  // Draw premium header band
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(margin, margin, pageW - margin * 2, 18, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("CERTIFICADO DE INSPEÇÃO", pageW / 2, margin + 7, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("LIFERAFT INSPECTION CERTIFICATE", pageW / 2, margin + 12, { align: "center" });
  doc.setTextColor(0, 0, 0);

  drawHeaderCell(10, 31, 54, 16, "CERTIFICADO N.º", asString(input.certNumber) || "—");
  drawHeaderCell(64, 31, 40, 16, "DATA", formatDateLabel(input.inspectionDate));
  drawHeaderCell(104, 31, 48, 16, "NAVIO", asString(input.shipName) || "Sem navio");
  drawHeaderCell(152, 31, 48, 16, "MODELO", asString(input.raftModel) || "Jangada");
  drawHeaderCell(10, 47, 95, 14, "N.º SÉRIE", asString(input.raftSerial) || "SEM-SERIAL");
  drawHeaderCell(105, 47, 95, 14, "ESTADO", asString(input.status) || "Concluída");

  let y = 66;

  drawSectionTitle(y, "Exterior da Jangada", "Liferaft - External");
  y += 9;
  drawRow(y, "Luz Exterior e Bateria", "Top Light and Battery", asChecked(checklist.luz_exterior_bateria), asString(checklist.ref_luz_exterior || "30203190"), formatValidityShort(checklist.validade_luzes_exteriores));
  y += 12;
  drawRow(y, "Tubo de Identificação", "Identification Card / Tube", asChecked(checklist.tubo_identificacao), asString(checklist.tuboIdentificacao || checklist.tubo_identificacao_ref), "");
  y += 12;
  drawRow(y, "Cilindro CO2", "Cylinder CO2", asChecked(checklist.cilindro_co2), asString(checklist.cilindro_co2 || checklist.ref_cilindro_co2), "");
  y += 13;

  drawSectionTitle(y, "Interior da Jangada", "Liferaft - Internal");
  y += 9;
  drawRow(y, "Luz Interior e Bateria", "Inside Light and Battery", asChecked(checklist.luz_interior_bateria), asString(checklist.ref_bateria || "30202206"), formatValidityShort(checklist.validade_bateria));
  y += 12;
  drawRow(y, "Facas de Segurança", "Safety Knifes", asChecked(checklist.faca_seguranca), "", "");
  y += 13;

  drawSectionTitle(y, "Equip. de Emergência", "Emergency Pack");
  y += 9;
  drawRow(y, "Água / Drinking Water", "Drinking Water", asChecked(checklist.saco_agua), asString(checklist.ref_agua || DRINKING_WATER_STOCK_REFERENCE), formatValidityShort(checklist.validade_agua));
  y += 12;
  drawRow(y, "Rações / Food Rations", "Food Rations", asChecked(checklist.racoes_alimentares), asString(checklist.ref_racoes || FOOD_RATIONS_STOCK_REFERENCE), formatValidityShort(checklist.validade_racoes));
  y += 12;
  drawRow(y, "Farmácia Solas / First Aid Kit", "First Aid Kit", asChecked(checklist.ambulancia), asString(checklist.ref_farmacia || "30202050"), formatValidityShort(checklist.validade_farmacia));
  y += 12;
  drawRow(y, "Comprimidos p/ Enjoo", "Seasickness Tablets", asChecked(checklist.comprimidos_enjoo), asString(checklist.ref_comprimidos || "30202051"), formatValidityShort(checklist.validade_comprimidos));
  y += 12;
  drawRow(y, "Foguetes Paraquedas", "Parachute Rockets", asChecked(checklist.foguetoes_paraquedas), asString(checklist.ref_paraquedas || "20500023"), formatValidityShort(checklist.validade_paraquedas));
  y += 12;
  drawRow(y, "Fachos de Mão", "Red Hand Flares", asChecked(checklist.fachos_mao), asString(checklist.ref_fachos || "20500035"), formatValidityShort(checklist.validade_fachos_mao));
  y += 12;
  drawRow(y, "Potes de Fumo", "Floating Smoke Signals", asChecked(checklist.potes_fumo), asString(checklist.ref_potes || "20500002"), formatValidityShort(checklist.validade_potes_fumo));
  y += 13;

  drawSectionTitle(y, "Ensaios e Testes", "Tests");
  y += 9;
  drawHeaderCell(10, y, 46, 12, "P1 CORR. INF", asString(checklist.p1_corrigida_inferior || "—"));
  drawHeaderCell(56, y, 46, 12, "P1 CORR. SUP", asString(checklist.p1_corrigida_superior || "—"));
  drawHeaderCell(102, y, 46, 12, "QUEDA INF (%)", asString(checklist.queda_real_inferior || "—"));
  drawHeaderCell(148, y, 52, 12, "QUEDA SUP (%)", asString(checklist.queda_real_superior || "—"));
  y += 12;
  drawHeaderCell(10, y, 130, 12, "RESULTADO WP", asString(checklist.aprovacao_wp || "—"));
  drawHeaderCell(140, y, 60, 12, "DATA INSPEÇÃO", formatDateLabel(input.inspectionDate));

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Centro técnico: OREY · Técnico: ${asString(input.technician) || "—"}`, 12, 286);
  doc.text("Assinatura: __________________________", 130, 286);

  // Carimbo oficial OREY na área de assinatura (canto inferior direito).
  const stampImage = asString(input.stampImage);
  if (/^data:image\/(png|jpe?g|webp);base64,/i.test(stampImage)) {
    const stampFormat = stampImage.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
    const stampW = 56;
    const stampH = stampW * (265 / 574);
    try {
      doc.addImage(stampImage, stampFormat, 130, 286 - 6 - stampH, stampW, stampH);
    } catch {
      // Carimbo é opcional: nunca deve impedir a geração do certificado.
    }
  }

  // QR + hash de verificação (faixa inferior, entre "Centro técnico" e "Assinatura").
  const verificationQr = asString(input.verificationQr);
  const verificationHash = asString(input.verificationHash);
  if (/^data:image\/(png|jpe?g|webp);base64,/i.test(verificationQr)) {
    const qrSize = 11;
    const qrX = 78;
    const qrY = 274;
    try {
      doc.addImage(verificationQr, "PNG", qrX, qrY, qrSize, qrSize);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(90, 90, 90);
      doc.text("Verificar autenticidade", qrX + qrSize + 2, qrY + 4);
      if (verificationHash) {
        doc.text(`Hash: ${verificationHash}`, qrX + qrSize + 2, qrY + 8);
      }
      doc.setTextColor(0, 0, 0);
    } catch {
      // QR é opcional.
    }
  }

  // Página de assinaturas: técnica do centro + representante do armador.
  const hasAnySignature =
    /^data:image\/(png|jpe?g|webp);base64,/i.test(asString(input.technicianSignature)) ||
    /^data:image\/(png|jpe?g|webp);base64,/i.test(asString(input.clientSignature));

  if (hasAnySignature) {
    doc.addPage();
    const pageH = 297;
    doc.setDrawColor(70, 70, 70);
    doc.rect(margin, margin, pageW - margin * 2, pageH - margin * 2);

    doc.setFillColor(15, 23, 42);
    doc.rect(margin, margin, pageW - margin * 2, 18, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("ASSINATURAS", pageW / 2, margin + 7, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("SIGNATURES", pageW / 2, margin + 12, { align: "center" });
    doc.setTextColor(0, 0, 0);

    const boxW = (pageW - margin * 2 - 8) / 2;
    const boxY = 48;
    const boxH = 78;

    const drawSignatureBox = (
      x: number,
      titlePt: string,
      titleEn: string,
      signerName: string,
      rolePt: string,
      signature?: string,
    ) => {
      doc.setDrawColor(90, 90, 90);
      doc.rect(x, boxY, boxW, boxH);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(titlePt.toUpperCase(), x + 4, boxY + 7);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(titleEn, x + 4, boxY + 11);

      const imageFormat = signature?.startsWith("data:image/jpeg")
        ? "JPEG"
        : signature?.startsWith("data:image/webp")
          ? "WEBP"
          : "PNG";

      if (signature && /^data:image\/(png|jpe?g|webp);base64,/i.test(signature)) {
        const imageH = 30;
        const imageW = Math.min(boxW - 8, 60);
        try {
          doc.addImage(signature, imageFormat, x + 4, boxY + 18, imageW, imageH);
        } catch {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(120, 120, 120);
          doc.text("(imagem de assinatura inválida)", x + 4, boxY + 30);
          doc.setTextColor(0, 0, 0);
        }
      } else {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text("(sem assinatura)", x + 4, boxY + 30);
        doc.setTextColor(0, 0, 0);
      }

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.line(x + 4, boxY + boxH - 16, x + boxW - 4, boxY + boxH - 16);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(signerName ? signerName : "________________", x + 4, boxY + boxH - 8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(80, 80, 80);
      doc.text(rolePt, x + 4, boxY + boxH - 2.5);
      doc.setTextColor(0, 0, 0);
    };

    drawSignatureBox(
      margin,
      "Técnico de campo",
      "Field Technician",
      asString(input.technicianName || input.technician),
      "Serviço OREY Açores",
      asString(input.technicianSignature),
    );
    drawSignatureBox(
      margin + boxW + 8,
      "Representante do armador",
      "Master / Owner Representative",
      asString(input.clientName),
      "Armador / Comandante do navio",
      asString(input.clientSignature),
    );
  }

  return doc;
}
