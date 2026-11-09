'use strict';

const test = globalThis.test || require('node:test').test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs, resolveEnv, reviewedSql, packBackup, unpackBackup,
  verifyExistingRows, validateObjects, preserveMetadata, safeError, REVIEWED, ENV_ORDER } = require('./activate-infrastructure.cjs');

test('inspect is default, apply requires exact flags, unknown/mixed/duplicate flags fail', () => {
  assert.equal(parseArgs(['--env-file', 'test.env']).apply, false);
  assert.equal(parseArgs(['--apply', '--env-file', 'test.env', '--confirm-target', 'host/db', '--backup-dir', 'temp']).apply, true);
  for (const args of [[], ['--apply', '--env-file', 'x'], ['--inspect', '--apply', '--env-file', 'x'],
    ['--env-file', 'x', '--env-file', 'y'], ['--env-file', 'x', '--sql', 'arbitrary.sql'],
    ['--env-file'], ['--env-file', 'x', '--backup-dir', 'x']]) assert.throws(() => parseArgs(args));
});

test('dotenv parsing uses only explicit file, runtime order, strict TLS and no URL option overrides', () => {
  const result = resolveEnv('POSTGRES_URL="postgresql://user:p%40ss@runtime.example:6543/postgres?sslmode=require&options=unsafe"\nDATABASE_URL=postgresql://other:secret@other.example/db\nAUTH_SECRET="stable-secret"');
  assert.equal(result.source, 'POSTGRES_URL');
  assert.equal(result.target, 'runtime.example:6543/postgres');
  assert.equal(result.config.password, 'p@ss');
  assert.deepEqual(result.config.ssl, { rejectUnauthorized: true });
  assert.equal(result.config.options, undefined);
  assert.equal(result.config.connectionString, undefined);
  assert.throws(() => resolveEnv('DATABASE_URL=file:local.db'));
  assert.throws(() => resolveEnv('DATABASE_URL=postgres://user:pass@host/db?sslmode=disable'));
  assert.throws(() => resolveEnv('AUTH_SECRET=something'));
  // All supported fallbacks retain precisely the runtime precedence.
  ENV_ORDER.forEach((source, index) => {
    const text = ENV_ORDER.slice(index).map(key => `${key}=postgres://u:p@${key.toLowerCase().replaceAll('_', '-')}.example/db`).join('\n');
    assert.equal(resolveEnv(text).source, source);
  });
  const runtime = fs.readFileSync(path.join(__dirname, '../src/lib/resolve-database-url.ts'), 'utf8');
  const order = runtime.match(/const RUNTIME_DATABASE_ENV_ORDER[^=]*=\s*\[([\s\S]*?)\]/)[1];
  assert.deepEqual([...order.matchAll(/"([^"]+)"/g)].map(match => match[1]), ENV_ORDER);
});

test('dedicated backup key takes precedence, preserves AUTH fallback and fails closed on short keys', () => {
  const base = 'DATABASE_URL=postgres://u:p@host/db\n';
  const auth = 'existing-auth-secret-for-fallback-tests';
  const independent = 'independent-infrastructure-backup-secret';
  assert.equal(resolveEnv(base + `AUTH_SECRET=${auth}`).secret, auth);
  const selected = resolveEnv(base + `AUTH_SECRET=${auth}\nINFRASTRUCTURE_BACKUP_SECRET=${independent}`).secret;
  assert.equal(selected, independent);
  assert.deepEqual(unpackBackup(packBackup({ test: true }, selected), independent), { test: true });
  assert.throws(() => unpackBackup(packBackup({ test: true }, selected), auth));
  const short = resolveEnv(base + `AUTH_SECRET=${auth}\nINFRASTRUCTURE_BACKUP_SECRET=short`).secret;
  assert.throws(() => packBackup({}, short), { safeCode: 'STABLE_BACKUP_SECRET_REQUIRED' });
  assert.throws(() => packBackup({}, ' '.repeat(40)));
  assert.equal(resolveEnv(base + `AUTH_SECRET=${auth}\nINFRASTRUCTURE_BACKUP_SECRET=`).secret, auth);
});

test('IVA-only scope is explicit and rejects any other or duplicate scope', () => {
  assert.equal(parseArgs(['--inspect', '--env-file', 'test.env', '--only', 'iva']).only, 'iva');
  assert.equal(parseArgs(['--apply', '--env-file', 'test.env', '--only', 'iva',
    '--confirm-target', 'host/db', '--backup-dir', 'temp']).only, 'iva');
  for (const scope of ['stock', 'all', 'IVA']) {
    assert.throws(() => parseArgs(['--env-file', 'test.env', '--only', scope]));
  }
  assert.throws(() => parseArgs(['--env-file', 'test.env', '--only', 'iva', '--only', 'iva']));
});

test('only reviewed SQL is accepted, actual files match, transaction wrappers are controlled', () => {
  for (const [name, sql] of Object.entries(REVIEWED)) {
    const actual = fs.readFileSync(path.join(__dirname, 'sql', name), 'utf8');
    const body = reviewedSql(name, actual);
    assert.ok(!body.trim().startsWith('BEGIN;'));
    assert.ok(!body.trim().endsWith('COMMIT;'));
    assert.ok(!/\b(?:DROP|TRUNCATE|INSERT|DELETE FROM|UPDATE public)\b/i.test(body));
    assert.equal(reviewedSql(name, sql.replaceAll('\n', '\r\n')), reviewedSql(name, sql).replaceAll('\n', '\r\n'));
    assert.throws(() => reviewedSql(name, actual + '\nDELETE FROM "MovimentacaoStock";'));
    assert.throws(() => reviewedSql(name, actual.replace('INTEGER', 'TEXT')));
  }
  assert.throws(() => reviewedSql('anything.sql', 'SELECT 1'));
});

test('AES-GCM backup roundtrip is complete, randomized, authenticated and hash verified', () => {
  const secret = 'stable-server-secret-for-local-tests-only';
  const payload = { tables: { test: { columns: ['id', 'private'], rows: [['9007199254740993', 'private-client-data'], ['2', null]] } } };
  const packed = packBackup(payload, secret);
  assert.ok(!packed.includes('private-client-data'));
  assert.deepEqual(unpackBackup(packed, secret), payload);
  assert.notEqual(packBackup(payload, secret), packed);
  assert.throws(() => unpackBackup(packed, secret + 'wrong'));
  assert.throws(() => packBackup(payload, 'short'));
  const changed = JSON.parse(packed);
  changed.sha256 = '0'.repeat(64);
  assert.throws(() => unpackBackup(JSON.stringify(changed), secret));
  changed.ciphertext = Buffer.alloc(64).toString('base64');
  assert.throws(() => unpackBackup(JSON.stringify(changed), secret));
});

test('original projection verification accepts new rows, rejects changed/deleted/duplicate old IDs', () => {
  const columns = [{ name: 'id' }, { name: 'amount' }];
  const old = [['1', '9007199254740993'], ['2', null]];
  assert.deepEqual(verifyExistingRows(old, [...old, ['3', 'new']], columns), {
    originalRows: 2, currentRows: 3, addedRows: 1, originalProjectionUnchanged: true,
  });
  assert.throws(() => verifyExistingRows(old, [['1', 'rounded'], old[1]], columns));
  assert.throws(() => verifyExistingRows(old, [old[1]], columns));
  assert.throws(() => verifyExistingRows(old, [...old, old[0]], columns));
});

function stockMeta() {
  return {
    table: { oid: 1, relkind: 'r', relrowsecurity: false, relforcerowsecurity: false, acl: null },
    columns: ['id', 'reversaoDeId'].map((name, index) => ({ name, type: 'integer', notnull: !index,
      default_expr: null, attidentity: '', attgenerated: '' })),
    indexes: [{ name: 'MovimentacaoStock_reversaoDeId_key', unique: true, primary: false,
      valid: true, ready: true, method: 'btree', predicate: null, indnatts: 1, indnkeyatts: 1,
      options: '0', keys: ['"reversaoDeId"'],
      definition: 'CREATE UNIQUE INDEX "MovimentacaoStock_reversaoDeId_key" ON public."MovimentacaoStock" USING btree ("reversaoDeId")' }],
    constraints: [{ name: 'pk', type: 'p', validated: true, deferrable: false, definition: 'PRIMARY KEY (id)' },
      { name: 'MovimentacaoStock_reversaoDeId_fkey', type: 'f', validated: true, deferrable: false, deferred: false,
        definition: 'FOREIGN KEY ("reversaoDeId") REFERENCES "MovimentacaoStock"(id) ON DELETE RESTRICT' }],
    policies: [], grants: [],
  };
}

test('definitions, not names, are verified, including FK actions and exact index expressions', () => {
  validateObjects('MovimentacaoStock', stockMeta(), true);
  for (const mutate of [meta => { meta.indexes[0].unique = false; },
    meta => { meta.indexes[0].predicate = 'id>0'; },
    meta => { meta.indexes[0].definition += ' NULLS NOT DISTINCT'; },
    meta => { meta.indexes[0].keys = ['id']; },
    meta => { meta.constraints[1].definition = meta.constraints[1].definition.replace('RESTRICT', 'CASCADE'); },
    meta => { meta.constraints[1].deferrable = true; },
    meta => { meta.columns[1].type = 'text'; },
    meta => { meta.columns[1].notnull = true; }]) {
    const meta = stockMeta(); mutate(meta);
    assert.throws(() => validateObjects('MovimentacaoStock', meta, true));
  }
  const missing = stockMeta(); missing.indexes = []; missing.constraints.pop(); missing.columns.pop();
  validateObjects('MovimentacaoStock', missing, false);
  assert.throws(() => validateObjects('MovimentacaoStock', missing, true));
});

test('existing schema, security and indexes cannot be changed by activation', () => {
  const before = stockMeta();
  const after = stockMeta();
  after.columns.push({ name: 'newNullable' });
  preserveMetadata(before, after);
  after.table.relrowsecurity = true;
  assert.throws(() => preserveMetadata(before, after));
});

test('error output cannot leak server messages, query values, credentials or stack', () => {
  const error = Object.assign(new Error('postgres://user:password@secret-host/db'), {
    code: '23505', detail: 'private-client-data', hint: 'secret', query: 'SELECT private',
  });
  const output = JSON.stringify(safeError(error));
  assert.equal(safeError(error).code, '23505');
  for (const value of ['password', 'private-client-data', 'secret-host', 'SELECT', 'stack']) assert.ok(!output.includes(value));
  assert.equal(safeError(new Error('sensitive')).code, 'LOCAL_OR_CONNECTION_FAILURE');
});
