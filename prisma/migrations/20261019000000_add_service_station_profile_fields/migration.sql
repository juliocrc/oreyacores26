ALTER TABLE "ServiceStation" ADD COLUMN IF NOT EXISTS "morada" TEXT;
ALTER TABLE "ServiceStation" ADD COLUMN IF NOT EXISTS "codigoPostal" TEXT;
ALTER TABLE "ServiceStation" ADD COLUMN IF NOT EXISTS "localidade" TEXT;
ALTER TABLE "ServiceStation" ADD COLUMN IF NOT EXISTS "telefone" TEXT;
ALTER TABLE "ServiceStation" ADD COLUMN IF NOT EXISTS "telefone2" TEXT;
ALTER TABLE "ServiceStation" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "ServiceStation" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "ServiceStation" ADD COLUMN IF NOT EXISTS "dgrmCertificado" TEXT;
ALTER TABLE "ServiceStation" ADD COLUMN IF NOT EXISTS "dgrmVerificacao" TIMESTAMP(3);
ALTER TABLE "ServiceStation" ADD COLUMN IF NOT EXISTS "dgrmValidade" TIMESTAMP(3);
ALTER TABLE "ServiceStation" ADD COLUMN IF NOT EXISTS "dgrmMarcas" TEXT;

UPDATE "ServiceStation"
SET
  "nome" = 'Açores',
  "empresa" = 'Orey - Técnica Naval e Industrial Lda.',
  "localizacao" = 'Cabouco',
  "morada" = 'Zona Industrial dos Portões Vermelhos, Armazém 19',
  "codigoPostal" = '9560-350',
  "localidade" = 'Cabouco',
  "telefone" = '+351 296 929 314',
  "telefone2" = '+351 296 929 315',
  "email" = 'azores.tecnica@orey.com',
  "website" = 'www.oreytecnica.com',
  "dgrmCertificado" = '12/2025',
  "dgrmVerificacao" = TIMESTAMP '2024-02-12 12:00:00',
  "dgrmValidade" = TIMESTAMP '2026-02-12 12:00:00',
  "dgrmMarcas" = 'DSB; RFD; SURVITECZODIAC',
  "observacoes" = 'Certificado DGRM 12/2025, verificação 12.02.2024, válido até 12.02.2026 (registo histórico).',
  "prefixo" = 'AZ',
  "ativo" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "codigo" = 'ACORES';

UPDATE "ServiceStation"
SET
  "nome" = 'Alcantarilha',
  "empresa" = 'Orey Técnica – Serviços Navais, Lda.',
  "localizacao" = 'Alcantarilha',
  "morada" = 'Zona Industrial e Comercial do Rogel, Lote C – Fração G',
  "codigoPostal" = '8365-204',
  "localidade" = 'Alcantarilha',
  "telefone" = '+351 282 322 795',
  "telefone2" = '+351 282 322 156',
  "email" = 'algarve.tecnica@orey.com',
  "website" = 'www.oreytecnica.com',
  "dgrmCertificado" = '9/2025',
  "dgrmVerificacao" = TIMESTAMP '2025-09-05 12:00:00',
  "dgrmValidade" = TIMESTAMP '2026-09-19 12:00:00',
  "dgrmMarcas" = 'RFD; OCEAN SAFETY; SEA-SAFE',
  "observacoes" = 'Certificado DGRM 9/2025, verificação 05.09.2025, válido até 19.09.2026 (registo histórico).',
  "ativo" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "codigo" = 'ALCATARILHA';
