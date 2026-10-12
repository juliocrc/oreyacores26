#!/usr/bin/env node
/*
 * Cria, na raiz do OneDrive detetada, a pasta de cada navio que tem uma ou
 * mais jangadas associadas, com a subpasta Documentos e as categorias usadas
 * pela app:
 *   <ROOT>/navios/<Navio>/Documentos/{DGRM,Quadros,Certificados,Documentos}
 *
 * Uso:
 *   node scripts/criar-pastas-navios-onedrive.cjs --dry-run   (só mostra)
 *   node scripts/criar-pastas-navios-onedrive.cjs             (cria)
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { Pool } = require("pg");

const ROOT_FOLDER = "OREYACORESDELUXE2026";
const DOCS_SUBFOLDER = "Documentos";
const CATEGORIES = ["DGRM", "Quadros", "Certificados", "Documentos"];

function detectOneDriveRoots() {
  const candidates = [];
  try {
    const home = os.homedir();
    for (const item of fs.readdirSync(home, { withFileTypes: true })) {
      if (item.isDirectory() && item.name.toLowerCase().startsWith("onedrive -")) {
        candidates.push(path.join(home, item.name));
      }
    }
  } catch {}
  if (process.env.OneDriveCommercial && fs.existsSync(process.env.OneDriveCommercial)) {
    if (!candidates.includes(process.env.OneDriveCommercial)) candidates.push(process.env.OneDriveCommercial);
  }
  return candidates;
}

function pickRoot() {
  const roots = detectOneDriveRoots();
  return roots.find((r) => /orey|azores|tecnica/i.test(r)) || roots[0] || "";
}

function sanitize(name) {
  return String(name)
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 120);
}

function connectionString() {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("postgres")) {
    return process.env.DATABASE_URL;
  }
  for (const file of [".env.production.local", ".env.prod", ".env.vercel.prod", ".env"]) {
    try {
      const text = fs.readFileSync(file, "utf8");
      const m = text.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
      if (m && m[1].trim().startsWith("postgres")) return m[1].trim();
    } catch {}
  }
  return "";
}

async function fetchShips(connectionStringValue) {
  let base = connectionStringValue;
  try {
    const parsed = new URL(connectionStringValue);
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("ssl");
    base = parsed.toString();
  } catch {}
  const sslVariants = [false, { rejectUnauthorized: false }];
  let lastError;
  for (const ssl of sslVariants) {
    const pool = new Pool({ connectionString: base, ssl });
    try {
      const { rows } = await pool.query(
        `SELECT DISTINCT n.nome FROM "Navio" n
         JOIN "Jangada" j ON j."shipId" = n.id
         WHERE n.nome IS NOT NULL AND n.nome <> ''
         ORDER BY n.nome`,
      );
      await pool.end();
      return rows.map((r) => r.nome);
    } catch (err) {
      lastError = err;
      await pool.end().catch(() => {});
    }
  }
  throw lastError;
}

(async () => {
  const dryRun = process.argv.includes("--dry-run");

  const root = pickRoot();
  console.log("Raiz OneDrive detetada:", root || "(nenhuma)");
  if (!root) {
    console.error("Nenhuma pasta OneDrive ('OneDrive - ...') encontrada para esta conta.");
    process.exit(1);
  }
  if (!fs.existsSync(root)) {
    console.error("A raiz detetada não existe no disco:", root);
    process.exit(1);
  }

  const cs = connectionString();
  if (!cs) {
    console.error("DATABASE_URL (PostgreSQL) não encontrado no ambiente nem nos ficheiros .env.");
    process.exit(1);
  }

  const ships = [...new Set((await fetchShips(cs)).map((s) => String(s).trim()).filter(Boolean))];
  console.log(`Navios com jangadas associadas: ${ships.length}`);

  const baseDir = path.join(root, ROOT_FOLDER, "navios");
  let created = 0;
  let existing = 0;
  const createdPaths = [];

  for (const ship of ships) {
    const shipDir = path.join(baseDir, sanitize(ship));
    const docsDir = path.join(shipDir, DOCS_SUBFOLDER);
    const dirs = [shipDir, docsDir, ...CATEGORIES.map((c) => path.join(docsDir, c))];
    for (const dir of dirs) {
      if (fs.existsSync(dir)) {
        existing += 1;
        continue;
      }
      if (!dryRun) fs.mkdirSync(dir, { recursive: true });
      created += 1;
      createdPaths.push(dir);
    }
  }

  if (dryRun) {
    console.log("\n[dry-run] Pastas que seriam criadas:");
    for (const p of createdPaths) console.log("  +", p);
  }
  console.log(
    `\n${dryRun ? "[dry-run] " : ""}Pastas ${dryRun ? "a criar" : "criadas"}: ${created} · já existentes: ${existing}`,
  );
  console.log("Base:", baseDir);
})().catch((err) => {
  console.error("Erro:", err && err.message ? err.message : err);
  process.exit(1);
});
