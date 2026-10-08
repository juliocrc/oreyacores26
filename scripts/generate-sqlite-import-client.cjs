/**
 * Gera o cliente Prisma de SQLite usado pelo import (scripts/import-sqlite-to-pg.cjs).
 *
 * O cliente gerado por omissao e o de PostgreSQL, porque e o que a Vercel usa, e
 * regenera-lo a app local em execucao bloqueia (EPERM na DLL do engine). Por
 * isso gera-se um cliente SQLite separado, com o seu proprio output, e o script
 * de import aponta para ele com SQLITE_PRISMA_CLIENT.
 *
 * O schema e derivado de prisma/schema.prisma de cada vez, para nao duplicar o
 * schema e diverge-lo. Usage: node scripts/generate-sqlite-import-client.cjs
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "prisma", "schema.prisma");
const TARGET = path.join(ROOT, "prisma", "schema.import-sqlite.prisma");
const OUTPUT = "../node_modules/.prisma/sqlite-client";

const source = fs.readFileSync(SOURCE, "utf8");
const generatorPattern = /(generator\s+client\s*\{)([\s\S]*?)(\})/;

if (!generatorPattern.test(source)) {
  console.error(`Nao encontrei o bloco 'generator client' em ${SOURCE}`);
  process.exit(1);
}

const patched = source.replace(
  generatorPattern,
  `$1\n  provider = "prisma-client-js"\n  output   = "${OUTPUT}"\n$3`
);

fs.writeFileSync(TARGET, patched, "utf8");
console.log(`Escrito ${path.relative(ROOT, TARGET)}`);

const prismaCli = path.join(ROOT, "node_modules", "prisma", "build", "index.js");
if (!fs.existsSync(prismaCli)) {
  console.error("CLI do Prisma nao encontrada em node_modules (instala dependencias primeiro).");
  process.exit(1);
}

execFileSync(
  process.execPath,
  [prismaCli, "generate", `--schema=${path.relative(ROOT, TARGET)}`],
  { cwd: ROOT, stdio: "inherit" }
);

const absOutput = path.resolve(ROOT, "prisma", OUTPUT);
if (!fs.existsSync(path.join(absOutput, "index.js"))) {
  console.error(`Cliente nao encontrado em ${absOutput}`);
  process.exit(1);
}
console.log(`\nDefine a variavel antes de importar:\n  $env:SQLITE_PRISMA_CLIENT = "${absOutput}"`);
