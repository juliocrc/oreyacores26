const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { exec, execFileSync, execSync, spawn } = require('child_process');

const APP_DIR = __dirname;

console.log("================================================");
console.log("===  GESTOR NAVAL OREY TECNICA - Acores  ===");
console.log("================================================");
console.log(`Diretorio: ${APP_DIR}`);
console.log(`Node.js: ${process.version}`);
console.log(`Plataforma: ${process.platform} ${process.arch}`);
console.log("");

// =============================================
// BACKUP AUTOMATICO
// =============================================
function backupDatabase() {
  const srcPath = path.join(APP_DIR, 'prisma', 'local.db');
  const backupsDir = path.join(APP_DIR, 'backups');
  if (fs.existsSync(srcPath)) {
    try {
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }
      const now = new Date();
      const ts = now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + '_' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0');
      const dstPath = path.join(backupsDir, `local_${ts}.db`);
      fs.copyFileSync(srcPath, dstPath);
      console.log(`Backup criado: backups\\local_${ts}.db`);
    } catch (err) {
      console.log(`Aviso backup: ${err.message}`);
    }
  }
}

function pruneBackupsDir(maxKeep = 10) {
  try {
    const dir = path.join(APP_DIR, 'backups');
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.db'))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    const toRemove = files.slice(maxKeep);
    for (const { f } of toRemove) {
      fs.unlinkSync(path.join(dir, f));
      console.log(`Backup antigo removido: backups\\${f}`);
    }
  } catch (err) {
    console.log(`Aviso rotação backups: ${err.message}`);
  }
}

backupDatabase();
pruneBackupsDir(10);

// =============================================
// SINCRONIZACAO GOOGLE DRIVE (base de dados)
// =============================================
function runSync(mode, silent = false) {
  try {
    const syncScript = path.join(APP_DIR, 'scripts', 'sync_gdrive.cjs');
    if (!fs.existsSync(syncScript)) return;
    const rclonePath = path.join(APP_DIR, 'bin', process.platform === 'win32' ? 'rclone.exe' : 'rclone');
    if (!fs.existsSync(rclonePath)) {
      if (!silent) console.log('[Drive] rclone nao encontrado; a continuar em modo local/offline.');
      return;
    }
    if (silent && process.env.GDRIVE_SILENT === '1') return;
    console.log(`[Drive] A sincronizar base de dados (${mode})...`);
    execFileSync(process.execPath, [syncScript, `--${mode}`], {
      cwd: APP_DIR,
      stdio: 'inherit',
      timeout: 900000,
    });
  } catch (err) {
    console.log(`[Drive] Sync ${mode} ignorado: ${err.message || err}`);
  }
}

function runSyncDetached(mode) {
  try {
    const syncScript = path.join(APP_DIR, 'scripts', 'sync_gdrive.cjs');
    if (!fs.existsSync(syncScript)) return;
    const rclonePath = path.join(APP_DIR, 'bin', process.platform === 'win32' ? 'rclone.exe' : 'rclone');
    if (!fs.existsSync(rclonePath)) return;
    console.log(`[Drive] A sincronizar base de dados (${mode})...`);
    const child = spawn(process.execPath, [syncScript, `--${mode}`], {
      cwd: APP_DIR,
      stdio: 'inherit',
      detached: true,
      windowsHide: true,
    });
    child.on('error', (err) => console.log(`[Drive] Sync ${mode} erro: ${err.message}`));
    child.unref();
  } catch (err) {
    console.log(`[Drive] Sync ${mode} ignorado: ${err.message || err}`);
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
process.on('SIGINT', () => { pushOnExit(); process.exit(0); });
process.on('SIGTERM', () => { pushOnExit(); process.exit(0); });


// =============================================
// CARREGAR .env (parser robusto)
// =============================================
function loadEnv(fileName) {
  const envPath = path.join(APP_DIR, fileName);
  if (!fs.existsSync(envPath)) return;
  
  console.log(`A carregar ${fileName}...`);
  try {
    const content = fs.readFileSync(envPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    content.split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) return;
      
      const key = line.substring(0, eqIndex).trim();
      let val = line.substring(eqIndex + 1).trim();
      
      // Remover aspas
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length - 1);
      }
      
      // Ignorar DATABASE_URL do .env (launcher.js define com caminho absoluto)
      if (key === 'DATABASE_URL') return;
      
      process.env[key] = val;
    });
  } catch (err) {
    console.error(`Erro ao ler ${fileName}: ${err.message}`);
  }
}

