import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Pool } from "pg";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

    const { secret } = body as { secret?: string };
    if (secret !== "orey-setup-2026") {
      return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
    }

    const dbUrl = process.env.DATABASE_URL || "";
    if (!dbUrl.startsWith("postgresql") && !dbUrl.startsWith("postgres://")) {
      return NextResponse.json({ error: "DATABASE_URL não é PostgreSQL." }, { status: 400 });
    }

    const schemaFile = path.join(process.cwd(), "prisma", "schema.sql");
    if (!fs.existsSync(schemaFile)) {
      return NextResponse.json({ error: "prisma/schema.sql não encontrado." }, { status: 500 });
    }

    const sql = fs.readFileSync(schemaFile, "utf8");

    let psqlOutput = "";
    let generateOutput = "";

    try {
      const pool = new Pool({
        connectionString: dbUrl,
        max: 1,
        ssl: { rejectUnauthorized: false },
        statement_timeout: 120_000,
      });
      await pool.query(sql);
      await pool.end();
      psqlOutput = "schema.sql executado com sucesso";
    } catch (e: unknown) {
      psqlOutput = e instanceof Error ? e.message : String(e);
    }

    generateOutput = "prisma generate executado no build (não necessário em runtime)";

    return NextResponse.json({
      ok: true,
      isPostgres: true,
      schemaFile: "schema.sql",
      psql: psqlOutput.slice(-1000),
      generate: generateOutput.slice(-500),
    });
  } catch (error: unknown) {
    console.error("[setup-db] Erro:", (error as Error)?.message || error);
    return NextResponse.json({ error: (error as Error)?.message || "Erro interno." }, { status: 500 });
  }
}
