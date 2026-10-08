const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const net = require('net');
const { exec, execFileSync, execSync, spawn } = require('child_process');

const APP_DIR = __dirname;
const LOG_DIR = path.join(APP_DIR, 'terminal_logs');
const LOG_FILE = path.join(LOG_DIR, 'launcher.log');
const SERVER_LOG_FILE = path.join(LOG_DIR, 'server.log');
const DB_REL = path.join('prisma', 'local.db');
const CHECK_MODE = process.argv.includes('--check');

// Marcador PORTABLE.txt na pen (ou OREY_PENDRAVE=1) => modo portatil:
// BD ativa na pasta do utilizador (desempenho) + sincronizacao com a pen.
const PORTABLE_MODE =
  fs.existsSync(path.join(APP_DIR, 'PORTABLE.txt')) ||
  process.env.OREY_PENDRAVE === '1';

// =============================================
// DETETAR CAMINHO DO SERVIDOR STANDALONE
// =============================================
function findServerJs() {
  // Opcao 1: server.js na raiz (copia direta do standalone)
  if (fs.existsSync(path.join(APP_DIR, 'server.js'))) {
    return path.join(APP_DIR, 'server.js');
  }
  // Opcao 2: dentro de .next/standalone/
  const standalone = path.join(APP_DIR, '.next', 'standalone', 'server.js');
  if (fs.existsSync(standalone)) {
    return standalone;
  }
  return null;
}

// =============================================
// LOG PARA FICHEIRO + CONSOLA
// =============================================
let logStream = null;
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  rotateLog();
  pruneTerminalLogs();
  logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
} catch (e) {
  logStream = null;
}

function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function log(msg, kind) {
  const line = `[${ts()}] [${kind || 'INFO'}] ${msg}`;
  try { console.log(line); } catch (e) {}
  if (logStream) {
    try { logStream.write(line + '\n'); } catch (e) {}
  }
}

// =============================================
// ROTACAO DE LOGS / LIMPEZA (a pen nao enche)
// =============================================
const MAX_LOG_BYTES = 5 * 1024 * 1024;   // 5 MB por ficheiro
const KEEP_LOG_FILES = 5;                // 5 ficheiros rodados
const MAX_LOG_AGE_MS = 30 * 24 * 60 * 60 * 1000; // apagar logs com >30 dias

function rotateLog() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const size = fs.statSync(LOG_FILE).size;
    if (size <= MAX_LOG_BYTES) return;
    for (let i = KEEP_LOG_FILES - 1; i >= 1; i--) {
      const from = i === 1 ? LOG_FILE : path.join(LOG_DIR, `launcher.${i - 1}.log`);
      const to = path.join(LOG_DIR, `launcher.${i}.log`);
      if (fs.existsSync(from)) fs.renameSync(from, to);
    }
    fs.writeFileSync(LOG_FILE, '');
    try { console.log(`Log rotacionado (antigo: ${Math.round(size / 1024)} KB).`); } catch (e) {}
  } catch (e) {}
}

function pruneTerminalLogs() {
  try {
    const cutoff = Date.now() - MAX_LOG_AGE_MS;
    for (const f of fs.readdirSync(LOG_DIR)) {
      if (!f.endsWith('.log')) continue;
      const p = path.join(LOG_DIR, f);
      if (fs.statSync(p).mtimeMs < cutoff) {
        fs.unlinkSync(p);
        try { console.log(`Log antigo removido: ${f}`); } catch (e) {}
      }
    }
  } catch (e) {}
}

// =============================================
// APPROVAÇÃO DE DATABASE (funciona sem admin)
// =============================================
// Prefere prisma/local.db na pasta da aplicação. Se a pasta não for
// gravável (ACL, extração em pasta protegida, USB sem permissões),
// faz fallback para uma pasta do utilizador (LOCALAPPDATA) onde tem
// sempre permissões — sem precisar de ser administrador.
function isWritable(dir) {
  const probe = path.join(dir, '.orey_write_probe');
  try {
    fs.writeFileSync(probe, 'x');
    fs.unlinkSync(probe);
    return true;
  } catch (e) {
    return false;
  }
}

