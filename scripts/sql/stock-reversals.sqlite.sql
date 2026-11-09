-- SQLite only, run once on a local database. Not part of PostgreSQL migrate history.
PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;
ALTER TABLE "MovimentacaoStock" ADD COLUMN "reversaoDeId" INTEGER
  REFERENCES "MovimentacaoStock" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE UNIQUE INDEX "MovimentacaoStock_reversaoDeId_key" ON "MovimentacaoStock" ("reversaoDeId");
COMMIT;
