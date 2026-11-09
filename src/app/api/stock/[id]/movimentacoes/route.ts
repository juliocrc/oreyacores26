import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { canEditPath, canViewPath } from "@/lib/user-permissions";
import { stockStationWhere } from "@/lib/stock-utils";
import { resolveActiveServiceStationId } from "@/lib/station-selection";

function parseIdParam(value: unknown): number {
  const id = Number(value);
  return Number.isFinite(id) ? id : NaN;
}

function canViewStock(access: NonNullable<Awaited<ReturnType<typeof getAccessContext>>>) {
  return access.isAdmin || canViewPath(access.permissions, "/stock") || canEditPath(access.permissions, "/stock");
}

// GET /api/stock/[id]/movimentacoes - Buscar histórico de movimentações
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: 'Sessão obrigatória.' }, { status: 401 });
    }
    if (!canViewStock(access)) {
      return NextResponse.json({ error: 'Sem permissão para consultar stock.' }, { status: 403 });
    }

    const { id: rawId } = await context.params;
    const id = parseIdParam(rawId);
    if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(id) || id > 2_147_483_647) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const article = await prisma.stock.findFirst({ where: { AND: [{ id },
      stockStationWhere(access, resolveActiveServiceStationId(req, access))] }, select: { id: true } });
    if (!article) return NextResponse.json({ error: 'Artigo nao encontrado nesta estacao.' }, { status: 404 });
    const movimentacoes = await prisma.movimentacaoStock.findMany({
      where: { stockId: id },
      orderBy: { createdAt: 'desc' },
      take: 100, // Últimas 100 movimentações
    });

    return NextResponse.json(movimentacoes);
  } catch {
    return NextResponse.json({ error: 'Erro ao buscar movimentações' }, { status: 500 });
  }
}