function pickDataDir() {
  const appDataDir = path.join(APP_DIR, 'prisma');
  const localDataBase = path.join(APP_DIR, DB_REL);

  const forceLocal =
    PORTABLE_MODE || process.env.OREY_FORCE_LOCAL_DB === '1' || process.env.OREY_DATA_DIR;

  // --- MODO PORTATIL: BD ativa na pasta do utilizador (desempenho) + sync com a pen ---
  if (forceLocal) {
    const base =
      process.env.OREY_DATA_DIR ||
      (process.platform === 'win32' && process.env.LOCALAPPDATA) ||
      path.join(os.homedir(), '.orey_acores');
    const dataDir = path.join(base, 'OreyAcores', 'prisma');
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      if (!isWritable(dataDir)) {
        log(`[DB] Sem permissões de escrita em ${dataDir}.`, 'ERRO');
        return { dir: appDataDir, dbPath: localDataBase, usedFallback: false, failed: true };
      }
      const dbPath = path.join(dataDir, 'local.db');

      if (fs.existsSync(dbPath)) {
        // Puxar da pen se esta estiver mais recente que a copia local
        if (fs.existsSync(localDataBase) &&
            fs.statSync(localDataBase).mtimeMs > fs.statSync(dbPath).mtimeMs + 1000) {
          fs.copyFileSync(localDataBase, dbPath);
          log('[DB] Base da pen mais recente — puxada para local.');
        }
      } else {
        // Primeira utilização: copiar da pen (ou criar base em branco)
        if (fs.existsSync(localDataBase)) {
          fs.copyFileSync(localDataBase, dbPath);
          try {
            const wal = localDataBase + '-wal';
            if (fs.existsSync(wal) && fs.statSync(wal).size > 0) {
              fs.copyFileSync(wal, dbPath + '-wal');
            }
          } catch (e) {}
        } else {
          fs.writeFileSync(dbPath, Buffer.alloc(0));
        }
      }
      try { fs.rmSync(dbPath + '-shm', { force: true }); } catch (e) {}

      log(`[DB] BD ativa (desempenho): ${dbPath}`);
      if (PORTABLE_MODE) log('[DB] Sincronizacao com a pen ativa (PORTABLE.txt).');
      return { dir: dataDir, dbPath, usedFallback: true, portableSync: PORTABLE_MODE, penDb: localDataBase };
    } catch (e) {
      log(`[DB] ERRO ao preparar pasta de dados local: ${e.message}`, 'ERRO');
      return { dir: appDataDir, dbPath: localDataBase, usedFallback: false, failed: true };
    }
  }

  // Sem base de dados: comportamento original (cria-la em branco na pasta da app).
  if (!fs.existsSync(localDataBase)) {
    return { dir: appDataDir, dbPath: localDataBase, usedFallback: false };
  }

  if (isWritable(appDataDir)) {
    return { dir: appDataDir, dbPath: localDataBase, usedFallback: false };
  }

  // Base existe mas a pasta não é gravável: usar pasta do utilizador
  const base2 =
    process.env.OREY_DATA_DIR ||
    (process.platform === 'win32' && process.env.LOCALAPPDATA) ||
    path.join(os.homedir(), '.orey_acores');
  const dataDir2 = path.join(base2, 'OreyAcores', 'prisma');
  try {
    fs.mkdirSync(dataDir2, { recursive: true });
    if (!isWritable(dataDir2)) {
      log(`[DB] Sem permissões de escrita em ${appDataDir} nem em ${dataDir2}`);
      return { dir: appDataDir, dbPath: localDataBase, usedFallback: false, failed: true };
    }
    const dbPath = path.join(dataDir2, 'local.db');
    if (!fs.existsSync(dbPath)) {
      fs.copyFileSync(localDataBase, dbPath);
      try {
        const wal = localDataBase + '-wal';
        if (fs.existsSync(wal) && fs.statSync(wal).size > 0) {
          fs.copyFileSync(wal, dbPath + '-wal');
        }
      } catch (e) {}
      try { fs.rmSync(dbPath + '-shm', { force: true }); } catch (e) {}
    }
    log(`[DB] Pasta da aplicação não gravável (ACL/perm). A usar dados em: ${dataDir2}`);
    return { dir: dataDir2, dbPath, usedFallback: true };
  } catch (e) {
    log(`[DB] ERRO ao preparar pasta de dados: ${e.message}`, 'ERRO');
    return { dir: appDataDir, dbPath: localDataBase, usedFallback: false, failed: true };
  }
}

// =============================================
// BASE DE DADOS REMOTA (PostgreSQL / Supabase)
// =============================================
// Por omissao o standalone corre em SQLite (prisma/local.db) para funcionar
// offline. Quando existe uma connection string PostgreSQL no .env
// (SUPABASE_DATABASE_URL, DIRECT_URL, POSTGRES_URL, ...), essa passa a ser a BD
// ativa: e exatamente a mesma que o deploy na Vercel usa, por isso o standalone
// e o Vercel leem e escrevem no mesmo sitio (sincronia real, sem copias).
// OREY_DB_MODE=sqlite|postgres forca um dos lados, util para voltar ao modo
// offline mesmo com a connection string configurada.
const POSTGRES_ENV_KEYS = [
  'SUPABASE_DATABASE_URL',
  'DIRECT_URL',
  'POSTGRES_PRISMA_URL',
  'VERCEL_POSTGRES_PRISMA_URL',
  'POSTGRES_URL',
  'VERCEL_POSTGRES_URL',
  'POSTGRES_URL_NON_POOLING',
  'NEON_DATABASE_URL',
  'DATABASE_URL',
];

function isPostgresUrl(value) {
  return typeof value === 'string' && /^postgres(ql)?:\/\//i.test(value.trim());
}

function resolveRemoteDatabase() {
  for (const key of POSTGRES_ENV_KEYS) {
    const value = readEnvValue(key);
    if (isPostgresUrl(value)) {
      return { url: value.trim(), source: key };
    }
  }
  return { url: null, source: null };
}

function envFlagEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value == null ? '' : value).trim().toLowerCase());
}

function maskConnectionString(url) {
  try {
    const parsed = new URL(url);
    const auth = parsed.username ? `${parsed.username}:***@` : '';
    return `${parsed.protocol}//${auth}${parsed.host}${parsed.pathname}`;
  } catch (e) {
    return 'postgresql://***';
  }
}

const REMOTE_DB = resolveRemoteDatabase();
const DB_MODE_PREFERENCE = String(readEnvValue('OREY_DB_MODE') || '').trim().toLowerCase();
const FORCE_LOCAL_DB =
  DB_MODE_PREFERENCE === 'sqlite' ||
  envFlagEnabled(readEnvValue('OREY_FORCE_LOCAL_DB')) ||
  envFlagEnabled(process.env.OREY_FORCE_LOCAL_DB);
const REMOTE_DB_MODE =
  DB_MODE_PREFERENCE === 'postgres' || (!FORCE_LOCAL_DB && Boolean(REMOTE_DB.url));

if (DB_MODE_PREFERENCE && !['sqlite', 'postgres'].includes(DB_MODE_PREFERENCE)) {
  log(`[DB] OREY_DB_MODE invalido ("${DB_MODE_PREFERENCE}") — a usar deteccao automatica.`, 'ERRO');
}
if (DB_MODE_PREFERENCE === 'postgres' && !REMOTE_DB.url) {
  log('[DB] ERRO: OREY_DB_MODE=postgres mas nao existe nenhuma connection string PostgreSQL.', 'ERRO');
  log('[DB] Define SUPABASE_DATABASE_URL no .env (ou nas variaveis de ambiente).', 'ERRO');
  process.exit(1);
}

function remoteDbDescriptor() {
  return {
    dir: path.join(APP_DIR, 'prisma'),
    dbPath: null,
    usedFallback: false,
    remote: true,
    source: REMOTE_DB.source,
    url: REMOTE_DB.url,
  };
}

const DB = REMOTE_DB_MODE ? remoteDbDescriptor() : pickDataDir();
const BACKUPS_DIR = DB.usedFallback ? path.join(DB.dir, '..', 'backups')
  : (isWritable(path.join(APP_DIR, 'backups')) ? path.join(APP_DIR, 'backups') : DB.dir);

function ensureBackupsDir() {
  try { fs.mkdirSync(BACKUPS_DIR, { recursive: true }); } catch (e) {}
}

// =============================================
// VERIFICACAO DE ESPACO EM DISCO
// =============================================
function checkDiskSpace() {
  try {
    const st = fs.statfsSync(APP_DIR);
    const freeMB = Math.round((st.bavail * st.bsize) / (1024 * 1024));
    if (freeMB < 500) {
      log(`[DISCO] ATENCAO: restam apenas ${freeMB} MB na unidade da aplicacao!`, 'ERRO');
    } else {
      log(`[DISCO] Espaco livre: ${freeMB} MB.`);
    }
    return freeMB;
  } catch (e) {
    // Fallback via PowerShell (Windows)
    try {
      const driveLetter = path.parse(APP_DIR).root.replace(':\\', '');
      const out = execSync(
        `powershell -NoProfile -Command "(Get-PSDrive -Name '${driveLetter}').Free"`,
        { encoding: 'utf8', timeout: 5000 }
      );
      const freeBytes = parseInt(out.trim(), 10);
      if (!isNaN(freeBytes)) {
        const freeMB = Math.round(freeBytes / (1024 * 1024));
        log(`[DISCO] Espaco livre: ${freeMB} MB.`);
        return freeMB;
      }
    } catch (e2) {}
    return null;
  }
}

console.log('================================================');
console.log('===  GESTOR NAVAL OREY TECNICA - Acores  ===');
console.log('================================================');
log(`Diretorio: ${APP_DIR}`);
log(`Node.js: ${process.version}`);
log(`Plataforma: ${process.platform} ${process.arch}`);
if (REMOTE_DB_MODE) {
  log(`Base de dados: PostgreSQL remota ${maskConnectionString(REMOTE_DB.url)} (via ${REMOTE_DB.source})`);
  log('Modo: BD partilhada com o Vercel — os dados sao os mesmos nos dois lados.');
} else {
  log(`Base de dados: ${DB.dbPath}${DB.usedFallback ? ' (fallback do utilizador)' : ''}`);
}
log(`Backups: ${BACKUPS_DIR}`);
log(`Log: ${LOG_FILE}`);
checkDiskSpace();
console.log('');

// =============================================
// CAPTURA DE ERROS GLOBAIS (não morre em silêncio)
// =============================================
process.on('uncaughtException', (err) => {
  log(`UNCAUGHT EXCEPTION: ${err && err.stack ? err.stack : err}`, 'ERRO');
});
process.on('unhandledRejection', (reason) => {
  log(`UNHANDLED REJECTION: ${reason && reason.stack ? reason.stack : reason}`, 'ERRO');
});

