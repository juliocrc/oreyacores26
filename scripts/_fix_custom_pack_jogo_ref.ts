/**
 * Correção pontual de dados: items de packs personalizados que usam a
 * referência 30202084 (RAÇÃO) para "Jogo de Reparação" — troca para a
 * referência canónica do jogo 20909107.
 *
 * Regra do utilizador: 30202084 é só Ração; 30202013 é só Kit de Reparação.
 *
 *   npx tsx scripts/_fix_custom_pack_jogo_ref.ts            # preview
 *   npx tsx scripts/_fix_custom_pack_jogo_ref.ts --apply     # grava
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const WRONG_REFERENCE = "30202084";
const JOGO_REFERENCE = "20909107";
const JOGO_STOCK_ID = 53; // "07 KIT REPARAÇÃO RFD" / 20909107

const APPLY = process.argv.includes("--apply");

async function main() {
  const packs = await prisma.customPackType.findMany({
    select: { id: true, name: true, items: true },
  });

  const hits: Array<{ packId: number; packName: string; itemId: number }> = [];

  for (const pack of packs) {
    for (const item of pack.items) {
      if (item.stockReference === WRONG_REFERENCE && /repara|kit/i.test(item.stockDescription)) {
        hits.push({ packId: pack.id, packName: pack.name, itemId: item.id });
      }
    }
  }

  console.log("== Items 'Jogo/Kit de Reparação' com ref de RAÇÃO (30202084) ==");
  for (const h of hits) {
    console.log(`  pack ${h.packId} "${h.packName}" | item ${h.itemId}`);
  }
  console.log(`total: ${hits.length}`);

  if (!APPLY) {
    console.log("[DRY-RUN] Nada gravado. Usa --apply para aplicar.");
    await prisma.$disconnect();
    return;
  }

  if (hits.length > 0) {
    const r = await prisma.customPackTypeItem.updateMany({
      where: { id: { in: hits.map((h) => h.itemId) } },
      data: { stockReference: JOGO_REFERENCE, stockId: JOGO_STOCK_ID },
    });
    console.log(`[APLICADO] ${r.count} item(s) -> ref ${JOGO_REFERENCE} / stock ${JOGO_STOCK_ID}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});