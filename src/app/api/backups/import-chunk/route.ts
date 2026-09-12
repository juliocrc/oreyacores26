import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireAdminOrBypass } from "@/app/api/backups/_lib";

export const runtime = "nodejs";

const isPostgres =
  (process.env.DATABASE_URL || "").startsWith("postgresql://") ||
  (process.env.DATABASE_URL || "").startsWith("postgres://");

export async function POST(request: Request) {
  const auth = await requireAdminOrBypass();
  if (!auth.ok) {
    return NextResponse.json({ error: "Não autorizado" }, { status: auth.status });
  }

  try {
    const fileName = request.headers.get("x-file-name") || "local.db";
    const chunkIndex = Number(request.headers.get("x-chunk-index") || "0");
    const totalChunks = Number(request.headers.get("x-total-chunks") || "1");

    const arrayBuf = await request.arrayBuffer();
    const chunkBuffer = Buffer.from(arrayBuf);

    const tempDir = path.join(process.cwd(), "prisma");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const tempFilePath = path.join(tempDir, "upload_temp.db");

    if (chunkIndex === 0) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    }

    fs.appendFileSync(tempFilePath, chunkBuffer);

    if (chunkIndex === totalChunks - 1) {
      const fullBuffer = fs.readFileSync(tempFilePath);
      const header = fullBuffer.slice(0, 16).toString("utf8");
      if (!header.startsWith("SQLite format 3")) {
        try { fs.unlinkSync(tempFilePath); } catch {}
        return NextResponse.json({ error: "Ficheiro inválido. Envie uma base de dados SQLite (.db)." }, { status: 400 });
      }

      const dbPath = path.join(tempDir, "local.db");
      fs.copyFileSync(tempFilePath, dbPath);
      try { fs.unlinkSync(tempFilePath); } catch {}

      if (isPostgres) {
        const { importSqliteToPostgres } = await import("@/lib/import-sqlite-to-postgres");
        const result = await importSqliteToPostgres({
          sqlitePath: dbPath,
          pgUrl: process.env.DATABASE_URL!,
        });

        if (!result.ok) {
          return NextResponse.json(
            { error: `Falha na importação para PostgreSQL: ${result.error}` },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          complete: true,
          message: "Base de dados importada para PostgreSQL com sucesso!",
        });
      }

      return NextResponse.json({
        success: true,
        complete: true,
        message: "Base de dados importada com sucesso!",
      });
    }

    return NextResponse.json({
      success: true,
      complete: false,
      message: `Parte ${chunkIndex + 1} de ${totalChunks} recebida com sucesso.`,
    });
  } catch (err) {
    console.error("[import-chunk]", err);
    return NextResponse.json(
      { error: (err as Error).message || "Erro ao processar parte do ficheiro." },
      { status: 500 }
    );
  }
}