// =============================================
// BACKUP AUTOMATICO
// =============================================
function backupDatabase(maxKeepFloor = 10) {
  if (!DB.dbPath) return;
  if (!fs.existsSync(DB.dbPath)) return;
  ensureBackupsDir();
  try {
    const now = new Date();
    const tsS = now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + '_' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0');
    const dstPath = path.join(BACKUPS_DIR, `local_${tsS}.db`);
    fs.copyFileSync(DB.dbPath, dstPath);
    log(`Backup criado: ${dstPath}`);
    pruneBackupsDir(maxKeepFloor);
  } catch (err) {
    log(`Aviso backup: ${err.message}`);
  }
}

function pruneBackupsDir(maxKeep = 10) {
  try {
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter((f) => f.endsWith('.db'))
      .map((f) => ({ f, t: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const { f } of files.slice(maxKeep)) {
      fs.unlinkSync(path.join(BACKUPS_DIR, f));
      log(`Backup antigo removido: ${f}`);
    }
  } catch (err) {
    log(`Aviso rotação backups: ${err.message}`);
  }
}

backupDatabase();

// =============================================
// TESTE DE RESTAURO DO BACKUP (valida que os dados voltam)
// =============================================
function verifyLatestBackup() {
  if (REMOTE_DB_MODE) return;
  const testScript = path.join(APP_DIR, 'scripts', 'test_restore_backup.cjs');
  if (!fs.existsSync(testScript)) return;
  try {
    exec(
      `"${process.execPath}" "${testScript}"`,
      { cwd: APP_DIR, timeout: 180000, windowsHide: true },
      (err, stdout, stderr) => {
        const out = String(stdout || '').trim();
        const errOut = String(stderr || '').trim();
        if (err) {
          log(`[Backup] Teste de restauro FALHOU: ${err.message}${errOut ? ' | ' + errOut : ''}`, 'ERRO');
          out.split('\n').filter(Boolean).forEach((l) => log(`[Backup] ${l.trim()}`));
        } else {
          const resumo = out.split('\n').filter((l) => l.includes('RESULTADO')).join(' ');
          log(`[Backup] Teste de restauro: ${resumo || 'OK'}`);
        }
      }
    );
  } catch (e) {
    log(`[Backup] Teste de restauro ignorado: ${e.message}`);
  }
}

// Diferido para nao atrasar o arranque; repete a cada 24h.
const restoreTestInitial = setTimeout(verifyLatestBackup, 2 * 60 * 1000);
restoreTestInitial.unref && restoreTestInitial.unref();
const restoreTestTimer = setInterval(verifyLatestBackup, 24 * 60 * 60 * 1000);
restoreTestTimer.unref && restoreTestTimer.unref();

// =============================================
// SINCRONIZACAO GOOGLE DRIVE (base de dados)
// =============================================
function readEnvValue(key) {
  if (process.env[key] != null && process.env[key] !== '') return String(process.env[key]).trim();
  for (const file of ['.env', '.env.local']) {
    try {
      const envPath = path.join(APP_DIR, file);
      if (!fs.existsSync(envPath)) continue;
      const content = fs.readFileSync(envPath, 'utf8');
      const m = content.split('\n').map((l) => l.trim()).find((l) => l.startsWith(key + '='));
      if (m) return m.split('=').slice(1).join('=').replace(/^["']|["']$/g, '').trim();
    } catch (e) {}
  }
  return '';
}

function loadRcloneBinNameFromEnv() {
  return readEnvValue('RCLONE_BIN_NAME');
}

// =============================================
// DESACTIVAR O SYNC DO GOOGLE DRIVE
// =============================================
// Pôr OREY_GDRIVE_SYNC=0 (no .env ou .env.local, ou como variável do sistema)
// desliga todo o sync automático com o Google Drive via rclone (pull no arranque,
// push periódico e push no fecho). A BD continua a funcionar apenas em local.
// GDRIVE_SILENT=1 mantém-se aceite por compatibilidade.
function isGdriveSyncDisabled() {
  // Em modo BD remota nao ha ficheiro SQLite local para sincronizar: o
  // "sync" e a propria BD partilhada com o Vercel.
  if (REMOTE_DB_MODE) return true;
  const flag = readEnvValue('OREY_GDRIVE_SYNC').toLowerCase();
  if (['0', 'false', 'off', 'no', 'disabled'].includes(flag)) return true;
  if (readEnvValue('GDRIVE_SILENT') === '1') return true;
  return false;
}

const GDRIVE_SYNC_DISABLED = isGdriveSyncDisabled();
if (REMOTE_DB_MODE) {
  log('[Drive] Sync do Google Drive ignorado — a BD ativa e a PostgreSQL partilhada com o Vercel.');
} else if (GDRIVE_SYNC_DISABLED) {
  log('[Drive] Sync com o Google Drive DESACTIVADO (OREY_GDRIVE_SYNC=0). A trabalhar apenas em local.');
}

function resolveRclonePath() {
  const names = [];
  const configured = loadRcloneBinNameFromEnv();
  if (configured) names.push(configured);
  names.push('rclone.exe', 'rclone');
  for (const name of names) {
    const candidate = path.join(APP_DIR, 'bin', name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(APP_DIR, 'bin', 'rclone.exe');
}

function runSync(mode, silent = false) {
  if (GDRIVE_SYNC_DISABLED) return;
  try {
    const syncScript = path.join(APP_DIR, 'scripts', 'sync_gdrive.cjs');
    if (!fs.existsSync(syncScript)) return;
    const rclonePath = resolveRclonePath();
    if (!fs.existsSync(rclonePath)) {
      if (!silent) log('[Drive] rclone nao encontrado; a continuar em modo local/offline.');
      return;
    }
    if (silent) return;
    log(`[Drive] A sincronizar base de dados (${mode})...`);
    execFileSync(process.execPath, [syncScript, `--${mode}`], {
      cwd: APP_DIR,
      stdio: 'ignore',
      timeout: 60000,
      env: { ...process.env, GDRIVE_DB_LOCAL_PATH: DB.dbPath },
    });
  } catch (err) {
    log(`[Drive] Sync ${mode} ignorado: ${err.message || err}`);
    if (err && /EPERM|EACCES|block/i.test(String(err.message || ''))) {
      log('[Drive] Possivel bloqueio do rclone pelo programa de protecao (ver VERIFICAR_RCLONE.bat).', 'ERRO');
    }
  }
}

function runSyncDetached(mode) {
  if (GDRIVE_SYNC_DISABLED) return;
  try {
    const syncScript = path.join(APP_DIR, 'scripts', 'sync_gdrive.cjs');
    if (!fs.existsSync(syncScript)) return;
    const rclonePath = resolveRclonePath();
    if (!fs.existsSync(rclonePath)) {
      log(`[Drive] rclone não encontrado (${path.basename(rclonePath)}); a continuar em modo local/offline.`);
      return;
    }
    log(`[Drive] A sincronizar base de dados (${mode})...`);
    const child = spawn(process.execPath, [syncScript, `--${mode}`], {
      cwd: APP_DIR,
      stdio: 'ignore',
      windowsHide: true,
      detached: true,
      env: { ...process.env, GDRIVE_DB_LOCAL_PATH: DB.dbPath },
    });
    child.on('error', (err) => {
      log(`[Drive] Sync ${mode} erro: ${err.message}`);
      if (err && /EPERM|EACCES|block/i.test(String(err.message || ''))) {
        log('[Drive] Possivel bloqueio do rclone pelo programa de protecao (ver VERIFICAR_RCLONE.bat).', 'ERRO');
      }
    });
    child.unref();
  } catch (err) {
    log(`[Drive] Sync ${mode} ignorado: ${err.message || err}`);
  }
}

// Descarregar a BD mais recente do Google Drive antes de arrancar (nao bloqueante)
if (!GDRIVE_SYNC_DISABLED) {
  runSyncDetached('pull');

  // Push periódico enquanto a aplicação estiver a correr
  const SYNC_INTERVAL_MS = (parseInt(readEnvValue('GDRIVE_SYNC_MINUTES'), 10) || 10) * 60 * 1000;
  const gdriveTimer = setInterval(() => runSyncDetached('push'), SYNC_INTERVAL_MS);
  gdriveTimer.unref && gdriveTimer.unref();
}

// =============================================
// SINCRONIZACAO COM A PEN (modo portatil)
// =============================================
function syncBackToPendrive() {
  if (!DB.portableSync || !DB.penDb) return;
  try {
    if (!fs.existsSync(DB.dbPath)) return;
    fs.mkdirSync(path.dirname(DB.penDb), { recursive: true });
    fs.copyFileSync(DB.dbPath, DB.penDb);
    try {
      const wal = DB.dbPath + '-wal';
      if (fs.existsSync(wal) && fs.statSync(wal).size > 0) {
        fs.copyFileSync(wal, DB.penDb + '-wal');
      }
    } catch (e) {}
    try { fs.rmSync(DB.penDb + '-shm', { force: true }); } catch (e) {}
    log('[DB] Base de dados sincronizada com a pen.');
  } catch (e) {
    log(`[DB] Aviso a sincronizar com a pen: ${e.message}`);
  }
}

const penSyncTimer = setInterval(() => {
  if (DB.portableSync) syncBackToPendrive();
}, 2 * 60 * 1000);
penSyncTimer.unref && penSyncTimer.unref();

// Push no fecho
function pushOnExit() {
  runSyncDetached('push');
  syncBackToPendrive();
}
process.on('SIGINT', () => { pushOnExit(); stopChild(); process.exit(0); });
process.on('SIGTERM', () => { pushOnExit(); stopChild(); process.exit(0); });

// =============================================
// CARREGAR .env (parser robusto)
// =============================================
function loadEnv(fileName) {
  const envPath = path.join(APP_DIR, fileName);
  if (!fs.existsSync(envPath)) return;

  log(`A carregar ${fileName}...`);
  try {
    const content = fs.readFileSync(envPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    content.split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;

      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) return;

      const key = line.substring(0, eqIndex).trim();
      let val = line.substring(eqIndex + 1).trim();

      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length - 1);
      }

      if (key === 'DATABASE_URL') return;

      process.env[key] = val;
    });
  } catch (err) {
    log(`Erro ao ler ${fileName}: ${err.message}`, 'ERRO');
  }
}

loadEnv('.env');
loadEnv('.env.local');

// =============================================
// GARANTIR VARIAVEIS DE AMBIENTE
// =============================================
if (!process.env.HOME) {
  process.env.HOME = os.homedir() || process.env.USERPROFILE || path.join(os.tmpdir(), 'home');
}
if (!process.env.XDG_DATA_HOME) {
  process.env.XDG_DATA_HOME = path.join(process.env.HOME, '.local', 'share');
}
process.env.NODE_ENV = 'production';

// =============================================
// DATABASE_URL - PostgreSQL remota ou ficheiro SQLite local
// =============================================
// Probe TCP simples: falhar aqui significa DNS/rede/bloqueio de firewall, e
// ajuda a distinguir "sem Internet" de "password errada" nos diagnosticos.
function checkRemoteDatabaseReachability(url) {
  let host = null;
  let port = 5432;
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    if (parsed.port) port = parseInt(parsed.port, 10);
  } catch (e) {
    return;
  }
  if (!host) return;
  const socket = new net.Socket();
  let settled = false;
  const done = (ok, message) => {
    if (settled) return;
    settled = true;
    try { socket.destroy(); } catch (e) {}
    if (ok) log(`[DB] Servidor PostgreSQL alcancavel em ${host}:${port}.`);
    else log(`[DB] Nao foi possivel ligar a ${host}:${port} — ${message}`, 'ERRO');
  };
  socket.setTimeout(5000);
  socket.once('connect', () => done(true));
  socket.once('timeout', () => done(false, 'tempo esgotado'));
  socket.once('error', (err) => done(false, err.message));
  try {
    socket.connect(port, host);
  } catch (e) {
    done(false, e.message);
  }
}

if (REMOTE_DB_MODE) {
  process.env.DATABASE_URL = REMOTE_DB.url;
  if (!process.env.SUPABASE_DATABASE_URL) process.env.SUPABASE_DATABASE_URL = REMOTE_DB.url;
  log(`DATABASE_URL: ${maskConnectionString(REMOTE_DB.url)} (via ${REMOTE_DB.source})`);
  checkRemoteDatabaseReachability(REMOTE_DB.url);
} else {
  process.env.DATABASE_URL = 'file:' + DB.dbPath.replace(/\\/g, '/');
  log(`DATABASE_URL: ${process.env.DATABASE_URL}`);
}
log('Prisma engine: OK');

// =============================================
// PORTA - ESCOLHA AUTOMATICA (nao mata processos)
// =============================================
const PID_FILE = path.join(LOG_DIR, 'server.pid');
let PORT = parseInt(process.env.PORT, 10) || 3000;

function getBusyPorts() {
  const busy = new Set();
  try {
    const out = execSync('netstat -ano', { encoding: 'utf8', timeout: 5000 });
    for (const line of out.split('\n')) {
      if (!/LISTENING/i.test(line)) continue;
      const m = line.match(/:(\d+)\s+/);
      if (m) busy.add(parseInt(m[1], 10));
    }
  } catch (e) {}
  return busy;
}

function closePreviousInstance() {
  try {
    if (!fs.existsSync(PID_FILE)) return;
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (!pid || !Number.isInteger(pid) || pid === process.pid) return;
    try {
      const cmd = execSync(
        `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`,
        { encoding: 'utf8', timeout: 5000 }
      );
      if (cmd.toLowerCase().includes('node') && cmd.includes(APP_DIR)) {
        log(`A fechar instancia anterior (PID ${pid})...`);
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore', timeout: 5000 });
        execSync('ping 127.0.0.1 -n 2 >nul', { stdio: 'ignore', timeout: 3000 });
      }
    } catch (e) {
      log(`PID anterior ja nao existe ou nao e da aplicacao.`);
    }
  } catch (e) {}
}

function writePidFile() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(PID_FILE, String(process.pid));
  } catch (e) {}
}

