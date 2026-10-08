const fs = require("fs");
const path = require("path");

const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

// Todos os templates usados em runtime pela app (Vercel tem filesystem read-only).
const FILES = [
  "template certificado orey.xltx",
  "template quadro.xlsx",
  "template certificado coletes.docx",
  "template Ficha de Verif. Múltipla.xlsx",
  "terceiro template.xlsx",
  "FICHA_DGRM_TEMPLATE.docx",
];

const OUT = path.join(__dirname, "..", "src", "lib", "template-embeds.generated.ts");

// Carrega o mapa de embeds já existente (se houver), para preservar os
// templates que não existem no filesystem (ex.: CI sem os binários).
// Assim nunca regravamos o ficheiro com menos embeds do que o commitado.
function loadExistingEmbeds() {
  if (!fs.existsSync(OUT)) return {};
  const src = fs.readFileSync(OUT, "utf8");
  const match = src.match(/export const TEMPLATE_EMBEDS: Record<string, string> = \{([\s\S]*?)\n\};/);
  if (!match) return {};
  const map = {};
  const re = /^\s{2}("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),$/gm;
  let m;
  while ((m = re.exec(match[1])) !== null) {
    try {
      map[JSON.parse(m[1])] = JSON.parse(m[2]);
    } catch {
      // ignorar entrada malformada
    }
  }
  return map;
}

const existing = loadExistingEmbeds();
const entries = [];
const missing = [];
const kept = [];
for (const name of FILES) {
  const full = path.join(TEMPLATES_DIR, name);
  if (fs.existsSync(full)) {
    const base64 = fs.readFileSync(full).toString("base64");
    entries.push(`  ${JSON.stringify(name)}: ${JSON.stringify(base64)},`);
  } else if (Object.prototype.hasOwnProperty.call(existing, name)) {
    entries.push(`  ${JSON.stringify(name)}: ${JSON.stringify(existing[name])},`);
    kept.push(name);
  } else {
    missing.push(name);
  }
}

if (missing.length) {
  console.warn("AVISO: templates SEM embed (em falta no disco e sem embeds prévios):", missing);
}
if (kept.length) {
  console.warn("Reutilizados embeds prévios (ficheiro em falta no filesystem):", kept);
}

if (entries.length === 0) {
  if (fs.existsSync(OUT)) {
    console.warn("Nenhum template encontrável; a manter o template-embeds.generated.ts existente (commitado).");
    return;
  }
  throw new Error("Nenhum template embutido e nem um ficheiro gerado pre-existente para manter.");
}

const out = [
  "// AUTO-GENERADO: scripts/_generate_template_embeds.cjs",
  "// Templates embebidos em base64 para funcionar em producao",
  "// (filesystem read-only na Vercel). Fallback quando o ficheiro nao existe.",
  "export const TEMPLATE_EMBEDS: Record<string, string> = {",
  ...entries,
  "};",
  "",
].join("\n");

fs.writeFileSync(OUT, out);
console.log("Escrito template-embeds.generated.ts:", out.length, "bytes |", entries.length, "templates");
