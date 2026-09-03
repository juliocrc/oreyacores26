/**
 * Script: clean-rations-from-packs.js
 * Substitui "Rações Alimentares" por "Jogo de Reparação" em jangadas Pack E, R e SOLAS B.
 * Estes packs NÃO incluem rações alimentares — o item correto é o kit de reparação.
 *
 * Uso:
 *   node scripts/clean-rations-from-packs.js              (dry-run por defeito)
 *   node scripts/clean-rations-from-packs.js --apply       (aplica alterações)
 */

const { PrismaClient } = require('@prisma/client');

const isApply = process.argv.includes('--apply');

const PACKS_SEM_RACOES = ['E', 'R', 'SOLAS B'];

const REPAIR_KIT_NAME = 'Jogo de Reparação';
const REPAIR_KIT_REF = '20909107';
const REPAIR_KIT_CATEGORY = 'EQUIPAMENTO';

function isRationName(name) {
  const norm = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const words = norm.split(/[^a-z0-9]+/).filter(Boolean);
  return words.some(
    (w) =>
      w === 'racao' ||
      w === 'racoes' ||
      w === 'ration' ||
      w === 'rations' ||
      w === 'food' ||
      w.startsWith('aliment')
  );
}

function matchesExcludedPack(packType) {
  if (!packType) return false;
  const upper = packType.toUpperCase().trim();
  return PACKS_SEM_RACOES.some(
    (p) => upper === p || upper.includes(p) || upper.includes('REDUZIDO')
  );
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const jangadas = await prisma.jangada.findMany({
      where: {
        OR: PACKS_SEM_RACOES.map((p) => ({
          packType: { contains: p },
        })),
      },
      include: {
        artigos: true,
      },
    });

    const filtered = jangadas.filter((j) => matchesExcludedPack(j.packType));

    console.log(`\n🔍 Jangadas encontradas com Pack E/R/SOLAS B: ${filtered.length}\n`);

    let totalUpdated = 0;
    const toUpdate = [];

    for (const jangada of filtered) {
      const rations = jangada.artigos.filter((a) => isRationName(a.name));
      if (rations.length > 0) {
        console.log(
          `  📦 #${jangada.id} — ${jangada.serial} (${jangada.brand} ${jangada.model}) — Pack: ${jangada.packType}`
        );
        for (const r of rations) {
          console.log(
            `     🔄 "${r.name}" [ref: ${r.referencia || '—'}] → "${REPAIR_KIT_NAME}" [ref: ${REPAIR_KIT_REF}]`
          );
          toUpdate.push(r.id);
          totalUpdated++;
        }
      }
    }

    console.log(`\n📊 Total de artigos ração a substituir por kit de reparação: ${totalUpdated}`);

    if (totalUpdated === 0) {
      console.log('✅ Nenhum artigo ração encontrado. Nada a corrigir.');
      return;
    }

    if (!isApply) {
      console.log('\n⚠️  Modo DRY-RUN. Para aplicar, execute:');
      console.log('   node scripts/clean-rations-from-packs.js --apply\n');
      return;
    }

    const result = await prisma.artigoJangada.updateMany({
      where: { id: { in: toUpdate } },
      data: {
        name: REPAIR_KIT_NAME,
        referencia: REPAIR_KIT_REF,
        codigoFabricante: REPAIR_KIT_REF,
      },
    });

    console.log(`\n✅ ${result.count} artigos substituídos de "Rações" para "${REPAIR_KIT_NAME}".\n`);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