closePreviousInstance();

// Se a porta pretendida estiver ocupada, escolher outra livre
const busyPorts = getBusyPorts();
const requestedPort = parseInt(process.env.PORT, 10) || 3000;
if (busyPorts.has(requestedPort)) {
  let chosen = 0;
  for (let p = requestedPort; p < requestedPort + 20; p++) {
    if (!busyPorts.has(p)) { chosen = p; break; }
  }
  PORT = chosen || (requestedPort + 20 + Math.floor(Math.random() * 100));
  log(`Porta ${requestedPort} ocupada — a usar porta ${PORT}.`);
}

process.env.PORT = String(PORT);

const authUrl = `http://localhost:${PORT}`;
process.env.AUTH_URL = authUrl;
process.env.NEXTAUTH_URL = authUrl;
log(`Porta: ${PORT} (livre)`);
log(`URL: ${authUrl}`);
writePidFile();

// Escrever porta num ficheiro simples para scripts .bat lerem
try { fs.writeFileSync(path.join(LOG_DIR, 'server.port'), String(PORT)); } catch (e) {}

if (CHECK_MODE) {
  console.log('');
  console.log('== RESUMO DE VERIFICACAO ==');
  console.log('Modo BD            :', REMOTE_DB_MODE ? 'PostgreSQL remota (Supabase/Vercel)' : 'SQLite local (offline)');
  if (REMOTE_DB_MODE) {
    console.log('Origem da ligacao  :', REMOTE_DB.source);
    console.log('Servidor BD        :', maskConnectionString(REMOTE_DB.url));
  }
  console.log('Base de dados     :', DB.dbPath || '(n/a — BD remota)');
  console.log('Fallback utilizar :', DB.usedFallback);
  console.log('Modo portatil     :', PORTABLE_MODE ? 'SIM (BD local + sync pen)' : 'NAO');
  console.log('Diretoria backups :', BACKUPS_DIR);
  console.log('Ficheiro de log   :', LOG_FILE);
  console.log('Porta             :', PORT);
  console.log('DB dir gravavel   :', isWritable(DB.dir));
  console.log('App dir gravavel  :', isWritable(APP_DIR));
  console.log('local.db existe   :', DB.dbPath ? fs.existsSync(DB.dbPath) : 'n/a');
  console.log('node_modules      :', fs.existsSync(path.join(APP_DIR, 'node_modules')));
  console.log('server.js (raiz)  :', fs.existsSync(path.join(APP_DIR, 'server.js')));
  console.log('standalone server :', fs.existsSync(path.join(APP_DIR, '.next', 'standalone', 'server.js')));
  console.log('Prisma engine     :', (() => {
    const dir = path.join(APP_DIR, 'node_modules', '.prisma', 'client');
    try {
      return fs.readdirSync(dir).filter((f) => f.startsWith('query_engine') && f.endsWith('.node')).join(', ') || 'nao encontrado';
    } catch (e) { return 'nao encontrado'; }
  })());
  console.log('bin\\node.exe      :', fs.existsSync(path.join(APP_DIR, 'bin', 'node.exe')));
  console.log('Node.js sistema   :', (() => { try { return require('child_process').execSync('node --version', { encoding: 'utf8' }).trim(); } catch(e) { return 'nao encontrado'; } })());
  try {
    const st = fs.statfsSync(APP_DIR);
    console.log('Espaco livre      :', Math.round((st.bavail * st.bsize) / (1024 * 1024)), 'MB');
  } catch (e) {}
  console.log('');
  log('[Check] Verificacao concluida — a sair sem iniciar o servidor.');
  process.exit(0);
}

