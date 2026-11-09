'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const dotenv = require('dotenv');

const APPROVED_TEMP = 'C:\\Users\\julio\\AppData\\Local\\Temp\\opencode';
const TABLES = ['MovimentacaoStock', 'DeclaracaoIsencaoIva'];
const ENV_ORDER = ['POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'VERCEL_POSTGRES_URL',
  'VERCEL_POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING', 'NEON_DATABASE_URL',
  'SUPABASE_DATABASE_URL', 'DATABASE_URL', 'DIRECT_URL', 'gestornavalpro_DATABASE_URL',
  'GESTOR_DB', 'gestornavalpro_POSTGRES_URL'];
const DOMAIN = 'orey-infrastructure-backup/v1';
// Pinned reviewed contents, not a generic SQL runner. Comments and CRLF are immaterial.
const REVIEWED = {
  'stock-reversals.sql': `BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public."MovimentacaoStock" ADD COLUMN IF NOT EXISTS "reversaoDeId" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "MovimentacaoStock_reversaoDeId_key"
  ON public."MovimentacaoStock" ("reversaoDeId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'MovimentacaoStock_reversaoDeId_fkey'
      AND conrelid = 'public."MovimentacaoStock"'::regclass) THEN
    ALTER TABLE public."MovimentacaoStock"
      ADD CONSTRAINT "MovimentacaoStock_reversaoDeId_fkey"
      FOREIGN KEY ("reversaoDeId") REFERENCES public."MovimentacaoStock" (id)
      ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;
END $$;
COMMIT;`,
  'iva-declarations.sql': `BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS "DeclaracaoIsencaoIva" (
  "id" SERIAL PRIMARY KEY,
  "numeroSequencial" INTEGER NOT NULL,
  "ano" INTEGER NOT NULL,
  "numeroCompleto" TEXT NOT NULL,
  "clienteNome" TEXT, "clienteNif" TEXT, "navioNome" TEXT, "navioMatricula" TEXT,
  "codigoIsencaoIva" TEXT, "origem" TEXT, "emitidoPorId" TEXT,
  "dataEmissao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "DeclaracaoIsencaoIva"
  ADD COLUMN IF NOT EXISTS "clienteId" INTEGER,
  ADD COLUMN IF NOT EXISTS "navioId" INTEGER,
  ADD COLUMN IF NOT EXISTS "snapshotJson" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "DeclaracaoIsencaoIva_numeroCompleto_key" ON "DeclaracaoIsencaoIva" ("numeroCompleto");
CREATE UNIQUE INDEX IF NOT EXISTS "DeclaracaoIsencaoIva_ano_numeroSequencial_key" ON "DeclaracaoIsencaoIva" ("ano", "numeroSequencial");
CREATE UNIQUE INDEX IF NOT EXISTS "DeclaracaoIsencaoIva_idempotencyKey_key" ON "DeclaracaoIsencaoIva" ("idempotencyKey");
CREATE INDEX IF NOT EXISTS "DeclaracaoIsencaoIva_ano_idx" ON "DeclaracaoIsencaoIva" ("ano");
CREATE INDEX IF NOT EXISTS "DeclaracaoIsencaoIva_numeroSequencial_idx" ON "DeclaracaoIsencaoIva" ("numeroSequencial");
CREATE INDEX IF NOT EXISTS "DeclaracaoIsencaoIva_clienteId_dataEmissao_idx" ON "DeclaracaoIsencaoIva" ("clienteId", "dataEmissao");
CREATE INDEX IF NOT EXISTS "DeclaracaoIsencaoIva_navioId_dataEmissao_idx" ON "DeclaracaoIsencaoIva" ("navioId", "dataEmissao");
COMMIT;`,
};

