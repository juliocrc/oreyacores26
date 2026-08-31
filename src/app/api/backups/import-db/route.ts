import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireAdminOrBypass } from "@/app/api/backups/_lib";

const isPostgres =
  (process.env.DATABASE_URL || "").startsWith("postgresql://") ||
  (process.env.DATABASE_URL || "").startsWith("postgres://");

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAdminOrBypass();
  if (!auth.ok)
    return NextResponse.json({ error: "Não autorizado" }, { status: auth.status });

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content-Type inválido. Envie o ficheiro como multipart/form-data." },
        { status: 400 }
      );
    }

    let file: File | null = null;
    try {
      const formData = await request.formData();
      file = formData.get("file") as File | null;
    } catch {
      return NextResponse.json(
        { error: "Não foi possível ler o ficheiro. Verifique se o ficheiro não está corrompido ou demasiado grande." },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json({ error: "Ficheiro não enviado." }, { status: 400 });
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Ficheiro demasiado grande. Máximo 50MB." },
        { status: 400 }
      );
    }

    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    const header = buffer.slice(0, 16).toString("utf8");
    if (!header.startsWith("SQLite format 3")) {
      return NextResponse.json(
        { error: "Ficheiro inválido. Envie uma base de dados SQLite (.db)." },
        { status: 400 }
      );
    }

    if (isPostgres) {
      const dbDir = path.join(process.cwd(), "prisma");
      if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
      const dbPath = path.join(dbDir, "local.db");

      const prevExists = fs.existsSync(dbPath);
      let prevBuffer: Buffer | null = null;
      if (prevExists) prevBuffer = fs.readFileSync(dbPath);

      fs.writeFileSync(dbPath, buffer);

      try {
        const importScript = path.resolve(process.cwd(), "scripts/import-sqlite-to-pg.ts");
        if (!fs.existsSync(importScript)) {
          return NextResponse.json(
            { error: "Script de importação não encontrado no servidor." },
            { status: 500 }
          );
        }

        const { execSync } = await import("child_process");
        execSync(`npx tsx "${importScript}"`, {
          env: { ...process.env, IMPORT_DATABASE_URL: process.env.DATABASE_URL! },
          cwd: process.cwd(),
          timeout: 180_000,
          stdio: "pipe",
        });

        return NextResponse.json({
          success: true,
          message: "Base de dados importada para PostgreSQL com sucesso!",
          size: buffer.length,
        });
      } finally {
        if (prevBuffer) {
          fs.writeFileSync(dbPath, prevBuffer);
        } else {
          try { fs.unlinkSync(dbPath); } catch {}
        }
      }
    }

    const dbPath = path.join(process.cwd(), "prisma", "local.db");

    if (fs.existsSync(dbPath)) {
      const backupDir = path.join(process.cwd(), "backups");
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      fs.copyFileSync(dbPath, path.join(backupDir, `pre_import_backup_${ts}.db`));
    }

    fs.writeFileSync(dbPath, buffer);

    return NextResponse.json({
      success: true,
      message: "Base de dados importada com sucesso!",
      size: buffer.length,
    });
  } catch (err) {
    console.error("[import-db]", err);
    return NextResponse.json(
      { error: (err as Error).message || "Erro ao importar base de dados." },
      { status: 500 }
    );
  }
}
