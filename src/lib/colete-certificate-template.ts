import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { Document, Element, Node } from "@xmldom/xmldom";
import { formatValidityDisplay } from "@/lib/date-display";
import { loadTemplateBuffer } from "@/lib/template-loader";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const ROWS_PER_PAGE = 14;

export type ColeteCertificateRow = {
  marca: string;
  modelo: string;
  serial: string;
  dataFabrico: string;
  status: string;
};

export type NavioColetesCertificateInput = {
  shipName: string;
  shipOwner: string;
  imoNumber: string;
  flag: string;
  portOfCall: string;
  classLabel?: string;
  serviceStation: string;
  inspectionPlaceAndDate: string;
  nextInspectionDate: string;
  rows: ColeteCertificateRow[];
};

function getLocalName(node: Node | null) {
  if (!node) return "";
  if (typeof node.localName === "string" && node.localName) return node.localName;
  const nodeName = String(node.nodeName || "");
  return nodeName.includes(":") ? nodeName.split(":").pop() || "" : nodeName;
}

function getChildElements(parent: Element, name?: string) {
  const result: Element[] = [];
  if (!parent?.childNodes) return result;

  for (let i = 0; i < parent.childNodes.length; i += 1) {
    const child = parent.childNodes[i];
    if (child?.nodeType !== 1) continue;
    if (!name || getLocalName(child) === name) result.push(child as Element);
  }

  return result;
}

function findDescendants(root: Node, name: string, acc: Element[] = []) {
  if (!root?.childNodes) return acc;

  for (let i = 0; i < root.childNodes.length; i += 1) {
    const child = root.childNodes[i];
    if (child?.nodeType !== 1) continue;
    if (getLocalName(child) === name) acc.push(child as Element);
    findDescendants(child, name, acc);
  }

  return acc;
}

function createWordElement(doc: Document, tagName: string) {
  return doc.createElementNS(WORD_NS, `w:${tagName}`);
}

function removeElementChildren(parent: Element, localName: string) {
  const children = getChildElements(parent, localName);
  children.forEach((child) => parent.removeChild(child));
}

function setCellText(cell: Element, value: string) {
  const doc = cell.ownerDocument;
  if (!doc) return;
  const paragraphs = getChildElements(cell, "p");
  const templateParagraph = paragraphs[0] || null;
  const paragraphProperties = templateParagraph ? getChildElements(templateParagraph, "pPr")[0]?.cloneNode(true) : null;
  const templateRun = templateParagraph ? findDescendants(templateParagraph, "r")[0] : null;
  const runProperties = templateRun ? getChildElements(templateRun, "rPr")[0]?.cloneNode(true) : null;

  removeElementChildren(cell, "p");

  const paragraph = createWordElement(doc, "p");
  if (paragraphProperties) paragraph.appendChild(paragraphProperties);

  const run = createWordElement(doc, "r");
  if (runProperties) run.appendChild(runProperties);

  if (value) {
    const text = createWordElement(doc, "t");
    if (/^\s|\s$/.test(value)) {
      text.setAttribute("xml:space", "preserve");
    }
    text.appendChild(doc.createTextNode(value));
    run.appendChild(text);
  }

  paragraph.appendChild(run);
  cell.appendChild(paragraph);
}

function createPageBreakParagraph(doc: Document) {
  const paragraph = createWordElement(doc, "p");
  const run = createWordElement(doc, "r");
  const breakElement = createWordElement(doc, "br");
  breakElement.setAttributeNS(WORD_NS, "w:type", "page");
  run.appendChild(breakElement);
  paragraph.appendChild(run);
  return paragraph;
}

function chunkRows(rows: ColeteCertificateRow[], size: number) {
  const chunks: ColeteCertificateRow[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks.length > 0 ? chunks : [[]];
}

function getTopLevelTables(nodes: Element[]) {
  return nodes.filter((node) => node?.nodeType === 1 && getLocalName(node) === "tbl");
}

function fillHeaderTable(table: Element, input: NavioColetesCertificateInput) {
  const rows = getChildElements(table, "tr");
  const row0 = getChildElements(rows[0], "tc");
  const row1 = getChildElements(rows[1], "tc");
  const row2 = getChildElements(rows[2], "tc");

  setCellText(row0[1], input.shipName || "");
  setCellText(row0[3], input.classLabel || "");
  setCellText(row1[1], input.shipOwner || "");
  setCellText(row1[3], input.imoNumber || "");
  setCellText(row2[1], input.flag || "");
  setCellText(row2[3], input.portOfCall || "");
}

function fillRowsTable(table: Element, rowsForPage: ColeteCertificateRow[]) {
  const rows = getChildElements(table, "tr");
  const dataRows = rows.slice(1);

  dataRows.forEach((row, index) => {
    const cells = getChildElements(row, "tc");
    const current = rowsForPage[index] || null;
    setCellText(cells[0], current ? String(index + 1) : "");
    setCellText(cells[1], current?.marca || "");
    setCellText(cells[2], current?.modelo || "");
    setCellText(cells[3], current?.serial || "");
    setCellText(cells[4], formatValidityDisplay(current?.dataFabrico) === "—" ? "" : formatValidityDisplay(current?.dataFabrico));
    setCellText(cells[5], current?.status || "");
  });
}

function fillFooterTable(table: Element, input: NavioColetesCertificateInput) {
  const rows = getChildElements(table, "tr");
  const valueCells = getChildElements(rows[1], "tc");
  setCellText(valueCells[0], input.serviceStation || "");
  setCellText(valueCells[1], input.inspectionPlaceAndDate || "");
  setCellText(valueCells[2], input.nextInspectionDate || "");
}

function fillPageContent(pageNodes: Element[], input: NavioColetesCertificateInput, rowsForPage: ColeteCertificateRow[]) {
  const tables = getTopLevelTables(pageNodes);
  if (tables.length < 3) {
    throw new Error("Estrutura inesperada do template de certificado de coletes.");
  }

  fillHeaderTable(tables[0], input);
  fillRowsTable(tables[1], rowsForPage);
  fillFooterTable(tables[2], input);
}

export async function generateNavioColetesCertificateDocx(input: NavioColetesCertificateInput) {
  const templateBuffer = await loadTemplateBuffer("template certificado coletes.docx");
  const zip = await JSZip.loadAsync(templateBuffer);
  const documentXmlFile = zip.file("word/document.xml");

  if (!documentXmlFile) {
    throw new Error("Template DOCX inválido: ficheiro word/document.xml não encontrado.");
  }

  const xml = await documentXmlFile.async("string");
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const body = findDescendants(doc, "body")[0];
  const sectionProps = getChildElements(body, "sectPr")[0] || null;

  if (!body || !sectionProps) {
    throw new Error("Template DOCX inválido: estrutura principal não reconhecida.");
  }

  const baseNodes = getChildElements(body).filter((node) => getLocalName(node) !== "sectPr");
  baseNodes.forEach((node) => body.removeChild(node));

  const pages = chunkRows(input.rows, ROWS_PER_PAGE);

  pages.forEach((pageRows, pageIndex) => {
    const clonedNodes = baseNodes.map((node) => node.cloneNode(true) as Element);
    clonedNodes.forEach((node) => body.insertBefore(node, sectionProps));
    fillPageContent(clonedNodes, input, pageRows);

    if (pageIndex < pages.length - 1) {
      body.insertBefore(createPageBreakParagraph(doc), sectionProps);
    }
  });

  const serializer = new XMLSerializer();
  zip.file("word/document.xml", serializer.serializeToString(doc));
  return zip.generateAsync({ type: "nodebuffer" });
}
