-- Portal do cliente: dispositivos registados e revogação individual.
-- Aplicar na base PostgreSQL de produção (Supabase/Neon/Postgres).

CREATE TABLE IF NOT EXISTS "PortalDevice" (
    "id" SERIAL PRIMARY KEY,
    "clienteId" INTEGER NOT NULL REFERENCES "Cliente"("id") ON DELETE CASCADE,
    "deviceId" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "app" TEXT,
    "modelo" TEXT,
    "osVersion" TEXT,
    "appVersion" TEXT,
    "serviceStationId" INTEGER,
    "ultimoAcesso" TIMESTAMP NOT NULL DEFAULT now(),
    "revogado" BOOLEAN NOT NULL DEFAULT false,
    "revogadoEm" TIMESTAMP,
    "criadoEm" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "PortalDevice_clienteId_deviceId_key"
    ON "PortalDevice" ("clienteId", "deviceId");

CREATE INDEX IF NOT EXISTS "PortalDevice_clienteId_revogado_idx"
    ON "PortalDevice" ("clienteId", "revogado");

CREATE INDEX IF NOT EXISTS "PortalDevice_deviceId_idx"
    ON "PortalDevice" ("deviceId");
