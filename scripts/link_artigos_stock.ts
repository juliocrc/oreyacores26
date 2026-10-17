/**
 * Liga ao catálogo de stock todos os artigos FÍSICOS das jangadas que ainda
 * não tenham stockId, preenchendo também a validade em falta a partir do stock.
 *
 * Não cria nem remove artigos — apenas resolve a ligação stockId (e a validade
 * em falta). Idempotente. Preview por omissão; usa --apply para gravar.
 *
 *   npx tsx scripts/link_artigos_stock.ts            # preview
 *   npx tsx scripts/link_artigos_stock.ts --apply    # grava
 *
 * Para produção (Supabase), correr com DATABASE_URL a apontar para a base de
 * produção. Garantir que o Prisma Client foi gerado para o schema correto.
 */

import { PrismaClient } from "@prisma/client";
import { linkPhysicalArticlesToStock } from "../src/lib/checklist-sync";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function fetchAllStock() {
  return prisma.stock.findMany({
    select: {
      id: true,
      referencia: true,
      descricao: true,
      quantidade: true,
      associavelJangada: true,
      aplicavelMarcaJangada: true,
      aplicavelModeloJangada: true,
      codigoFabricante: true,
      validade: true,
    },
  });
}

async function main() {
  const allStock = await fetchAllStock();
  console.log(`Stock: ${allStock.length} registos.`);

  const before = await prisma.artigoJangada.count({
    where: { inspecaoId: null, stockId: null },
  });
  console.log(`Artigos físicos sem stockId (antes): ${before}`);

  if (!APPLY) {
    const rafts = await prisma.jangada.findMany({
      select: { id: true, serial: true, _count: { select: { artigos: true } } },
      orderBy: { id: "asc" },
    });
    console.log(
      `[preview] ${rafts.length} jangadas. Executar com --apply para ligar os artigos ao stock.`,
    );
    return;
  }

  const rafts = await prisma.jangada.findMany({
    select: { id: true, serial: true },
    orderBy: { id: "asc" },
  });

  let totalLinked = 0;
  let totalVal = 0;
  let failures = 0;

  for (const r of rafts) {
    try {
      const res = await linkPhysicalArticlesToStock(r.id, allStock);
      totalLinked += res.linked;
      totalVal += res.validadeAtualizada;
      if (res.linked > 0) {
        console.log(`  [apply] #${r.id} ${r.serial}: 🔗${res.linked} validades+${res.validadeAtualizada}`);
      }
    } catch (e) {
      failures++;
      console.error(`  [apply] #${r.id} ${r.serial} falhou:`, e);
    }
  }

  const after = await prisma.artigoJangada.count({
    where: { inspecaoId: null, stockId: null },
  });

  console.log(
    `\n[apply] ${rafts.length} jangadas, 🔗${totalLinked} artigos ligados, validades preenchidas: ${totalVal}, ${failures} falhas.`,
  );
  console.log(`Artigos físicos sem stockId (depois): ${after} (antes: ${before}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
