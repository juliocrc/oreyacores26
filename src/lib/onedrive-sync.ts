import fs from "fs";
import path from "path";
import os from "os";

const CONFIG_PATH = path.join(process.cwd(), "backups", "onedrive-config.json");
const TARGET_ROOT_FOLDER = "OREYACORESDELUXE2026";
const CERTIFICADOS_DIR = "certificados açores 2026 versao1";

export const NAVIO_CATEGORY_FOLDERS = ["DGRM", "Quadros", "Certificados", "Documentos"] as const;
export const NAVIO_DOCS_SUBFOLDER = "Documentos";

export type OneDriveConfig = {
  enabled: boolean;
  rootPath: string;
};

type OneDriveGraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  driveId: string;
};

function loadGraphConfig(): OneDriveGraphConfig | null {
  const values = {
    tenantId: process.env.ONEDRIVE_TENANT_ID?.trim(),
    clientId: process.env.ONEDRIVE_CLIENT_ID?.trim(),
    clientSecret: process.env.ONEDRIVE_CLIENT_SECRET?.trim(),
    driveId: process.env.ONEDRIVE_DRIVE_ID?.trim(),
  };
  return Object.values(values).every(Boolean) ? values as OneDriveGraphConfig : null;
}

export type OneDriveGraphStatus = {
  configured: boolean;
  missing: string[];
  drive: { id: string; name?: string; driveType?: string } | null;
  error?: string;
};

