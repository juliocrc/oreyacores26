-- Acesso ao portal do cliente + sessões longas revogáveis.
-- Aplicar uma vez na base PostgreSQL de produção (Supabase/Neon/Postgres).
-- Alternativa: npx prisma db push --schema=prisma/schema.postgresql.prisma

ALTER TABLE "Cliente"
    ADD COLUMN IF NOT EXISTS "portalAtivo" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Cliente"
    ADD COLUMN IF NOT EXISTS "portalSessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Cliente_portalAtivo_idx"
    ON "Cliente" ("portalAtivo");
