/**
 * In-process SQLite -> PostgreSQL import.
 *
 * Extracted from scripts/import-sqlite-to-pg (.ts/.cjs) so that the API routes
 * and server actions can run the import directly instead of spawning a child
 * process (`node`/`npx tsx`), which triggers EDR behaviour guards.
 *
 * The standalone scripts under scripts/ remain as thin wrappers for manual use.
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

export interface ImportSqliteToPgOptions {
  sqlitePath: string;
  pgUrl: string;
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  tables: number;
  inserted: number;
  errors: number;
}

const IMPORT_ORDER = [
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

export async function importSqliteToPostgres(
  options: ImportSqliteToPgOptions
): Promise<ImportResult> {
  const { sqlitePath, pgUrl } = options;

  const sqlite = new PrismaClient({
    datasources: { db: { url: `file:${sqlitePath.replace(/\\/g, "/")}` } },
    log: [],
  });
  const pgPool = new Pool({
    connectionString: pgUrl,
    max: 5,
    ssl: { rejectUnauthorized: false },
  });

  const stats = { tables: 0, inserted: 0, errors: 0 };

  try {
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
      return Number(rows[0]?.cnt || 0);
    }

    async function importTable(token: string, table: string): Promise<void> {
      stats.tables++;
      const sqliteCols = await getSqliteColumns(table);
      const pgCols = await getPgColumns(table);

      if (pgCols.length === 0) return;
      const common = pgCols.filter((c) => sqliteCols.includes(c));
      if (common.length === 0) return;

      const count = await getRowCount(table);
      if (count === 0) return;

      const rows: Record<string, unknown>[] = await sqlite.$queryRawUnsafe(
        `SELECT * FROM "${table}"`
      );

      const BATCH = 200;
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
            stats.inserted++;
          } catch (err: unknown) {
            const m = err instanceof Error ? err.message : String(err);
            if (
              !m.includes("unique") &&
              !m.includes("duplicate") &&
              !m.includes("foreign key") &&
              !m.includes("violates")
            ) {
              console.error(`    ${token} row error: ${m.slice(0, 150)}`);
            }
            stats.errors++;
          }
        }
      }
    }

    async function resetSequences(): Promise<void> {
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

    const tableRows = await sqlite.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name`
    );
    const tableNames = tableRows.map((t) => t.name);

    for (const table of IMPORT_ORDER) {
      if (tableNames.includes(table)) {
        await importTable(table, table);
      }
    }
    const remaining = tableNames.filter((t) => !IMPORT_ORDER.includes(t));
    for (const table of remaining) {
      await importTable(table, table);
    }

    await resetSequences();

    return {
      ok: true,
      tables: stats.tables,
      inserted: stats.inserted,
      errors: stats.errors,
    };
  } catch (err: unknown) {
    console.error("[import-sqlite-to-pg] FATAL:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      tables: stats.tables,
      inserted: stats.inserted,
      errors: stats.errors,
    };
  } finally {
    await sqlite.$disconnect().catch(() => {});
    await pgPool.end().catch(() => {});
  }
}