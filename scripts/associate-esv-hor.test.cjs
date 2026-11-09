const test = globalThis.test || require('node:test').test;
const assert = require('node:assert/strict');
const { associate, parseArgs, catalogueTarget } = require('./associate-esv-hor.cjs');

const target = catalogueTarget();
function fixture(overrides = {}) {
  const calls = [];
  const station = { id: 1, codigo: 'ACORES', nome: 'Test station', ativo: true, territorioTipo: 'AZORES' };
  const rafts = [
    { id: 2179, serial: '5017210100016', shipId: null,
      shipNameManual: `ESV-HOR - ${target.nome}`, serviceStationId: null },
    { id: 2180, serial: '5017210100018', shipId: null, shipNameManual: null, serviceStationId: null },
  ];
  const client = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes('FROM "ServiceStation"')) return { rows: overrides.stations || [station] };
    if (sql.includes('FROM "Navio"')) return { rows: overrides.ships || [] };
    if (sql.includes('FROM "Jangada"')) return { rows: overrides.rafts || rafts };
    if (sql.includes('FROM "Inspecao"')) return { rows: [{ count: '1' }] };
    if (sql.startsWith('INSERT INTO "Navio"')) return { rows: [{ id: 90001, nome: target.nome,
      matricula: target.numero, serviceStationId: 1 }], rowCount: 1 };
    if (sql.startsWith('INSERT INTO "Auditoria"')) {
      if (overrides.auditError) throw new Error('TEST_AUDIT_FAILURE');
      return { rowCount: 1 };
    }
    if (sql.startsWith('UPDATE "Jangada"')) return { rowCount: overrides.updateCount ?? 1,
      rows: [{ id: values[2], serial: values[3], shipId: values[0], shipNameManual: '', serviceStationId: values[1] }] };
    return { rows: [] };
  } };
  return { client, calls, station, rafts };
}

test('requires explicit mode and explicit positive integer station', () => {
  for (const args of [[], ['--apply'], ['--check'], ['--check', '--station-id', '0'],
    ['--check', '--station-id', '1', '--apply'], ['--check', '--station-id', '1.2']]) {
    assert.throws(() => parseArgs(args), /EXPLICIT_MODE_AND_STATION_REQUIRED/);
  }
  assert.deepEqual(parseArgs(['--check', '--station-id', '1']), { apply: false, stationId: 1 });
  assert.deepEqual(parseArgs(['--apply', '--station-id', '1']), { apply: true, stationId: 1 });
});

test('check is a read-only transaction with zero mutation statements', async () => {
  const { client, calls } = fixture();
  const report = await associate(client, { apply: false, stationId: 1 }, target);
  assert.equal(report.mutations, 0);
  assert.equal(report.raftsToUpdate, 2);
  assert.equal(report.inspectionsPreserved, 1);
  assert.match(calls[0].sql, /READ ONLY$/);
  assert.equal(calls.at(-1).sql, 'ROLLBACK');
  assert.equal(calls.some(c => /^(INSERT|UPDATE|DELETE|LOCK|COMMIT)/.test(c.sql)), false);
});

test('apply creates only catalogue vessel, updates exact two old values and audits atomically', async () => {
  const { client, calls, rafts } = fixture();
  const report = await associate(client, { apply: true, stationId: 1 }, target);
  assert.equal(report.committed, true);
  assert.equal(calls.at(-1).sql, 'COMMIT');
  const create = calls.find(c => c.sql.startsWith('INSERT INTO "Navio"'));
  assert.deepEqual(create.values, [target.nome, 'ESV-HOR', 1, target.tipo]);
  const updates = calls.filter(c => c.sql.startsWith('UPDATE'));
  assert.equal(updates.length, 2);
  for (const [i, update] of updates.entries()) {
    assert.deepEqual(update.values, [90001, 1, rafts[i].id, rafts[i].serial, null, rafts[i].shipNameManual, null]);
    assert.match(update.sql, /"shipId" IS NOT DISTINCT FROM/);
    assert.match(update.sql, /"shipNameManual" IS NOT DISTINCT FROM/);
    assert.match(update.sql, /"serviceStationId" IS NOT DISTINCT FROM/);
  }
  assert.equal(calls.filter(c => c.sql.startsWith('INSERT INTO "Auditoria"')).length, 3);
  assert.equal(calls.some(c => /^(DELETE|ALTER|DROP|TRUNCATE)/.test(c.sql)), false);
  assert.equal(calls.some(c => /^(UPDATE|INSERT INTO) "(?:Inspecao|ServiceStationQueue|MovimentoEquipamento|Stock)"/.test(c.sql)), false);
  assert.ok(calls.findIndex(c => c.sql.startsWith('LOCK TABLE')) < calls.findIndex(c => c.sql.includes('FROM "Navio"')));
});

test('rejects changed old values including null versus empty manual', async () => {
  for (const patch of [{ shipId: 12821 }, { serial: 'different' }, { id: 12 },
    { serviceStationId: 2 }, { shipNameManual: '' }]) {
    const data = fixture();
    data.rafts[1] = { ...data.rafts[1], ...patch };
    await assert.rejects(associate(data.client, { apply: true, stationId: 1 }, target), /RAFT_OLD_VALUES_CHANGED/);
    assert.equal(data.calls.at(-1).sql, 'ROLLBACK');
    assert.equal(data.calls.some(c => c.sql.startsWith('INSERT')), false);
  }
});

test('rejects duplicate serial matches, existing identity and ambiguous or wrong station', async () => {
  const data = fixture();
  for (const overrides of [{ ships: [{ id: 12821 }] },
    { rafts: [...data.rafts, { ...data.rafts[0], id: 999 }] },
    { stations: [{ ...data.station, ativo: false }] },
    { stations: [data.station, { ...data.station, id: 7 }] }]) {
    const { client, calls } = fixture(overrides);
    await assert.rejects(associate(client, { apply: true, stationId: 1 }, target));
    assert.equal(calls.at(-1).sql, 'ROLLBACK');
    assert.equal(calls.some(c => c.sql.startsWith('INSERT')), false);
  }
  await assert.rejects(associate(data.client, { apply: false, stationId: 2 }, target), /STATION_EVIDENCE_CHANGED/);
});

test('audit failure or wrong affected count rolls back, never commits', async () => {
  for (const overrides of [{ auditError: true }, { updateCount: 0 }, { updateCount: 2 }]) {
    const { client, calls } = fixture(overrides);
    await assert.rejects(associate(client, { apply: true, stationId: 1 }, target));
    assert.equal(calls.at(-1).sql, 'ROLLBACK');
    assert.equal(calls.some(c => c.sql === 'COMMIT'), false);
  }
});
