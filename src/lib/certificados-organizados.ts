import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from "fs";
import { createHash } from "crypto";
import path from "path";
import { put, del } from "@vercel/blob";

const CERTIFICADOS_BASE = path.join(process.cwd(), "public", "certificados-organizados");
const NAVIOS_BASE = path.join(process.cwd(), "public", "navios", "NAVIOS");
const UPLOADS_TMP = path.join(process.cwd(), "public", "uploads", "tmp");

const BLOB_ENABLED = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const SYNC_TO_BLOB = process.env.CERTIFICADOS_SYNC_BLOB === "true" && BLOB_ENABLED;

function sanitizeFolderName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 120);
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .trim();
}

function computeHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex").substring(0, 16);
}

function generateStandardName(
  type: "CERT" | "QUADRO" | "EXT",
  serial: string,
  date: Date,
  ext: string,
  sequence?: number
): string {
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  const seq = sequence ? `_${String(sequence).padStart(3, "0")}` : "";
  return `${type}_${serial}_${dateStr}${seq}.${ext}`;
}

function getCertificadosBaseDir(): string {
  return CERTIFICADOS_BASE;
}

function getNaviosBaseDir(): string {
  return NAVIOS_BASE;
}

function getCertificadosYearDir(year: number): string {
  const base = getCertificadosBaseDir();
  return path.join(base, `CERTIFICADOS AÇORES ${year}`);
}

function getNavioDir(shipName: string): string {
  const base = getNaviosBaseDir();
  const sanitized = sanitizeFolderName(shipName);
  return path.join(base, sanitized);
}

function getIndexPath(dir: string): string {
  return path.join(dir, "index.json");
}

