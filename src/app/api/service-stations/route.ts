import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";
import { getAccessContext } from "@/lib/access-control";
import { buildVisibleServiceStationWhere } from "@/lib/service-station-visibility";
import { parseServiceStationInput } from "@/lib/service-station-input";

export async function GET(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }

    const includeInactive =
      access.isAdmin && new URL(req.url).searchParams.get("includeInactive") === "1";

    const stations = await prisma.serviceStation.findMany({
      where: buildVisibleServiceStationWhere({
        ...(includeInactive ? {} : { ativo: true }),
        ...(access.stationId
          ? { id: access.stationId }
          : access.isAdmin
            ? {}
            : { id: { in: access.allowedStationIds.length ? access.allowedStationIds : [-1] } }),
      }),
      orderBy: [{ nome: "asc" }],
      select: includeInactive
        ? {
            id: true,
            codigo: true,
            nome: true,
            empresa: true,
            localizacao: true,
            territorioTipo: true,
            regiaoOperacional: true,
            ativo: true,
            observacoes: true,
          }
        : {
            id: true,
            codigo: true,
            nome: true,
            empresa: true,
            localizacao: true,
            territorioTipo: true,
            regiaoOperacional: true,
          },
    });

    return NextResponse.json(stations);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao listar estações de serviço.";
    return buildDatabaseErrorResponse(error, message);
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }
    if (!access.isAdmin) {
      return NextResponse.json({ error: "Apenas administradores podem gerir estações." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const { data, error } = parseServiceStationInput(body);
    if (error || !data) {
      return NextResponse.json({ error: error || "Dados inválidos." }, { status: 400 });
    }

    const existing = await prisma.serviceStation.findUnique({
      where: { codigo: data.codigo },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Já existe uma estação com o código ${data.codigo}.` },
        { status: 409 },
      );
    }

    const created = await prisma.serviceStation.create({ data });
    return NextResponse.json(created, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao criar estação de serviço.";
    return buildDatabaseErrorResponse(error, message);
  }
}
