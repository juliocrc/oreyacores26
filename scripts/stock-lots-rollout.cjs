// Explicit rollout helper. Connection strings and stock rows are never logged.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { migrate, rehearse } = require('./migrate-stock-lots.cjs');
const root = path.resolve(__dirname, '..');
const temporary = 'C:\\Users\\julio\\AppData\\Local\\Temp\\opencode';
const hash = rows => crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
let phase = 'configuration';

async function snapshot(connectionString) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '30000ms'");
    const identity = (await client.query('SELECT current_database() AS database, current_user AS role')).rows[0];
    const rows = (await client.query('SELECT * FROM public."Stock" ORDER BY id')).rows;
    const indexes = (await client.query("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'Stock' ORDER BY indexname")).rows;
    await client.query('ROLLBACK');
    return { identity, rows, indexes };
  } finally { await client.end(); }
}

async function main() {
  const action = process.argv[2] || 'check';
  if (!['check', 'rehearse', 'apply'].includes(action)) throw new Error('INVALID_ACTION');
  const flags = process.argv.slice(3);
  if (flags.some(flag => !['--confirm-index-only', '--allow-transaction-pooler'].includes(flag))) throw new Error('INVALID_FLAG');
  const allowTransactionPooler = flags.includes('--allow-transaction-pooler');
  if (action === 'apply' && !flags.includes('--confirm-index-only')) throw new Error('EXPLICIT_CONFIRMATION_REQUIRED');
  const config = require('dotenv').parse(fs.readFileSync(path.join(root, '.env.production.local')));
  const configured = new URL(config.DATABASE_URL);
  // Supabase documents session mode on port 5432 of the same shared pooler.
  // Verify both credentials and the complete stock fingerprint before using it.
  const session = new URL(allowTransactionPooler ? config.DATABASE_URL : config.DIRECT_URL || config.DATABASE_URL);
  if (!allowTransactionPooler && !config.DIRECT_URL) {
    if (!configured.hostname.endsWith('.pooler.supabase.com') || configured.port !== '6543') throw new Error('SESSION_ENDPOINT_REQUIRES_CONFIGURATION');
    session.port = '5432';
    session.searchParams.delete('pgbouncer');
  }
  if (!['postgres:', 'postgresql:'].includes(session.protocol) || (!allowTransactionPooler && session.port === '6543')) throw new Error('INVALID_SESSION_ENDPOINT');
  phase = 'verify-configured-database';
  const baseline = await snapshot(config.DATABASE_URL);
  phase = 'verify-session-database';
  const candidate = allowTransactionPooler ? baseline : await snapshot(session.toString());
  if (JSON.stringify(baseline.identity) !== JSON.stringify(candidate.identity) || hash(baseline.rows) !== hash(candidate.rows)) throw new Error('DATABASE_IDENTITY_MISMATCH');
  console.log(JSON.stringify({ sessionVerified: !allowTransactionPooler, transactionPoolerOptIn: allowTransactionPooler, stockRows: candidate.rows.length, fingerprint: hash(candidate.rows), action }));
  if (action === 'check') return;
  if (action === 'rehearse') return rehearse(session.toString());
  if (!fs.statSync(temporary).isDirectory()) throw new Error('BACKUP_PARENT_MISSING');
  phase = 'locked-index-only-migration';
  const result = await migrate(session.toString(), true, `${session.hostname}${session.pathname}`, { allowTransactionPooler, backupDir: temporary });
  // These postconditions were checked under the lock, not against a stale baseline
  // or a new snapshot that could include legitimate post-commit application writes.
  console.log(JSON.stringify({ applied: true, ...result, lotIndex: true, sharedLotIndex: true, legacyPairIndexRemoved: true }));
}

main().catch(error => {
  const code = String(error.code || error.message || 'UNKNOWN');
  const category = /timeout|timed out/i.test(code) ? 'CONNECTION_TIMEOUT' : /certificate|ssl|tls/i.test(code) ? 'TLS_ERROR' : 'DETAILS_REDACTED';
  console.error(JSON.stringify({ failed: true, phase, errorType: error.name, code: /^[A-Z0-9_]+$/.test(code) ? code : category }));
  process.exitCode = 1;
});
