import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { apiStationScope, requireApiAccess } from "@/lib/api-access";
import { resolveActiveServiceStationId } from "@/lib/station-selection";
import { stockStationWhere } from "@/lib/stock-utils";

function getInspecaoArtigoDelegate() {
  return prisma.artigoJangada;
}

export async function GET(req: NextRequest) {
  const { access, error } = await requireApiAccess("/jangadas");
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const activeStationId = resolveActiveServiceStationId(req, access);
  const scope = apiStationScope(access, activeStationId);
  const where: Prisma.ArtigoJangadaWhereInput = {
    Jangada: scope,
    // Preserve the explicitly shared/null-station stock contract, but never
    // expose another station's stock through an incorrectly linked article.
    OR: [{ stockId: null }, { stock: stockStationWhere(access, activeStationId) }],
  };
  const referencia = searchParams.get("referencia"); if (referencia) where.referencia = { contains: referencia };
  const descricao = searchParams.get("descricao"); if (descricao) where.name = { contains: descricao };
  if (searchParams.get("inspecaoId")) where.inspecaoId = Number(searchParams.get("inspecaoId"));
  if (searchParams.get("stockId")) where.stockId = Number(searchParams.get("stockId"));

  const delegate = getInspecaoArtigoDelegate();
  if (!delegate) {
    return NextResponse.json([]);
  }

  const artigos = await delegate.findMany({
    where,
    include: { inspecao: true, stock: true },
  });

  // Inspecao only stores a scalar jangadaId, not a station relation. Do not
  // expose a mismatched historical inspection through an article association.
  return NextResponse.json(access.isAdmin ? artigos : artigos.filter(
    artigo => !artigo.inspecao || artigo.inspecao.jangadaId === artigo.jangadaId,
  ));
}
