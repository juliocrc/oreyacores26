import { NextRequest, NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { resolveActiveServiceStationId } from "@/lib/station-selection";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const activeStationId = resolveActiveServiceStationId(request, access);
    const equipamento = await prisma.calibracaoEquipamento.findUnique({
      where: { id },
      select: { id: true, serviceStationId: true },
    });
    if (!equipamento) {
      return NextResponse.json({ error: "Registo não encontrado" }, { status: 404 });
    }
    if (
      !access.isAdmin &&
      activeStationId &&
      equipamento.serviceStationId &&
      equipamento.serviceStationId !== activeStationId
    ) {
      return NextResponse.json({ error: "Sem acesso a este registo noutra estação." }, { status: 403 });
    }

    const historico = await prisma.calibracaoHistorico.findMany({
      where: { calibracaoId: id },
      orderBy: [{ dataCalibracao: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json(historico);
  } catch (error) {
    console.error('Error fetching calibration history:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Erro ao carregar o histórico de calibrações' },
      { status: 500 }
    );
  }
}