// =============================================
// VALIDAR STANDALONE
// =============================================
const SERVER_JS = findServerJs();
if (!SERVER_JS) {
  log('ERRO: server.js nao encontrado!', 'ERRO');
  log('  Opcao 1: Execute REBUILD_USB.bat para construir o standalone.', 'ERRO');
  log('  Opcao 2: Copie a pasta .next/standalone/ da maquina de desenvolvimento.', 'ERRO');
  console.log('');
  console.log('[ERRO] Build standalone nao encontrado.');
  console.log('  Execute REBUILD_USB.bat ou copie .next/standalone/ da maquina original.');
  console.log('');
  process.exit(1);
}
log(`Servidor: ${SERVER_JS}`);

// Copiar server.js para raiz se estiver so no standalone (para compatibilidade)
if (SERVER_JS !== path.join(APP_DIR, 'server.js')) {
  try {
    fs.copyFileSync(SERVER_JS, path.join(APP_DIR, 'server.js'));
    log('server.js copiado para raiz (compatibilidade).');
  } catch (e) {
    log(`Aviso: nao foi possivel copiar server.js para raiz: ${e.message}`);
  }
}

// Verificar dependencias essenciais do standalone
const standaloneDir = path.dirname(SERVER_JS);
const criticalFiles = [
  path.join(standaloneDir, '.next'),
  path.join(standaloneDir, 'node_modules'),
];
for (const f of criticalFiles) {
  if (!fs.existsSync(f)) {
    log(`AVISO: pasta critica nao encontrada: ${f}`, 'ERRO');
  }
}

