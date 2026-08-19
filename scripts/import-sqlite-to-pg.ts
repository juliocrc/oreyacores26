/**
 * Import data from local SQLite to Render PostgreSQL.
 *
 * Usage:
 *   IMPORT_DATABASE_URL="postgresql://user:pass@host:5432/dbname" npx tsx scripts/import-sqlite-to-pg.ts
 *
 * Reads from prisma/local.db via Prisma (SQLite schema).
 * Writes to PostgreSQL via the `pg` module directly.
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import path from "path";

const SQLITE_PATH = path.resolve(__dirname, "../prisma/local.db");
const PG_URL = process.env.IMPORT_DATABASE_URL;

if (!PG_URL) {
  console.error("IMPORT_DATABASE_URL is required.");
  process.exit(1);
}

const sqlite = new PrismaClient({
  datasources: { db: { url: `file:${SQLITE_PATH}` } },
  log: [],
});

const pgPool = new Pool({ connectionString: PG_URL, max: 5 });

/* ---------- helpers ---------- */

async function getSqliteColumns(table: string): Promise<string[]> {
  const rows: { name: string }[] = await sqlite.$queryRawUnsafe(
    `PRAGMA table_info("${table}")`
  );
  return rows.map((r) => r.name);
}

async function getPgColumns(table: string): Promise<string[]> {
  const { rows } = await pgPool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
    [table]
  );
  return rows.map((r: { column_name: string }) => r.column_name);
}

async function getRowCount(table: string): Promise<number> {
  const rows = await sqlite.$queryRawUnsafe<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt FROM "${table}"`
  );
  return Number(rows[0].cnt);
}

async function importTable(label: string, table: string) {
  const sqliteCols = await getSqliteColumns(table);
  const pgCols = await getPgColumns(table);

  if (pgCols.length === 0) {
    console.log(`  ${label}: SKIP (no PG table)`);
    return;
  }

  const common = pgCols.filter((c) => sqliteCols.includes(c));
  if (common.length === 0) {
    console.log(`  ${label}: SKIP (no common columns)`);
    return;
  }

  const count = await getRowCount(table);
  console.log(`  ${label}: ${count} rows, ${common.length} common cols`);
  if (count === 0) return;

  const rows: Record<string, unknown>[] = await sqlite.$queryRawUnsafe(
    `SELECT * FROM "${table}"`
  );

  const BATCH = 200;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);

    for (const row of batch) {
      const vals = common.map((col) => {
        const v = row[col];
        if (typeof v === "object" && v !== null && !(v instanceof Date)) {
          return JSON.stringify(v);
        }
        return v ?? null;
      });

      try {
        const cols = common.join(", ");
        const ph = common.map((_, j) => `$${j + 1}`).join(", ");
        await pgPool.query(
          `INSERT INTO "${table}" (${cols}) VALUES (${ph}) ON CONFLICT DO NOTHING`,
          vals
        );
        inserted++;
      } catch (err: unknown) {
        const m = err instanceof Error ? err.message : String(err);
        if (
          !m.includes("unique") &&
          !m.includes("duplicate") &&
          !m.includes("foreign key") &&
          !m.includes("violates")
        ) {
          console.error(`    ${label} row error: ${m.slice(0, 150)}`);
        }
        errors++;
      }
    }
  }

  if (errors > 0) {
    console.log(`    (${inserted} ok, ${errors} errors)`);
  }
}

async function resetSequences() {
  console.log("\n  Resetting sequences...");
  const { rows: tables } = await pgPool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  );
  for (const { tablename } of tables as { tablename: string }[]) {
    try {
      await pgPool.query(
        `SELECT setval(pg_get_serial_sequence('"${tablename}"', 'id'), COALESCE((SELECT MAX(id) FROM "${tablename}"), 1))`
      );
    } catch {
      // no serial id
    }
  }
}

async function main() {
  console.log("=== SQLite -> PostgreSQL Import ===");
  console.log(`SQLite: ${SQLITE_PATH}`);
  console.log(
    `PostgreSQL: ${PG_URL!.replace(/\/\/[^:]+:[^@]+@/, "//***:***@")}\n`
  );

  const tables = await sqlite.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name`
  );
  const tableNames = tables.map((t) => t.name);
  console.log(`SQLite tables (${tableNames.length}): ${tableNames.join(", ")}\n`);

  const ordered = [
    "ServiceStation",
    "Cliente",
    "User",
    "Navio",
    "Jangada",
    "Artigo",
    "Stock",
    "Colete",
    "FatoImersao",
    "Tecnico",
    "ContactoInterno",
    "CatalogMarcaModelo",
    "CustomPackType",
    "ArtigoJangada",
    "VerificacaoColete",
    "CertificadoColete",
    "VerificacaoFatoImersao",
    "CertificadoFatoImersao",
    "FatoImersaoComponentHistory",
    "TecnicoAusencia",
    "CertificacaoFabricanteTecnico",
    "Equipamento",
    "CalibracaoEquipamento",
    "MovimentoEquipamento",
    "Inspecao",
    "OrdemServico",
    "OrdemServicoJangada",
    "OrdemServicoChecklistItem",
    "OrdemServicoTempo",
    "OrdemServicoLog",
    "CertificadoExtraido",
    "CertificadoValidade",
    "Agenda",
    "AgendaEvento",
    "MovimentacaoStock",
    "Recall",
    "Custo",
    "Epirb",
    "Post",
    "Auditoria",
    "Fatura",
    "FaturaOrdemServico",
    "NotaCredito",
    "Recibo",
    "CustomPackTypeItem",
    "ServiceStationQueue",
    "ColeteComponentHistory",
    "Extintor",
    "PedidoAssistencia",
    "PedidoReposicao",
    "PedidoReposicaoLinha",
    "OrdemCompra",
    "OrdemCompraLinha",
    "Fornecedor",
    "Comunicacao",
  ];

  for (const table of ordered) {
    if (tableNames.includes(table)) {
      await importTable(table, table);
    }
  }

  const remaining = tableNames.filter((t) => !ordered.includes(t));
  for (const table of remaining) {
    await importTable(table, table);
  }

  await resetSequences();

  console.log("\n=== Done ===");
}

main()
  .catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  })
  .finally(async () => {
    await sqlite.$disconnect();
    await pgPool.end();
  });
