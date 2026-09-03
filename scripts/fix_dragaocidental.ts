/**
 * Corrige artigos de ração de emergência para "Kit de Reparação"
 * nas jangadas da embarcação "dragaocidental" (ou similar).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== A procurar embarcação 'dragaocidental' ===");
  const allNavios = await prisma.navio.findMany();

  const navios = allNavios.filter(n => n.nome && n.nome.toLowerCase().replace(/[^a-z0-9]/g, "").includes("dragaocidental"));

  console.log(`Encontrados ${navios.length} navio(s) correspondentes a 'dragaocidental':`);
  for (const n of navios) {
    console.log(`- Navio ID ${n.id}: "${n.nome}"`);
  }

  let totalCorrigidos = 0;

  for (const navio of navios) {
    const jangadas = await prisma.jangada.findMany({
      where: { shipId: navio.id },
      include: { artigos: true },
    });

    for (const jangada of jangadas) {
      for (const artigo of jangada.artigos) {
        const nomeLower = (artigo.name || "").toLowerCase();
        const isRacao = 
          nomeLower.includes("ração") || 
          nomeLower.includes("racao") || 
          nomeLower.includes("ration") ||
          artigo.referencia === "30202084";

        if (isRacao) {
          console.log(`  [Corrigindo] Navio "${navio.nome}" -> Jangada ID ${jangada.id} (Serial: ${jangada.serial}) - Artigo ID ${artigo.id}: "${artigo.name}" (Ref: ${artigo.referencia}) -> "Kit de Reparação" (30202013)`);
          
          await prisma.artigoJangada.update({
            where: { id: artigo.id },
            data: {
              name: "Kit de Reparação",
              referencia: "30202013",
              stockId: 244,
            },
          });
          totalCorrigidos++;
        }
      }
    }
  }

  console.log(`\n=== Concluído! Total de artigos corrigidos para Kit de Reparação: ${totalCorrigidos} ===`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
