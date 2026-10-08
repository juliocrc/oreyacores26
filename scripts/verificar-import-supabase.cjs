/**
 * Verifica que o Supabase tem os mesmos dados que a base local.
 *
 * Compara contagem por contagem entre o SQLite (fonte) e o PostgreSQL
 * (destino), ja a descontar as exclusoes de demonstracao declaradas em
 * scripts/import-exclusions.json. Sai com codigo 1 se alguma tabela divergir.
 *
 *   IMPORT_DATABASE_URL=postgresql://... node scripts/verificar-import-supabase.cjs
 */

const path = require("path");
const fs = require("fs");
const { Pool } = require("pg");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const REPO = path.resolve(__dirname, "..");
const SQLITE_PATH = path.resolve(
  process.env.SQLITE_IMPORT_PATH || path.join(REPO, "prisma", "local.db")
);
const PG_URL = process.env.IMPORT_DATABASE_URL;
const EXCLUSIONS_FILE = process.env.IMPORT_EXCLUDE_FILE || path.join(__dirname, "import-exclusions.json");

const { PrismaClient } = require(process.env.SQLITE_PRISMA_CLIENT || "@prisma/client");

if (!PG_URL) {
  console.error("IMPORT_DATABASE_URL is required.");
  process.exit(1);
}

const sqlite = new PrismaClient({
  datasources: { db: { url: `file:${SQLITE_PATH}` } },
  log: [],
});
const cleanPgUrl = PG_URL.replace(/[?&]sslmode=[^&]*/g, '');
const pg = new Pool({ connectionString: cleanPgUrl, max: 2, ssl: { rejectUnauthorized: false } });

function loadExclusions() {
  const map = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(EXCLUSIONS_FILE, "utf8"));
    for (const [table, ids] of Object.entries(raw)) {
      if (table.startsWith("_") || !Array.isArray(ids)) continue;
      map.set(table, ids.length);
    }
  } catch (e) {
    /* sem exclusoes */
  }
  return map;
}

const EXCLUSIONS = loadExclusions();

async function main() {
  console.log("=== VERIFICACAO DO IMPORT (SQLite -> Supabase) ===");
  console.log(`Origem : ${SQLITE_PATH}`);
  console.log(`Destino: ${new URL(PG_URL).hostname}\n`);

  const tables = await sqlite.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name`
  );
  const names = tables.map((t) => t.name);

  let divergencias = 0;
  const linhas = [];

  for (const table of names) {
    const src = Number((await sqlite.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM "${table}"`))[0].c);
    const excluidos = EXCLUSIONS.get(table) || 0;
    const esperado = src - excluidos;

    const existe = await pg.query(
      `SELECT to_regclass($1) AS t`,
      [`public."${table}"`]
    );
    if (!existe.rows[0].t) {
      linhas.push({ tabela: table, local: esperado, supabase: "TABELA AUSENTE", ok: false });
      divergencias++;
      continue;
    }

    const dest = Number(
      (await pg.query(`SELECT COUNT(*)::bigint AS c FROM public."${table}"`)).rows[0].c
    );

    const ok = dest === esperado;
    if (!ok) divergencias++;
    linhas.push({
      tabela: table,
      local: esperado,
      supabase: dest,
      ok,
      delta: dest - esperado,
      excluidos: excluidos || undefined,
    });
  }

  console.log("tabela".padEnd(30), "local".padStart(9), "supabase".padStart(10), "delta".padStart(8), "  estado");
  console.log("-".repeat(68));
  for (const l of linhas) {
    if (l.local === 0 && (l.supabase === 0 || l.supabase === "TABELA AUSENTE") && l.ok) continue;
    console.log(
      l.tabela.padEnd(30),
      String(l.local).padStart(9),
      String(l.supabase).padStart(10),
      String(typeof l.supabase === "number" ? (l.delta > 0 ? `+${l.delta}` : l.delta) : "-").padStart(8),
      "  " + (l.ok ? "ok" : "DIVERGE")
    );
  }

  console.log(`\nTabelas verificadas: ${linhas.length}; divergencias: ${divergencias}`);
  if (divergencias > 0) {
    console.error("\nHa divergencias. Corre o import com --apply e volta a verificar.");
    process.exitCode = 1;
  } else {
    console.log("Supabase esta alinhado com a base local (exclusoes de demonstracao a parte).");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sqlite.$disconnect();
    await pg.end();
  });