function check(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { safeCode: code });
}
const qi = value => '"' + value.replaceAll('"', '""') + '"';
const tableSql = name => `public.${qi(name)}`;
const canonicalSql = sql => sql.replace(/--[^\r\n]*/g, '').replace(/\s+/g, ' ').trim();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function parseArgs(argv) {
  const result = { apply: false };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    check(!seen.has(flag), 'DUPLICATE_FLAG');
    seen.add(flag);
    if (flag === '--inspect' || flag === '--apply') result.apply = flag === '--apply';
    else {
      check(['--env-file', '--confirm-target', '--backup-dir', '--only'].includes(flag), 'UNKNOWN_FLAG');
      check(Boolean(argv[i + 1]) && !argv[i + 1].startsWith('--'), 'MISSING_FLAG_VALUE');
      result[flag.slice(2)] = argv[++i];
    }
  }
  check(!(seen.has('--inspect') && seen.has('--apply')), 'CONFLICTING_MODES');
  check(Boolean(result['env-file']), 'ENV_FILE_REQUIRED');
  check(!seen.has('--only') || result.only === 'iva', 'INVALID_SCOPE');
  check(!result.apply || (result['confirm-target'] && result['backup-dir']), 'APPLY_CONFIRMATION_REQUIRED');
  check(result.apply || (!result['confirm-target'] && !result['backup-dir']), 'APPLY_FLAGS_IN_INSPECT');
  return result;
}

function resolveEnv(text) {
  const env = dotenv.parse(text);
  const source = ENV_ORDER.find(key => env[key]?.trim());
  check(Boolean(source), 'DATABASE_URL_MISSING');
  let url;
  try { url = new URL(env[source].trim()); } catch { check(false, 'DATABASE_URL_INVALID'); }
  check(['postgres:', 'postgresql:'].includes(url.protocol), 'POSTGRES_REQUIRED');
  check(Boolean(url.hostname) && url.pathname.length > 1 && Boolean(url.username), 'DATABASE_URL_INVALID');
  // Never let pg-connection-string override certificate verification through URL flags.
  const sslMode = url.searchParams.get('sslmode');
  check(!sslMode || ['require', 'verify-ca', 'verify-full'].includes(sslMode), 'INSECURE_TLS_MODE');
  const database = decodeURIComponent(url.pathname.slice(1));
  const target = `${url.hostname}:${url.port || '5432'}/${database}`;
  check(!/[\r\n\u0000-\u001f]/.test(target), 'INVALID_TARGET');
  return {
    source, target, secret: env.INFRASTRUCTURE_BACKUP_SECRET || env.AUTH_SECRET,
    config: {
      host: url.hostname, port: Number(url.port || 5432), database,
      user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
      ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 15000,
      application_name: 'orey-infrastructure-activation',
      // Explicit fields intentionally ignore PG*, process DATABASE_URL and URL options.
    },
  };
}

function reviewedSql(name, text) {
  check(Object.hasOwn(REVIEWED, name), 'SQL_NOT_ALLOWLISTED');
  check(canonicalSql(text) === canonicalSql(REVIEWED[name]), 'SQL_REVIEW_REQUIRED');
  return text.replace(/--[^\r\n]*/g, '').trim().replace(/^BEGIN;/, '').replace(/COMMIT;\s*$/, '');
}

