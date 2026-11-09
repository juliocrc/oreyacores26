const assert = require('node:assert/strict');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { migrate } = require('./migrate-stock-lots.cjs');

async function main() {
  const parent = 'C:/Users/julio/AppData/Local/Temp/opencode';
  assert(require('node:fs').existsSync(parent));
  const file = path.join(parent, `stock-lots-${Date.now()}.db`);
  const url = `file:${file}`;
  const db = new PrismaClient({ datasources: { db: { url } } });
  const execute = sql => db.$executeRawUnsafe(sql);
  try {
    await execute('PRAGMA foreign_keys = ON');
    await execute(`CREATE TABLE "Stock" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "referencia" TEXT NOT NULL, "serviceStationId" INTEGER, "lote" TEXT, "validade" TEXT, "codigoBarras" TEXT, "quantidade" INTEGER NOT NULL, "quantidadeReservada" INTEGER NOT NULL DEFAULT 0)`);
    await execute('CREATE UNIQUE INDEX "Stock_referencia_serviceStationId_key" ON "Stock" ("referencia", "serviceStationId")');
    await execute('CREATE UNIQUE INDEX "Stock_codigoBarras_key" ON "Stock" ("codigoBarras")');
    await execute('CREATE TABLE "Movement" (id INTEGER PRIMARY KEY, stockId INTEGER REFERENCES "Stock"(id) ON DELETE CASCADE)');
    await execute('CREATE TABLE "Installed" (id INTEGER PRIMARY KEY, stockId INTEGER REFERENCES "Stock"(id) ON DELETE SET NULL)');
    await execute(`INSERT INTO "Stock" VALUES (41, 'FLARE', 1, 'A', '2028-01', 'OLD-41', 12, 3), (42, 'PADDLE', NULL, NULL, NULL, NULL, 5, 0), (43, 'PADDLE', NULL, NULL, NULL, NULL, 3, 0), (44, 'LEGACY-KNOWN', NULL, ' X ', NULL, NULL, 1, 0)`);
    await execute('INSERT INTO "Movement" VALUES (10, 41)');
    await execute('INSERT INTO "Installed" VALUES (20, 41)');
    await db.$disconnect();
    await migrate(url, false);
    await migrate(url, true, file);
    assert.deepEqual(await db.$queryRawUnsafe('SELECT * FROM "Movement"'), [{ id: 10, stockId: 41 }]);
    assert.deepEqual(await db.$queryRawUnsafe('SELECT * FROM "Installed"'), [{ id: 20, stockId: 41 }]);
    assert.equal((await db.$queryRawUnsafe('SELECT lote FROM "Stock" WHERE id=42'))[0].lote, null);
    assert.equal((await db.$queryRawUnsafe('SELECT lote FROM "Stock" WHERE id=43'))[0].lote, null);
    assert.equal((await db.$queryRawUnsafe('SELECT lote FROM "Stock" WHERE id=44'))[0].lote, ' X ');
    await execute(`INSERT INTO "Stock" (referencia, serviceStationId, lote, validade, codigoBarras, quantidade) VALUES ('FLARE', 1, 'B', '2029-01', 'NEW-B', 7)`);
    const lots = await db.$queryRawUnsafe('SELECT id, lote, codigoBarras FROM "Stock" WHERE referencia=\'FLARE\' ORDER BY id');
    assert.equal(lots[0].id, 41);
    assert.notEqual(lots[0].id, lots[1].id);
    assert.notEqual(lots[0].codigoBarras, lots[1].codigoBarras);
    await assert.rejects(execute(`INSERT INTO "Stock" (referencia, serviceStationId, lote, quantidade) VALUES ('FLARE', 1, 'A', 1)`));
    await execute(`INSERT INTO "Stock" (referencia, lote, quantidade) VALUES ('CANONICAL', '', 1)`);
    await assert.rejects(execute(`INSERT INTO "Stock" (referencia, lote, quantidade) VALUES ('CANONICAL', '', 1)`));
    await execute(`INSERT INTO "Stock" (referencia, serviceStationId, lote, quantidade) VALUES ('FLARE', 2, 'A', 1)`);
    const concurrent = await Promise.allSettled([1, 2].map(() => execute(`INSERT INTO "Stock" (referencia, lote, quantidade) VALUES ('RACE', 'R', 1)`)));
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
    await migrate(url, true, file);
    // Only duplicate actual known keys abort; unknown NULL rows were retained.
    await execute('DROP INDEX "Stock_global_referencia_lote_key"');
    await execute(`INSERT INTO "Stock" (referencia, lote, quantidade) VALUES ('RACE', 'R', 1)`);
    await assert.rejects(migrate(url, true, file), /collision/);
    assert.equal((await db.$queryRawUnsafe('SELECT COUNT(*) AS n FROM "Stock" WHERE referencia=\'RACE\''))[0].n, 2n);
    console.log('PASS: exact preservation including duplicate legacy NULLs/whitespace, idempotence, lots A/B, station scope, known null-station uniqueness, concurrent uniqueness and collision rollback.');
    console.log(`Disposable database retained: ${file}`);
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
