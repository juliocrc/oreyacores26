import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { resolveActiveServiceStationId } from "@/lib/station-selection";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";
import { buildVisibleServiceStationWhere } from "@/lib/service-station-visibility";
import { AZORES_TECHNICIANS } from "@/lib/agenda-technicians";
import { normalizeLooseText } from "@/lib/text-normalization";

function normalizeText(value: unknown) {
  return normalizeLooseText(value || "");
}

function isAcoresStation(station: { codigo?: string | null; nome?: string | null }) {
  const code = normalizeText(station?.codigo);
  const name = normalizeText(station?.nome);
  return code === "acores" || name === "acores";
}

function buildAcoresFallbackTechnicians() {
  return AZORES_TECHNICIANS.map((tech, index) => ({
    id: -1000 - index,
    nome: tech.name,
    email: null,
    ativo: true,
    serviceStationId: null,
  }));
}

export async function GET(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }

    const searchParams = new URL(req.url).searchParams;
    const includeInactive = searchParams.get("includeInactive") === "true";
    const search = String(searchParams.get("search") || "").trim();
    const activeStationId = resolveActiveServiceStationId(req, access);
    const tecnicoSearchWhere: Prisma.TecnicoWhereInput | undefined = search
      ? {
          OR: [
            { nome: { contains: search } },
            { email: { contains: search } },
          ],
        }
      : undefined;

    const stationWhere = activeStationId
      ? { id: activeStationId }
      : access.isAdmin
        ? { ativo: true }
        : { id: { in: access.allowedStationIds.length ? access.allowedStationIds : [-1] }, ativo: true };

    const stations = await prisma.serviceStation.findMany({
      where: buildVisibleServiceStationWhere(stationWhere as unknown as Record<string, unknown>),
      orderBy: [{ nome: "asc" }, { id: "asc" }],
      select: {
        id: true,
        codigo: true,
        nome: true,
        empresa: true,
        localizacao: true,
        territorioTipo: true,
        regiaoOperacional: true,
        tecnicos: {
          where: {
            ...(includeInactive ? {} : { ativo: true }),
            ...(tecnicoSearchWhere || {}),
          },
          orderBy: [{ nome: "asc" }, { id: "asc" }],
          select: {
            id: true,
            nome: true,
            email: true,
            ativo: true,
            serviceStationId: true,
          },
        },
      },
    });

    const activeStation = activeStationId
      ? stations.find((station) => station.id === activeStationId) || null
      : null;

    const unassignedWhere = {
      serviceStationId: null,
      ...(includeInactive ? {} : { ativo: true }),
      ...(tecnicoSearchWhere || {}),
    } satisfies Prisma.TecnicoWhereInput;

    const unassigned = access.isAdmin && !activeStationId
      ? await prisma.tecnico.findMany({
          where: unassignedWhere,
          orderBy: [{ nome: "asc" }, { id: "asc" }],
          select: {
            id: true,
            nome: true,
            email: true,
            ativo: true,
            serviceStationId: true,
          },
        })
      : [];

    const fallbackTecnicos = buildAcoresFallbackTechnicians();
    const searchNormalized = normalizeText(search);

    const stationsWithFallback = stations.map((station) => {
      if (!isAcoresStation(station)) {
        return {
          ...station,
          totalTecnicos: station.tecnicos.length,
        };
      }

      const hasRealTecnicos = station.tecnicos.length > 0;
      if (hasRealTecnicos) {
        return {
          ...station,
          totalTecnicos: station.tecnicos.length,
        };
      }

      const filteredFallback = fallbackTecnicos.filter((tech) => {
        if (includeInactive || tech.ativo) {
          if (!searchNormalized) return true;
          return normalizeText(tech.nome).includes(searchNormalized);
        }
        return false;
      });

      return {
        ...station,
        tecnicos: filteredFallback,
        totalTecnicos: filteredFallback.length,
      };
    });

    return NextResponse.json({
      activeStationId,
      activeStation,
      canViewAllStations: access.isAdmin,
      stations: stationsWithFallback,
      unassigned: unassigned,
      totalTecnicos: stationsWithFallback.reduce((total, station) => total + station.tecnicos.length, 0) + unassigned.length,
    });
  } catch (error) {
    return buildDatabaseErrorResponse(error, "Erro ao listar técnicos.");
  }
}
