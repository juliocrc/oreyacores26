/**
 * Declaração de Isenção de IVA — geração do documento DOCX em duplicado.
 *
 * O layout segue as convenções da ficha DGRM (`templates/FICHA_DGRM_TEMPLATE.docx`):
 * cabeçalho centrado, título, tabela de dados com linhas de rótulo seguidas de
 * linhas de valor, bloco de assinatura e código do documento no rodapé.
 *
 * Duas diferenças deliberadas face ao DGRM:
 *  - A declaração é emitida pela Orey, não pela DGRM, pelo que não leva o
 *    cabeçalho do Ministério. Reutiliza-se o `styles.xml`/tema do template e
 *    substitui-se apenas o `word/document.xml`.
 *  - A página é A4 (o DGRM é A5), por se tratar de um documento fiscal com
 *    assinatura, emitido em duas vias.
 *
 * As duas vias (cliente e duplicado para a fatura) são cópias da mesma
 * declaração e por isso levam **o mesmo número de requisição**. O ATCUD só
 * aparece se tiver sido comunicado um código de validação de série à AT.
 */

import fs from "node:fs/promises";
import path from "node:path";

import JSZip from "jszip";

import { getIsencaoIvaInfo } from "@/lib/iva-isencao-codes";
import { formatarAtcud, type AtcudSeries } from "@/lib/declaracao-isencao-iva";
import { loadTemplateBufferIfExists } from "@/lib/template-loader";

const EMPRESA_NOME = "OREY TÉCNICA SERVIÇOS NAVAIS, LDA.";
const EMPRESA_NIF = "501 117 334";
const EMPRESA_MORADA = [
  "Delegação Açores: Zona Industrial dos Portes Vermelhos, Armazém 19",
  "9560-350 Cabouco",
];

/** A4 em twips, com margens de 2 cm. */
const PAGINA_LARGURA = 11906;
const PAGINA_ALTURA = 16838;
const MARGEM = 1134;
const LARGURA_UTIL = PAGINA_LARGURA - MARGEM * 2;

/** As duas vias da declaração, com o mesmo número de requisição. */
export const VIAS_DECLARACAO = [
  { rotulo: "1.ª VIA — CLIENTE", destino: "Via original entregue ao cliente." },
  { rotulo: "DUPLICADO — FATURA", destino: "Duplicado a anexar à fatura." },
] as const;

const TEMPLATE_CANDIDATES = [
  path.join(process.cwd(), "templates", "FICHA_DGRM_TEMPLATE.docx"),
];

