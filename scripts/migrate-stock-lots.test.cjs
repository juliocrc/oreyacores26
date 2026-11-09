const assert = require('node:assert/strict');
const test = globalThis.test || require('node:test').test;
const fs = require('node:fs');
const path = require('node:path');
const { migrate, postgresRehearsalSql, preflight } = require('./migrate-stock-lots.cjs');
const sql = fs.readFileSync(path.join(__dirname, 'sql/stock-lots.postgresql.sql'), 'utf8');

test('rehearsal qualifies every table target and DROP INDEX in pg_temp', () => {
  const statements = postgresRehearsalSql(sql);
  assert.equal(statements.length, 3);
  assert.equal(statements.filter(statement => statement.startsWith('DROP INDEX')).length, 1);
  for (const statement of statements) {
    assert(!statement.includes('public.'));
    if (statement.startsWith('DROP INDEX')) assert.equal(statement, 'DROP INDEX IF EXISTS pg_temp."Stock_referencia_serviceStationId_key"');
    else assert(statement.includes('pg_temp."Stock"'));
    assert(!/\b(?:FROM|ON|UPDATE|TABLE) "Stock"/.test(statement));
  }
});

test('rehearsal refuses changed or extra SQL before a connection is opened', () => {
  assert.throws(() => postgresRehearsalSql(`${sql}\nDROP INDEX public."Stock_codigoBarras_key";`));
  assert.throws(() => postgresRehearsalSql(sql.replace('DROP INDEX IF EXISTS "Stock_referencia_serviceStationId_key"', 'DROP INDEX IF EXISTS public."Stock_referencia_serviceStationId_key"')));
  assert.throws(() => postgresRehearsalSql(`${sql}\nUPDATE "Stock" SET lote = '';`));
  const statements = sql.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);
  assert.throws(() => postgresRehearsalSql([statements[0], statements[1], statements[1]].join(';')));
  assert.throws(() => postgresRehearsalSql(statements.reverse().join(';')));
});

const poolerUrl = 'postgresql://test:NEVER_LOG_PASSWORD@review.pooler.supabase.com:6543/test';
const target = 'review.pooler.supabase.com/test';
const temporary = 'C:/Users/julio/AppData/Local/Temp/opencode';

test('transaction pooler APPLY is still denied by default before connecting', async () => {
  await assert.rejects(migrate(poolerUrl, true, target), /direct or session-mode/);
});

