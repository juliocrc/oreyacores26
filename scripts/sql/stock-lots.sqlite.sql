-- Index-only: no table rebuild, data normalization or foreign-key changes.
DROP INDEX IF EXISTS "Stock_referencia_serviceStationId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Stock_referencia_serviceStationId_lote_key"
  ON "Stock" ("referencia", "serviceStationId", "lote");
CREATE UNIQUE INDEX IF NOT EXISTS "Stock_global_referencia_lote_key"
  ON "Stock" ("referencia", "lote") WHERE "serviceStationId" IS NULL AND "lote" IS NOT NULL;