// =============================================
// SUPERVISOR/INICIAR SERVIDOR NEXT.JS
// =============================================
console.log('');
log('A iniciar servidor (standalone)...');
console.log('');

let child = null;
let shuttingDown = false;
let serverLogStream = null;

function stopChild() {
  if (child && !child.killed) {
    try { child.kill(); } catch (e) {}
  }
}

// A saida do servidor (stdout+stderr) e' guardada em server.log para permitir
// diagnosticar crashes na outra maquina (antes perdia-se com stdio: 'inherit').
function getServerLogStream() {
  if (serverLogStream) return serverLogStream;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const st = fs.existsSync(SERVER_LOG_FILE) ? fs.statSync(SERVER_LOG_FILE) : null;
    if (st && st.size > MAX_LOG_BYTES) {
      try { fs.renameSync(SERVER_LOG_FILE, path.join(LOG_DIR, 'server.1.log')); } catch (e) {}
    }
    serverLogStream = fs.createWriteStream(SERVER_LOG_FILE, { flags: 'a' });
  } catch (e) {
    serverLogStream = null;
  }
  return serverLogStream;
}

function pipeServerOutput(chunk) {
  const text = chunk.toString();
  try { process.stdout.write(text); } catch (e) {}
  const s = getServerLogStream();
  if (s) {
    try { s.write(`[${ts()}] ${text}`); } catch (e) {}
  }
}

