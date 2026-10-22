import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkStations() {
  const stations = await prisma.serviceStation.findMany({
    select: { id: true, codigo: true, nome: true, ativo: true }
  });
  console.log('All stations:', JSON.stringify(stations, null, 2));
}

checkStations().finally(() => prisma.$disconnect());