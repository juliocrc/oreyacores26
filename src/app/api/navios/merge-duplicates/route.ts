import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiAccess } from "@/lib/api-access";

// GET — lista navios duplicados (case-insensitive)
// POST — preview only; name matches are candidates, never proof of identity.
export async function GET() {
  try {
    const { error } = await requireApiAccess("/navios", { adminOnly: true });
    if (error) return error;
    const allShips = await prisma.navio.findMany({
      select: {
        id: true,
        nome: true,
        matricula: true,
        ilha: true,
        tipoPesca: true,
        clienteId: true,
        serviceStationId: true,
        ativo: true,
      },
      orderBy: { nome: "asc" },
    });

    // Agrupar por nome normalizado (case-insensitive, trim, normalize accents)
    const groups: Record<string, typeof allShips> = {};
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

    // Filtrar apenas os que têm duplicados
    const duplicates = Object.entries(groups)
      .filter(([, ships]) => ships.length > 1)
      .map(([key, ships]) => ({
        normalizedName: key,
        count: ships.length,
        ships,
      }));

    return NextResponse.json({
      totalShips: allShips.length,
      duplicateGroups: duplicates.length,
      duplicates,
    });
  } catch (error) {
    console.error("Error finding duplicate ships:", error);
    return NextResponse.json({ error: "Erro ao procurar navios duplicados." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { error } = await requireApiAccess("/navios", { adminOnly: true });
    if (error) return error;
    const body = await req.json();
    const { dryRun = true } = body || {};
    if (dryRun !== true) {
      return NextResponse.json({
        code: "MERGE_REQUIRES_REVIEW",
        error: "Fusão automática suspensa. Reveja os IDs, matrículas, clientes e estações e prepare uma operação transacional com backup.",
      }, { status: 409 });
    }

    const allShips = await prisma.navio.findMany({
      orderBy: { nome: "asc" },
    });

    // Agrupar por nome normalizado
    const groups: Record<string, typeof allShips> = {};
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

    const duplicateGroups = Object.entries(groups).filter(([, ships]) => ships.length > 1);

    if (duplicateGroups.length === 0) {
      return NextResponse.json({ message: "Nenhum navio duplicado encontrado.", merged: 0 });
    }

    const mergeResults: Array<{
      kept: { id: number; nome: string };
      merged: Array<{ id: number; nome: string }>;
      updates: Record<string, number>;
    }> = [];

    for (const [, ships] of duplicateGroups) {
      // Para cada grupo, contar as dependências de cada navio
      const shipStats = await Promise.all(
        ships.map(async (ship) => {
          const [jangadasCount, coleteCount, epirbCount, inspecaoCount, ordemCount] = await Promise.all([
            prisma.jangada.count({ where: { shipId: ship.id } }),
            prisma.colete.count({ where: { shipId: ship.id } }),
            prisma.epirb.count({ where: { shipId: ship.id } }),
            prisma.inspecao.count({ where: { navioId: ship.id } }),
            prisma.ordemServico.count({ where: { shipId: ship.id } }),
          ]);
          return {
            ...ship,
            totalDeps: jangadasCount + coleteCount + epirbCount + inspecaoCount + ordemCount,
            jangadasCount,
            coleteCount,
            epirbCount,
            inspecaoCount,
            ordemCount,
          };
        })
      );

      // Manter o que tem mais dependências (ou o primeiro por ID se iguais)
      shipStats.sort((a, b) => b.totalDeps - a.totalDeps || a.id - b.id);
      const keeper = shipStats[0];
      const toMerge = shipStats.slice(1);

      mergeResults.push({
        kept: { id: keeper.id, nome: keeper.nome },
        merged: toMerge.map((dup) => ({ id: dup.id, nome: dup.nome })),
        updates: {
          jangadas: toMerge.reduce((a, d) => a + d.jangadasCount, 0),
          coletes: toMerge.reduce((a, d) => a + d.coleteCount, 0),
          epirbs: toMerge.reduce((a, d) => a + d.epirbCount, 0),
          inspecoes: toMerge.reduce((a, d) => a + d.inspecaoCount, 0),
          ordensServico: toMerge.reduce((a, d) => a + d.ordemCount, 0),
        },
      });
    }

    return NextResponse.json({
      dryRun,
      message: "Análise concluída. Nenhum registo foi alterado. As correspondências por nome exigem revisão de identidade.",
      merged: mergeResults.length,
      details: mergeResults,
    });
  } catch (error) {
    console.error("Error merging duplicate ships:", error);
    return NextResponse.json({ error: "Erro ao fazer merge de navios." }, { status: 500 });
  }
}
