import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { canonicalizeDateFields } from "@/lib/date-display";

function normalizeIds(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const where: Prisma.ColeteWhereInput = {};
    const serial = searchParams.get("serial"); if (serial) where.serial = { contains: serial };
    const marca = searchParams.get("marca"); if (marca) where.marca = { contains: marca };
    const modelo = searchParams.get("modelo"); if (modelo) where.modelo = { contains: modelo };
    const tamanho = searchParams.get("tamanho"); if (tamanho) where.tamanho = { contains: tamanho };
    const estado = searchParams.get("estado"); if (estado) where.estado = { contains: estado };
    const dataFabrico = searchParams.get("dataFabrico");
    if (dataFabrico) {
      // dataFabrico is stored as free-text string in the database
      where.dataFabrico = { contains: dataFabrico };
    }
    if (searchParams.get("shipId")) where.shipId = Number(searchParams.get("shipId"));

    const coletes = await prisma.colete.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        shipId: true,
        serial: true,
        marca: true,
        modelo: true,
        tamanho: true,
        estado: true,
        dataFabrico: true,
        dataInspecao: true,
        dataProxInspecao: true,
        observacoes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(coletes);
  } catch (err) {
    console.error("[API /coletes] Erro ao listar coletes:", err);
    return NextResponse.json({ error: (err as Error).message || "Erro ao listar coletes" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { ids } = await req.json();
    const normalizedIds = normalizeIds(ids);
    if (normalizedIds.length === 0) {
      return NextResponse.json({ error: "Envie um array de IDs para exclusão em lote." }, { status: 400 });
    }

    await prisma.colete.deleteMany({
      where: {
        id: {
          in: normalizedIds,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Erro ao eliminar coletes" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const ids = normalizeIds(body?.ids);
    const action = String(body?.action || "").trim();

    if (ids.length === 0) {
      return NextResponse.json({ error: "Selecione pelo menos um colete." }, { status: 400 });
    }

    if (!action) {
      return NextResponse.json({ error: "Ação em lote não indicada." }, { status: 400 });
    }

    let data: Record<string, unknown>;

    if (action === "assign-ship") {
      const shipId = Number(body?.shipId);
      if (!Number.isFinite(shipId) || shipId <= 0) {
        return NextResponse.json({ error: "Navio inválido para associação em lote." }, { status: 400 });
      }
      data = { shipId };
    } else if (action === "clear-ship") {
      data = { shipId: null };
    } else if (action === "set-status") {
      const estado = String(body?.estado || "").trim();
      if (!estado) {
        return NextResponse.json({ error: "Estado inválido para atualização em lote." }, { status: 400 });
      }
      data = { estado };
    } else {
      return NextResponse.json({ error: "Ação em lote não suportada." }, { status: 400 });
    }

    const result = await prisma.colete.updateMany({
      where: { id: { in: ids } },
      data,
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Erro ao aplicar ação em lote nos coletes" }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = canonicalizeDateFields(await req.json(), [
      "dataFabrico",
      "dataInspecao",
      "dataProxInspecao",
    ]);
    const colete = await prisma.colete.create({
      data: {
        shipId: data.shipId || null,
        serial: data.serial,
        marca: data.marca,
        modelo: data.modelo,
        tamanho: data.tamanho,
        estado: data.estado,
        dataFabrico: data.dataFabrico,
        dataInspecao: data.dataInspecao,
        dataProxInspecao: data.dataProxInspecao,
        observacoes: data.observacoes,
      },
      select: {
        id: true,
        shipId: true,
        serial: true,
        marca: true,
        modelo: true,
        tamanho: true,
        estado: true,
        dataFabrico: true,
        dataInspecao: true,
        dataProxInspecao: true,
        observacoes: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json(colete, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Erro ao criar colete" }, { status: 400 });
  }
}
