"use client";

import { appToast } from "@/lib/app-toast";

/**
 * Gravação automática de documentos em pastas no disco, via File System Access API
 * (Chrome/Edge; funciona em localhost). Estrutura criada a partir de uma pasta
 * principal escolhida pelo utilizador:
 *
 *   <principal>/
 *     NAVIOS AÇORES/
 *       <NomeDoNavio>/
 *         Quadros/
 *         DGRM/
 *         Declarações IVA/
 *     certificados açores 2026 versao1/   (pasta única, fixa no Deluxe)
 *
 * Se a API não estiver disponível (Firefox/Safari), os ficheiros são descarregados
 * normalmente para a pasta de Downloads do browser.
 */

export const NAVIOS_FOLDER = "NAVIOS AÇORES";

/**
 * OREYACORESDELUXE: pasta única e fixa dos certificados, para que não dependa
 * do ano da inspeção. Ex.: public/certificados açores 2026 versao1
 */
export const CERTIFICADOS_FOLDER = "certificados açores 2026 versao1";

/** Pasta dos certificados (fixa no Deluxe). O `year` é ignorado. */
export function certificadosFolderForYear(_year?: number | string | null): string {
  return CERTIFICADOS_FOLDER;
}

export type ShipDocCategory = "Quadros" | "DGRM" | "Declarações IVA";

type PermissionMode = "read" | "readwrite";

interface OreyWritable {
  write(data: Blob | BufferSource | string): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}

interface OreyFileHandle {
  kind: "file";
  name: string;
  createWritable(): Promise<OreyWritable>;
}

interface OreyDirHandle {
  kind: "directory";
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OreyDirHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OreyFileHandle>;
  queryPermission?(descriptor?: { mode?: PermissionMode }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode?: PermissionMode }): Promise<PermissionState>;
}

type DirectoryPicker = (options?: {
  id?: string;
  mode?: PermissionMode;
  startIn?: "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
}) => Promise<OreyDirHandle>;

export type SaveOutcome =
  | { saved: true; path: string }
  | { saved: false; reason: "unsupported" | "cancelled" | "error"; error?: string };

const DB_NAME = "orey-documentos";
const STORE_NAME = "handles";
const ROOT_KEY = "root";

function getDirectoryPicker(): DirectoryPicker | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { showDirectoryPicker?: DirectoryPicker };
  return typeof w.showDirectoryPicker === "function" ? w.showDirectoryPicker.bind(window) : null;
}

export function isShipFolderSaveSupported(): boolean {
  return getDirectoryPicker() !== null && typeof indexedDB !== "undefined";
}

// ---------------------------------------------------------------- IndexedDB

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function idbGet<T>(key: string): Promise<T | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

// ---------------------------------------------------------------- Helpers

function sanitizeSegment(input?: string | null): string {
  return String(input ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120);
}

function sanitizeFilename(input: string): string {
  return sanitizeSegment(input) || `documento_${Date.now()}`;
}

export function yearFromDate(value?: string | null): number | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.getFullYear();
}

export function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Lê o header X-Orey-Saved-Path devolvido pelos endpoints de geração.
 * Se existir, o ficheiro já ficou gravado no projeto → mostra toast e devolve true
 * (sem descarregar para o browser). Caso contrário devolve false.
 */
export function toastSavedPathIfPresent(
  res: Response,
  label?: string,
): boolean {
  const savedPath = res.headers.get("X-Orey-Saved-Path");
  if (!savedPath) return false;
  appToast.success(`${label ? label + " — " : ""}Guardado em ${savedPath}`);
  return true;
}

