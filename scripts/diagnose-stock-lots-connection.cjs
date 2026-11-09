// Read-only diagnostics. Never print connection strings, credentials or server errors.
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns').promises;
const net = require('node:net');
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');
const { parse } = require('pg-connection-string');
const root = path.resolve(__dirname, '..');
const files = ['.env', '.env.local', '.env.prod', '.env.prod2', '.env.production.local',
  '.env.vercel.checkprod', '.env.vercel.prod', '.env.vercel.pull', '.env.vercel.tmp',
  '.vercel.env.production.local'];
const emit = value => console.log(JSON.stringify(value));
function category(error) {
  const code = String(error.code || '');
  if (/^[A-Z0-9_]{2,40}$/.test(code)) return code;
  return /timeout|timed out/i.test(error.message || '') ? 'TIMEOUT' : 'REDACTED_ERROR';
}
function tcp(address, port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: address, port });
    const finish = result => { socket.destroy(); resolve(result); };
    socket.setTimeout(4000, () => finish('TIMEOUT'));
    socket.once('connect', () => finish('OPEN'));
    socket.once('error', error => finish(category(error)));
  });
}
async function identity(url, address) {
  const config = parse(url.toString());
  // SSL is mandatory. Preserve configured CA/verification, adding SNI for IP probes.
  if (config.ssl === false) throw Object.assign(new Error(), { code: 'SSL_DISABLED_IN_CONFIG' });
  config.ssl = { ...(config.ssl || {}), servername: url.hostname };
  if (address) config.host = address;
  const client = new Client({ ...config, connectionTimeoutMillis: 6000, query_timeout: 6000 });
  client.on('error', () => {});
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '5000ms'");
    const result = (await client.query(`SELECT current_database() AS database, current_user AS role,
      (SELECT oid FROM pg_database WHERE datname = current_database()) AS database_oid,
      system_identifier::text AS system_identifier,
      current_setting('transaction_read_only') AS read_only
      FROM pg_control_system()`)).rows[0];
    // pg_stat_ssl describes pooler-to-Postgres, not this client's TLS connection.
    result.ssl = client.connection.stream.encrypted === true;
    await client.query('ROLLBACK');
    return result;
  } finally { await client.end().catch(() => {}); }
}
async function main() {
  const configs = [];
  for (const file of files) {
    if (!fs.existsSync(path.join(root, file))) continue;
    try { execFileSync('git', ['check-ignore', '--quiet', '--', file], { cwd: root, stdio: 'pipe' }); }
    catch { continue; }
    configs.push({ file, env: require('dotenv').parse(fs.readFileSync(path.join(root, file))) });
  }
  const production = configs.find(c => c.file === '.env.production.local');
  const baselineUrl = new URL(production.env.DATABASE_URL);
  const project = decodeURIComponent(baselineUrl.username).split('.').slice(1).join('.');
  if (!project || !baselineUrl.hostname.endsWith('.pooler.supabase.com')) throw new Error('UNEXPECTED_BASELINE');
  emit({ phase: 'inventory', managementTokenPresent: Boolean(process.env.SUPABASE_ACCESS_TOKEN ||
    configs.some(c => c.env.SUPABASE_ACCESS_TOKEN)), filesChecked: configs.map(c => c.file) });
  const targets = [];
  const seen = new Set();
  for (const { file, env } of configs) {
    for (const key of ['DIRECT_URL', 'POSTGRES_URL_NON_POOLING']) {
      if (!env[key]) continue;
      try {
        const url = new URL(env[key]);
        const sameProject = url.hostname === `db.${project}.supabase.co` ||
          (url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username).endsWith(`.${project}`));
        const eligible = sameProject && ['postgres:', 'postgresql:'].includes(url.protocol) && (url.port || '5432') === '5432';
        emit({ phase: 'configured-alternative', file, key, sameProject, eligible,
          mode: url.hostname.endsWith('.pooler.supabase.com') ? 'pooler' : 'direct' });
        const id = `${url.hostname}:${url.port || '5432'}/${url.pathname}`;
        if (eligible && !seen.has(id)) { seen.add(id); targets.push({ label: `${file}:${key}`, url }); }
      } catch { emit({ phase: 'configured-alternative', file, key, error: 'INVALID_URL' }); }
    }
  }
  const session = new URL(baselineUrl);
  session.port = '5432';
  session.searchParams.delete('pgbouncer');
  const sessionId = `${session.hostname}:${session.port}/${session.pathname}`;
  if (!seen.has(sessionId)) targets.push({ label: 'documented-session-same-host', url: session });
  let baseline;
  try {
    baseline = await identity(baselineUrl);
    emit({ phase: 'baseline', authenticated: true, ssl: baseline.ssl, readOnly: baseline.read_only === 'on', controlIdentityAvailable: Boolean(baseline.system_identifier) });
  } catch (error) { emit({ phase: 'baseline', authenticated: false, error: category(error) }); }
  for (const { label, url } of targets) {
    let addresses;
    try { addresses = await dns.lookup(url.hostname, { all: true }); }
    catch (error) { emit({ phase: 'dns', label, error: category(error) }); continue; }
    const unique = [...new Map(addresses.map(a => [a.address, a])).values()];
    emit({ phase: 'dns', label, ipv4: unique.filter(a => a.family === 4).length, ipv6: unique.filter(a => a.family === 6).length });
    for (const [index, entry] of unique.entries()) {
      const result = await tcp(entry.address, Number(url.port || 5432));
      emit({ phase: 'tcp', label, addressIndex: index + 1, family: entry.family, port: Number(url.port || 5432), result });
      if (result !== 'OPEN') continue;
      try {
        const candidate = await identity(url, entry.address);
        emit({ phase: 'authentication', label, addressIndex: index + 1, authenticated: true,
          ssl: candidate.ssl, readOnly: candidate.read_only === 'on',
          sameDatabaseAndControlIdentity: baseline ? JSON.stringify(candidate) === JSON.stringify(baseline) : null });
      } catch (error) { emit({ phase: 'authentication', label, addressIndex: index + 1, authenticated: false, error: category(error) }); }
    }
  }
}
main().catch(() => { emit({ failed: true, error: 'DIAGNOSTIC_FAILED_DETAILS_REDACTED' }); process.exitCode = 1; });
