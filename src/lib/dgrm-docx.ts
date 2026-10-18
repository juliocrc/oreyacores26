/**
 * In-process DOCX generation for DGRM identification sheet.
 * Port of scripts/gerar_dgrm_docx.py — uses jszip + xmldom instead of python-docx.
 */

import JSZip from "jszip";
import {
  DOMParser,
  XMLSerializer,
  type Node as XmlNode,
  type Element as XmlElement,
} from "@xmldom/xmldom";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function isW(el: XmlNode, local: string): boolean {
  return (
    el.nodeType === 1 &&
    el.localName === local &&
    el.namespaceURI === W
  );
}

/**
 * Returns all top-level <w:p> direct children of <w:body>,
 * excluding paragraphs inside <w:tbl>.  Mirrors python-docx's doc.paragraphs.
 */
function getBodyParagraphs(body: XmlNode): XmlElement[] {
  const paras: XmlElement[] = [];
  for (const child of Array.from(body.childNodes)) {
    if (isW(child, "p")) paras.push(child as XmlElement);
  }
  return paras;
}

/**
 * Clear all <w:r> runs inside a paragraph, put text into the first run.
 */
function setParagraphText(para: XmlElement, text: string, bold = false): void {
  const runs: XmlElement[] = [];

  for (const child of Array.from(para.childNodes)) {
    if (isW(child, "r")) {
      runs.push(child as XmlElement);
    } else if (isW(child, "hyperlink") || isW(child, "smartTag")) {
      for (const sub of Array.from(child.childNodes)) {
        if (isW(sub, "r")) runs.push(sub as XmlElement);
      }
    }
  }

  // Clear all runs
  for (const run of runs) {
    for (const node of Array.from(run.childNodes)) {
      if (isW(node, "t") || isW(node, "tabs")) {
        run.removeChild(node);
      }
    }
  }

  if (runs.length > 0) {
    const first = runs[0];
    const docOwner = first.ownerDocument;
    if (!docOwner) throw new Error("paragraph has no owner document");
    let rPr = Array.from(first.childNodes).find((n) => isW(n, "rPr")) as XmlElement | undefined;
    if (bold) {
      if (!rPr) {
        rPr = docOwner.createElementNS(W, "w:rPr");
        first.insertBefore(rPr, first.firstChild);
      }
      let b = Array.from(rPr.childNodes).find((n) => isW(n, "b")) as XmlElement | undefined;
      if (!b) {
        b = docOwner.createElementNS(W, "w:b");
        rPr.appendChild(b);
      }
    }
    const t = docOwner.createElementNS(W, "w:t");
    t.textContent = text;
    t.setAttribute("xml:space", "preserve");
    first.appendChild(t);
  } else {
    const docOwner = para.ownerDocument;
    if (!docOwner) throw new Error("paragraph has no owner document");
    const run = docOwner.createElementNS(W, "w:r");
    const rPr = docOwner.createElementNS(W, "w:rPr");
    if (bold) {
      rPr.appendChild(docOwner.createElementNS(W, "w:b"));
    }
    run.appendChild(rPr);
    const t = docOwner.createElementNS(W, "w:t");
    t.textContent = text;
    t.setAttribute("xml:space", "preserve");
    run.appendChild(t);
    para.appendChild(run);
  }
}

/**
 * Set the text of all paragraphs inside a cell (clearing runs, setting first).
 */
function setCellText(cell: XmlElement, text: string, bold = false): void {
  for (const child of Array.from(cell.childNodes)) {
    if (isW(child, "p")) {
      setParagraphText(child as XmlElement, text, bold);
    }
  }
}

function setCellSingleParagraphText(cell: XmlElement, text: string): void {
  let firstParagraph = true;
  for (const child of Array.from(cell.childNodes)) {
    if (!isW(child, "p")) continue;
    setParagraphText(child as XmlElement, firstParagraph ? text : "");
    firstParagraph = false;
  }
}

function getManufacturerLocation(brand?: string): string {
  const normalized = String(brand || "").trim().toUpperCase();
  if (normalized.includes("DSB")) return "Alemanha";
  if (normalized.includes("RFD")) return "Inglaterra";
  if (normalized.includes("VIKING")) return "Dinamarca";
  if (normalized.includes("ZODIAC")) return "França";
  if (normalized.includes("EUROVINIL")) return "Itália";
  return "";
}

/**
 * Return array of <w:tbl> direct children of <w:body>.
 */
function getBodyTables(body: XmlNode): XmlElement[] {
  const tables: XmlElement[] = [];
  for (const child of Array.from(body.childNodes)) {
    if (isW(child, "tbl")) tables.push(child as XmlElement);
  }
  return tables;
}

function getTableRows(table: XmlElement): XmlElement[] {
  const rows: XmlElement[] = [];
  for (const child of Array.from(table.childNodes)) {
    if (isW(child, "tr")) rows.push(child as XmlElement);
  }
  return rows;
}

function getRowCells(row: XmlElement): XmlElement[] {
  const cells: XmlElement[] = [];
  for (const child of Array.from(row.childNodes)) {
    if (isW(child, "tc")) cells.push(child as XmlElement);
  }
  return cells;
}

