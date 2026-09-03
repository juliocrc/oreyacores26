// Backup automatico da base de dados SQLite local.
// Copia prisma/local.db para backups/local_<timestamp>.db e purga backups antigos.
// Invocado pelo instrumentation.ts (startBackupScheduler) a cada 24h e manualmente
// via POST /api/backups (node scripts/db_backup.js).

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'prisma', 'local.db');
const BACKUPS_DIR = path.join(process.cwd(), 'backups');
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas
const BACKUP_PREFIX = 'auto_'; // distingue automatico ('auto_local_') de manual ('local_')

function pad2(n) {
  return String(n).padStart(2, '0');
}

function timestampName(date) {
  return (
    ('' + date.getFullYear()) +
    pad2(date.getMonth() + 1) +
    pad2(date.getDate()) + '_' +
    pad2(date.getHours()) +
    pad2(date.getMinutes())
  );
}

function createBackupFile() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('[backup] Base de dados nao encontrada em', DB_PATH);
    return null;
  }
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  const fileName = `auto_local_${timestampName(new Date())}.db`;
  const filePath = path.join(BACKUPS_DIR, fileName);
  fs.copyFileSync(DB_PATH, filePath);
  return filePath;
}

function pruneOldBackups(maxCount) {
  try {
    const files = fs
      .readdirSync(BACKUPS_DIR)
      .filter((f) => f.endsWith('.db') && f.startsWith('auto_local_'))
      .map((f) => ({ f, t: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    const toRemove = files.slice(maxCount);
    for (const item of toRemove) {
      fs.unlinkSync(path.join(BACKUPS_DIR, item.f));
    }
    if (toRemove.length) console.log(`[backup] Purgados ${toRemove.length} backup(s) antigo(s).`);
  } catch (err) {
    console.error('[backup] Erro ao purgar backups antigos:', err);
  }
}

function syncToZapier(filePath, fileName) {
  const webhookUrl = process.env.ZAPIER_BACKUP_WEBHOOK_URL || '';
  if (!webhookUrl) return;
  try {
    const https = require('https');
    const url = new URL(webhookUrl);
    const payload = JSON.stringify({
      fileName,
      backupDate: new Date().toISOString(),
      machineId: process.env.APP_STORAGE_NAMESPACE || 'local',
      sizeBytes: fs.statSync(filePath).size,
    });
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => { /* fire and forget */ });
    req.on('error', (e) => console.error('[backup] Zapier sync failed:', e.message));
    req.write(payload);
    req.end();
  } catch (e) {
    // non-critical
  }
}

function runBackup() {
  try {
    const filePath = createBackupFile();
    if (filePath) {
      console.log('[backup] Backup criado:', filePath);
      syncToZapier(filePath, path.basename(filePath));
      pruneOldBackups(14); // guarda os ultimos 14 backups automaticos
      return { ok: true, file: filePath };
    }
    return { ok: false };
  } catch (err) {
    console.error('[backup] Erro a criar backup:', err);
    return { ok: false, error: err.message };
  }
}

let timer = null;

// startBackupScheduler: arranca o agendador automatico (24h) num servidor vivo.
function startBackupScheduler() {
  if (timer) return; // evitar duplicacao em re-registros
  runBackup(); // backup imediato no arranque
  timer = setInterval(runBackup, BACKUP_INTERVAL_MS);
  if (timer.unref) timer.unref(); // nao impede o processo de terminar
  console.log('[backup] Agendador automatico ativo (intervalo: 24h).');
}

// Permite tambem execucao manual (node scripts/db_backup.js)
if (require.main === module) {
  const result = runBackup();
  console.log('[backup] Resultado:', JSON.stringify(result));
}

module.exports = { startBackupScheduler, runBackup };