function readIndex(dir: string): any[] {
  const indexPath = getIndexPath(dir);
  if (!existsSync(indexPath)) return [];
  try {
    const content = readFileSync(indexPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

function writeIndex(dir: string, entries: any[]): void {
  const indexPath = getIndexPath(dir);
  const sorted = [...entries].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  writeFileSync(indexPath, JSON.stringify(sorted, null, 2), "utf-8");
}

function upsertIndexEntry(dir: string, entry: any): void {
  const entries = readIndex(dir);
  const idx = entries.findIndex(e => e.name === entry.name);
  if (idx >= 0) entries[idx] = { ...entries[idx], ...entry, updatedAt: new Date().toISOString() };
  else entries.push({ ...entry, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  writeIndex(dir, entries);
}

function removeIndexEntry(dir: string, fileName: string): void {
  const entries = readIndex(dir).filter(e => e.name !== fileName);
  writeIndex(dir, entries);
}

async function syncToBlobIfEnabled(relativePath: string, buffer: Buffer): Promise<string | null> {
  if (!SYNC_TO_BLOB) return null;
  try {
    const blobPath = `certificados-organizados/${relativePath.replace(/\\/g, "/")}`;
    await put(blobPath, buffer, { access: "public", addRandomSuffix: false, allowOverwrite: true });
    return blobPath;
  } catch (e) {
    console.warn("Blob sync failed:", e);
    return null;
  }
}

async function deleteFromBlobIfEnabled(relativePath: string): Promise<void> {
  if (!SYNC_TO_BLOB) return;
  try {
    const blobPath = `certificados-organizados/${relativePath.replace(/\\/g, "/")}`;
    await del(blobPath);
  } catch (e) {
    console.warn("Blob delete failed:", e);
  }
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function getYearFromDate(dateStr?: string | null): number {
  if (!dateStr) return new Date().getFullYear();
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return new Date().getFullYear();
  return parsed.getFullYear();
}

export function getCertificadosUrlFromRelativePath(relativePath: string): string {
  return `/${relativePath.replace(/\\/g, "/")}`;
}

export async function saveCertificadoToYearFolder(
  year: number,
  fileName: string,
  buffer: Buffer,
  meta?: { serial?: string; date?: Date; type?: "CERT" | "QUADRO" }
): Promise<{ filePath: string; relativePath: string; standardName: string; hash: string; blobPath?: string | null }> {
  const dir = getCertificadosYearDir(year);
  ensureDir(dir);

  const hash = computeHash(buffer);
  const ext = path.extname(fileName).slice(1) || "xlsx";
  const standardName = meta?.serial && meta?.date
    ? generateStandardName(meta.type || "CERT", meta.serial, meta.date, ext)
    : sanitizeFileName(fileName);

  // Deduplicação: se já existe ficheiro com mesmo hash, não gravar duplicado
  const index = readIndex(dir);
  const existing = index.find(e => e.hash === hash);
  if (existing) {
    return {
      filePath: path.join(dir, existing.name),
      relativePath: path.relative(process.cwd(), path.join(dir, existing.name)),
      standardName: existing.name,
      hash,
      blobPath: existing.blobPath,
    };
  }

  const filePath = path.join(dir, standardName);
  writeFileSync(filePath, buffer);

  const relativePath = path.relative(process.cwd(), filePath);
  const blobPath = await syncToBlobIfEnabled(relativePath, buffer);

  upsertIndexEntry(dir, {
    name: standardName,
    originalName: fileName,
    type: "certificado",
    serial: meta?.serial || null,
    date: meta?.date?.toISOString().slice(0, 10) || null,
    size: buffer.length,
    hash,
    blobPath,
    modified: new Date().toISOString(),
  });

  return { filePath, relativePath, standardName, hash, blobPath };
}

export async function saveQuadroToNavioFolder(
  shipName: string,
  fileName: string,
  buffer: Buffer,
  meta?: { serial?: string; date?: Date }
): Promise<{ filePath: string; relativePath: string; standardName: string; hash: string; blobPath?: string | null }> {
  const dir = getNavioDir(shipName);
  ensureDir(dir);

  const hash = computeHash(buffer);
  const ext = path.extname(fileName).slice(1) || "xlsx";
  const standardName = meta?.serial && meta?.date
    ? generateStandardName("QUADRO", meta.serial, meta.date, ext)
    : sanitizeFileName(fileName);

  const index = readIndex(dir);
  const existing = index.find(e => e.hash === hash);
  if (existing) {
    return {
      filePath: path.join(dir, existing.name),
      relativePath: path.relative(process.cwd(), path.join(dir, existing.name)),
      standardName: existing.name,
      hash,
      blobPath: existing.blobPath,
    };
  }

  const filePath = path.join(dir, standardName);
  writeFileSync(filePath, buffer);

  const relativePath = path.relative(process.cwd(), filePath);
  const blobPath = await syncToBlobIfEnabled(relativePath, buffer);

  upsertIndexEntry(dir, {
    name: standardName,
    originalName: fileName,
    type: "quadro",
    serial: meta?.serial || null,
    date: meta?.date?.toISOString().slice(0, 10) || null,
    size: buffer.length,
    hash,
    blobPath,
    modified: new Date().toISOString(),
  });

  return { filePath, relativePath, standardName, hash, blobPath };
}

export async function saveExternalCertificadoToNavioFolder(
  shipName: string,
  fileName: string,
  buffer: Buffer,
  meta?: { serial?: string; date?: Date }
): Promise<{ filePath: string; relativePath: string; standardName: string; hash: string; blobPath?: string | null }> {
  const dir = getNavioDir(shipName);
  ensureDir(dir);

  const hash = computeHash(buffer);
  const ext = path.extname(fileName).slice(1) || "pdf";
  const standardName = meta?.serial && meta?.date
    ? generateStandardName("EXT", meta.serial, meta.date, ext)
    : sanitizeFileName(fileName);

  const index = readIndex(dir);
  const existing = index.find(e => e.hash === hash);
  if (existing) {
    return {
      filePath: path.join(dir, existing.name),
      relativePath: path.relative(process.cwd(), path.join(dir, existing.name)),
      standardName: existing.name,
      hash,
      blobPath: existing.blobPath,
    };
  }

  const filePath = path.join(dir, standardName);
  writeFileSync(filePath, buffer);

  const relativePath = path.relative(process.cwd(), filePath);
  const blobPath = await syncToBlobIfEnabled(relativePath, buffer);

  upsertIndexEntry(dir, {
    name: standardName,
    originalName: fileName,
    type: "externo",
    serial: meta?.serial || null,
    date: meta?.date?.toISOString().slice(0, 10) || null,
    size: buffer.length,
    hash,
    blobPath,
    modified: new Date().toISOString(),
  });

  return { filePath, relativePath, standardName, hash, blobPath };
}

// === Utilitários para limpeza ===

export async function cleanTmpFolder(maxAgeDays = 7): Promise<{ deleted: number; freedBytes: number }> {
  if (!existsSync(UPLOADS_TMP)) return { deleted: 0, freedBytes: 0 };
  let deleted = 0;
  let freedBytes = 0;
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  async function walk(dir: string) {
    const entries = await import("fs/promises").then(fs => fs.readdir(dir, { withFileTypes: true }));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        try { await import("fs/promises").then(fs => fs.rmdir(full)); } catch {}
      } else {
        const stats = await import("fs/promises").then(fs => fs.stat(full));
        if (now - stats.mtimeMs > maxAgeMs) {
          freedBytes += stats.size;
          await import("fs/promises").then(fs => fs.unlink(full));
          deleted++;
        }
      }
    }
  }
  await walk(UPLOADS_TMP);
  return { deleted, freedBytes };
}

export async function deduplicateAllFolders(): Promise<{ removed: number; freedBytes: number }> {
  let removed = 0;
  let freedBytes = 0;
  const seenHashes = new Set<string>();

  async function processDir(dir: string) {
    if (!existsSync(dir)) return;
    const entries = await import("fs/promises").then(fs => fs.readdir(dir, { withFileTypes: true }));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "NAVIOS") await processDir(full); // NAVIOS handled separately
      } else if (entry.name !== "index.json") {
        const buffer = readFileSync(full);
        const hash = computeHash(buffer);
        if (seenHashes.has(hash)) {
          const stats = statSync(full);
          freedBytes += stats.size;
          await import("fs/promises").then(fs => fs.unlink(full));
          removeIndexEntry(dir, entry.name);
          removed++;
        } else {
          seenHashes.add(hash);
        }
      }
    }
  }

  await processDir(CERTIFICADOS_BASE);
  
  // Navios
  const naviosDir = NAVIOS_BASE;
  if (existsSync(naviosDir)) {
    const navios = await import("fs/promises").then(fs => fs.readdir(naviosDir, { withFileTypes: true }));
    for (const n of navios.filter(d => d.isDirectory())) {
      await processDir(path.join(naviosDir, n.name));
    }
  }

  return { removed, freedBytes };
}