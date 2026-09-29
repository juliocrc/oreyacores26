/*
 * Sincronização da base de dados (prisma/local.db) com o Google Drive via rclone.
 *
 * Uso:
 *   node scripts/sync_gdrive.cjs --pull    # descarregar do Drive (mais recente)
 *   node scripts/sync_gdrive.cjs --push    # carregar para o Drive
 *   node scripts/sync_gdrive.cjs --auto    # pull + push
 *
 * Configuração (uma única vez, por computador):
 *   .\bin\rclone.exe config        # criar um remote chamado "gdrive" (Google Drive)
 *   - ou -
 *   .\bin\rclone.exe config create gdrive drive scope=drive
 *
 * Variáveis opcionais no .env:
 *   GDRIVE_REMOTE=gdrive
 *   GDRIVE_DB_PATH=OreyAcores
 */
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DB_REL = "prisma/local.db";
const DB_PATH = process.env.GDRIVE_DB_LOCAL_PATH || path.join(ROOT, DB_REL);

function loadEnv(fileName) {
  const envPath = path.join(ROOT, fileName);
  if (!fs.existsSync(envPath)) return;
  try {
    const content = fs.readFileSync(envPath, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    content.split("\n").forEach((line) => {
      line = line.trim();
      if (!line || line.startsWith("#")) return;
      const eq = line.indexOf("=");
      if (eq === -1) return;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    });
  } catch {}
}

loadEnv(".env");
loadEnv(".env.local");

// Binário do rclone: pode ser renomeado/alternativo (RCLONE_BIN_NAME) para
// contornar bloqueios por assinatura do programa de proteção (ex: Harmony).
function resolveRclone() {
  const configured = (process.env.RCLONE_BIN_NAME || "").trim();
  if (configured) {
    const p = path.join(ROOT, "bin", configured);
    if (fs.existsSync(p)) return p;
    console.warn(`[gdrive] Aviso: RCLONE_BIN_NAME="${configured}" não existe (bin\\${configured}). A usar rclone.exe.`);
  }
  return path.join(ROOT, "bin", "rclone.exe");
}
const RCLONE = resolveRclone();

const REMOTE = process.env.GDRIVE_REMOTE || "gdrive";
const GDRIVE_PATH = (process.env.GDRIVE_DB_PATH || "OreyAcores").replace(/^\/+|\/+$/g, "");
const GDRIVE_BACKUPS_PATH = (process.env.GDRIVE_BACKUPS_PATH || "OreyAcores_Backups").replace(/^\/+|\/+$/g, "");
const PRUNE_MIN_AGE_DAYS = parseInt(process.env.GDRIVE_PRUNE_MIN_AGE_DAYS || "30", 10);

// Se GDRIVE_CRYPT_REMOTE estiver definido (ex: "orye_crypt"), a base de dados
// é sincronizada cifrada através desse remote crypt. O remote crypt aponta já
// para a pasta cifrada no Drive (ex: gdrive:OreyAcores), pelo que a referência
// é a raiz do remote crypt ("${CRYPT}:" sem subpasta).
const CRYPT_REMOTE = (process.env.GDRIVE_CRYPT_REMOTE || "").trim().replace(/:$/, "");
const CRYPT_BACKUPS_REMOTE = (process.env.GDRIVE_CRYPT_BACKUPS_REMOTE || "").trim().replace(/:$/, "");

function dbRemotePath() {
  if (CRYPT_REMOTE) return `${CRYPT_REMOTE}:`;
  return `${REMOTE}:${GDRIVE_PATH}`;
}

function backupsRemotePath() {
  if (CRYPT_BACKUPS_REMOTE) return `${CRYPT_BACKUPS_REMOTE}:`;
  return `${REMOTE}:${GDRIVE_BACKUPS_PATH}`;
}

function rclone(args) {
  if (!fs.existsSync(RCLONE)) {
    console.error(`[gdrive] rclone não encontrado em bin/${path.basename(RCLONE)}`);
    return false;
  }
  const result = spawnSync(RCLONE, args, { encoding: "utf8", timeout: 900000, windowsHide: true });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    // spawnSync preenche result.error quando o processo não consegue arrancar —
    // tipicamente o programa de proteção bloqueou o arranque do rclone.
    detectBlocked(result.error);
    return false;
  }
  if (result.signal) {
    console.error(`[gdrive] ${path.basename(RCLONE)} foi interrompido pelo sinal ${result.signal} — provavelmente bloqueado pelo programa de proteção.`);
    return false;
  }
  if (result.status !== 0) {
    console.error(`[gdrive] ${path.basename(RCLONE)} saiu com código ${result.status}.`);
    return false;
  }
  return true;
}

