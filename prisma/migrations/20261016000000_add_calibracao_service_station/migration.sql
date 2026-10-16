ALTER TABLE "CalibracaoEquipamento" ADD COLUMN "serviceStationId" INTEGER;

CREATE INDEX "CalibracaoEquipamento_serviceStationId_idx" ON "CalibracaoEquipamento"("serviceStationId");
