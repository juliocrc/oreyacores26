/**
 * Verifica se a ordem de tabelas em scripts/import-sqlite-to-pg.cjs respeita as
 * foreign keys reais do PostgreSQL, e imprime uma ordem corrigida.
 * Usa a lista do próprio script como fonte de verdade (sem a duplicar aqui).
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const SCRIPT = path.resolve(__dirname, "../scripts/import-sqlite-to-pg.cjs");
const PG_URL = process.env.IMPORT_DATABASE_URL;

const src = fs.readFileSync(SCRIPT, "utf8");
const arrMatch = src.match(/const ordered = \[([\s\S]*?)\];/);
if (!arrMatch) throw new Error("nao encontrei 'const ordered = [...]' no script de import");
const ordered = [...arrMatch[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);

// Colunas que o script já adia (DEFERRED_RELATIONS): não bloqueiam a ordem.
const deferMatch = src.match(/const DEFERRED_RELATIONS = \{([\s\S]*?)\n\};/);
const deferred = new Set();
if (deferMatch) {
  for (const m of deferMatch[1].matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
    for (const col of m[2].matchAll(/"(\w+)"/g)) deferred.add(`${m[1]}.${col[1]}`);
  }
}
console.log(`relacoes ja adiadas: ${[...deferred].join(", ") || "(nenhuma)"}\n`);

const FK_COLS = `
  SELECT
    child.relname AS child,
    parent.relname AS parent,
    (SELECT a.attname FROM pg_attribute a
      WHERE a.attrelid = con.conrelid AND a.attnum = con.conkey[1]) AS column
  FROM pg_constraint con
  JOIN pg_class child ON child.oid = con.conrelid
  JOIN pg_class parent ON parent.oid = con.confrelid
  JOIN pg_namespace n ON n.oid = child.relnamespace
  WHERE con.contype = 'f' AND n.nspname = 'public'
`;

(async () => {
  const c = new Client({ connectionString: PG_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const { rows: fks } = await c.query(FK_COLS);

  const known = new Set(ordered);
  const parents = new Map();
  for (const { child, parent, column } of fks) {
    if (!known.has(child) || !known.has(parent) || child === parent) continue;
    if (deferred.has(`${child}.${column}`)) continue;
    if (!parents.has(child)) parents.set(child, new Set());
    parents.get(child).add(parent);
  }

  //violacoes na ordem atual
  const placed = new Set();
  const violations = [];
  for (const t of ordered) {
    for (const p of parents.get(t) || []) {
      if (!placed.has(p)) violations.push({ table: t, missingParent: p });
    }
    placed.add(t);
  }

  console.log(`tabelas na lista: ${ordered.length}`);
  console.log(`violacoes de FK na ordem atual: ${violations.length}`);
  for (const v of violations) {
    console.log(`   ${v.table} importado ANTES de ${v.missingParent}`);
  }

  //ordem topologica estavel: escolher sempre a primeira tabela da lista original
  //cujos pais ja foram colocados
  const remaining = [...ordered];
  const done = new Set();
  const fixed = [];
  let guard = 0;
  while (remaining.length) {
    const idx = remaining.findIndex((t) => {
      const ps = [...(parents.get(t) || [])];
      return ps.every((p) => done.has(p) || !known.has(p));
    });
    if (idx === -1) {
      const left = remaining.filter((t) => {
        const ps = [...(parents.get(t) || [])];
        return ps.some((p) => !done.has(p) && known.has(p));
      });
      console.log(`\nCiclo/dependencia nao resolvivel entre: ${left.join(", ")}`);
      console.log("Estas tabelas precisam de DEFERRED_RELATIONS no script de import.");
      break;
    }
    const t = remaining.splice(idx, 1)[0];
    done.add(t);
    fixed.push(t);
  }

  console.log(`\ntabelas ordenadas: ${fixed.length}`);
  const lines = [];
  for (let i = 0; i < fixed.length; i += 3) {
    lines.push("      " + fixed.slice(i, i + 3).map((n) => `"${n}",`).join(" "));
  }
  console.log("\n--- lista corrigida ---");
  console.log(lines.join("\n"));

  await c.end();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
