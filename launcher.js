const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { exec, execFileSync, execSync, spawn } = require('child_process');

const APP_DIR = __dirname;
const LOG_DIR = path.join(APP_DIR, 'terminal_logs');
const LOG_FILE = path.join(LOG_DIR, 'launcher.log');
const DB_REL = path.join('prisma', 'local.db');
const CHECK_MODE = process.argv.includes('--check');

// =============================================
// LOG PARA FICHEIRO + CONSOLA
// =============================================
let logStream = null;
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
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

  // Sem base de dados: comportamento original (cria-la em branco na pasta da app).
  if (!fs.existsSync(localDataBase)) {
    return { dir: appDataDir, dbPath: localDataBase, usedFallback: false };
  }

  if (isWritable(appDataDir)) {
    return { dir: appDataDir, dbPath: localDataBase, usedFallback: false };
  }

  // Base existe mas a pasta não é gravável: usar pasta do utilizador
  const base =
    process.env.OREY_DATA_DIR ||
    (process.platform === 'win32' && process.env.LOCALAPPDATA) ||
    path.join(os.homedir(), '.orey_acores');
  const dataDir = path.join(base, 'OreyAcores', 'prisma');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    if (!isWritable(dataDir)) {
      log(`[DB] Sem permissões de escrita em ${appDataDir} nem em ${dataDir}`);
      return { dir: appDataDir, dbPath: localDataBase, usedFallback: false, failed: true };
    }
    const dbPath = path.join(dataDir, 'local.db');
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
    log(`[DB] Pasta da aplicação não gravável (ACL/perm). A usar dados em: ${dataDir}`);
    return { dir: dataDir, dbPath, usedFallback: true };
  } catch (e) {
    log(`[DB] ERRO ao preparar pasta de dados: ${e.message}`, 'ERRO');
    return { dir: appDataDir, dbPath: localDataBase, usedFallback: false, failed: true };
  }
}

const DB = pickDataDir();
const BACKUPS_DIR = DB.usedFallback ? path.join(DB.dir, '..', 'backups')
  : (isWritable(path.join(APP_DIR, 'backups')) ? path.join(APP_DIR, 'backups') : DB.dir);

function ensureBackupsDir() {
  try { fs.mkdirSync(BACKUPS_DIR, { recursive: true }); } catch (e) {}
}

console.log('================================================');
console.log('===  GESTOR NAVAL OREY TECNICA - Acores  ===');
console.log('================================================');
log(`Diretorio: ${APP_DIR}`);
log(`Node.js: ${process.version}`);
log(`Plataforma: ${process.platform} ${process.arch}`);
log(`Base de dados: ${DB.dbPath}${DB.usedFallback ? ' (fallback do utilizador)' : ''}`);
log(`Backups: ${BACKUPS_DIR}`);
log(`Log: ${LOG_FILE}`);
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
// SINCRONIZACAO GOOGLE DRIVE (base de dados)
// =============================================
function runSync(mode, silent = false) {
  try {
    const syncScript = path.join(APP_DIR, 'scripts', 'sync_gdrive.cjs');
    if (!fs.existsSync(syncScript)) return;
    const rclonePath = path.join(APP_DIR, 'bin', process.platform === 'win32' ? 'rclone.exe' : 'rclone');
    if (!fs.existsSync(rclonePath)) {
      if (!silent) log('[Drive] rclone nao encontrado; a continuar em modo local/offline.');
      return;
    }
    if (silent && process.env.GDRIVE_SILENT === '1') return;
    log(`[Drive] A sincronizar base de dados (${mode})...`);
    execFileSync(process.execPath, [syncScript, `--${mode}`], {
      cwd: APP_DIR,
      stdio: 'ignore',
      timeout: 900000,
      env: { ...process.env, GDRIVE_DB_LOCAL_PATH: DB.dbPath },
    });
  } catch (err) {
    log(`[Drive] Sync ${mode} ignorado: ${err.message || err}`);
  }
}

function runSyncDetached(mode) {
  try {
    const syncScript = path.join(APP_DIR, 'scripts', 'sync_gdrive.cjs');
    if (!fs.existsSync(syncScript)) return;
    const rclonePath = path.join(APP_DIR, 'bin', process.platform === 'win32' ? 'rclone.exe' : 'rclone');
    if (!fs.existsSync(rclonePath)) return;
    log(`[Drive] A sincronizar base de dados (${mode})...`);
    const child = spawn(process.execPath, [syncScript, `--${mode}`], {
      cwd: APP_DIR,
      stdio: 'ignore',
      windowsHide: true,
      detached: true,
      env: { ...process.env, GDRIVE_DB_LOCAL_PATH: DB.dbPath },
    });
    child.on('error', (err) => log(`[Drive] Sync ${mode} erro: ${err.message}`));
    child.unref();
  } catch (err) {
    log(`[Drive] Sync ${mode} ignorado: ${err.message || err}`);
  }
}

