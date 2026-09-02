import fs from "fs";
import path from "path";
import https from "https";

const BACKUPS_DIR = path.join(process.cwd(), "backups");
const CONFIG_PATH = path.join(process.cwd(), "backups", "gdrive-config.json");

type GDriveConfig = {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  folderId?: string;
  enabled: boolean;
  autoBackupIntervalHours: number;
  lastBackupAt?: string;
};

export function loadGDriveConfig(): GDriveConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...defaultConfig(), ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) };
    }
  } catch { /* */ }
  return defaultConfig();
}

export function saveGDriveConfig(config: GDriveConfig) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

function defaultConfig(): GDriveConfig {
  return { accessToken: "", enabled: false, autoBackupIntervalHours: 24 };
}

function httpsRequest(options: https.RequestOptions, data?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

export async function uploadToGoogleDrive(
  accessToken: string,
  filePath: string,
  fileName: string,
  mimeType: string,
  folderId?: string
) {
  const boundary = "-------" + Date.now().toString(36);
  const metadata = { name: fileName, parents: folderId ? [folderId] : [] };
  const fileBuffer = fs.readFileSync(filePath);

  let body = "";
  body += `--${boundary}\r\n`;
  body += `Content-Type: application/json; charset=UTF-8\r\n\r\n`;
  body += `${JSON.stringify(metadata)}\r\n`;
  body += `--${boundary}\r\n`;
  body += `Content-Type: ${mimeType}\r\n\r\n`;

  const bodyBuffer = Buffer.concat([
    Buffer.from(body, "utf8"),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);

  const options: https.RequestOptions = {
    hostname: "www.googleapis.com",
    path: "/upload/drive/v3/files?uploadType=multipart",
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": bodyBuffer.length,
    },
  };

  const result = await httpsRequest(options);
  const parsed = JSON.parse(result);
  if (parsed.error) throw new Error(parsed.error.message || "Erro Google Drive");
  return parsed;
}

export function createBackupFile(): { filePath: string; fileName: string } {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  const dbPath = path.join(process.cwd(), "prisma", "local.db");
  if (!fs.existsSync(dbPath)) throw new Error("Base de dados nao encontrada");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `gestornaval_backup_${timestamp}.db`;
  const filePath = path.join(BACKUPS_DIR, fileName);

  fs.copyFileSync(dbPath, filePath);
  return { filePath, fileName };
}

export async function runCloudBackup(): Promise<string> {
  const config = loadGDriveConfig();
  if (!config.enabled || !config.accessToken) {
    throw new Error("Backup cloud nao configurado. Aceda a Configuracoes > Cloud Backup.");
  }

  const { filePath, fileName } = createBackupFile();
  try {
    const result = await uploadToGoogleDrive(config.accessToken, filePath, fileName, "application/octet-stream", config.folderId);
    config.lastBackupAt = new Date().toISOString();
    saveGDriveConfig(config);
    return `Backup enviado para Google Drive: ${result.name || fileName}`;
  } finally {
    // Keep local backup file
  }
}

export function isCloudBackupDue(): boolean {
  const config = loadGDriveConfig();
  if (!config.enabled || !config.accessToken) return false;
  if (!config.lastBackupAt) return true;
  const hoursSince = (Date.now() - new Date(config.lastBackupAt).getTime()) / 3600000;
  return hoursSince >= config.autoBackupIntervalHours;
}

export async function fetchLatestBackupFromGoogleDrive(): Promise<{ buffer: Buffer; fileName: string }> {
  const config = loadGDriveConfig();
  if (!config.accessToken) {
    throw new Error("Google Drive não está configurado. Token de acesso em falta.");
  }

  const query = config.folderId ? `'${config.folderId}' in parents and name contains 'gestornaval_backup'` : `name contains 'gestornaval_backup'`;
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=createdTime+desc&pageSize=1`;

  const listRes = await new Promise<string>((resolve, reject) => {
    https.get(listUrl, { headers: { Authorization: `Bearer ${config.accessToken}` } }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
      res.on("error", reject);
    });
  });

  const parsed = JSON.parse(listRes);
  if (parsed.error) throw new Error(parsed.error.message || "Erro ao listar ficheiros no Google Drive");
  const files = parsed.files || [];
  if (files.length === 0) throw new Error("Nenhum backup encontrado no Google Drive.");

  const latestFile = files[0];
  const fileId = latestFile.id;
  const fileName = latestFile.name;

  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  const fileBuffer = await new Promise<Buffer>((resolve, reject) => {
    https.get(downloadUrl, { headers: { Authorization: `Bearer ${config.accessToken}` } }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`Erro ao descarregar do Google Drive (status ${res.statusCode})`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", chunk => chunks.push(Buffer.from(chunk)));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
  });

  return { buffer: fileBuffer, fileName };
}