export async function getOneDriveGraphStatus(): Promise<OneDriveGraphStatus> {
  const missing = (
    [
      ["ONEDRIVE_TENANT_ID", process.env.ONEDRIVE_TENANT_ID],
      ["ONEDRIVE_CLIENT_ID", process.env.ONEDRIVE_CLIENT_ID],
      ["ONEDRIVE_CLIENT_SECRET", process.env.ONEDRIVE_CLIENT_SECRET],
      ["ONEDRIVE_DRIVE_ID", process.env.ONEDRIVE_DRIVE_ID],
    ] as const
  )
    .filter(([, value]) => !value || !String(value).trim())
    .map(([key]) => key);

  const config = loadGraphConfig();
  if (!config) {
    return { configured: false, missing, drive: null };
  }

  try {
    const token = await getGraphToken(config);
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(config.driveId)}/root`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.error?.message || `HTTP ${response.status}`;
      return { configured: true, missing: [], drive: null, error: `Microsoft Graph: ${detail}` };
    }
    return {
      configured: true,
      missing: [],
      drive: { id: String(payload.id || config.driveId), name: payload.name, driveType: payload.driveType },
    };
  } catch (err) {
    return {
      configured: true,
      missing: [],
      drive: null,
      error: err instanceof Error ? err.message : "Falha ao contactar o Microsoft Graph.",
    };
  }
}

async function getGraphToken(config: OneDriveGraphConfig) {
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new Error(`Microsoft Graph token failed (${response.status}).`);
  }
  return payload.access_token as string;
}

async function syncToGraph(config: OneDriveGraphConfig, relativePath: string, buffer: Buffer, contentType = "application/octet-stream") {
  const token = await getGraphToken(config);
  const graphPath = relativePath.split(path.sep).join("/").split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(config.driveId)}/root:/${graphPath}:/content`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
    },
    body: new Uint8Array(buffer),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Microsoft Graph upload failed (${response.status}): ${detail.slice(0, 300)}`);
  }
}

function sanitizeFolderName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 120);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, " ").replace(/\.\./g, "_").trim().substring(0, 180);
}

export function detectOneDriveBusinessRoots(): string[] {
  const candidates: string[] = [];
  try {
    const homedir = os.homedir();
    if (fs.existsSync(homedir)) {
      const items = fs.readdirSync(homedir, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory() && item.name.toLowerCase().startsWith("onedrive -")) {
          candidates.push(path.join(homedir, item.name));
        }
      }
    }
  } catch {}

  if (process.env.OneDriveCommercial && fs.existsSync(process.env.OneDriveCommercial)) {
    if (!candidates.includes(process.env.OneDriveCommercial)) {
      candidates.push(process.env.OneDriveCommercial);
    }
  }

  return candidates;
}

export function loadOneDriveConfig(): OneDriveConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      return {
        enabled: Boolean(data.enabled),
        rootPath: String(data.rootPath || ""),
      };
    }
  } catch {}

  const businessRoots = detectOneDriveBusinessRoots();
  const defaultRoot = businessRoots.find(r => /orey|azores|tecnica/i.test(r)) || businessRoots[0] || "";

  return {
    enabled: Boolean(defaultRoot),
    rootPath: defaultRoot,
  };
}

export function saveOneDriveConfig(config: OneDriveConfig) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

export async function syncEmittedDocumentToOneDrive(params: {
  kind: "certificado" | "quadro" | "externo" | "declaracao-iva";
  fileName: string;
  buffer: Buffer;
  shipName?: string;
}): Promise<{ synced: boolean; filePath?: string; reason?: string }> {
  try {
    const graphConfig = loadGraphConfig();
    let subDir = CERTIFICADOS_DIR;
    if (params.kind === "quadro" || params.kind === "externo" || params.kind === "declaracao-iva") {
      const ship = sanitizeFolderName(params.shipName || "Geral");
      const categoria = params.kind === "quadro" ? "Quadros" : params.kind === "externo" ? "Certificados" : "Documentos";
      subDir = path.join("navios", ship, NAVIO_DOCS_SUBFOLDER, categoria);
    }
    const relativePath = path.join(TARGET_ROOT_FOLDER, subDir, params.fileName);

    if (graphConfig) {
      await syncToGraph(graphConfig, relativePath, params.buffer);
      return { synced: true, filePath: `graph:${relativePath}` };
    }

    const config = loadOneDriveConfig();
    if (!config.enabled || !config.rootPath) {
      return { synced: false, reason: "OneDrive não configurado ou desativado." };
    }

    if (!fs.existsSync(config.rootPath)) {
      return { synced: false, reason: `Caminho raiz do OneDrive não encontrado: ${config.rootPath}` };
    }

    const targetDir = path.join(config.rootPath, TARGET_ROOT_FOLDER, subDir);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filePath = path.join(targetDir, params.fileName);
    
    // Skip if identical size and name exists
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size === params.buffer.length) {
        return { synced: true, filePath };
      }
    }

    fs.writeFileSync(filePath, params.buffer);
    return { synced: true, filePath };
  } catch (err: any) {
    console.error("[onedrive-sync] Erro ao sincronizar documento:", err?.message);
    return { synced: false, reason: err?.message };
  }
}

export async function syncNavioFileToOneDrive(params: {
  shipName: string;
  fileName: string;
  buffer: Buffer;
  contentType?: string;
  category?: "documentos" | "certificados" | "dgrm" | "quadros" | string;
}): Promise<{ synced: boolean; filePath?: string; reason?: string }> {
  try {
    const ship = sanitizeFolderName(params.shipName || "Navio sem nome");
    const cat = params.category?.toLowerCase() || "documentos";
    const folderCategory = cat === "dgrm" ? "DGRM"
      : cat === "quadros" || cat === "quadro" ? "Quadros"
      : cat === "certificados" || cat === "certificado" ? "Certificados"
      : "Documentos";
    const relativePath = path.join(TARGET_ROOT_FOLDER, "navios", ship, NAVIO_DOCS_SUBFOLDER, folderCategory, sanitizeFolderName(params.fileName));
    const graphConfig = loadGraphConfig();

    if (graphConfig) {
      await syncToGraph(graphConfig, relativePath, params.buffer, params.contentType);
      return { synced: true, filePath: `graph:${relativePath}` };
    }

    const config = loadOneDriveConfig();
    if (!config.enabled || !config.rootPath) return { synced: false, reason: "OneDrive não configurado ou desativado." };
    const targetDir = path.join(config.rootPath, TARGET_ROOT_FOLDER, "navios", ship, NAVIO_DOCS_SUBFOLDER, folderCategory);
    fs.mkdirSync(targetDir, { recursive: true });
    const filePath = path.join(targetDir, sanitizeFileName(params.fileName));
    fs.writeFileSync(filePath, params.buffer);
    return { synced: true, filePath };
  } catch (error) {
    return { synced: false, reason: error instanceof Error ? error.message : "Falha ao guardar no OneDrive." };
  }
}

export type NavioFolderSyncItem = {
  shipName: string;
  folderPath?: string;
  created: number;
  existing: number;
  error?: string;
};

export type NavioFolderSyncResult = {
  source: "graph" | "filesystem" | "none";
  rootPath?: string;
  created: number;
  existing: number;
  errors: number;
  ships: NavioFolderSyncItem[];
  reason?: string;
};

function graphChildrenUrl(config: OneDriveGraphConfig, parentSegments: string[]) {
  const encodedParent = parentSegments.map(encodeURIComponent).join("/");
  return encodedParent
    ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(config.driveId)}/root:/${encodedParent}:/children`
    : `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(config.driveId)}/root/children`;
}

