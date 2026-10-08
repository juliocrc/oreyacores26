/**
 * Compara estaticamente prisma/schema.prisma (SQLite, fonte de dados) com
 * prisma/schema.postgresql.prisma (alvo Vercel/Supabase) e reporta divergências
 * de modelos e colunas. Não precisa de ligação à base de dados.
 */
const fs = require("fs");
const path = require("path");

const SQLITE = path.resolve(__dirname, "../prisma/schema.prisma");
const PG = path.resolve(__dirname, "../prisma/schema.postgresql.prisma");

function parseModels(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const models = new Map();
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    const modelStart = line.match(/^model\s+(\w+)\s*\{$/);
    if (modelStart) {
      current = { name: modelStart[1], fields: new Map() };
      models.set(current.name, current);
      continue;
    }
    if (line === "}") {
      current = null;
      continue;
    }
    if (!current) continue;
    if (!line || line.startsWith("//") || line.startsWith("@@") || line.startsWith("@")) continue;

    // "nome Tipo? @attr(...)" -> nome + tipo
    const m = line.match(/^(\w+)\s+([\w\.\[\]<>]+)(\?)?/);
    if (!m) continue;
    const [, fieldName, fieldType, optional] = m;
    if (current.fields.has(fieldName)) continue;
    current.fields.set(fieldName, { type: fieldType, optional: Boolean(optional) });
  }

  return models;
}

const sqlite = parseModels(SQLITE);
const pg = parseModels(PG);

let drift = 0;

const onlySqlite = [...sqlite.keys()].filter((n) => !pg.has(n));
const onlyPg = [...pg.keys()].filter((n) => !sqlite.has(n));

if (onlySqlite.length) {
  console.log(`MODELOS só no schema SQLite (faltam no PostgreSQL): ${onlySqlite.join(", ")}`);
  drift += onlySqlite.length;
}
if (onlyPg.length) {
  console.log(`MODELOS só no schema PostgreSQL (não existem no SQLite): ${onlyPg.join(", ")}`);
}

for (const [name, sModel] of sqlite) {
  const pModel = pg.get(name);
  if (!pModel) continue;

  const missing = [...sModel.fields.keys()].filter((f) => !pModel.fields.has(f));
  const extra = [...pModel.fields.keys()].filter((f) => !sModel.fields.has(f));
  const typeDiff = [...sModel.fields.keys()]
    .filter((f) => pModel.fields.has(f))
    .filter((f) => sModel.fields.get(f).type !== pModel.fields.get(f).type)
    .map((f) => `${f}: sqlite=${sModel.fields.get(f).type} pg=${pModel.fields.get(f).type}`)
    .filter(
      (d) => true,
    );

  if (missing.length || extra.length || typeDiff.length) {
    drift++;
    console.log(`\n[${name}]`);
    if (missing.length) console.log(`   FALTAM no PostgreSQL: ${missing.join(", ")}`);
    if (extra.length) console.log(`   A MAIS no PostgreSQL: ${extra.join(", ")}`);
    if (typeDiff.length) console.log(`   TIPOS diferentes:\n     ${typeDiff.join("\n     ")}`);
  }
}

console.log(`\n=== modelos com deriva: ${drift} (sqlite=${sqlite.size}, pg=${pg.size}) ===`);
