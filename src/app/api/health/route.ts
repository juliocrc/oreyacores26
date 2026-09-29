import { NextResponse } from "next/server";
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import prisma from "@/lib/prisma";
import { quickCheckSqlite } from "@/lib/sqlite-pragmas";

export const dynamic = "force-dynamic";

type HealthStatus = "ok" | "warn" | "down";

const BACKUPS_DIR = join(process.cwd(), "backups");
const BACKUP_MAX_AGE_HOURS = 32; // tolera ligeiro atraso sobre o agendamento de 24h
const DB_CHECK_TIMEOUT_MS = 2500; // evita que o watchdog (timeout curto) mate o servidor
const QUICK_CHECK_TIMEOUT_MS = 2500;

function latestAutoBackupAgeHours(): { ageHours: number; file: string | null } {
  try {
    if (!existsSync(BACKUPS_DIR)) return { ageHours: Infinity, file: null };
    const files = readdirSync(BACKUPS_DIR)
      .filter((f) => f.endsWith(".db") && f.startsWith("auto_local_"))
      .map((f) => ({ f, t: statSync(join(BACKUPS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    if (files.length === 0) return { ageHours: Infinity, file: null };
    const latest = files[0];
    return { ageHours: (Date.now() - latest.t) / 3_600_000, file: latest.f };
  } catch {
    return { ageHours: Infinity, file: null };
  }
}

function runWithTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

export async function GET() {
  const startedAt = Date.now();

  let databaseStatus: HealthStatus = "ok";
  let databaseLatencyMs: number | null = null;
  let databaseError: string | null = null;

  let dbCheckResult: { latencyMs: number | null };
  try {
    dbCheckResult = await runWithTimeout(
      (async (): Promise<{ latencyMs: number | null }> => {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        return { latencyMs: Date.now() - dbStart };
      })(),
      DB_CHECK_TIMEOUT_MS,
      { latencyMs: null }
    );
  } catch (error) {
    databaseStatus = "down";
    databaseError = error instanceof Error ? error.message : "Database check failed";
    dbCheckResult = { latencyMs: null };
  }
  databaseLatencyMs = dbCheckResult.latencyMs;
  if (dbCheckResult.latencyMs === null) {
    databaseStatus = databaseStatus === "down" ? "down" : "warn";
    databaseError = databaseError ?? "DB check timed out";
  }

  const integrity = await runWithTimeout(quickCheckSqlite(), QUICK_CHECK_TIMEOUT_MS, {
    status: "ok",
    detail: "quick_check timed out",
  } as Awaited<ReturnType<typeof quickCheckSqlite>>);

  const { ageHours, file: backupFile } = latestAutoBackupAgeHours();
  const backupStatus: HealthStatus = Number.isFinite(ageHours) && ageHours <= BACKUP_MAX_AGE_HOURS ? "ok" : "warn";

  const sentryEnabled = (process.env.SENTRY_ENABLED ?? "true").trim() !== "false";
  const sentryConfigured = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN);

  const overallStatus: HealthStatus = databaseStatus === "down"
    ? "down"
    : integrity.status === "error"
      ? "warn"
      : backupStatus === "ok" && (!sentryEnabled || sentryConfigured)
        ? "ok"
        : "warn";

  const responseBody = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    latencyMs: Date.now() - startedAt,
    checks: {
      database: {
        status: databaseStatus,
        latencyMs: databaseLatencyMs,
        error: databaseError,
      },
      integrity: {
        status: integrity.status,
        detail: integrity.detail ?? null,
      },
      backup: {
        status: backupStatus,
        latestFile: backupFile,
        ageHours: Number.isFinite(ageHours) ? Number(Math.round(ageHours * 10) / 10) : null,
        maxAgeHours: BACKUP_MAX_AGE_HOURS,
      },
      sentry: {
        status: !sentryEnabled ? "ok" : sentryConfigured ? "ok" : "warn",
        enabled: sentryEnabled,
        configured: sentryConfigured,
      },
    },
  };

  const statusCode = overallStatus === "down" ? 503 : 200;
  return NextResponse.json(responseBody, { status: statusCode });
}