loadEnv('.env');
loadEnv('.env.local');

// =============================================
// GARANTIR VARIAVEIS DE AMBIENTE
// =============================================

// HOME para Windows
if (!process.env.HOME) {
  process.env.HOME = os.homedir() || process.env.USERPROFILE || path.join(os.tmpdir(), 'home');
}
if (!process.env.XDG_DATA_HOME) {
  process.env.XDG_DATA_HOME = path.join(process.env.HOME, '.local', 'share');
}

// Modo producao
process.env.NODE_ENV = 'production';

// Garantir process.argv[0]
if (!process.argv[0]) {
  process.argv[0] = process.execPath || 'node';
}

// =============================================
// DATABASE_URL - CAMINHO ABSOLUTO
// =============================================
const sqlitePath = path.join(APP_DIR, 'prisma', 'local.db');
if (fs.existsSync(sqlitePath)) {
  const sqliteUrlPath = sqlitePath.replace(/\\/g, '/');
  process.env.DATABASE_URL = `file:${sqliteUrlPath}`;
  console.log(`DATABASE_URL: ${sqliteUrlPath}`);
  console.log('Prisma engine: OK');
} else {
  console.log('ERRO: local.db nao encontrado!');
}

// =============================================
// PORTA E NEXTAUTH_URL
// =============================================
const PORT = process.env.PORT || 3000;
process.env.PORT = PORT;

let localIp = 'localhost';
try {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIp = iface.address;
        break;
      }
    }
  }
} catch (e) {}

const authUrl = `http://localhost:${PORT}`;
process.env.AUTH_URL = authUrl;
process.env.NEXTAUTH_URL = authUrl;
console.log(`Porta: ${PORT}`);
console.log(`URL: ${authUrl}`);

// =============================================
// FECHAR INSTANCIA ANTERIOR
// =============================================
try {
  const stdout = execSync('netstat -ano', { encoding: 'utf8', timeout: 5000 });
  const lines = stdout.split('\n');
  for (const line of lines) {
    if (line.includes(`:${PORT}`) && line.includes('LISTENING')) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') {
        console.log(`A fechar instancia anterior (PID: ${pid})...`);
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
// INICIAR SERVIDOR NEXT.JS
// =============================================
console.log("");
console.log("A iniciar servidor...");
console.log("");

try {
  require('./server.js');
} catch (err) {
  console.error("ERRO ao iniciar servidor:", err.message);
  console.error("");
  console.error("Possiveis solucoes:");
  console.error("1. Execute REBUILD_USB.bat para refazer o build");
  console.error("2. Verifique se node_modules esta completo");
  console.error("3. Verifique se .next existe e nao esta corrompido");
  console.error("");
  process.exit(1);
}

// =============================================
// AGUARDAR SERVIDOR E ABRIR NAVEGADOR
// =============================================
function waitForServer(attempts = 60, intervalMs = 1000) {
  return new Promise((resolve) => {
    let remaining = attempts;
    let scheduled = false;

    const scheduleRetry = () => {
      if (scheduled) return; // garante UMA tentativa por pedido (evita duplo retry)
      scheduled = true;
      remaining--;
      if (remaining <= 0) {
        console.log(`[Launcher] Timeout: servidor nao respondeu ao health check em ${attempts * intervalMs / 1000}s.`);
        resolve(false);
        return;
      }
      setTimeout(() => {
        scheduled = false;
        tryHealth();
      }, intervalMs);
    };

    const tryHealth = () => {
      const req = http.get(`http://localhost:${PORT}/api/health`, { timeout: 3000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          scheduleRetry();
        }
      });
      req.on('error', scheduleRetry);
      req.on('timeout', () => {
        req.destroy();
        scheduleRetry();
      });
    };

    tryHealth();
  });
}

(async () => {
  const ready = await waitForServer();
  if (ready) {
    console.log(`Servidor pronto em http://localhost:${PORT}`);
    try {
      const startCmd = process.platform === 'win32'
        ? `start "" http://localhost:${PORT}`
        : `xdg-open http://localhost:${PORT}`;
      exec(startCmd, (err) => {
        if (err) console.error("Erro ao abrir navegador:", err.message);
      });
    } catch (e) {
      console.error("Erro ao abrir navegador:", e.message);
    }
  } else {
    console.log("Servidor pode nao estar totalmente funcional. Tente abrir http://localhost:3000 manualmente.");
  }
})();