async function createGraphChildFolder(
  config: OneDriveGraphConfig,
  token: string,
  parentSegments: string[],
  name: string,
): Promise<"created" | "existing"> {
  const response = await fetch(graphChildrenUrl(config, parentSegments), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  });
  if (response.ok) return "created";
  if (response.status === 409) return "existing";
  const detail = await response.text().catch(() => "");
  throw new Error(`Microsoft Graph folder create failed (${response.status}): ${detail.slice(0, 300)}`);
}

export async function ensureNavioFoldersToOneDrive(params: {
  shipNames: string[];
  categories?: string[];
}): Promise<NavioFolderSyncResult> {
  const categories = (params.categories && params.categories.length
    ? params.categories
    : [...NAVIO_CATEGORY_FOLDERS]
  )
    .map((c) => sanitizeFolderName(c))
    .filter(Boolean);

  const uniqueShips = Array.from(
    new Set(params.shipNames.map((n) => (n || "").trim()).filter(Boolean)),
  );

  const baseSegments = [TARGET_ROOT_FOLDER, "navios"];
  const graphConfig = loadGraphConfig();

  if (graphConfig) {
    const token = await getGraphToken(graphConfig);
    const result: NavioFolderSyncResult = { source: "graph", created: 0, existing: 0, errors: 0, ships: [] };
    for (const rawName of uniqueShips) {
      const ship = sanitizeFolderName(rawName);
      const item: NavioFolderSyncItem = { shipName: rawName, created: 0, existing: 0 };
      try {
        const shipSegments = [...baseSegments, ship, NAVIO_DOCS_SUBFOLDER];
        let parentSegments: string[] = [];
        for (const segment of shipSegments) {
          const status = await createGraphChildFolder(graphConfig, token, parentSegments, segment);
          if (status === "created") item.created += 1;
          else item.existing += 1;
          parentSegments = [...parentSegments, segment];
        }
        for (const cat of categories) {
          const status = await createGraphChildFolder(graphConfig, token, shipSegments, cat);
          if (status === "created") item.created += 1;
          else item.existing += 1;
        }
        item.folderPath = shipSegments.join("/");
      } catch (error) {
        item.error = error instanceof Error ? error.message : "Falha ao criar pastas no OneDrive.";
        result.errors += 1;
      }
      result.created += item.created;
      result.existing += item.existing;
      result.ships.push(item);
    }
    return result;
  }

  const config = loadOneDriveConfig();
  if (!config.enabled || !config.rootPath) {
    return { source: "none", created: 0, existing: 0, errors: 0, ships: [], reason: "OneDrive não configurado ou desativado." };
  }
  if (!fs.existsSync(config.rootPath)) {
    return {
      source: "none",
      created: 0,
      existing: 0,
      errors: 0,
      ships: [],
      reason: `Caminho raiz do OneDrive não encontrado: ${config.rootPath}`,
    };
  }

  const result: NavioFolderSyncResult = {
    source: "filesystem",
    rootPath: config.rootPath,
    created: 0,
    existing: 0,
    errors: 0,
    ships: [],
  };
  for (const rawName of uniqueShips) {
    const ship = sanitizeFolderName(rawName);
    const item: NavioFolderSyncItem = { shipName: rawName, created: 0, existing: 0 };
    try {
      const baseDir = path.join(config.rootPath, TARGET_ROOT_FOLDER, "navios", ship, NAVIO_DOCS_SUBFOLDER);
      if (fs.existsSync(baseDir)) item.existing += 1;
      else {
        fs.mkdirSync(baseDir, { recursive: true });
        item.created += 1;
      }
      for (const cat of categories) {
        const dir = path.join(baseDir, cat);
        if (fs.existsSync(dir)) item.existing += 1;
        else {
          fs.mkdirSync(dir, { recursive: true });
          item.created += 1;
        }
      }
      item.folderPath = path.join(TARGET_ROOT_FOLDER, "navios", ship, NAVIO_DOCS_SUBFOLDER);
    } catch (error) {
      item.error = error instanceof Error ? error.message : "Falha ao criar pastas no OneDrive.";
      result.errors += 1;
    }
    result.created += item.created;
    result.existing += item.existing;
    result.ships.push(item);
  }
  return result;
}
