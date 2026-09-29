// Restauro da base SQLite a partir de um backup.
//   node scripts/restore_from_backup.js            -> usa o backup automatico mais recente em backups/
//   node scripts/restore_from_backup.js <caminho>  -> restaura a partir de um ficheiro especifico
// Antes do restauro é feita uma copia de seguranca da base atual (pre_restore_local_*).
// NOTA: idealmente o servidor deve estar parado durante o restauro.

const fs = require('fs');
const path = require('path');
const { sqliteHeaderOk, verifyBackup } = require('./backup_helpers');

const DB_PATH = path.join(process.cwd(), 'prisma', 'local.db');
const BACKUPS_DIR = path.join(process.cwd(), 'backups');
const PRE_RESTORE_PREFIX = 'pre_restore_local_';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function timestampName(date) {
  return (
    '' + date.getFullYear() +
    pad2(date.getMonth() + 1) +
    pad2(date.getDate()) + '_' +
    pad2(date.getHours()) +
    pad2(date.getMinutes())
  );
}

function pickBackup(argPath) {
  if (argPath) {
    const p = path.resolve(process.cwd(), argPath);
    if (!fs.existsSync(p)) {
      console.error('[restore] ERRO: ficheiro de backup nao encontrado:', p);
      return null;
    }
    return p;
  }
  if (!fs.existsSync(BACKUPS_DIR)) return null;
  const candidates = fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith('.db'))
    .map((f) => ({ f, t: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return candidates.length ? path.join(BACKUPS_DIR, candidates[0].f) : null;
}

async function main() {
  const arg = process.argv[2];
  const backupPath = pickBackup(arg);

  if (!backupPath) {
    console.error('[restore] ERRO: nenhum backup encontrado em', BACKUPS_DIR);
    process.exitCode = 1;
    return;
  }

  console.log('[restore] Backup a restaurar:', backupPath);

  if (!sqliteHeaderOk(backupPath)) {
    console.error('[restore] ERRO: o backup nao e uma base SQLite valida.');
    process.exitCode = 1;
    return;
  }

  const pre = await verifyBackup(backupPath);
  if (!pre.ok) {
    console.error('[restore] ERRO: o backup nao abre corretamente ->', pre.error);
    process.exitCode = 1;
    return;
  }
  console.log('[restore] Backup verificavel ->', JSON.stringify(pre.counts));

  if (fs.existsSync(DB_PATH)) {
    if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    const safety = path.join(BACKUPS_DIR, `${PRE_RESTORE_PREFIX}${timestampName(new Date())}.db`);
    fs.copyFileSync(DB_PATH, safety);
    console.log('[restore] Copia de seguranca pre-restauro:', safety);
  }

  fs.copyFileSync(backupPath, DB_PATH);
  console.log('[restore] Base restaurada em', DB_PATH);

  const after = await verifyBackup(DB_PATH);
  if (after.ok) {
    console.log('[restore] RESULTADO: OK ->', JSON.stringify(after.counts));
  } else {
    console.error('[restore] RESULTADO: FALHA na verificacao pos-restauro ->', after.error);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[restore] Erro fatal:', e);
    process.exit(1);
  });
}