// Descarregar a BD mais recente do Google Drive antes de arrancar
runSync('pull', true);

// Push periódico enquanto a aplicação estiver a correr
const SYNC_INTERVAL_MS = (parseInt(process.env.GDRIVE_SYNC_MINUTES, 10) || 10) * 60 * 1000;
const gdriveTimer = setInterval(() => runSyncDetached('push'), SYNC_INTERVAL_MS);
gdriveTimer.unref && gdriveTimer.unref();

// Push no fecho
function pushOnExit() {
  runSyncDetached('push');
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
// DATABASE_URL - CAMINHO ABSOLUTO
// =============================================
process.env.DATABASE_URL = 'file:' + DB.dbPath.replace(/\\/g, '/');
log(`DATABASE_URL: ${process.env.DATABASE_URL}`);
log('Prisma engine: OK');

// =============================================
// PORTA E NEXTAUTH_URL
// =============================================
const PORT = parseInt(process.env.PORT, 10) || 3000;
process.env.PORT = String(PORT);

const authUrl = `http://localhost:${PORT}`;
process.env.AUTH_URL = authUrl;
process.env.NEXTAUTH_URL = authUrl;
log(`Porta: ${PORT}`);
log(`URL: ${authUrl}`);

if (CHECK_MODE) {
  console.log('');
  console.log('== RESUMO DE VERIFICACAO ==');
  console.log('Base de dados     :', DB.dbPath);
  console.log('Fallback utilizar :', DB.usedFallback);
  console.log('Diretoria backups :', BACKUPS_DIR);
  console.log('Ficheiro de log   :', LOG_FILE);
  console.log('DB dir gravavel   :', isWritable(DB.dir));
  console.log('App dir gravavel  :', isWritable(APP_DIR));
  console.log('local.db existe   :', fs.existsSync(DB.dbPath));
  console.log('node_modules      :', fs.existsSync(path.join(APP_DIR, 'node_modules')));
  console.log('standalone server :', fs.existsSync(path.join(APP_DIR, '.next', 'standalone', 'server.js')));
  console.log('bin\\node.exe      :', fs.existsSync(path.join(APP_DIR, 'bin', 'node.exe')));
  console.log('');
  log('[Check] Verificacao concluida — a sair sem iniciar o servidor.');
  process.exit(0);
}

// =============================================
// FECHAR INSTANCIA ANTERIOR
// =============================================
try {
  const stdout = execSync('netstat -ano', { encoding: 'utf8', timeout: 5000 });
  for (const line of stdout.split('\n')) {
    if (line.includes(`:${PORT}`) && line.includes('LISTENING')) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0' && String(pid) !== String(process.pid)) {
        log(`A fechar instancia anterior (PID: ${pid})...`);
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch (e) {}
        try { execSync('ping 127.0.0.1 -n 2 >nul', { stdio: 'ignore', timeout: 3000 }); } catch (e) {}
        break;
      }
    }
  }
} catch (err) {
  // Ignorar erros
}

// =============================================
// SUPERVISOR/INICIAR SERVIDOR NEXT.JS
// =============================================
console.log('');
log('A iniciar servidor (standalone)...');
console.log('');

let child = null;
let shuttingDown = false;

function stopChild() {
  if (child && !child.killed) {
    try { child.kill(); } catch (e) {}
  }
}

function startChild(attempt) {
  if (shuttingDown) return;
  log(`[Supervisor] Tentativa ${attempt} de iniciar servidor...`);
  child = spawn(process.execPath, ['server.js'], {
    cwd: APP_DIR,
    env: process.env,
    stdio: 'inherit',
    windowsHide: false,
  });
  child.on('error', (err) => {
    log(`[Supervisor] Erro a iniciar servidor: ${err.message}`, 'ERRO');
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    log(`[Supervisor] Servidor terminou (code=${code}, signal=${signal})`, 'ERRO');
  });
}

// =============================================
// HEALTH CHECK / WATCHDOG
// =============================================
function healthCheck(cb) {
  const req = http.get(`http://127.0.0.1:${PORT}/api/health`, { timeout: 3000 }, (res) => {
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