let lastStartAt = 0;

function startChild(attempt) {
  if (shuttingDown) return;
  lastStartAt = Date.now();
  log(`[Supervisor] Tentativa ${attempt} de iniciar servidor...`);
  const s = getServerLogStream();
  if (s) {
    try {
      s.write(`\n===== Arranque do servidor (tentativa ${attempt}) em ${new Date().toISOString()} =====\n`);
    } catch (e) {}
  }
  child = spawn(process.execPath, [SERVER_JS], {
    cwd: APP_DIR,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
  });
  if (child.stdout) child.stdout.on('data', pipeServerOutput);
  if (child.stderr) child.stderr.on('data', pipeServerOutput);
  child.on('error', (err) => {
    log(`[Supervisor] Erro a iniciar servidor: ${err.message}`, 'ERRO');
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    log(`[Supervisor] Servidor terminou (code=${code}, signal=${signal})`, 'ERRO');
    const s2 = getServerLogStream();
    if (s2) {
      try { s2.write(`\n===== Servidor terminou em ${new Date().toISOString()} (code=${code}, signal=${signal}) =====\n`); } catch (e) {}
    }
  });
}

// =============================================
// HEALTH CHECK / WATCHDOG
// =============================================
function healthCheck(cb) {
  const req = http.get(`http://127.0.0.1:${PORT}/api/health`, { timeout: HEALTH_TIMEOUT_MS }, (res) => {
    res.resume();
    cb(res.statusCode === 200);
  });
  req.on('error', () => cb(false));
  req.on('timeout', () => { req.destroy(); cb(false); });
}

let consecutiveFailures = 0;
let recovered = false;
let restarts = 0;
const MAX_RESTARTS = 3;
const WATCHDOG_MS = 15000;
// O /api/health faz verificações ao SQLite (pode demorar em arranque a frio);
// um timeout de 3s levava o watchdog a matar o servidor à primeira lentidão.
const HEALTH_TIMEOUT_MS = 10000;
// Período de graça após cada arranque: as falhas iniciais (compilação da rota,
// warmup Prisma, PRAGMAs) não contam para reiniciar o servidor.
const STARTUP_GRACE_MS = 60000;

function watchdogTick() {
  if (shuttingDown) return;
  healthCheck((ok) => {
    if (ok) {
      consecutiveFailures = 0;
      if (!recovered) {
        recovered = true;
        log('[Health] Servidor responde em /api/health');
        if (restarts === 0) openBrowser();
      }
    } else {
      if (Date.now() - lastStartAt < STARTUP_GRACE_MS) {
        // Servidor acabou de arrancar: aguardar mais tempo antes de reiniciar.
        return;
      }
      consecutiveFailures++;
      if (consecutiveFailures >= 4) {
        consecutiveFailures = 0;
        if (restarts < MAX_RESTARTS) {
          restarts++;
          const waitMs = [3000, 10000, 30000][Math.min(restarts - 1, 2)];
          log(`[Watchdog] Servidor não responde após ${consecutiveFailures + 4} verificações. Reinício ${restarts}/${MAX_RESTARTS} em ${waitMs / 1000}s...`, 'ERRO');
          stopChild();
          setTimeout(() => startChild(restarts + 1), waitMs);
        } else {
          log('[Watchdog] Limite de reinícios atingido. Consulte o log para diagnóstico.', 'ERRO');
        }
      }
    }
  });
}

function openBrowser() {
  try {
    const startCmd = process.platform === 'win32'
      ? `start "" http://localhost:${PORT}`
      : `xdg-open http://localhost:${PORT}`;
    exec(startCmd, (err) => {
      if (err) log(`Erro ao abrir navegador: ${err.message}`);
    });
  } catch (e) {
    log(`Erro ao abrir navegador: ${e.message}`);
  }
}

setInterval(watchdogTick, WATCHDOG_MS);
startChild(1);
watchdogTick(); // primeira verificação imediata

console.log('');
log(`Servidor a iniciar em http://localhost:${PORT} — mantenha esta janela aberta.`);
log(`A registar atividade e erros em: ${LOG_FILE}`);
console.log('');