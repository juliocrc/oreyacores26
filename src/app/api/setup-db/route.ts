import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import path from "path";

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
    const prismaBin = path.resolve("./node_modules/.bin/prisma");
    const prismaJs = path.resolve("./node_modules/prisma/build/index.js");
    const { existsSync } = await import("fs");
    const prismaCmd = existsSync(prismaBin) ? prismaBin : `node ${prismaJs}`;

    let generateOutput = "";
    let pushOutput = "";
    let migrateOutput = "";

    try {
      generateOutput = execSync(`${prismaCmd} generate --schema prisma/${schemaFile}`, {
        cwd: path.resolve("."),
        timeout: 60000,
        encoding: "utf-8",
        stdio: "pipe",
      });
    } catch (e: any) {
      generateOutput = e.stderr || e.message || "generate failed";
    }

    try {
      pushOutput = execSync(`${prismaCmd} db push --schema prisma/${schemaFile} --accept-data-loss`, {
        cwd: path.resolve("."),
        timeout: 120000,
        encoding: "utf-8",
        stdio: "pipe",
      });
    } catch (e: any) {
      pushOutput = e.stderr || e.message || "db push failed";
    }

    if (isPostgres) {
      try {
        migrateOutput = execSync(`${prismaCmd} migrate deploy --schema prisma/${schemaFile}`, {
          cwd: path.resolve("."),
          timeout: 120000,
          encoding: "utf-8",
          stdio: "pipe",
        });
      } catch (e: any) {
        migrateOutput = e.stderr || e.message || "migrate deploy failed";
      }
    }

    return NextResponse.json({
      ok: true,
      isPostgres,
      schemaFile,
      generate: generateOutput.slice(-500),
      push: pushOutput.slice(-500),
      migrate: migrateOutput.slice(-500),
    });
  } catch (error: any) {
    console.error("[setup-db] Erro:", error?.message || error);
    return NextResponse.json({ error: error?.message || "Erro interno." }, { status: 500 });
  }
}
