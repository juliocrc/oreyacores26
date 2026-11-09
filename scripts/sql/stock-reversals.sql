-- PostgreSQL only. Apply independently of the historical SQLite migration chain.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public."MovimentacaoStock" ADD COLUMN IF NOT EXISTS "reversaoDeId" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "MovimentacaoStock_reversaoDeId_key"
  ON public."MovimentacaoStock" ("reversaoDeId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'MovimentacaoStock_reversaoDeId_fkey'
      AND conrelid = 'public."MovimentacaoStock"'::regclass) THEN
    ALTER TABLE public."MovimentacaoStock"
      ADD CONSTRAINT "MovimentacaoStock_reversaoDeId_fkey"
      FOREIGN KEY ("reversaoDeId") REFERENCES public."MovimentacaoStock" (id)
      ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;
END $$;
COMMIT;
