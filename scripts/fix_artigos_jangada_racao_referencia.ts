/**
 * Corrige artigos das jangadas que são rações de emergência mas ficaram com a
 * referência do KIT REPARAÇÃO (30202013), passando a usar a referência correta
 * 30202084 ("06 RAÇÃO EMERGÊNCIA - 0,5 KG").
 *
 * Idempotente. Por omissão mostra apenas o preview (dry-run); usa --apply para gravar.
 *
 * Uso:
 *   npx tsx scripts/fix_artigos_jangada_racao_referencia.ts            # preview
 *   npx tsx scripts/fix_artigos_jangada_racao_referencia.ts --apply     # grava
 *
 * NOTA: liga à base indicada pela variável DATABASE_URL (local = SQLite, produção = Postgres).
 */

import { PrismaClient } from "@prisma/client";
import { isRationArticle } from "../src/config/packTemplates";

const prisma = new PrismaClient();

const KIT_REPAIR_REFERENCE = "30202013";
const RATION_REFERENCE = "30202084";
const RATION_NAME = "06 RAÇÃO EMERGÊNCIA - 0,5 KG";

const APPLY = process.argv.includes("--apply");

function looksLikeRation(name?: string | null) {
  return name ? isRationArticle(name) : false;
}

async function main() {
  // Candidatos: artigos que têm a referência do KIT REPARAÇÃO ...
  const candidates = await prisma.artigoJangada.findMany({
    where: { referencia: KIT_REPAIR_REFERENCE },
    include: { Jangada: { select: { serial: true, packType: true } } },
    orderBy: { id: "asc" },
  });

  // ... mas cujo nome corresponde a uma RAÇÃO (não a um kit de reparação).
  const targets = candidates
    .filter((a) => looksLikeRation(a.name))
    .map((a) => ({
      id: a.id,
      name: a.name,
      referencia: a.referencia,
      serial: a.Jangada?.serial || null,
      packType: a.Jangada?.packType || null,
    }));

  console.log(`KIT_REPAIR_REFERENCE=${KIT_REPAIR_REFERENCE} | RATION_REFERENCE=${RATION_REFERENCE}`);
  console.log(`Candidatos (ref ${KIT_REPAIR_REFERENCE}): ${candidates.length}`);
  console.log(`Rações a corrigir (nome de ração): ${targets.length}`);
  console.log("");

  if (targets.length === 0) {
    console.log("Nada a corrigir. Tudo conforme.");
    return;
  }

  for (const t of targets) {
    console.log(
      `  id ${t.id} | "${t.name}" | ref ${t.referencia} | jangada ${t.serial} (${t.packType})  ->  novo: "${RATION_NAME}" / ${RATION_REFERENCE}`
    );
  }

  if (!APPLY) {
    console.log("\n[DRY-RUN] Nada foi gravado. Usa --apply para aplicar.");
    return;
  }

  const ids = targets.map((t) => t.id);
  const result = await prisma.artigoJangada.updateMany({
    where: { id: { in: ids }, referencia: KIT_REPAIR_REFERENCE },
    data: { referencia: RATION_REFERENCE, name: RATION_NAME },
  });
  console.log(`\n[APLICADO] ${result.count} artigo(s) corrigido(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
