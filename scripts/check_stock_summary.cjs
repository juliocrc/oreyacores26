const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const allStock = await prisma.stock.findMany({
    orderBy: { referencia: 'asc' }
  });

  console.log(`Total de registos de stock na BD: ${allStock.length}`);
  console.log(`Lotes legados desconhecidos preservados (NULL): ${allStock.filter(item => item.lote == null).length}`);

  // Read-only: references can legitimately have multiple lots/stations.
  const mapRef = new Map();
  const duplicates = [];

  for (const item of allStock) {
    if (item.lote == null) continue;
    const ref = JSON.stringify([item.referencia, item.serviceStationId, item.lote]);
    if (mapRef.has(ref)) {
      duplicates.push({ ref, id1: mapRef.get(ref).id, id2: item.id });
    } else {
      mapRef.set(ref, item);
    }
  }

  if (duplicates.length > 0) {
    console.log(`Colisoes de identidade: ${duplicates.length}. Nenhuma alteracao efetuada.`);
  } else {
    console.log("Sem colisoes de identidade detetadas.");
  }

  const finalStock = await prisma.stock.findMany({
    orderBy: [{ categoria: 'asc' }, { referencia: 'asc' }]
  });

  console.log(`\nTotal de registos/lotes em stock: ${finalStock.length}\n`);

  const byCategory = {};
  for (const item of finalStock) {
    const cat = item.categoria || "DIVERSOS";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }

  for (const [cat, items] of Object.entries(byCategory).sort()) {
    console.log(`=== CATEGORIA: ${cat} (${items.length} artigos) ===`);
    for (const it of items) {
      console.log(`  [Ref: ${it.referencia}] ${it.descricao} | Qtd: ${it.quantidade} | Prateleira: ${it.localizacao || '-'} | P. Venda: €${it.precoVenda}`);
    }
    console.log("");
  }
}

run()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
