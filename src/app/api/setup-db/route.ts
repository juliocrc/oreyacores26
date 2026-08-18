import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

    const { secret } = body as { secret?: string };
    if (secret !== "orey-setup-2026") {
      return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
    }

    const isPostgres = (process.env.DATABASE_URL || "").startsWith("postgresql");
    const schemaFile = isPostgres ? "schema.postgresql.prisma" : "schema.prisma";
    let psqlOutput = "";
    let generateOutput = "";

    if (isPostgres) {
      try {
        psqlOutput = execSync(`psql "$DATABASE_URL" -f prisma/schema.sql 2>&1`, {
          cwd: process.cwd(),
          timeout: 120000,
          encoding: "utf-8",
          stdio: "pipe",
        });
      } catch (e: any) {
        psqlOutput = e.stdout || e.stderr || e.message || "psql failed";
      }
    }

    try {
      generateOutput = execSync(`npx prisma generate --schema prisma/${schemaFile}`, {
        cwd: process.cwd(),
        timeout: 60000,
        encoding: "utf-8",
        stdio: "pipe",
      });
    } catch (e: any) {
      generateOutput = e.stderr || e.message || "generate failed";
    }

    return NextResponse.json({
      ok: true,
      isPostgres,
      schemaFile,
      psql: psqlOutput.slice(-1000),
      generate: generateOutput.slice(-500),
    });
  } catch (error: any) {
    console.error("[setup-db] Erro:", error?.message || error);
    return NextResponse.json({ error: error?.message || "Erro interno." }, { status: 500 });
  }
}