export type DeclaracaoIsencaoIvaDocxInput = {
  /** Número completo da requisição, "0007/2026". */
  numeroCompleto: string;
  ano: number;
  dataEmissao: Date;
  clienteNome?: string | null;
  clienteNif?: string | null;
  navioNome?: string | null;
  navioMatricula?: string | null;
  /** CFR da embarcação, constante do registo de embarcações da UE. */
  navioCfr?: string | null;
  codigoIsencaoIva?: string | null;
  localEmissao?: string | null;
  /** Nome de quem assina, se for conhecido. */
  emitidoPor?: string | null;
  /** Série documental comunicada à AT. Sem código, não há ATCUD. */
  atcud?: AtcudSeries | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Construção de XML
// ─────────────────────────────────────────────────────────────────────────────

function esc(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type RunOpts = {
  bold?: boolean;
  italic?: boolean;
  size?: number;
  color?: string;
};

function run(texto: string, opts: RunOpts = {}): string {
  const rPr =
    `<w:rPr>` +
    (opts.bold ? "<w:b/>" : "") +
    (opts.italic ? "<w:i/>" : "") +
    (opts.color ? `<w:color w:val="${opts.color}"/>` : "") +
    (opts.size ? `<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>` : "") +
    `</w:rPr>`;
  return `<w:r>${rPr}<w:t xml:space="preserve">${esc(texto)}</w:t></w:r>`;
}

type ParaOpts = {
  align?: "left" | "center" | "right" | "both";
  style?: string;
  before?: number;
  after?: number;
};

function para(conteudo: string, opts: ParaOpts = {}): string {
  const pPr =
    `<w:pPr>` +
    (opts.style ? `<w:pStyle w:val="${opts.style}"/>` : "") +
    (opts.before || opts.after
      ? `<w:spacing w:before="${opts.before ?? 0}" w:after="${opts.after ?? 0}"/>`
      : "") +
    (opts.align ? `<w:jc w:val="${opts.align}"/>` : "") +
    `</w:pPr>`;
  return `<w:p>${pPr}${conteudo}</w:p>`;
}

function celula(
  conteudo: string,
  opts: { largura: number; span?: number; sombreado?: string; alinhoVertical?: "center" },
): string {
  const span = opts.span && opts.span > 1 ? `<w:gridSpan w:val="${opts.span}"/>` : "";
  const tcPr =
    `<w:tcPr>` +
    `<w:tcW w:w="${opts.largura}" w:type="dxa"/>` +
    span +
    (opts.sombreado
      ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.sombreado}"/>`
      : "") +
    (opts.alinhoVertical ? `<w:vAlign w:val="${opts.alinhoVertical}"/>` : "") +
    `</w:tcPr>`;
  return `<w:tc>${tcPr}${conteudo}</w:tc>`;
}

function linha(celulas: string[]): string {
  return `<w:tr>${celulas.join("")}</w:tr>`;
}

function tabela(
  grelha: number[],
  linhas: string[],
  opts: { semBordas?: boolean } = {},
): string {
  const lados = ["top", "left", "bottom", "right", "insideH", "insideV"];
  const bordas = opts.semBordas
    ? lados.map((l) => `<w:${l} w:val="none" w:sz="0" w:space="0"/>`).join("")
    : lados.map((l) => `<w:${l} w:val="single" w:sz="4" w:space="0"/>`).join("");
  const largura = grelha.reduce((a, b) => a + b, 0);
  return (
    `<w:tbl>` +
    `<w:tblPr>` +
    `<w:tblW w:w="${largura}" w:type="dxa"/>` +
    `<w:tblLayout w:type="fixed"/>` +
    `<w:tblBorders>${bordas}</w:tblBorders>` +
    `</w:tblPr>` +
    `<w:tblGrid>${grelha.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
    linhas.join("") +
    `</w:tbl>`
  );
}

function quebraPagina(): string {
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
}

function dataLonga(data: Date): string {
  return data.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Montagem do documento
// ─────────────────────────────────────────────────────────────────────────────

const GRELHA_CABECALHO = [5600, 4038];
const GRELHA_DADOS = [2500, 2319, 2500, 2319];
const ROTULO_SOMBREADO = "EFEFEF";

function celulaRotulo(texto: string, largura: number, span?: number): string {
  return celula(para(run(texto, { bold: true, size: 18 }), { style: "TableParagraph" }), {
    largura,
    span,
    sombreado: ROTULO_SOMBREADO,
    alinhoVertical: "center",
  });
}

function celulaValor(texto: string, largura: number, span?: number): string {
  return celula(para(run(texto || "—", { size: 18 }), { style: "TableParagraph" }), {
    largura,
    span,
    alinhoVertical: "center",
  });
}

function blocoCabecalho(
  rotuloVia: string,
  input: DeclaracaoIsencaoIvaDocxInput,
): string {
  const atcud = formatarAtcud(input.atcud);
  const esquerda = [
    para(run(EMPRESA_NOME, { bold: true, size: 18 }), { style: "TableParagraph" }),
    para(run(`NIF: ${EMPRESA_NIF}`, { size: 16 }), { style: "TableParagraph" }),
    para(run(EMPRESA_MORADA[0], { size: 14 }), { style: "TableParagraph" }),
    para(run(EMPRESA_MORADA[1], { size: 14 }), { style: "TableParagraph" }),
  ].join("");

  const direita = [
    para(
      run(`Requisição Nº ${input.numeroCompleto}`, { bold: true, size: 20 }),
      { align: "right", style: "TableParagraph" },
    ),
    // O ATCUD só consta se a série documental tiver sido comunicada à AT.
    atcud ? para(run(atcud, { size: 16 }), { align: "right", style: "TableParagraph" }) : "",
    para(run(rotuloVia, { bold: true, size: 16 }), { align: "right", style: "TableParagraph" }),
  ].join("");

  return tabela(
    GRELHA_CABECALHO,
    [linha([celula(esquerda, { largura: GRELHA_CABECALHO[0] }), celula(direita, { largura: GRELHA_CABECALHO[1] })])],
    { semBordas: true },
  );
}

function blocoDados(input: DeclaracaoIsencaoIvaDocxInput): string {
  const info = getIsencaoIvaInfo(input.codigoIsencaoIva);
  const local = input.localEmissao || "Cabouco";
  const [l1, l2, l3, l4] = GRELHA_DADOS;

  const linhas: string[] = [
    linha([
      celulaRotulo("Emitido por", l1 + l2, 2),
      celulaRotulo("Local e data de emissão", l3 + l4, 2),
    ]),
    linha([
      celulaValor(`${EMPRESA_NOME} (NIF ${EMPRESA_NIF})`, l1 + l2, 2),
      celulaValor(`${local}, ${dataLonga(input.dataEmissao)}`, l3 + l4, 2),
    ]),
    linha([
      celulaRotulo("Cliente", l1 + l2, 2),
      celulaRotulo("NIF do cliente", l3 + l4, 2),
    ]),
    linha([
      celulaValor(input.clienteNome || "", l1 + l2, 2),
      celulaValor(input.clienteNif || "", l3 + l4, 2),
    ]),
    linha([
      celulaRotulo("Embarcação", l1 + l2, 2),
      celulaRotulo("Matrícula", l3 + l4, 2),
    ]),
    linha([
      celulaValor(input.navioNome || "", l1 + l2, 2),
      celulaValor(input.navioMatricula || "", l3 + l4, 2),
    ]),
  ];

  if (input.navioCfr) {
    linhas.push(
      linha([celulaRotulo("CFR (registo de embarcações da União Europeia)", l1 + l2 + l3 + l4, 4)]),
      linha([celulaValor(input.navioCfr, l1 + l2 + l3 + l4, 4)]),
    );
  }

  const motivo = info
    ? `${info.code} — ${info.mencao} (${info.norma})`
    : input.codigoIsencaoIva || "";

  linhas.push(
    linha([celulaRotulo("Motivo de isenção de IVA", l1 + l2 + l3 + l4, 4)]),
    linha([celulaValor(motivo, l1 + l2 + l3 + l4, 4)]),
    linha([celulaRotulo("Número da requisição", l1 + l2, 2), celulaValor(input.numeroCompleto, l3 + l4, 2)]),
  );

  return tabela(GRELHA_DADOS, linhas);
}

function textoDeclaracao(input: DeclaracaoIsencaoIvaDocxInput): string {
  const info = getIsencaoIvaInfo(input.codigoIsencaoIva);
  const fundamento = info ? info.norma : "o motivo de isenção indicado";
  return (
    `Declara-se, para os efeitos do artigo 7.º do Decreto-Lei n.º 28/2019, de 15 de fevereiro, ` +
    `que a operação identificada nesta declaração está isenta de IVA nos termos de ${fundamento}.\n\n` +
    `Esta declaração é emitida em duplicado, com o mesmo número de requisição: uma via é entregue ` +
    `ao cliente e o duplicado é anexado à fatura correspondente.`
  );
}

function blocoAssinatura(input: DeclaracaoIsencaoIvaDocxInput): string {
  const nome = input.emitidoPor ? input.emitidoPor : "";
  return [
    para(run("Local e data", { bold: true, size: 18 }), { style: "TableParagraph", before: 240 }),
    para(run(`${input.localEmissao || "Cabouco"}, ${dataLonga(input.dataEmissao)}`, { size: 18 }), {
      style: "TableParagraph",
    }),
    para("", { after: 240 }),
    para(run("O Responsável", { bold: true, size: 18 }), { style: "TableParagraph" }),
    para(run(nome, { size: 18 }), { style: "TableParagraph" }),
    para("", { after: 120 }),
    para(run("…………………………………………………………………………", { size: 18 }), {
      style: "TableParagraph",
      align: "center",
    }),
  ].join("");
}

function montarUmaVia(
  rotuloVia: string,
  destino: string,
  input: DeclaracaoIsencaoIvaDocxInput,
): string {
  return [
    blocoCabecalho(rotuloVia, input),
    para("", { after: 120 }),
    para(run("DECLARAÇÃO DE ISENÇÃO DE IVA", { bold: true, size: 28 }), {
      style: "Heading1",
      align: "center",
    }),
    para(run(destino, { italic: true, size: 16 }), { align: "center" }),
    para("", { after: 160 }),
    blocoDados(input),
    para("", { after: 160 }),
    para(run(textoDeclaracao(input), { size: 18 }), { align: "both", after: 120 }),
    blocoAssinatura(input),
    para(run(`Documento ${input.numeroCompleto} · ${EMPRESA_NOME} · NIF ${EMPRESA_NIF}`, { size: 12 }), {
      align: "center",
      before: 240,
    }),
  ].join("");
}

function montarDocumento(input: DeclaracaoIsencaoIvaDocxInput): string {
  const corpo = VIAS_DECLARACAO.map((via, indice) => {
    const viaXml = montarUmaVia(via.rotulo, via.destino, input);
    return indice === 0 ? viaXml : quebraPagina() + viaXml;
  }).join("");

  const sectPr =
    `<w:sectPr>` +
    `<w:pgSz w:w="${PAGINA_LARGURA}" w:h="${PAGINA_ALTURA}" w:orient="portrait"/>` +
    `<w:pgMar w:top="${MARGEM}" w:bottom="${MARGEM}" w:left="${MARGEM}" w:right="${MARGEM}" ` +
    `w:header="708" w:footer="708" w:gutter="0"/>` +
    `</w:sectPr>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${corpo}${sectPr}</w:body>` +
    `</w:document>`
  );
}

async function carregarTemplate(): Promise<Buffer> {
  const erros: string[] = [];
  for (const candidato of TEMPLATE_CANDIDATES) {
    try {
      return await fs.readFile(candidato);
    } catch (erro) {
      erros.push(`${candidato}: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }
  const embutido = await loadTemplateBufferIfExists(path.basename(TEMPLATE_CANDIDATES[0]));
  if (embutido) return embutido;
  throw new Error(
    `Não foi encontrado o template DOCX base para a declaração de IVA.\n${erros.join("\n")}`,
  );
}

/**
 * Gera o DOCX da declaração em duplicado, herdando o `styles.xml`, o tema e as
 * fontes do template DGRM e substituindo o conteúdo do documento.
 */
export async function gerarDeclaracaoIsencaoIvaDocx(
  input: DeclaracaoIsencaoIvaDocxInput,
): Promise<Buffer> {
  const template = await carregarTemplate();
  const zip = await JSZip.loadAsync(template);
  zip.file("word/document.xml", montarDocumento(input));
  return zip.generateAsync({ type: "nodebuffer" });
}

/** Nome de ficheiro sugerido para a declaração. */
export function nomeFicheiroDeclaracao(numeroCompleto: string): string {
  return `Declaracao_Isencao_IVA_${numeroCompleto.replace(/\//g, "-")}.docx`;
}
