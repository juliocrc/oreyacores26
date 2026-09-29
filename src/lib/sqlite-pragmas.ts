import prisma from "./prisma";

/**
 * Aplica PRAGMAs de fiabilidade/perf quando a BD local é SQLite (file:/).
 * WAL: escritas concorrentes sem bloquear leituras e backups mais consistentes.
 * synchronous=NORMAL: durabilidade adequada em WAL sem penalizar a escrita.
 * foreign_keys=ON: integridade referencial (o SQLite tem-na desligada por omissão).
 */
export async function applySqlitePragmas(): Promise<{ applied: boolean; error?: string }> {
  const url = process.env.SUPABASE_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  if (!url.startsWith("file:")) {
    return { applied: false };
  }

  const applied: string[] = [];
  const errors: string[] = [];

  // `PRAGMA journal_mode = WAL` devolve uma linha com o modo resultante.
  // Como devolve resultados, NÃO pode ser executado com $executeRawUnsafe
  // (erro "Execute returned results, which is not allowed in SQLite").
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ journal_mode?: string }>>("PRAGMA journal_mode = WAL");
    const mode = rows?.[0]?.journal_mode ?? "?";
    applied.push(`journal_mode=${mode}`);
  } catch (error) {
    errors.push(`journal_mode: ${toErrorMessage(error)}`);
  }

  // Estes PRAGMAs não devolvem linhas, logo usam $executeRawUnsafe.
  for (const stmt of ["PRAGMA synchronous = NORMAL", "PRAGMA foreign_keys = ON"]) {
    try {
      await prisma.$executeRawUnsafe(stmt);
      applied.push(stmt.replace("PRAGMA ", ""));
    } catch (error) {
      errors.push(`${stmt}: ${toErrorMessage(error)}`);
    }
  }

  // Nota: `PRAGMA busy_timeout` devolve um inteiro; o Prisma converte-o em BigInt e
  // a serialização falha ("Do not know how to serialize a BigInt"), deixando a ligação
  // inutilizável para queries seguintes. O Prisma também não permite defini-lo na
  // connection string (prisma/prisma#28209), pelo que não é aplicado aqui. O modo WAL
  // já reduz bastante os conflitos de escrita.

  if (errors.length > 0) {
    return { applied: applied.length > 0, error: errors.join(" | ") };
  }
  return { applied: true };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Verifica a integridade física da BD (rápido, best-effort). Só faz sentido em SQLite.
 * Devolve "ok" quando o PRAGMA quick_check passa; "n/a" quando não é SQLite (ex.: Postgres).
 */
export async function quickCheckSqlite(): Promise<{ status: "ok" | "error" | "n/a"; detail?: string }> {
  const url = process.env.SUPABASE_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  if (!url.startsWith("file:")) {
    return { status: "n/a" };
  }
  try {
    const rows = await prisma.$queryRawUnsafe<unknown[]>("PRAGMA quick_check");
    const result = rows && rows.length > 0 ? String((rows[0] as Record<string, unknown>).quick_check ?? "") : "";
    return result === "ok" ? { status: "ok" } : { status: "error", detail: result || "quick_check não devolveu ok" };
  } catch (error) {
    return {
      status: "error",
      detail: error instanceof Error ? error.message : "Erro no quick_check",
    };
  }
}