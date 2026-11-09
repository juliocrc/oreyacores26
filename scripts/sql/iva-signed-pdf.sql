-- Manual rollout only, after approval and a verified backup/PITR restore point.
-- Additive: no backfill, defaults, renumbering or snapshot changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public."DeclaracaoIsencaoIva"
  ADD COLUMN IF NOT EXISTS "pdfAssinadoMeta" TEXT;
-- Verify the existing column too; IF NOT EXISTS alone could mask schema drift.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'DeclaracaoIsencaoIva'
      AND column_name = 'pdfAssinadoMeta' AND data_type = 'text' AND is_nullable = 'YES'
      AND column_default IS NULL
  ) THEN
    RAISE EXCEPTION 'Unexpected pdfAssinadoMeta type/nullability/default';
  END IF;
END $$;
COMMIT;