export interface DgrmData {
  brand?: string;
  model?: string;
  serial?: string;
  capacity?: string;
  cylinderSerial?: string;
  cylinderPesoBruto?: string;
  cylinderTara?: string;
  cylinderCo2?: string;
  cylinderN2?: string;
  packType?: string;
  containerModel?: string;
  painterLength?: string;
  hruReferencia?: string;
  cylinderCabecaDisparoRef?: string;
  dataFabrico?: string;
  certificadoExternoNumero?: string;
  certificadoNumeroOriginal?: string;
  ilha?: string;
  dataInspecao?: string;
  shipName?: string;
  shipNameManual?: string;
  ultimoCertificadoNumero?: string;
  ownerDisplay?: string;
  owner?: string;
  manufacturerLocation?: string;
}

function fmtPeso(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const s = String(v).replace(",", ".");
  const n = parseFloat(s);
  if (!isNaN(n)) return n.toFixed(3);
  return String(v);
}

function formatPeriodicReviewDate(value?: string): string {
  const raw = String(value || "").trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const european = raw.match(/^(\d{2})[/.\-](\d{2})[/.\-](\d{4})/);
  if (european) return `${european[1]}-${european[2]}-${european[3]}`;
  return raw;
}

export async function generateDgrmDocx(
  templateBuffer: Buffer,
  data: DgrmData,
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(templateBuffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("word/document.xml not found in template");
  const docXml = await docFile.async("string");

  const parser = new DOMParser({
    xmlns: { w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main" },
  });
  const doc = parser.parseFromString(docXml, "application/xml");
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  if (!body) throw new Error("w:body not found in template");

  const paras = getBodyParagraphs(body);
  const tables = getBodyTables(body);

  // Build paragraph replacements (python-docx indices = body paragraph indices)
  const cyl = data.cylinderSerial || "";
  const peso = fmtPeso(data.cylinderPesoBruto);
  const tara = fmtPeso(data.cylinderTara);
  const co2 = fmtPeso(data.cylinderCo2);
  const n2 = fmtPeso(data.cylinderN2);

  // O valor é preenchido apenas na linha portuguesa. A linha inglesa é
  // deixada intacta (apenas com o rótulo inscrito no template) para não
  // repetir a mesma informação nas duas línguas.
  const paraReplacements: [number, string][] = [
    [5, `Fabricante: ${data.brand || ""}`],
    [9, `Tipo: ${data.model || ""}  N.º de série: ${data.serial || ""}  Para: ${data.capacity || ""} Pessoas`],
    [12, `Garrafa de gás n.º: ${cyl}  Peso: ${peso}  Tara: ${tara}  CO2: ${co2}  N2: ${n2}`],
    [15, `Embalagem de Sobrevivência Tipo: ${data.packType || ""}`],
    [18, `Contentor/Saco modelo: ${data.containerModel || ""}`],
    [21, `Comprimento do cabo de disparo: ${data.painterLength || ""}`],
    [24, `Libertador hidrostático: ${data.hruReferencia || ""}  Tipo: ${data.cylinderCabecaDisparoRef || ""}`],
    [28, "Local e data de emissão da ficha: _________________________ , _________________________"],
    [31, "O Responsável pela Estação de Serviço:"],
    [33, "________________________________"],
  ];

  for (const [idx, text] of paraReplacements) {
    if (idx < paras.length) setParagraphText(paras[idx], text);
  }

  // ── Table 0 ──
  if (tables.length > 0) {
    const tbl = tables[0];
    const rows = getTableRows(tbl);

    const fab = data.dataFabrico || "";
    const cert = data.certificadoExternoNumero || data.certificadoNumeroOriginal || "";
    const local = data.manufacturerLocation || getManufacturerLocation(data.brand);

    // Row 1: manufacture date, place, cert number
    if (rows.length > 1) {
      const row1 = rows[1];
      const cells = getRowCells(row1);
      if (cells.length > 0) setCellText(cells[0], fab, true);
      if (cells.length > 1) setCellText(cells[1], local, true);
      if (cells.length > 2) setCellText(cells[2], cert, true);
    }

    // Row 3: inspection date, ship name, report number
    if (rows.length > 3) {
      const row3 = rows[3];
      const cells = getRowCells(row3);
      if (cells.length > 0)
        setCellText(cells[0], formatPeriodicReviewDate(data.dataInspecao), true);
      if (cells.length > 1)
        setCellText(cells[1], data.shipName || data.shipNameManual || "", true);
      if (cells.length > 2)
        setCellText(cells[2], data.ultimoCertificadoNumero || "", true);
    }

    // Last row: owner name in all cells
    const lastRow = rows[rows.length - 1];
    const ownerText = data.ownerDisplay || data.owner || "";
    for (const cell of getRowCells(lastRow)) {
      setCellSingleParagraphText(cell, ownerText);
      // set bold on the text inside last row cells
      for (const p of Array.from(cell.childNodes)) {
        if (isW(p, "p")) setParagraphText(p as XmlElement, ownerText, true);
      }
    }
  }

  // Serialize back
  const serializer = new XMLSerializer();
  const xmlStr = serializer.serializeToString(doc);
  zip.file("word/document.xml", xmlStr);

  return zip.generateAsync({ type: "nodebuffer" });
}
