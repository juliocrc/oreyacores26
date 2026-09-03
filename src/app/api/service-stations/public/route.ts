import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { buildVisibleServiceStationWhere } from "@/lib/service-station-visibility";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stations = await prisma.serviceStation.findMany({
      where: buildVisibleServiceStationWhere({ ativo: true }),
      orderBy: [{ nome: "asc" }],
      select: {
        id: true,
        codigo: true,
        nome: true,
        empresa: true,
        localizacao: true,
        territorioTipo: true,
        regiaoOperacional: true,
      },
    });

    return NextResponse.json({ stations });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao listar estações de serviço.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
