"use server";

import fs from "fs";
import path from "path";
import { requireAdminOrBypass } from "@/app/api/backups/_lib";
import { execSync } from "child_process";

const isPostgres =
  (process.env.DATABASE_URL || "").startsWith("postgresql://") ||
  (process.env.DATABASE_URL || "").startsWith("postgres://");

export async function importDatabaseAction(formData: FormData) {
  const auth = await requireAdminOrBypass();
  if (!auth.ok) {
    return { success: false, error: "Não autorizado" };
  }

  try {
    const file = formData.get("file") as File | null;
    if (!file) {
      return { success: false, error: "Ficheiro não enviado." };
    }

    if (file.size > 50 * 1024 * 1024) {
      return { success: false, error: "Ficheiro demasiado grande. Máximo 50MB." };
    }

    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    const header = buffer.slice(0, 16).toString("utf8");
    if (!header.startsWith("SQLite format 3")) {
      return { success: false, error: "Ficheiro inválido. Envie uma base de dados SQLite (.db)." };
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
        const importScript = path.resolve(process.cwd(), "scripts/import-sqlite-to-pg.cjs");
        if (!fs.existsSync(importScript)) {
          return { success: false, error: "Script de importação não encontrado no servidor." };
        }

        execSync(`node "${importScript}"`, {
          env: { ...process.env, IMPORT_DATABASE_URL: process.env.DATABASE_URL! },
          cwd: process.cwd(),
          timeout: 180_000,
          stdio: "pipe",
        });

        return {
          success: true,
          message: "Base de dados importada para PostgreSQL com sucesso!",
        };
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

    return {
      success: true,
      message: "Base de dados importada com sucesso!",
    };
  } catch (err) {
    console.error("[importDatabaseAction]", err);
    return { success: false, error: (err as Error).message || "Erro ao importar base de dados." };
  }
}
