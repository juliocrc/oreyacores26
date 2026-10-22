import { del, list, put } from "@vercel/blob";
import { existsSync } from "fs";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "fs/promises";
import path from "path";

const ROOT_PREFIX = "documentos-tecnicos";

export type FolderType = "documentacao" | "legislacao";

type StoredFileInfo = {
  name: string;
  relativePath?: string;
  size: number;
  modified: string | Date;
  url?: string;
};

const ALLOWED_FOLDERS: FolderType[] = ["documentacao", "legislacao"];

export function isAllowedFolder(value: string | null): value is FolderType {
  return Boolean(value && ALLOWED_FOLDERS.includes(value as FolderType));
}

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[<>:"|?*]/g, "_").replace(/\.\./g, "_");
}

export function inferContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".doc") return "application/msword";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".xls") return "application/vnd.ms-excel";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".txt") return "text/plain";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  return "application/octet-stream";
}

function storageEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

const LOCAL_FOLDER_PATHS: Record<FolderType, string> = {
  documentacao: path.join(process.cwd(), "documentacao"),
  legislacao: path.join(process.cwd(), "legislacao"),
};

function folderLocalPath(folder: FolderType) {
  return LOCAL_FOLDER_PATHS[folder];
}

function blobPath(folder: FolderType, file?: string) {
  return file ? `${ROOT_PREFIX}/${folder}/${file}` : `${ROOT_PREFIX}/${folder}/`;
}

function sanitizeRelativePath(input: string) {
  const normalized = String(input || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (normalized.some((segment) => segment === '.' || segment === '..')) return null;
  return normalized.join('/');
}

async function findBlob(folder: FolderType, filename: string) {
  const target = blobPath(folder, filename);
  const result = await list({ prefix: target });
  return (result.blobs || []).find((blob) => blob.pathname === target) || null;
}

async function ensureFolder(folder: FolderType) {
  const full = folderLocalPath(folder);
  if (!existsSync(full)) {
    await mkdir(full, { recursive: true });
  }
}

async function listLocalFilesRecursive(baseDir: string, currentRelative = ''): Promise<StoredFileInfo[]> {
  if (!existsSync(baseDir)) return [];

  const entries = await readdir(baseDir, { withFileTypes: true });
  const collected: StoredFileInfo[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(baseDir, entry.name);
    const relativePath = currentRelative ? `${currentRelative}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      collected.push(...await listLocalFilesRecursive(absolutePath, relativePath));
      continue;
    }

    if (!entry.isFile()) continue;

    const details = await stat(absolutePath);
    collected.push({
      name: path.basename(entry.name),
      relativePath,
      size: details.size,
      modified: details.mtime,
    });
  }

  return collected;
}

export async function listFiles(folder: FolderType): Promise<StoredFileInfo[]> {
  if (storageEnabled()) {
    const result = await list({ prefix: blobPath(folder) });
    return (result.blobs || []).map((blob) => ({
      name: path.posix.basename(blob.pathname),
      relativePath: blob.pathname.replace(blobPath(folder), ''),
      size: blob.size,
      modified: blob.uploadedAt,
      url: blob.url,
    }));
  }

  const folderPath = folderLocalPath(folder);
  if (!existsSync(folderPath)) return [];

  return listLocalFilesRecursive(folderPath);
}

export async function saveFile(folder: FolderType, originalName: string, bytes: ArrayBuffer, contentType?: string) {
  const sanitized = sanitizeFilename(originalName);
  const ext = path.extname(sanitized);
  const base = path.basename(sanitized, ext);
  let finalName = sanitized;

  if (storageEnabled()) {
    const existing = await findBlob(folder, finalName);
    if (existing) finalName = `${base}_${Date.now()}${ext}`;

    await put(blobPath(folder, finalName), Buffer.from(bytes), {
      access: "public",
      addRandomSuffix: false,
      contentType: contentType || inferContentType(finalName),
    });

    return finalName;
  }

  await ensureFolder(folder);
  const folderPath = folderLocalPath(folder);
  const initialPath = path.join(folderPath, finalName);
  if (existsSync(initialPath)) {
    finalName = `${base}_${Date.now()}${ext}`;
  }

  const finalPath = path.join(folderPath, finalName);
  await writeFile(finalPath, Buffer.from(bytes));
  return finalName;
}

async function readLocalStoredFile(folder: FolderType, safeRelativePath: string, safe: string) {
  const primaryPath = path.join(folderLocalPath(folder), ...safeRelativePath.split('/'));
  const calibrationFallback =
    folder === "documentacao" ? path.join(process.cwd(), "public", "calibraçoes", safe) : null;
  const filePath = existsSync(primaryPath)
    ? primaryPath
    : calibrationFallback && existsSync(calibrationFallback)
      ? calibrationFallback
      : null;

  if (!filePath) return null;

  return {
    buffer: await readFile(filePath),
    contentType: inferContentType(safe),
    filename: safe,
  };
}

export async function readStoredFile(folder: FolderType, filename: string) {
  const safeRelativePath = sanitizeRelativePath(filename);
  if (!safeRelativePath) return null;
  const safe = path.posix.basename(safeRelativePath);

  if (storageEnabled()) {
    const blob = await findBlob(folder, safeRelativePath);
    if (blob) {
      const response = await fetch(blob.url, { cache: "no-store" });
      if (response.ok) {
        return {
          buffer: Buffer.from(await response.arrayBuffer()),
          contentType: response.headers.get("content-type") || inferContentType(safe),
          filename: safe,
        };
      }
    }
  }

  return readLocalStoredFile(folder, safeRelativePath, safe);
}

export async function deleteStoredFile(folder: FolderType, filename: string) {
  const safeRelativePath = sanitizeRelativePath(filename);
  if (!safeRelativePath) return false;

  if (storageEnabled()) {
    const blob = await findBlob(folder, safeRelativePath);
    if (!blob) return false;
    await del(blob.url);
    return true;
  }

  const filePath = path.join(folderLocalPath(folder), ...safeRelativePath.split('/'));
  if (!existsSync(filePath)) return false;
  await unlink(filePath);
  return true;
}
