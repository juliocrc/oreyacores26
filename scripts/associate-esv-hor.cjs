// Prepared for review. --check is read-only; --apply requires separate authorization.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const EXPECTED = [
  { id: 2179, serial: '5017210100016', shipId: null,
    shipNameManual: 'ESV-HOR - Nossa Senhora da Concei\u00e7\u00e3o', serviceStationId: null },
  { id: 2180, serial: '5017210100018', shipId: null, shipNameManual: null, serviceStationId: null },
];

function catalogueTarget() {
  const ts = require('typescript');
  const filename = path.resolve(__dirname, '../src/lib/marinha.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const compiledModule = new Module(filename, module);
  compiledModule.filename = filename;
  compiledModule.paths = Module._nodeModulePaths(path.dirname(filename));
  compiledModule._compile(compiled, filename);
  const targets = compiledModule.exports.marinhaClasses.flatMap(c => c.navios
    .filter(n => n.numero === 'ESV-HOR').map(n => ({ ...n, tipo: c.tipo })));
  if (targets.length !== 1 || targets[0].nome !== 'Nossa Senhora da Concei\u00e7\u00e3o') {
    throw new Error('CATALOGUE_IDENTITY_CHANGED');
  }
  return targets[0];
}

function parseArgs(args) {
  if (args.length !== 3 || !['--check', '--apply'].includes(args[0]) ||
      args[1] !== '--station-id' || !/^[1-9]\d*$/.test(args[2]) ||
      !Number.isSafeInteger(Number(args[2]))) throw new Error('EXPLICIT_MODE_AND_STATION_REQUIRED');
  return { apply: args[0] === '--apply', stationId: Number(args[2]) };
}

async function associate(client, { apply, stationId }, target) {
  if (!Number.isSafeInteger(stationId) || stationId <= 0 || typeof apply !== 'boolean') {
    throw new Error('EXPLICIT_MODE_AND_STATION_REQUIRED');
  }
  if (target.numero !== 'ESV-HOR' || target.nome !== 'Nossa Senhora da Concei\u00e7\u00e3o') {
    throw new Error('CATALOGUE_IDENTITY_CHANGED');
  }
  try {
    await client.query(apply ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' :
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15000ms'");
    await client.query("SET LOCAL lock_timeout = '3000ms'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '15000ms'");
    // Matricula has no unique constraint. Block concurrent vessel writes during the short apply.
    if (apply) await client.query('LOCK TABLE "Navio" IN SHARE ROW EXCLUSIVE MODE');
    const stations = (await client.query(`SELECT id, codigo, nome, ativo, "territorioTipo"
      FROM "ServiceStation" WHERE "territorioTipo" = 'AZORES' OR id = $1
      ORDER BY id${apply ? ' FOR UPDATE' : ''}`, [stationId])).rows;
    const active = stations.filter(s => s.ativo && s.territorioTipo === 'AZORES');
    if (active.length !== 1 || active[0].id !== stationId || active[0].codigo !== 'ACORES') {
      throw new Error('STATION_EVIDENCE_CHANGED');
    }
    const ships = (await client.query(`SELECT id FROM "Navio"
      WHERE regexp_replace(upper(matricula), '[^A-Z0-9]', '', 'g') = 'ESVHOR'
      OR mmsi = '263080000'`)).rows;
    // Expected absence is part of the reviewed precondition; never select by name.
    if (ships.length !== 0) throw new Error('VESSEL_IDENTITY_CONFLICT_OR_CHANGED');
    const rafts = (await client.query(`SELECT id, serial, "shipId", "shipNameManual", "serviceStationId"
      FROM "Jangada" WHERE id = ANY($1::int[])
      OR regexp_replace(serial, '[^0-9]', '', 'g') = ANY($2::text[])
      ORDER BY id${apply ? ' FOR UPDATE' : ''}`,
    [EXPECTED.map(r => r.id), EXPECTED.map(r => r.serial)])).rows;
    if (rafts.length !== 2 || EXPECTED.some((expected, i) =>
      Object.keys(expected).some(key => expected[key] !== rafts[i]?.[key]))) {
      throw new Error('RAFT_OLD_VALUES_CHANGED');
    }
    const inspectionCount = Number((await client.query(`SELECT count(*) FROM "Inspecao"
      WHERE "jangadaId" = ANY($1::int[]) OR "jangadaSerial" = ANY($2::text[])`,
    [EXPECTED.map(r => r.id), EXPECTED.map(r => r.serial)])).rows[0].count);
    const report = { mode: apply ? 'apply' : 'check', station: active[0],
      vesselIdentity: target.numero, vesselsToCreate: 1, raftsToUpdate: 2,
      auditRecordsToCreate: 3, inspectionsPreserved: inspectionCount, historyWrites: 0 };
    if (!apply) {
      await client.query('ROLLBACK');
      return { ...report, mutations: 0 };
    }
    const ship = (await client.query(`INSERT INTO "Navio"
      (nome, matricula, "serviceStationId", ilha, "tipoPesca", "tipoNavio", bandeira, proprietario)
      VALUES ($1, $2, $3, '', '', $4, 'Portugal', 'Marinha Portuguesa')
      RETURNING id, nome, matricula, "serviceStationId"`,
    [target.nome, target.numero, stationId, target.tipo])).rows[0];
    const audit = async (table, operation, id, before, after) => {
      const result = await client.query(`INSERT INTO "Auditoria"
        (tabela, "tipoOperacao", "idRegisto", descricao, usuario, "dadosAntes", "dadosDepois")
        VALUES ($1, $2, $3, $4, $5, $6, $7)`, [table, operation, id,
        'ESV-HOR: explicit reviewed association; inspection and station history unchanged',
        'maintenance:associate-esv-hor', before ? JSON.stringify(before) : null, JSON.stringify(after)]);
      if (result.rowCount !== 1) throw new Error('AUDIT_COUNT_MISMATCH');
    };
    await audit('Navio', 'CREATE', ship.id, null, ship);
    for (const old of EXPECTED) {
      const updated = await client.query(`UPDATE "Jangada"
        SET "shipId" = $1, "shipNameManual" = '', "serviceStationId" = $2, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = $3 AND serial = $4 AND "shipId" IS NOT DISTINCT FROM $5::int
        AND "shipNameManual" IS NOT DISTINCT FROM $6::text
        AND "serviceStationId" IS NOT DISTINCT FROM $7::int
        RETURNING id, serial, "shipId", "shipNameManual", "serviceStationId"`,
      [ship.id, stationId, old.id, old.serial, old.shipId, old.shipNameManual, old.serviceStationId]);
      if (updated.rowCount !== 1) throw new Error('RAFT_UPDATE_COUNT_MISMATCH');
      await audit('Jangada', 'UPDATE', old.id, old, updated.rows[0]);
    }
    await client.query('COMMIT');
    return { ...report, committed: true, shipId: ship.id };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const target = catalogueTarget();
  const config = require('dotenv').parse(fs.readFileSync(path.resolve(__dirname, '../.env.production.local')));
  let url;
  try { url = new URL(config.DATABASE_URL); } catch { throw new Error('INVALID_DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('INVALID_DATABASE_PROTOCOL');
  const client = new (require('pg').Client)({ connectionString: config.DATABASE_URL,
    connectionTimeoutMillis: 15000, application_name: 'reviewed-esv-hor-association' });
  try {
    await client.connect();
    console.log(JSON.stringify(await associate(client, options, target), null, 2));
  } finally { await client.end().catch(() => {}); }
}

if (require.main === module) main().catch(() => {
  // Never print driver errors, connection details or private configuration.
  console.error(JSON.stringify({ failed: true, code: 'ASSOCIATION_FAILED_REVIEW_REQUIRED' }));
  process.exitCode = 1;
});

module.exports = { associate, parseArgs, catalogueTarget };
