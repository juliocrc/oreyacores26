require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const allShips = await prisma.navio.findMany({
    orderBy: { id: "asc" },
  });

  const groups = {};
  for (const ship of allShips) {
    const key = ship.nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");
    if (!groups[key]) groups[key] = [];
    groups[key].push(ship);
  }

  for (const [key, ships] of Object.entries(groups)) {
    if (ships.length > 1) {
      console.log(`Found group for "${key}": ${ships.length} ships`);
      const kept = ships[0];
      const duplicates = ships.slice(1);

      for (const dup of duplicates) {
        console.log(`Merging duplicate ship ID ${dup.id} (${dup.nome}) into ID ${kept.id}`);
        await prisma.jangada.updateMany({
          where: { shipId: dup.id },
          data: { shipId: kept.id },
        });
        await prisma.colete.updateMany({
          where: { shipId: dup.id },
          data: { shipId: kept.id },
        });
        await prisma.epirb.updateMany({
          where: { shipId: dup.id },
          data: { shipId: kept.id },
        });
        await prisma.inspecao.updateMany({
          where: { navioId: dup.id },
          data: { navioId: kept.id },
        });
        await prisma.navio.delete({
          where: { id: dup.id },
        });
      }
    }
  }
  console.log("Merge complete!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
