/* Explicit opt-in migration. Never resolves a default database or replays the
 * project's SQLite migration history against PostgreSQL. No credentials logged. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function preflight(rows, reportOnly = false) {
  const seen = new Map();
  const collisions = [];
  for (const row of rows) {
    if (row.lote == null) continue;
    const lot = row.lote;
    const key = JSON.stringify([row.referencia, row.serviceStationId, lot]);
    if (seen.has(key)) collisions.push({ ids: [seen.get(key), row.id] });
    else seen.set(key, row.id);
  }
  if (collisions.length && !reportOnly) throw new Error(`Known lot collision: IDs ${collisions[0].ids.join(', ')} (${collisions.length} collisions total). Resolve manually; no merging is permitted.`);
  return {
    rows: rows.length,
    quantity: rows.reduce((sum, r) => sum + Number(r.quantidade), 0),
    reserved: rows.reduce((sum, r) => sum + Number(r.quantidadeReservada), 0),
    nullLots: rows.filter(row => row.lote == null).length,
    emptyLots: rows.filter(row => row.lote === '').length,
    noncanonicalLots: rows.filter(row => row.lote != null && row.lote !== String(row.lote).trim()).length,
    ...(reportOnly ? { collisionCount: collisions.length, collisions } : {}),
  };
}

function fingerprint(rows) {
  return createHash('sha256').update(JSON.stringify(rows, (_, v) => typeof v === 'bigint' ? String(v) : v)).digest('hex');
}

const quote = name => `"${name.replace(/"/g, '""')}"`;

async function postgresStockInfo(query, relationName = '"Stock"') {
  const [relation] = await query(`SELECT c.oid::int AS oid, n.nspname AS schema
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.oid = pg_catalog.to_regclass($1) AND c.relkind = 'r'`, [relationName]);
  if (!relation) throw new Error('Stock base table not found on the explicit target.');
  const columns = await query(`SELECT attname AS name, pg_catalog.format_type(atttypid, atttypmod) AS type,
    attnotnull AS "notNull", pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS "default"
    FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`, [relation.oid]);
  const indexes = await query(`SELECT c.relname AS indexname, pg_catalog.pg_get_indexdef(i.indexrelid) AS indexdef,
    i.indisvalid AS valid, i.indisready AS ready, k.contype AS "constraintType"
    FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid
    LEFT JOIN pg_catalog.pg_constraint k ON k.conindid = i.indexrelid AND k.conrelid = i.indrelid
    WHERE i.indrelid = $1 ORDER BY c.relname`, [relation.oid]);
  const constraints = await query(`SELECT conname AS name, contype AS type,
    pg_catalog.pg_get_constraintdef(oid) AS definition FROM pg_catalog.pg_constraint
    WHERE conrelid = $1 ORDER BY conname`, [relation.oid]);
  const incoming = await query(`SELECT k.conname AS name, n.nspname AS schema, c.relname AS "table",
    pg_catalog.pg_get_constraintdef(k.oid) AS definition,
    ARRAY(SELECT a.attname FROM unnest(k.conkey) WITH ORDINALITY AS keys(num, ord)
      JOIN pg_catalog.pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = keys.num ORDER BY keys.ord)::text[] AS columns,
    ARRAY(SELECT a.attname FROM unnest(k.confkey) WITH ORDINALITY AS keys(num, ord)
      JOIN pg_catalog.pg_attribute a ON a.attrelid = k.confrelid AND a.attnum = keys.num ORDER BY keys.ord)::text[] AS "targetColumns"
    FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid = k.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE k.contype = 'f' AND k.confrelid = $1 ORDER BY n.nspname, c.relname, k.conname`, [relation.oid]);
  for (const name of ['id', 'referencia', 'serviceStationId', 'lote', 'quantidade', 'quantidadeReservada', 'foto', 'localizacao']) {
    if (!columns.some(column => column.name === name)) throw new Error(`Required Stock column missing: ${name}.`);
  }
  if (indexes.some(index => !index.valid || !index.ready)) throw new Error('Invalid/not-ready Stock index; review before migration.');
  if (indexes.some(index => index.indexname === 'Stock_referencia_serviceStationId_key' && index.constraintType)) {
    throw new Error('Legacy pair uniqueness is a constraint, not a standalone index; reviewed constraint DDL is required.');
  }
  return { ...relation, table: `${quote(relation.schema)}."Stock"`, columns, indexes, constraints, incoming };
}

// CREATE INDEX inherits its target table's namespace in PostgreSQL. DROP INDEX
// must be explicitly qualified: search_path alone is not an isolation boundary.
function postgresRehearsalSql(sql) {
  const statements = sql.replace(/--[^\n]*/g, '').split(';').map(statement => statement.trim()).filter(Boolean);
  if (statements.length !== 3) throw new Error('Unexpected migration statement count; review rehearsal qualification.');
  return statements.map((statement, index) => {
    if (index === 0 && statement === 'DROP INDEX IF EXISTS "Stock_referencia_serviceStationId_key"') {
      return 'DROP INDEX IF EXISTS pg_temp."Stock_referencia_serviceStationId_key"';
    }
    if ((index === 1 && /^CREATE UNIQUE INDEX IF NOT EXISTS "Stock_referencia_serviceStationId_lote_key"\s+ON "Stock" \("referencia", "serviceStationId", "lote"\)$/.test(statement)) ||
        (index === 2 && /^CREATE UNIQUE INDEX IF NOT EXISTS "Stock_global_referencia_lote_key"\s+ON "Stock" \("referencia", "lote"\) WHERE "serviceStationId" IS NULL AND "lote" IS NOT NULL$/.test(statement))) {
      return statement.replace('ON "Stock"', 'ON pg_temp."Stock"');
    }
    throw new Error('Unrecognized migration statement; refusing rehearsal before any DDL.');
  });
}