function backupKey(secret) {
  check(typeof secret === 'string' && secret.trim().length >= 32, 'STABLE_BACKUP_SECRET_REQUIRED');
  return crypto.createHash('sha256').update(DOMAIN + '\0').update(secret).digest();
}
function packBackup(payload, secret) {
  const plaintext = Buffer.from(JSON.stringify(payload));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', backupKey(secret), iv);
  cipher.setAAD(Buffer.from(DOMAIN));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return JSON.stringify({ version: 1, domain: DOMAIN, sha256: hash(plaintext),
    iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64') });
}
function unpackBackup(text, secret) {
  const envelope = JSON.parse(text);
  check(envelope.version === 1 && envelope.domain === DOMAIN, 'BACKUP_VERSION_INVALID');
  const decipher = crypto.createDecipheriv('aes-256-gcm', backupKey(secret), Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(Buffer.from(DOMAIN));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
  check(hash(plaintext) === envelope.sha256, 'BACKUP_HASH_MISMATCH');
  return JSON.parse(plaintext.toString('utf8'));
}

async function metadata(db, name) {
  const ref = tableSql(name);
  const table = (await db.query(`SELECT c.oid, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
    c.relacl::text AS acl FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=$1`, [name])).rows[0];
  if (!table) return null;
  check(table.relkind === 'r', 'ORDINARY_TABLE_REQUIRED');
  const columns = (await db.query(`SELECT a.attname AS name, a.attnum,
    pg_catalog.format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS notnull,
    a.attidentity, a.attgenerated, pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expr
    FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d
    ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`, [ref])).rows;
  const indexes = (await db.query(`SELECT c.relname AS name, i.indisunique AS unique,
    i.indisprimary AS primary, i.indisvalid AS valid, i.indisready AS ready,
    am.amname AS method, i.indnatts, i.indnkeyatts,
    ARRAY(SELECT pg_catalog.pg_get_indexdef(i.indexrelid,k,true)
      FROM generate_series(1,i.indnkeyatts) k ORDER BY k) AS keys,
    i.indoption::text AS options, pg_catalog.pg_get_expr(i.indpred,i.indrelid) AS predicate,
    pg_catalog.pg_get_indexdef(i.indexrelid) AS definition
    FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid
    JOIN pg_catalog.pg_am am ON am.oid=c.relam
    WHERE i.indrelid=$1::regclass ORDER BY c.relname`, [ref])).rows;
  const constraints = (await db.query(`SELECT conname AS name, contype AS type,
    convalidated AS validated, condeferrable AS deferrable, condeferred AS deferred,
    pg_catalog.pg_get_constraintdef(oid,true) AS definition
    FROM pg_catalog.pg_constraint WHERE conrelid=$1::regclass ORDER BY conname`, [ref])).rows;
  const policies = (await db.query(`SELECT polname, polcmd, polpermissive, polroles::text,
    pg_catalog.pg_get_expr(polqual,polrelid) AS qual,
    pg_catalog.pg_get_expr(polwithcheck,polrelid) AS withcheck
    FROM pg_catalog.pg_policy WHERE polrelid=$1::regclass ORDER BY polname`, [ref])).rows;
  const grants = (await db.query(`SELECT r.rolname AS role, r.rolsuper, r.rolbypassrls,
    p.privilege, pg_catalog.has_table_privilege(r.oid,$1::regclass,p.privilege) AS allowed,
    pg_catalog.has_any_column_privilege(r.oid,$1::regclass,'SELECT') AS column_select,
    pg_catalog.has_any_column_privilege(r.oid,$1::regclass,'INSERT') AS column_insert,
    pg_catalog.has_any_column_privilege(r.oid,$1::regclass,'UPDATE') AS column_update
    FROM pg_catalog.pg_roles r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE',
      'TRUNCATE','REFERENCES','TRIGGER']) p(privilege)
    WHERE r.rolname IN ('anon','authenticated') ORDER BY r.rolname,p.privilege`, [ref])).rows;
  return { table, columns, indexes, constraints, policies, grants };
}

async function transaction(db, readOnly, fn) {
  await db.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
  try {
    await db.query("SET LOCAL lock_timeout='5s'");
    await db.query("SET LOCAL statement_timeout='60s'");
    await db.query("SET LOCAL search_path=public,pg_catalog");
    await db.query('SET LOCAL row_security=off');
    const result = await fn();
    await db.query('COMMIT');
    return result;
  } catch (error) {
    try { await db.query('ROLLBACK'); } catch { /* Connection may have failed at COMMIT. No retries. */ }
    throw error;
  }
}

async function rowsFor(db, name, columns) {
  // PostgreSQL text representations preserve bigint, numeric and timestamp precision.
  return (await db.query(`SELECT ARRAY[${columns.map(c => `${qi(c.name)}::text`).join(',')}] AS cells
    FROM ${tableSql(name)} ORDER BY "id"`)).rows.map(row => row.cells);
}

function verifyExistingRows(before, after, columns) {
  const id = columns.findIndex(c => c.name === 'id');
  check(id >= 0, 'ID_COLUMN_REQUIRED');
  const current = new Map(after.map(row => [row[id], hash(JSON.stringify(row))]));
  check(current.size === after.length, 'NON_UNIQUE_ID');
  check(before.every(row => current.get(row[id]) === hash(JSON.stringify(row))), 'HISTORICAL_ROWS_CHANGED');
  return { originalRows: before.length, currentRows: after.length, addedRows: after.length - before.length,
    originalProjectionUnchanged: true };
}

const INDEXES = {
  MovimentacaoStock: [['MovimentacaoStock_reversaoDeId_key', true, ['reversaoDeId']]],
  DeclaracaoIsencaoIva: [
    ['DeclaracaoIsencaoIva_numeroCompleto_key', true, ['numeroCompleto']],
    ['DeclaracaoIsencaoIva_ano_numeroSequencial_key', true, ['ano', 'numeroSequencial']],
    ['DeclaracaoIsencaoIva_idempotencyKey_key', true, ['idempotencyKey']],
    ['DeclaracaoIsencaoIva_ano_idx', false, ['ano']],
    ['DeclaracaoIsencaoIva_numeroSequencial_idx', false, ['numeroSequencial']],
    ['DeclaracaoIsencaoIva_clienteId_dataEmissao_idx', false, ['clienteId', 'dataEmissao']],
    ['DeclaracaoIsencaoIva_navioId_dataEmissao_idx', false, ['navioId', 'dataEmissao']],
  ],
};
function normalizedDefinition(value) { return value.replaceAll('public.', '').replaceAll('"', '').replace(/\s+/g, ' ').trim(); }
function validateObjects(name, meta, complete) {
  check(Boolean(meta) || !complete, 'TABLE_MISSING');
  if (!meta) return;
  const column = (key, type, nullable) => {
    const found = meta.columns.find(c => c.name === key);
    check(Boolean(found) || !complete, 'COLUMN_MISSING');
    if (found) check(found.type === type && (!nullable || (!found.notnull && !found.default_expr)) &&
      !found.attidentity && !found.attgenerated, 'COLUMN_DEFINITION_MISMATCH');
  };
  column('id', 'integer', false);
  check(meta.constraints.some(c => c.type === 'p' && normalizedDefinition(c.definition) === 'PRIMARY KEY (id)' &&
    c.validated && !c.deferrable), 'ID_PRIMARY_KEY_REQUIRED');
  if (name === TABLES[0]) column('reversaoDeId', 'integer', true);
  else {
    for (const key of ['clienteId', 'navioId']) column(key, 'integer', true);
    for (const key of ['snapshotJson', 'idempotencyKey']) column(key, 'text', true);
    for (const key of ['ano', 'numeroSequencial']) column(key, 'integer', false);
    for (const key of ['numeroCompleto', 'clienteNome', 'clienteNif', 'navioNome', 'navioMatricula',
      'codigoIsencaoIva', 'origem', 'emitidoPorId']) column(key, 'text', false);
    for (const key of ['dataEmissao', 'createdAt', 'updatedAt']) column(key, 'timestamp(3) without time zone', false);
    for (const key of ['ano', 'numeroSequencial', 'numeroCompleto', 'dataEmissao', 'createdAt', 'updatedAt']) {
      const found = meta.columns.find(c => c.name === key);
      check((!found && !complete) || found?.notnull, 'REQUIRED_COLUMN_NULLABLE');
    }
  }
  for (const [indexName, unique, keys] of INDEXES[name]) {
    const index = meta.indexes.find(i => i.name === indexName);
    check(Boolean(index) || !complete, 'INDEX_MISSING');
    if (index) check(index.unique === unique && !index.primary && index.valid && index.ready &&
      index.method === 'btree' && !index.predicate && Number(index.indnatts) === keys.length &&
      Number(index.indnkeyatts) === keys.length && index.options === keys.map(() => '0').join(' ') &&
      JSON.stringify(index.keys.map(normalizedDefinition)) === JSON.stringify(keys) &&
      normalizedDefinition(index.definition) === `CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${indexName} ON ${name} USING btree (${keys.join(', ')})`,
    'INDEX_DEFINITION_MISMATCH');
  }
  if (name === TABLES[0]) {
    const fk = meta.constraints.find(c => c.name === 'MovimentacaoStock_reversaoDeId_fkey');
    check(Boolean(fk) || !complete, 'FOREIGN_KEY_MISSING');
    if (fk) check(fk.type === 'f' && fk.validated && !fk.deferrable && !fk.deferred &&
      normalizedDefinition(fk.definition) === 'FOREIGN KEY (reversaoDeId) REFERENCES MovimentacaoStock(id) ON DELETE RESTRICT',
    'FOREIGN_KEY_DEFINITION_MISMATCH');
  }
}

function preserveMetadata(before, after) {
  if (!before) return;
  for (const kind of ['columns', 'indexes', 'constraints', 'policies']) {
    for (const object of before[kind]) {
      const key = kind === 'policies' ? 'polname' : 'name';
      assert.deepEqual(after[kind].find(item => item[key] === object[key]), object);
    }
  }
  for (const key of ['oid', 'relkind', 'relrowsecurity', 'relforcerowsecurity', 'acl']) {
    assert.deepEqual(after.table[key], before.table[key]);
  }
  assert.deepEqual(after.grants, before.grants);
}

async function duplicates(db, name, meta) {
  if (!meta) return {};
  const groups = name === TABLES[0] ? [['reversaoDeId']] : [['ano', 'numeroSequencial'], ['numeroCompleto'], ['idempotencyKey']];
  const result = {};
  for (const keys of groups) {
    if (!keys.every(key => meta.columns.some(c => c.name === key))) continue;
    const sqlKeys = keys.map(qi).join(',');
    result[keys.join('+')] = (await db.query(`SELECT count(*)::text AS groups, COALESCE(sum(n-1),0)::text AS extra_rows
      FROM (SELECT count(*) n FROM ${tableSql(name)} WHERE ${keys.map(key => `${qi(key)} IS NOT NULL`).join(' AND ')}
      GROUP BY ${sqlKeys} HAVING count(*)>1) d`)).rows[0];
  }
  return result;
}

async function inspect(db, names = TABLES) {
  return transaction(db, true, async () => {
    const schemas = (await db.query("SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY nspname")).rows.map(r => r.nspname);
    const tables = {};
    for (const name of names) {
      const meta = await metadata(db, name);
      if (!meta) { tables[name] = { exists: false }; continue; }
      let validation = 'compatible';
      try { validateObjects(name, meta, false); } catch (error) { validation = safeError(error).code; }
      tables[name] = { exists: true, validation,
        rowCount: (await db.query(`SELECT count(*)::text AS n FROM ${tableSql(name)}`)).rows[0].n,
        fields: meta.columns.map(c => ({ name: c.name, type: c.type, nullable: !c.notnull })),
        indexes: meta.indexes.map(i => ({ name: i.name, unique: i.unique, valid: i.valid, method: i.method })),
        duplicateCounters: await duplicates(db, name, meta),
        rls: meta.table.relrowsecurity, forceRls: meta.table.relforcerowsecurity,
        policyCount: meta.policies.length, apiGrants: meta.grants,
        warning: 'Existing RLS/grants are reported only, never automatically changed. API schema exposure cannot be proven from SQL catalogs.' };
    }
    return { schemas, tables };
  });
}

function safeError(error) {
  // Never print server message/detail/hint, SQL, URLs, stack, or row values.
  const code = error?.safeCode || (/^[0-9A-Z]{5}$/.test(error?.code || '') ? error.code : 'LOCAL_OR_CONNECTION_FAILURE');
  return { code, action: 'Stopped; no automatic retry or rollback of committed scripts. Inspect before any further apply.' };
}

async function main(argv = process.argv.slice(2), envText) {
  const args = parseArgs(argv);
  const names = args.only === 'iva' ? [TABLES[1]] : TABLES;
  const resolved = resolveEnv(envText ?? fs.readFileSync(path.resolve(args['env-file']), 'utf8'));
  const scripts = args.only === 'iva' ? ['iva-declarations.sql'] : Object.keys(REVIEWED);
  const sqls = scripts.map(name => [name,
    reviewedSql(name, fs.readFileSync(path.join(__dirname, 'sql', name), 'utf8'))]);
  let backupDir;
  if (args.apply) {
    check(args['confirm-target'] === resolved.target, 'TARGET_CONFIRMATION_MISMATCH');
    backupKey(resolved.secret);
    backupDir = fs.realpathSync(path.resolve(args['backup-dir']));
    const approved = fs.realpathSync(APPROVED_TEMP);
    const relative = path.relative(approved, backupDir);
    check(relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)), 'BACKUP_DIRECTORY_NOT_APPROVED');
    check(fs.statSync(backupDir).isDirectory(), 'BACKUP_DIRECTORY_REQUIRED');
  }
  const { Client } = require('pg');
  const db = new Client(resolved.config);
  // pg notices and errors may contain row data. Only emit our own sanitized output.
  db.on('error', () => {});
  try {
    await db.connect();
    const identity = (await db.query('SELECT current_database() AS db')).rows[0];
    check(identity.db === resolved.config.database, 'CONNECTED_DATABASE_MISMATCH');
    console.log(JSON.stringify({ mode: args.apply ? 'apply' : 'inspect', source: resolved.source,
      confirmTarget: resolved.target, report: await inspect(db, names) }, null, 2));
    if (!args.apply) return;

    const snapshot = await transaction(db, true, async () => {
      const tables = {};
      for (const name of names) {
        const meta = await metadata(db, name);
        check(name !== TABLES[0] || Boolean(meta), 'STOCK_TABLE_REQUIRED');
        validateObjects(name, meta, false);
        const dup = await duplicates(db, name, meta);
        check(Object.values(dup).every(value => value.groups === '0'), 'HISTORICAL_DUPLICATES');
        tables[name] = { meta, rows: meta ? await rowsFor(db, name, meta.columns) : [] };
      }
      return { version: 1, target: resolved.target, createdAt: new Date().toISOString(),
        sqlHashes: Object.fromEntries(sqls.map(([name, sql]) => [name, hash(sql)])), tables };
    });
    // No DDL locks while serializing, encrypting, writing, fsyncing and verifying backup.
    const file = path.join(backupDir, `infrastructure-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.aesgcm.json`);
    const fd = fs.openSync(file, 'wx', 0o600);
    try { fs.writeFileSync(fd, packBackup(snapshot, resolved.secret)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    assert.deepEqual(unpackBackup(fs.readFileSync(file, 'utf8'), resolved.secret), snapshot);
    console.log(JSON.stringify({ backupVerified: true, path: file,
      counts: Object.fromEntries(names.map(name => [name, snapshot.tables[name].rows.length])) }));

    for (let i = 0; i < sqls.length; i++) {
      const [script, sql] = sqls[i];
      const name = names[i];
      await transaction(db, false, async () => {
        // Transaction-scoped advisory lock is safe even through transaction poolers.
        const locked = (await db.query('SELECT pg_catalog.pg_try_advisory_xact_lock(180317, 202601) AS ok')).rows[0].ok;
        check(locked, 'ACTIVATION_ALREADY_RUNNING');
        const before = snapshot.tables[name].meta;
        assert.deepEqual(await metadata(db, name), before);
        await db.query(sql);
        if (!before && name === TABLES[1]) {
          await db.query('ALTER TABLE public."DeclaracaoIsencaoIva" ENABLE ROW LEVEL SECURITY');
          await db.query('REVOKE ALL ON TABLE public."DeclaracaoIsencaoIva" FROM PUBLIC');
          const sequence = (await db.query(`SELECT pg_catalog.pg_get_serial_sequence('public."DeclaracaoIsencaoIva"','id') AS name`)).rows[0].name;
          check(Boolean(sequence), 'NEW_TABLE_SEQUENCE_REQUIRED');
          // regclass output is server-quoted; this is never CLI/env input.
          await db.query(`REVOKE ALL ON SEQUENCE ${sequence} FROM PUBLIC`);
          const roles = (await db.query("SELECT rolname FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated')")).rows;
          for (const { rolname } of roles) {
            await db.query(`REVOKE ALL ON TABLE public."DeclaracaoIsencaoIva" FROM ${qi(rolname)}`);
            await db.query(`REVOKE ALL ON SEQUENCE ${sequence} FROM ${qi(rolname)}`);
          }
        }
        const after = await metadata(db, name);
        validateObjects(name, after, true);
        preserveMetadata(before, after);
        if (!before) {
          check(after.table.relrowsecurity && after.policies.length === 0 &&
            after.grants.every(g => !g.allowed && !g.column_select && !g.column_insert && !g.column_update &&
              !g.rolsuper && !g.rolbypassrls), 'NEW_TABLE_API_ACCESS_NOT_DENIED');
        }
      });
      console.log(JSON.stringify({ script, committed: true }));
      const original = snapshot.tables[name];
      const verified = original.meta ? await transaction(db, true, async () =>
        verifyExistingRows(original.rows, await rowsFor(db, name, original.meta.columns), original.meta.columns)) :
        { originalRows: 0, originalProjectionUnchanged: true };
      console.log(JSON.stringify({ table: name, verification: verified }));
    }
    console.log(JSON.stringify({ completed: true, report: await inspect(db, names) }, null, 2));
  } finally { await db.end(); }
}

module.exports = { parseArgs, resolveEnv, reviewedSql, packBackup, unpackBackup,
  verifyExistingRows, validateObjects, preserveMetadata, metadata, transaction, rowsFor,
  duplicates, safeError, REVIEWED, ENV_ORDER, main };
if (require.main === module) main().catch(error => {
  console.error(JSON.stringify(safeError(error)));
  process.exitCode = 1;
});
