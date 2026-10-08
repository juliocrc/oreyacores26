// Helper partilhado de verificação de backups SQLite.
// Usado por scripts/db_backup.js, scripts/restore_from_backup.js e scripts/verify_backups.cjs.

const fs = require('fs');

function sqliteHeaderOk(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(16);
      fs.readSync(fd, buf, 0, 16, 0);
      return buf.toString('utf8') === 'SQLite format 3\0';
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

// Abre o ficheiro com Prisma e conta registos nas tabelas principais.
// Devolve { ok: true, counts } ou { ok: false, error }.
async function verifyBackup(filePath) {
  if (!sqliteHeaderOk(filePath)) {
    return { ok: false, error: 'O ficheiro não é uma base SQLite válida.' };
  }
  try {
    const { PrismaClient } = require('@prisma/client');
    const url = 'file:' + filePath.replace(/\\/g, '/');
    const client = new PrismaClient({ datasources: { db: { url } } });
    try {
      const counts = {};
      for (const table of ['Inspecao', 'Jangada', 'Stock']) {
        const res = await client.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM "${table}"`);
        counts[table] = Number(res && res[0] ? res[0].c : 0);
      }
      return { ok: true, counts };
    } finally {
      await client.$disconnect();
    }
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

module.exports = { sqliteHeaderOk, verifyBackup };