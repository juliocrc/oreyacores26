import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

function getInspecaoArtigoDelegate() {
  return prisma.artigoJangada;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const where: Prisma.ArtigoJangadaWhereInput = {};
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

  return NextResponse.json(artigos);
}
