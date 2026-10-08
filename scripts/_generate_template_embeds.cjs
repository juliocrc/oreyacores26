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

const entries = [];
const missing = [];
for (const name of FILES) {
  const full = path.join(TEMPLATES_DIR, name);
  if (!fs.existsSync(full)) {
    missing.push(name);
    continue;
  }
  const base64 = fs.readFileSync(full).toString("base64");
  entries.push(`  ${JSON.stringify(name)}: ${JSON.stringify(base64)},`);
}

if (missing.length) {
  console.warn("AVISO: templates em falta (nao embutidos):", missing);
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

fs.writeFileSync(path.join(__dirname, "..", "src", "lib", "template-embeds.generated.ts"), out);
console.log("Escrito template-embeds.generated.ts:", out.length, "bytes |", entries.length, "templates");
