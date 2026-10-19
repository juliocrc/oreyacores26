import prisma from "@/lib/prisma";

export const SOUTH_REGION_ILHA_VALUES = ["Sul", "SUL", "sul"];

export async function activeStationIsAlcantarilha(activeStationId: number | null): Promise<boolean> {
  if (!activeStationId) return false;

  const station = await prisma.serviceStation.findUnique({
    where: { id: activeStationId },
    select: { codigo: true },
  });

  return station?.codigo === "ALCATARILHA";
}

export async function getSouthRegionShipIds(): Promise<number[]> {
  const ships = await prisma.navio.findMany({
    where: { ilha: { in: SOUTH_REGION_ILHA_VALUES } },
    select: { id: true },
  });

  return ships.map((ship) => ship.id);
}
