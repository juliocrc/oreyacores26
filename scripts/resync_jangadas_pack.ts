/**
 * Re-sincroniza os artigos físicos (ArtigoJangada) de todas as jangadas com
 * o esperado pelo Tipo de Pack e Lotação, resolvendo também o stockId de
 * cada artigo (linkagem com o catálogo de stock, agora alargado às novas
 * famílias do sistema de insuflação).
 *
 * Idempotente. Preview por omissão; usa --apply para gravar.
 *
 *   npx tsx scripts/resync_jangadas_pack.ts             # preview
 *   npx tsx scripts/resync_jangadas_pack.ts --apply      # grava
 *
 * Envolve syncRaftArticlesWithPackType (src/lib/checklist-sync.ts).
 */

import { PrismaClient } from "@prisma/client";
import { syncRaftArticlesWithPackType } from "../src/lib/checklist-sync";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

async function main() {
  const rafts = await prisma.jangada.findMany({
    select: {
      id: true,
      serial: true,
      brand: true,
      model: true,
      packType: true,
      capacity: true,
      _count: { select: { artigos: true } },
    },
    orderBy: { id: "asc" },
  });

  const valid = rafts.filter(
    (r) => r.brand?.trim() && r.model?.trim() && r.packType?.trim(),
  );

  console.log(`Jangadas: ${rafts.length} (${valid.length} com brand/model/packType válidos).`);

  if (!APPLY) {
    for (const r of valid) {
      console.log(
        `  [preview] #${r.id} ${r.serial} | ${r.brand} · ${r.model} | pack=${r.packType} | lotação=${r.capacity} | artigos=${r._count.artigos}`,
      );
    }
    console.log("\n[preview] Executar com --apply para re-sincronizar todas (syncRaftArticlesWithPackType).");
    return;
  }

  let totalAdded = 0;
  let totalUpdated = 0;
  let totalStockLinked = 0;
  let totalRemoved = 0;
  let failures = 0;

  for (const r of valid) {
    try {
      const result = await syncRaftArticlesWithPackType(r.id, { linkStock: true });
      const s = result.summary;
      totalAdded += s.added;
      totalUpdated += s.updated;
      totalStockLinked += s.stockLinked;
      totalRemoved += s.removed;
      console.log(
        `  [apply] #${r.id} ${r.serial} | ${r.brand}·${r.model} | pack=${r.packType} | +${s.added} ~${s.updated} 🔗${s.stockLinked} -${s.removed} (${s.total}) | src=${result.packSource}${result.warning ? " ⚠ " + result.warning : ""}`,
      );
    } catch (e) {
      failures++;
      console.error(`  [apply] #${r.id} ${r.serial} falhou:`, e);
    }
  }

  console.log(
    `\n[apply] resumo: ${valid.length} jangadas, +${totalAdded} adicionados, ~${totalUpdated} atualizados, 🔗${totalStockLinked} stock linkados, -${totalRemoved} removidos, ${failures} falhas.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });