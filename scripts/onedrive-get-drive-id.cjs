/*
 * Obtem/valida o ONEDRIVE_DRIVE_ID via Microsoft Graph (fluxo app-only).
 *
 * Uso:
 *   1) Crie o ficheiro backups/onedrive.env.local com:
 *        ONEDRIVE_TENANT_ID=<Directory (tenant) ID>
 *        ONEDRIVE_CLIENT_ID=<Application (client) ID>
 *        ONEDRIVE_CLIENT_SECRET=<Value do client secret>
 *        ONEDRIVE_USER=<email/UPN do dono do OneDrive>   (opcional, para descobrir o drive)
 *        ONEDRIVE_DRIVE_ID=<id>                          (opcional, para validar)
 *   2) node scripts/onedrive-get-drive-id.cjs
 *
 * Tambem aceita as mesmas variaveis no ambiente.
 */
const fs = require("fs");
const path = require("path");

function readEnvLocal() {
  const p = path.join(process.cwd(), "backups", "onedrive.env.local");
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const file = readEnvLocal();
const pick = (name) => (process.env[name] || file[name] || "").trim();

const tenant = pick("ONEDRIVE_TENANT_ID");
const clientId = pick("ONEDRIVE_CLIENT_ID");
const clientSecret = pick("ONEDRIVE_CLIENT_SECRET");
const user = pick("ONEDRIVE_USER");
const driveId = pick("ONEDRIVE_DRIVE_ID");

if (!tenant || !clientId || !clientSecret) {
  console.error("Faltam ONEDRIVE_TENANT_ID / ONEDRIVE_CLIENT_ID / ONEDRIVE_CLIENT_SECRET.");
  console.error("Ponha-os em backups/onedrive.env.local (ver comentario no topo do script).");
  process.exit(1);
}

async function getToken() {
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || typeof json.access_token !== "string") {
    throw new Error(`Token falhou (${res.status}): ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

(async () => {
  const token = await getToken();
  console.log("Token obtido com sucesso.");

  if (user) {
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user)}/drive`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`users/${user}/drive falhou (${res.status}): ${JSON.stringify(json)}`);
    } else {
      console.log(`Drive de ${user}:`);
      console.log(`  ONEDRIVE_DRIVE_ID = ${json.id}`);
      console.log(`  nome=${json.name} | tipo=${json.driveType} | owner=${json.owner?.user?.email || json.owner?.user?.displayName || "?"}`);
    }
  }

  if (driveId) {
    const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`Drive ${driveId} falhou (${res.status}): ${JSON.stringify(json)}`);
    } else {
      console.log(`ONEDRIVE_DRIVE_ID valido: ${json.name} (${json.id})`);
    }
  }

  if (!user && !driveId) {
    console.log("Defina ONEDRIVE_USER (UPN) para descobrir o drive, ou ONEDRIVE_DRIVE_ID para o validar.");
  }
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