async function rehearse(url) {
  if (!/^postgres(ql)?:\/\//.test(url)) throw new Error('--rehearse supports PostgreSQL only.');
  // Validate the entire statement list before opening a connection.
  const statements = postgresRehearsalSql(fs.readFileSync(path.join(__dirname, 'sql', 'stock-lots.postgresql.sql'), 'utf8'));
  const { Client } = require('pg');
  const client = new Client({ connectionString: url });
  const query = async (sql, values) => (await client.query(sql, values)).rows;
  let began = false;
  try {
    await client.connect();
    console.log(`Provider: postgresql; target: ${new URL(url).hostname}${new URL(url).pathname}; mode: REHEARSE (TEMP ONLY, ROLLBACK)`);
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    began = true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    const resolved = await postgresStockInfo(query);
    await client.query('SET LOCAL search_path = pg_temp, pg_catalog');
    const source = await postgresStockInfo(query, resolved.table);
    const before = await query(`SELECT * FROM ${source.table} ORDER BY "id"`);
    console.log('Copied-data preflight:', JSON.stringify(preflight(before, true)));
    // Do not copy sequence/identity defaults: even temporary test inserts must
    // never advance a real production sequence. Existing IDs are copied explicitly.
    await client.query(`CREATE TEMP TABLE "Stock" (LIKE ${source.table} INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE) ON COMMIT DROP`);
    const columnList = source.columns.map(column => quote(column.name)).join(', ');
    await client.query(`INSERT INTO pg_temp."Stock" (${columnList}) SELECT ${columnList} FROM ${source.table}`);
    const cloned = await postgresStockInfo(query);
    if (cloned.schema === source.schema || !cloned.schema.startsWith('pg_temp_')) throw new Error('Temporary Stock isolation failed.');
    // LIKE names the copied indexes automatically. Rename only the exact legacy
    // pair index in the temp namespace so the prepared DROP is actually exercised.
    const oldPair = cloned.indexes.filter(index => /^CREATE UNIQUE INDEX/.test(index.indexdef) && /\((?:"referencia"|referencia), "serviceStationId"\)$/.test(index.indexdef));
    if (source.indexes.some(index => index.indexname === 'Stock_referencia_serviceStationId_key')) {
      if (oldPair.length !== 1) throw new Error('Cannot identify the cloned legacy pair index safely.');
      if (oldPair[0].indexname !== 'Stock_referencia_serviceStationId_key') {
        await client.query(`ALTER INDEX ${quote(cloned.schema)}.${quote(oldPair[0].indexname)} RENAME TO "Stock_referencia_serviceStationId_key"`);
      }
    }
    await client.query('CREATE TEMP TABLE "Stock_lot_rehearsal_links" (source text NOT NULL, "rowId" text NOT NULL, "stockId" integer NOT NULL REFERENCES pg_temp."Stock"("id") ON DELETE CASCADE) ON COMMIT DROP');
    for (const fk of source.incoming) {
      if (fk.columns.length !== 1 || fk.targetColumns.length !== 1 || fk.targetColumns[0] !== 'id') throw new Error('Unsupported incoming FK shape for temporary rehearsal.');
      await client.query(`INSERT INTO pg_temp."Stock_lot_rehearsal_links" SELECT $1, ctid::text, ${quote(fk.columns[0])}
        FROM ${quote(fk.schema)}.${quote(fk.table)} WHERE ${quote(fk.columns[0])} IS NOT NULL`, [`${fk.schema}.${fk.table}:${fk.name}`]);
    }
    const linkSql = 'SELECT * FROM pg_temp."Stock_lot_rehearsal_links" ORDER BY source, "rowId", "stockId"';
    const linksBefore = await query(linkSql);
    console.log('Copied incoming associations:', linksBefore.length, 'from', source.incoming.length, 'FKs');
    await client.query('SAVEPOINT stock_lot_rehearsal_ddl');
    for (const [index, statement] of statements.entries()) {
      try { await client.query(statement); }
      catch (error) {
        console.log(`Temporary DDL blocked at statement ${index + 1}/${statements.length}; SQLSTATE ${error.code || 'unknown'}; production target untouched.`);
        await client.query('ROLLBACK TO SAVEPOINT stock_lot_rehearsal_ddl');
        if (JSON.stringify(before) !== JSON.stringify(await query('SELECT * FROM pg_temp."Stock" ORDER BY "id"')) ||
            fingerprint(linksBefore) !== fingerprint(await query(linkSql))) throw new Error('Temporary rejected-migration rollback verification failed.');
        if (JSON.stringify(source) !== JSON.stringify(await postgresStockInfo(query, source.table)) ||
            JSON.stringify(before) !== JSON.stringify(await query(`SELECT * FROM ${source.table} ORDER BY "id"`))) throw new Error('Source schema/data changed within rehearsal snapshot.');
        console.log('Verified rejected-DDL rollback: copied IDs, all fields and associations unchanged; source schema/data unchanged in snapshot.');
        throw error;
      }
    }
    const after = await query('SELECT * FROM pg_temp."Stock" ORDER BY "id"');
    if (fingerprint(before) !== fingerprint(after)) throw new Error('Temporary Stock IDs/other data changed.');
    if (fingerprint(linksBefore) !== fingerprint(await query(linkSql))) throw new Error('Temporary associations changed.');
    const migrated = await postgresStockInfo(query);
    if (JSON.stringify(migrated.columns) !== JSON.stringify(cloned.columns) ||
        !migrated.indexes.some(index => index.indexname === 'Stock_referencia_serviceStationId_lote_key') ||
        !migrated.indexes.some(index => index.indexname === 'Stock_global_referencia_lote_key') ||
        migrated.indexes.some(index => index.indexname === 'Stock_referencia_serviceStationId_key')) throw new Error('Temporary schema postconditions failed.');
    console.log('Verified temporary Stock:', preflight(after));
    console.log('Verified copied incoming associations:', linksBefore.length, 'from', source.incoming.length, 'FKs');
    console.log('Temporary post-migration indexes:', migrated.indexes);
    // Re-read explicitly qualified source data; pg_temp must never shadow it.
    if (JSON.stringify(before) !== JSON.stringify(await query(`SELECT * FROM ${source.table} ORDER BY "id"`)) ||
        JSON.stringify(source) !== JSON.stringify(await postgresStockInfo(query, source.table))) throw new Error('Source schema/data changed within rehearsal snapshot.');
    await client.query('ROLLBACK');
    began = false;
    const [cleanup] = await query(`SELECT pg_catalog.to_regclass('pg_temp."Stock"') IS NULL AS clean`);
    if (!cleanup.clean) throw new Error('Temporary table cleanup failed.');
    console.log('PASS: PostgreSQL DDL rehearsed on copied rows and associations; transaction rolled back; no real Stock/index/sequence writes.');
  } finally {
    try {
      if (began) {
        await client.query('ROLLBACK');
        console.log('Rehearsal transaction rolled back; temporary DDL/data discarded.');
      }
    }
    finally { await client.end(); }
  }
}

async function migrate(url, apply, confirm, options = {}) {
  const sqlite = url.startsWith('file:');
  if (!sqlite && !/^postgres(ql)?:\/\//.test(url)) throw new Error('Only file: or PostgreSQL targets are supported.');
  const target = sqlite ? path.resolve(url.slice(5)) : `${new URL(url).hostname}${new URL(url).pathname}`;
  if (sqlite && !fs.existsSync(target)) throw new Error('SQLite target must already exist.');
  console.log(`Provider: ${sqlite ? 'sqlite' : 'postgresql'}; target: ${target}; mode: ${apply ? 'APPLY' : 'CHECK'}`);
  if (apply && confirm !== target) throw new Error('Supply --confirm-target with exactly the target shown by --check.');
  if (apply && !sqlite && new URL(url).port === '6543' && /(?:\.supabase\.co|\.supabase\.com)$/.test(new URL(url).hostname) && !options.allowTransactionPooler) {
    throw new Error('Use a verified direct or session-mode connection for APPLY, not the Supabase transaction pooler.');
  }
  // Validate all PostgreSQL DDL before connecting, including on direct targets.
  const statements = apply && !sqlite ? postgresRehearsalSql(fs.readFileSync(path.join(__dirname, 'sql', 'stock-lots.postgresql.sql'), 'utf8'))
    .map(statement => statement.replace('pg_temp.', 'public.')) : null;
  let backupDir;
  if (apply && !sqlite) {
    if (!options.backupDir || !fs.lstatSync(options.backupDir).isDirectory()) throw new Error('A preexisting local --backup-dir is required for PostgreSQL APPLY.');
    backupDir = fs.realpathSync(options.backupDir);
  }
  let client, query, execute, close;
  if (sqlite) {
    const { PrismaClient } = require('@prisma/client');
    client = new PrismaClient({ datasources: { db: { url: `file:${target}` } } });
    query = sql => client.$queryRawUnsafe(sql);
    execute = sql => client.$executeRawUnsafe(sql);
    close = () => client.$disconnect();
  } else {
    const { Client } = require('pg');
    client = new Client({ connectionString: url, connectionTimeoutMillis: 15000 });
    await client.connect();
    query = async (sql, values) => (await client.query(sql, values)).rows;
    execute = sql => client.query(sql);
    close = () => client.end();
  }
  let began = false;
  try {
    if (!sqlite && !apply) {
      await execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      began = true;
      await execute("SET LOCAL lock_timeout = '5s'");
      await execute("SET LOCAL statement_timeout = '60s'");
    }
    if (apply) {
      await execute(sqlite ? 'BEGIN IMMEDIATE' : 'BEGIN');
      began = true;
      if (!sqlite) {
        await execute("SET LOCAL lock_timeout = '5s'");
        await execute("SET LOCAL statement_timeout = '60s'");
        await execute('SET LOCAL search_path = pg_catalog, public');
        await execute('SET LOCAL row_security = off');
        await execute('LOCK TABLE public."Stock" IN ACCESS EXCLUSIVE MODE');
      }
    }
    const info = sqlite ? null : await postgresStockInfo(query, 'public."Stock"');
    if (info) {
      console.log('Stock schema:', info.schema, 'columns:', info.columns);
      console.log('Stock constraints:', info.constraints);
      console.log('Incoming Stock FKs:', info.incoming);
    }
    const rows = await query(`SELECT * FROM ${info ? info.table : '"Stock"'} ORDER BY "id"`);
    console.log('Preflight:', JSON.stringify(preflight(rows, true)));
    const indexes = info ? info.indexes : await query("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'Stock'");
    console.log('Indexes:', indexes);
    if (indexes.some(index => /CREATE UNIQUE INDEX/i.test(index.sql || index.indexdef || '') && /\breferencia\b/.test(index.sql || index.indexdef || '') && !/\blote\b/.test(index.sql || index.indexdef || '') && (index.name || index.indexname) !== 'Stock_referencia_serviceStationId_key')) {
      throw new Error('Unexpected reference-only unique index; review its provider-specific removal before migration. No changes applied.');
    }
    preflight(rows);
    if (!apply) return;
    const before = fingerprint(rows);
    let backup;
    if (!sqlite) {
      const conflicts = await query(`SELECT c.relname FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_catalog.pg_index i ON i.indexrelid = c.oid
        WHERE n.nspname = 'public' AND c.relname IN
          ('Stock_referencia_serviceStationId_key', 'Stock_referencia_serviceStationId_lote_key', 'Stock_global_referencia_lote_key')
          AND (i.indrelid IS NULL OR i.indrelid <> $1)`, [info.oid]);
      if (conflicts.length) throw new Error('Reviewed index name belongs to another relation; refusing DDL.');
      const identity = await query('SELECT current_database() AS database, current_user AS role');
      const snapshot = { identity, rows, schema: info, fingerprint: before };
      const contents = JSON.stringify(snapshot, (_, value) => typeof value === 'bigint' ? String(value) : value);
      backup = path.join(backupDir, `stock-lots-before-${require('node:crypto').randomUUID()}.json`);
      const fd = fs.openSync(backup, 'wx', 0o600);
      try { fs.writeFileSync(fd, contents); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      const restored = fs.readFileSync(backup, 'utf8');
      if (createHash('sha256').update(restored).digest('hex') !== createHash('sha256').update(contents).digest('hex') ||
          fingerprint(JSON.parse(restored).rows) !== before) throw new Error('Locked backup verification failed; rolling back.');
      console.log(JSON.stringify({ backupVerified: true, backup, fingerprint: before, stockRows: rows.length }));
    }
    if (sqlite) {
      const sql = fs.readFileSync(path.join(__dirname, 'sql', 'stock-lots.sqlite.sql'), 'utf8');
      for (const statement of sql.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean)) await execute(statement);
      if ((await query('PRAGMA foreign_key_check')).length) throw new Error('Foreign key check failed.');
    } else {
      // String queries, sequential awaits: no named prepared statements or pipeline.
      for (const statement of statements) await execute(statement);
    }
    const after = await query(`SELECT * FROM ${info ? info.table : '"Stock"'} ORDER BY "id"`);
    if (fingerprint(after) !== before) throw new Error('Stock IDs/data changed unexpectedly; rolling back.');
    if (info) {
      const migrated = await postgresStockInfo(query, 'public."Stock"');
      const normalize = definition => definition.replace(/ IF NOT EXISTS| USING btree/g, '').replace(/["()\s]/g, '');
      for (const statement of statements.slice(1)) {
        const name = statement.match(/INDEX IF NOT EXISTS "([^"]+)"/)[1];
        const index = migrated.indexes.find(index => index.indexname === name);
        if (!index || normalize(index.indexdef) !== normalize(statement)) throw new Error('Lot index definition verification failed; rolling back.');
      }
      const changedNames = ['Stock_referencia_serviceStationId_key', 'Stock_referencia_serviceStationId_lote_key', 'Stock_global_referencia_lote_key'];
      if (migrated.indexes.some(index => index.indexname === changedNames[0]) ||
          fingerprint(info.indexes.filter(index => !changedNames.includes(index.indexname))) !== fingerprint(migrated.indexes.filter(index => !changedNames.includes(index.indexname))) ||
          fingerprint([info.columns, info.constraints, info.incoming]) !== fingerprint([migrated.columns, migrated.constraints, migrated.incoming])) throw new Error('Schema preservation verification failed; rolling back.');
    }
    console.log('Verified unchanged IDs, quantities, reservations and other Stock fields:', preflight(after));
    await execute('COMMIT');
    began = false;
    console.log('Index-only migration committed. All legacy lots/NULLs and Stock fields preserved exactly.');
    return { backup, fingerprint: before, stockRows: after.length, allStockFieldsUnchanged: true };
  } finally {
    try { if (began) await execute('ROLLBACK'); } finally { await close(); }
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const envFile = args.find(arg => arg.startsWith('--env-file='))?.slice(11);
  const envValues = envFile ? require('dotenv').parse(fs.readFileSync(path.resolve(envFile))) : null;
  if (!envFile) require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'));
  const env = args.find(arg => arg.startsWith('--target-env='))?.slice(13);
  const url = env && (envValues ? envValues[env] : process.env[env]);
  if (!url || args.filter(arg => ['--check', '--apply', '--rehearse'].includes(arg)).length !== 1) {
    console.error('Usage: node scripts/migrate-stock-lots.cjs --check|--apply|--rehearse --target-env=STOCK_LOTS_DATABASE_URL [--env-file=FILE] [--confirm-target=host/database or absolute SQLite path] [--backup-dir=EXISTING_DIRECTORY] [--allow-transaction-pooler]');
    process.exitCode = 1;
  } else (args.includes('--rehearse') ? rehearse(url) : migrate(url, args.includes('--apply'), args.find(arg => arg.startsWith('--confirm-target='))?.slice(17), {
    allowTransactionPooler: args.includes('--allow-transaction-pooler'), backupDir: args.find(arg => arg.startsWith('--backup-dir='))?.slice(13),
  }))
    .catch(error => { console.error(error.code || error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]')); process.exitCode = 1; });
}

module.exports = { migrate, preflight, rehearse, postgresRehearsalSql };