async function ensurePermission(handle: OreyDirHandle): Promise<boolean> {
  try {
    if (!handle.queryPermission) return true;
    if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") return true;
    if (!handle.requestPermission) return false;
    return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

/** Abre o seletor de pastas e guarda a pasta principal escolhida. */
export async function pickRootFolder(): Promise<OreyDirHandle | null> {
  const picker = getDirectoryPicker();
  if (!picker) return null;
  const picked = await picker({ id: "orey-root", mode: "readwrite", startIn: "documents" });
  await idbSet(ROOT_KEY, picked);
  return picked;
}

export async function getConfiguredRootName(): Promise<string | null> {
  const root = await idbGet<OreyDirHandle>(ROOT_KEY);
  return root?.name ?? null;
}

/** Permite ao utilizador escolher/trocar a pasta principal. Devolve o nome. */
export async function chooseRootFolder(): Promise<string | null> {
  try {
    const root = await pickRootFolder();
    if (!root) {
      appToast.warning("Este browser não suporta gravação direta em pastas. Use Chrome ou Edge.");
      return null;
    }
    // Pedir já a permissão enquanto o gesto do utilizador está ativo.
    await ensurePermission(root);
    return root.name;
  } catch (error) {
    if ((error as DOMException)?.name === "AbortError") return null;
    appToast.error("Não foi possível selecionar a pasta: " + (error instanceof Error ? error.message : String(error)));
    return null;
  }
}

async function writeFileToFolder(
  parent: OreyDirHandle,
  segments: string[],
  filename: string,
  blob: Blob,
): Promise<string> {
  let dir = parent;
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(sanitizeSegment(segment), { create: true });
  }
  const fileHandle = await dir.getFileHandle(sanitizeFilename(filename), { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  const pathParts = [parent.name, ...segments, fileHandle.name];
  return pathParts.join("\\");
}

/**
 * Guarda o ficheiro na estrutura (via File System Access API) ou, em fallback,
 * descarrega-o normalmente. Nunca lança: devolve sempre um SaveOutcome.
 */
async function saveDocument(params: {
  segments: string[];
  filename: string;
  blob: Blob;
  successMessage?: (path: string) => string;
  quiet?: boolean;
}): Promise<SaveOutcome> {
  const { segments, filename, blob, successMessage, quiet } = params;

  const picker = getDirectoryPicker();
  if (!picker) {
    triggerDownload(filename, blob);
    return { saved: false, reason: "unsupported" };
  }

  try {
    // Não abrir o seletor aqui: após um fetch a ativação do utilizador pode ter
    // expirado. A pasta é definida no menu da conta. Só reutilizamos a já autorizada.
    const root = await idbGet<OreyDirHandle>(ROOT_KEY);
    if (!root) {
      triggerDownload(filename, blob);
      if (!quiet) {
        appToast.info(
          "Defina primeiro a pasta de documentos no menu da conta (canto superior direito). Ficheiro descarregado para Downloads.",
        );
      }
      return { saved: false, reason: "unsupported" };
    }
    if (!(await ensurePermission(root))) {
      triggerDownload(filename, blob);
      if (!quiet) {
        appToast.info(
          "Sem autorização para a pasta de documentos. Ficheiro descarregado para Downloads. Defina novamente a pasta no menu da conta.",
        );
      }
      return { saved: false, reason: "cancelled" };
    }
    const path = await writeFileToFolder(root, segments, filename, blob);
    if (!quiet) appToast.success(successMessage ? successMessage(path) : `Guardado em ${path}`);
    return { saved: true, path };
  } catch (error) {
    if ((error as DOMException)?.name === "AbortError") {
      triggerDownload(filename, blob);
      return { saved: false, reason: "cancelled" };
    }
    triggerDownload(filename, blob);
    const message = error instanceof Error ? error.message : String(error);
    if (!quiet) appToast.warning(`Não foi possível guardar na pasta (${message}). Ficheiro descarregado para Downloads.`);
    return { saved: false, reason: "error", error: message };
  }
}

/** Quadro de inspeção DGRM/IVA de um navio → NAVIOS AÇORES/<navio>/<categoria>/ */
export function saveShipDocument(params: {
  shipName?: string | null;
  category: ShipDocCategory;
  filename: string;
  blob: Blob;
}): Promise<SaveOutcome> {
  const ship = sanitizeSegment(params.shipName) || "Sem navio";
  return saveDocument({
    segments: [NAVIOS_FOLDER, ship, params.category],
    filename: params.filename,
    blob: params.blob,
    successMessage: (path) => `Guardado em ${path}`,
  });
}

/** Certificado → "certificados açores 2026 versao1"/ (pasta fixa do Deluxe). */
export function saveCertificateDocument(params: {
  year?: number | string | null;
  filename: string;
  blob: Blob;
  quiet?: boolean;
}): Promise<SaveOutcome> {
  const year = typeof params.year === "string" ? Number(params.year.slice(0, 4)) : Number(params.year);
  return saveDocument({
    segments: [certificadosFolderForYear(year)],
    filename: params.filename,
    blob: params.blob,
    quiet: params.quiet,
    successMessage: (path) => `Certificado guardado em ${path}`,
  });
}
