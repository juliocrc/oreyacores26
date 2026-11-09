-- Apply manually before activating declaration issuance. No historical rows are rewritten.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS "DeclaracaoIsencaoIva" (
  "id" SERIAL PRIMARY KEY,
  "numeroSequencial" INTEGER NOT NULL,
  "ano" INTEGER NOT NULL,
  "numeroCompleto" TEXT NOT NULL,
  "clienteNome" TEXT, "clienteNif" TEXT, "navioNome" TEXT, "navioMatricula" TEXT,
  "codigoIsencaoIva" TEXT, "origem" TEXT, "emitidoPorId" TEXT,
  "dataEmissao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "DeclaracaoIsencaoIva"
  ADD COLUMN IF NOT EXISTS "clienteId" INTEGER,
  ADD COLUMN IF NOT EXISTS "navioId" INTEGER,
  ADD COLUMN IF NOT EXISTS "snapshotJson" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
-- Existing duplicates fail activation instead of silently renumbering legal documents.
CREATE UNIQUE INDEX IF NOT EXISTS "DeclaracaoIsencaoIva_numeroCompleto_key" ON "DeclaracaoIsencaoIva" ("numeroCompleto");
CREATE UNIQUE INDEX IF NOT EXISTS "DeclaracaoIsencaoIva_ano_numeroSequencial_key" ON "DeclaracaoIsencaoIva" ("ano", "numeroSequencial");
CREATE UNIQUE INDEX IF NOT EXISTS "DeclaracaoIsencaoIva_idempotencyKey_key" ON "DeclaracaoIsencaoIva" ("idempotencyKey");
CREATE INDEX IF NOT EXISTS "DeclaracaoIsencaoIva_ano_idx" ON "DeclaracaoIsencaoIva" ("ano");
CREATE INDEX IF NOT EXISTS "DeclaracaoIsencaoIva_numeroSequencial_idx" ON "DeclaracaoIsencaoIva" ("numeroSequencial");
CREATE INDEX IF NOT EXISTS "DeclaracaoIsencaoIva_clienteId_dataEmissao_idx" ON "DeclaracaoIsencaoIva" ("clienteId", "dataEmissao");
CREATE INDEX IF NOT EXISTS "DeclaracaoIsencaoIva_navioId_dataEmissao_idx" ON "DeclaracaoIsencaoIva" ("navioId", "dataEmissao");
COMMIT;
