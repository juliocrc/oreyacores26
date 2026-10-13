-- sessão única por utilizador: guarda o identificador da sessão ativa.
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "activeSessionId" TEXT;
