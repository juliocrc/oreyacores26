/**
 * Correção pontual de dados: artigos "Kit de Reparação" que estão associados
 * erradamente ao stock de RAÇÃO (id 26, ref 30202084) em vez do stock do KIT
 * (id 244, ref 30202013), e artigos de RAÇÃO em jangadas Pack E que deveriam
 * ser Kit de Reparação.
 *
 * Idempotente. Preview por omissão; usa --apply para gravar.
 *
 *   npx tsx scripts/fix_kit_reparacao_stock_packE.ts            # preview
 *   npx tsx scripts/fix_kit_reparacao_stock_packE.ts --apply     # grava
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const RATION_STOCK_ID = 26;   // "06 RAÇÃO EMERGÊNCIA - 0,5 KG" / 30202084
const KIT_STOCK_ID = 244;     // "07 KIT REPARAÇÃO" / 30202013
const KIT_REFERENCE = "30202013";
const KIT_NAME = "Kit de Reparação";

const APPLY = process.argv.includes("--apply");

async function main() {
  // 1) Kits de reparação (ref 30202013) com stockId apontando para a RAÇÃO (26)
  const kitsWrongStock = await prisma.artigoJangada.findMany({
    where: { referencia: KIT_REFERENCE, stockId: RATION_STOCK_ID },
    orderBy: { id: "asc" },
  });

  console.log("== Kits de reparação com stockId de ração (26) ==");
  for (const k of kitsWrongStock) {
    console.log(`  id ${k.id} | "${k.name}" | ref ${k.referencia} | stockId ${k.stockId} -> ${KIT_STOCK_ID}`);
  }
  console.log(`total: ${kitsWrongStock.length}\n`);

  // 2) Artigos de RAÇÃO em jangadas Pack E (que não levam rações) -> Kit de Reparação
  const racoesPackE = await prisma.artigoJangada.findMany({
    where: {
      OR: [{ referencia: "30202084" }, { referencia: KIT_REFERENCE }],
      Jangada: { packType: "E" },
    },
    include: { Jangada: { select: { serial: true, packType: true } } },
    orderBy: { id: "asc" },
  });

  console.log("== Artigos ração/kit em jangadas Pack E ==");
  for (const a of racoesPackE) {
    console.log(`  id ${a.id} | "${a.name}" | ref ${a.referencia} | stockId ${a.stockId} | jangada ${a.Jangada?.serial} (${a.Jangada?.packType})`);
  }
  console.log(`total: ${racoesPackE.length}\n`);

  if (!APPLY) {
    console.log("[DRY-RUN] Nada gravado. Usa --apply para aplicar.");
    return;
  }

  // Aplicar 1)
  if (kitsWrongStock.length > 0) {
    const ids = kitsWrongStock.map((k) => k.id);
    const r1 = await prisma.artigoJangada.updateMany({
      where: { id: { in: ids } },
      data: { stockId: KIT_STOCK_ID },
    });
    console.log(`[1] Actualizados ${r1.count} kit(s) para stockId ${KIT_STOCK_ID}`);
  }

  // Aplicar 2): artigos em Pack E com ref ração/kit -> Kit de Reparação (ref 30202013, stock 244)
  for (const a of racoesPackE) {
    await prisma.artigoJangada.update({
      where: { id: a.id },
      data: {
        name: KIT_NAME,
        referencia: KIT_REFERENCE,
        stockId: KIT_STOCK_ID,
      },
    });
    console.log(`[2] artigo ${a.id} -> "${KIT_NAME}" / ${KIT_REFERENCE} / stock ${KIT_STOCK_ID}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
