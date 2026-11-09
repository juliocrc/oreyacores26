const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const parent = 'C:/Users/julio/AppData/Local/Temp/opencode';
  assert(fs.existsSync(parent));
  const file = path.join(parent, `stock-reversals-${Date.now()}.db`);
  const db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  const execute = sql => db.$executeRawUnsafe(sql);
  try {
    await execute('PRAGMA foreign_keys = ON');
    await execute('CREATE TABLE "Stock" (id INTEGER PRIMARY KEY, quantidade INTEGER NOT NULL)');
    await execute('CREATE TABLE "MovimentacaoStock" (id INTEGER PRIMARY KEY, stockId INTEGER NOT NULL, tipo TEXT NOT NULL, quantidadeAntes INTEGER NOT NULL, quantidadeDepois INTEGER NOT NULL, motivo TEXT, usuario TEXT)');
    await execute('INSERT INTO "Stock" VALUES (41, 10)');
    await execute(`INSERT INTO "MovimentacaoStock" VALUES (12, 41, 'entrada', 2, 5, 'Original', 'actor')`);
    const original = await db.$queryRawUnsafe('SELECT * FROM "MovimentacaoStock"');
    const sql = fs.readFileSync(path.join(__dirname, 'sql/stock-reversals.sqlite.sql'), 'utf8');
    for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await execute(statement);
    assert.deepEqual(await db.$queryRawUnsafe('SELECT id, stockId, tipo, quantidadeAntes, quantidadeDepois, motivo, usuario FROM "MovimentacaoStock"'), original);
    const insert = (id, reversal) => execute(`INSERT INTO "MovimentacaoStock" VALUES (${id}, 41, 'estorno', 10, 7, 'Reason', 'operator', ${reversal})`);
    await insert(13, 12);
    await assert.rejects(insert(14, 12), /UNIQUE constraint failed/);
    await assert.rejects(insert(15, 999), /FOREIGN KEY constraint failed/);
    await assert.rejects(execute('DELETE FROM "MovimentacaoStock" WHERE id = 12'), /FOREIGN KEY constraint failed/);
    await insert(16, 'NULL');
    await insert(17, 'NULL');
    // The compensating audit constraint and stock update must roll back together.
    await assert.rejects(db.$transaction(async tx => {
      await tx.$executeRawUnsafe('UPDATE "Stock" SET quantidade = quantidade - 3 WHERE id = 41');
      await tx.$executeRawUnsafe(`INSERT INTO "MovimentacaoStock" VALUES (18, 41, 'estorno', 10, 7, 'Duplicate', 'operator', 12)`);
    }), /UNIQUE constraint failed/);
    assert.equal((await db.$queryRawUnsafe('SELECT quantidade FROM "Stock" WHERE id = 41'))[0].quantidade, 10);
    console.log('PASS: SQLite additive migration preserves original, nullable uniqueness, FK, deletion protection and atomic rollback.');
    console.log(`Disposable database: ${file}`);
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
