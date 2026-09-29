import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const where: Prisma.EquipamentoFindManyArgs["where"] = {};
    if (searchParams.get("nome")) where.nome = { contains: searchParams.get("nome")! };
    if (searchParams.get("tipo")) where.tipo = { contains: searchParams.get("tipo")! };
    if (searchParams.get("marca")) where.marca = { contains: searchParams.get("marca")! };
    if (searchParams.get("modelo")) where.modelo = { contains: searchParams.get("modelo")! };
    if (searchParams.get("serial")) where.serial = { contains: searchParams.get("serial")! };
    if (searchParams.get("estado")) where.estado = { contains: searchParams.get("estado")! };

    const equipamentos = await prisma.equipamento.findMany({ where });
    return NextResponse.json(equipamentos);
  } catch (error) {
    console.error("GET equipamento error:", error);
    return NextResponse.json({ error: "Erro ao buscar equipamentos." }, { status: 500 });
  }
}
