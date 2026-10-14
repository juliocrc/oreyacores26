-- Multi-estacao:
--  * ServiceStation.prefixo: prefixo de numeracao por estacao (ex.: AZ, LX, AV)
--  * ContactoInterno.serviceStationId: liga contactos internos a uma estacao
-- Idempotente: pode ser reaplicada sem efeitos colaterais.

ALTER TABLE "ServiceStation" ADD COLUMN IF NOT EXISTS "prefixo" TEXT;

ALTER TABLE "ContactoInterno" ADD COLUMN IF NOT EXISTS "serviceStationId" INTEGER;

CREATE INDEX IF NOT EXISTS "ContactoInterno_serviceStationId_idx"
  ON "ContactoInterno"("serviceStationId");

DO $$
BEGIN
  ALTER TABLE "ContactoInterno"
    ADD CONSTRAINT "ContactoInterno_serviceStationId_fkey"
    FOREIGN KEY ("serviceStationId") REFERENCES "ServiceStation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