for (const failure of [null, 'backup-write', 'backup-read', 'preflight', 'index-owner', 'ddl', 'fingerprint', 'index-definition']) {
  test(`guarded pooler transaction: ${failure || 'ordered locked backup and commit'}`, async () => {
    const pg = require('pg');
    const originalClient = pg.Client;
    const originalWrite = fs.writeFileSync;
    const originalRead = fs.readFileSync;
    const originalLog = console.log;
    const events = [];
    const logs = [];
    let backup;
    let ddl = 0;
    let reads = 0;
    const rows = [{ id: 1, referencia: 'PRIVATE_ROW', serviceStationId: null, lote: null, quantidade: 2, quantidadeReservada: 0 }];
    const columns = ['id', 'referencia', 'serviceStationId', 'lote', 'quantidade', 'quantidadeReservada', 'foto', 'localizacao'].map(name => ({ name, type: 'text' }));
    const oldIndex = { indexname: 'Stock_referencia_serviceStationId_key', indexdef: 'CREATE UNIQUE INDEX "Stock_referencia_serviceStationId_key" ON public."Stock" (referencia, "serviceStationId")', valid: true, ready: true, constraintType: null };
    const indexes = postgresRehearsalSql(sql).slice(1).map(statement => ({
      indexname: statement.match(/INDEX IF NOT EXISTS "([^"]+)"/)[1],
      indexdef: statement.replace(' IF NOT EXISTS', '').replace('pg_temp.', 'public.').replace(' (', ' USING btree ('), valid: true, ready: true, constraintType: null,
    }));
    class FakeClient {
      async connect() { events.push('CONNECT'); }
      async end() { events.push('END'); }
      async query(text, values) {
        assert.equal(typeof text, 'string', 'no named query configs');
        events.push(text);
        let result = [];
        if (text.includes('AS oid, n.nspname')) {
          assert.deepEqual(values, ['public."Stock"']);
          result = [{ oid: 123, schema: 'public' }];
        } else if (text.startsWith('SELECT c.relname FROM')) result = failure === 'index-owner' ? [{ relname: 'Stock_referencia_serviceStationId_key' }] : [];
        else if (text.includes('SELECT attname AS name')) result = columns;
        else if (text.includes('AS indexname')) result = ddl === 3 ? indexes : [oldIndex];
        else if (text.startsWith('SELECT *')) {
          assert.equal(text, 'SELECT * FROM "public"."Stock" ORDER BY "id"');
          reads++;
          result = failure === 'preflight' ? [1, 2].map(id => ({ ...rows[0], id, lote: 'duplicate' })) : rows;
          if (failure === 'fingerprint' && reads > 1) result = [{ ...rows[0], lote: '' }];
        } else if (text.startsWith('SELECT current_database')) result = [{ database: 'test', role: 'test' }];
        else if (/^(DROP|CREATE) /.test(text)) {
          assert(events.includes('BACKUP_READ'), 'backup verified before any DDL');
          assert(text.includes('public.'));
          assert(!text.includes('pg_temp.'));
          ddl++;
          if (failure === 'ddl') throw new Error('DDL_FAILED');
          if (failure === 'index-definition') indexes[0].indexdef += ' WHERE false';
        }
        return { rows: result };
      }
    }
    pg.Client = FakeClient;
    console.log = (...args) => logs.push(args.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' '));
    fs.writeFileSync = (file, contents, ...args) => {
      if (typeof file === 'number') {
        events.push('BACKUP_WRITE');
        assert(events.includes('LOCK TABLE public."Stock" IN ACCESS EXCLUSIVE MODE'));
        assert.deepEqual(JSON.parse(contents).rows, rows);
        assert('incoming' in JSON.parse(contents).schema);
        if (failure === 'backup-write') throw new Error('BACKUP_FAILED');
      }
      return originalWrite(file, contents, ...args);
    };
    fs.readFileSync = (file, ...args) => {
      if (typeof file === 'string' && path.basename(file).startsWith('stock-lots-before-')) {
        backup = file;
        events.push('BACKUP_READ');
        if (failure === 'backup-read') return '{}';
      }
      return originalRead(file, ...args);
    };
    try {
      const run = () => migrate(poolerUrl, true, target, { allowTransactionPooler: true, backupDir: temporary });
      if (failure) {
        await assert.rejects(run());
        assert(!events.includes('COMMIT'));
        assert.equal(events.at(-2), 'ROLLBACK');
        if (['backup-write', 'backup-read', 'preflight', 'index-owner'].includes(failure)) assert.equal(ddl, 0);
      } else {
        const result = await run();
        assert.equal(result.allStockFieldsUnchanged, true);
        assert.equal(ddl, 3);
        assert.equal(events.filter(event => event === 'BEGIN').length, 1);
        assert(events.indexOf('BEGIN') < events.indexOf('LOCK TABLE public."Stock" IN ACCESS EXCLUSIVE MODE'));
        assert(events.includes("SET LOCAL lock_timeout = '5s'"));
        assert(events.includes("SET LOCAL statement_timeout = '60s'"));
        assert.equal(events.at(-2), 'COMMIT');
        assert(!events.includes('ROLLBACK'));
      }
      assert.equal(events.at(-1), 'END');
      assert(!logs.join('\n').includes('PRIVATE_ROW'));
      assert(!logs.join('\n').includes('NEVER_LOG_PASSWORD'));
    } finally {
      pg.Client = originalClient;
      fs.writeFileSync = originalWrite;
      fs.readFileSync = originalRead;
      console.log = originalLog;
      // Generated test artifacts only; production backup files are never removed.
      if (backup) fs.unlinkSync(backup);
    }
  });
}

test('pooler opt-in refuses non-index SQL before connecting', async () => {
  const originalRead = fs.readFileSync;
  fs.readFileSync = (file, ...args) => String(file).endsWith('stock-lots.postgresql.sql') ? sql.replace('DROP INDEX IF EXISTS "Stock_referencia_serviceStationId_key"', 'DELETE FROM public."Stock"') : originalRead(file, ...args);
  try {
    await assert.rejects(migrate(poolerUrl, true, target, { allowTransactionPooler: true, backupDir: temporary }), /Unrecognized migration statement/);
  } finally { fs.readFileSync = originalRead; }
});

test('preflight reports null/empty/noncanonical lots without changing rows', () => {
  const rows = [
    { id: 1, referencia: 'A', serviceStationId: 1, lote: null, quantidade: 10, quantidadeReservada: 2 },
    { id: 2, referencia: 'A', serviceStationId: 1, lote: ' B ', quantidade: 5, quantidadeReservada: 0 },
    { id: 3, referencia: 'C', serviceStationId: null, lote: '', quantidade: 0, quantidadeReservada: 0 },
  ];
  assert.deepEqual(preflight(rows), { rows: 3, quantity: 15, reserved: 2, nullLots: 1, emptyLots: 1, noncanonicalLots: 1 });
  assert.equal(rows[0].lote, null);
  assert.equal(rows[1].lote, ' B ');
});

test('legacy NULL duplicates are accepted; only duplicate nonnull keys block', () => {
  const rows = [1, 2, 3].map(id => ({ id, referencia: 'REF', serviceStationId: null, lote: null, quantidade: 1, quantidadeReservada: 0 }));
  assert.equal(preflight(rows, true).collisionCount, 0);
  assert.equal(preflight(rows).nullLots, 3);
  rows.forEach(row => { row.lote = 'A'; });
  assert.equal(preflight(rows, true).collisionCount, 2);
  assert.deepEqual(preflight(rows, true).collisions, [{ ids: [1, 2] }, { ids: [1, 3] }]);
  assert.throws(() => preflight(rows), /2 collisions total/);
});