function detectBlocked(err) {
  const code = err && err.code;
  const msg = err && err.message;
  console.error(`[gdrive] ERRO ao arrancar bin/${path.basename(RCLONE)}: ${msg}`);
  if (code === "EPERM" || code === "EACCES" || /operation not permitted|access is denied/i.test(msg || "")) {
    console.error("[gdrive] Parece que o programa de proteção bloqueiou o rclone.exe (falso positivo).");
    console.error("[gdrive]   - Execute VERIFICAR_RCLONE.bat para validar o binário e obter os passos de exceção.");
    console.error("[gdrive]   - Alternativa: RENOMEAR_RCLONE.bat (evita deteção por nome/assinatura).");
    return;
  }
  if (code === "ENOENT") {
    console.error(`[gdrive] binário não existe: ${RCLONE}`);
  }
}

function remoteListed() {
  const result = spawnSync(RCLONE, ["listremotes"], { encoding: "utf8", timeout: 30000, windowsHide: true });
  if (result.error) {
    detectBlocked(result.error);
    return false;
  }
  if (result.status !== 0) return false;
  const remotes = (result.stdout || "").split("\n").map((l) => l.trim().replace(":", ""));
  const required = [REMOTE];
  if (CRYPT_REMOTE) required.push(CRYPT_REMOTE);
  if (CRYPT_BACKUPS_REMOTE) required.push(CRYPT_BACKUPS_REMOTE);
  return required.every((r) => remotes.includes(r));
}

function pull() {
  if (!fs.existsSync(DB_PATH)) {
    console.log("[gdrive] local.db ainda não existe localmente — a criar diretório.");
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  const ok = rclone(["copy", `${dbRemotePath()}/local.db`, path.dirname(DB_PATH), "--update", "--transfers", "1"]);
  if (ok) console.log(`[gdrive] Pull concluído (Drive → local).`);
  return ok;
}

function push() {
  if (!fs.existsSync(DB_PATH)) {
    console.log("[gdrive] local.db não existe — nada para enviar.");
    return false;
  }
  const ok = rclone(["copy", DB_PATH, dbRemotePath(), "--update", "--transfers", "1"]);
  if (ok) console.log(`[gdrive] Push concluído (local → Drive).`);
  return ok;
}

function pruneRemote(remotePath, minAgeDays) {
  if (!remotePath) return true;
  const exists = spawnSync(RCLONE, ["lsf", remotePath, "--max-depth", "0"], {
    encoding: "utf8",
    timeout: 120000,
    windowsHide: true,
  });
  if (exists.status !== 0) {
    console.log(`[gdrive] Sem pasta remota ${remotePath} — nada a purgar.`);
    return true;
  }
  const ok = rclone(["delete", remotePath, "--min-age", `${minAgeDays}d`, "--transfers", "1"]);
  if (ok) console.log(`[gdrive] Prune concluído (ficheiros com > ${minAgeDays} dias removidos em ${remotePath}).`);
  return ok;
}

function prune() {
  const ok1 = pruneRemote(backupsRemotePath(), PRUNE_MIN_AGE_DAYS);
  const ok2 = pruneRemote(`${backupsRemotePath()}/backups`, PRUNE_MIN_AGE_DAYS);
  return ok1 && ok2;
}

function main() {
  const mode = process.argv[2] || "--auto";
  console.log(`[gdrive] Modo: ${mode} | Remote: ${REMOTE} | Caminho Drive: ${dbRemotePath()}`);
  if (CRYPT_REMOTE || CRYPT_BACKUPS_REMOTE) {
    console.log(`[gdrive] Cifragem: ATIVADA (DB: ${CRYPT_REMOTE || "-"} | Backups: ${CRYPT_BACKUPS_REMOTE || "-"})`);
  }
  console.log(`[gdrive] Base de dados: ${DB_PATH}`);

  if (!fs.existsSync(RCLONE)) {
    console.error("[gdrive] ERRO: bin/rclone.exe em falta.");
    process.exitCode = 1;
    return;
  }

  if (!remoteListed()) {
    console.error("");
    console.error(`[gdrive] Faltam remotes do rclone: "${REMOTE}"${CRYPT_REMOTE ? ` e "${CRYPT_REMOTE}"` : ""}${CRYPT_BACKUPS_REMOTE ? ` e "${CRYPT_BACKUPS_REMOTE}"` : ""}.`);
    console.error("");
    console.error("Para configurar o Google Drive, execute uma vez:");
    console.error(`    .\\bin\\rclone.exe config`);
    console.error(`  e crie um remote com o nome "gdrive" do tipo Google Drive.`);
    console.error(`  (ou: .\\bin\\rclone.exe config create gdrive drive scope=drive)`);
    console.error("");
    if (CRYPT_REMOTE || CRYPT_BACKUPS_REMOTE) {
      console.error("Para ativar a cifragem, execute:  CONFIGURAR_RCLONE_CRYPT.bat");
      console.error("");
    }
    process.exitCode = 1;
    return;
  }

  if (mode === "--pull") {
    pull();
  } else if (mode === "--push") {
    push();
    prune();
  } else if (mode === "--prune") {
    prune();
  } else {
    pull();
    push();
    prune();
  }
}

main();
