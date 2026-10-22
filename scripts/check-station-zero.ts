import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkStationZero() {
  const stations = await prisma.serviceStation.findMany({
    where: { OR: [{ id: 0 }, { codigo: '0' }, { nome: { contains: '0' } }] }
  });
  console.log('Stations with 0:', JSON.stringify(stations, null, 2));
}

checkStationZero().finally(() => prisma.$disconnect());