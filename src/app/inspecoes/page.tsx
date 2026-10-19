import React from "react";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { ACTIVE_SERVICE_STATION_COOKIE, resolveActiveServiceStationIdFromCookie } from "@/lib/station-selection";
import InspecoesClient from "./InspecoesClient";

const PAGE_SIZE = 50;

export default async function InspecoesPage() {
  const access = await getAccessContext();
  const cookieStore = await cookies();
  const stationId = access
    ? resolveActiveServiceStationIdFromCookie(
        cookieStore.get(ACTIVE_SERVICE_STATION_COOKIE)?.value,
        access,
      )
    : null;

  const [stationRaftIds, stationNavioIds] = stationId
    ? await Promise.all([
        prisma.jangada.findMany({ where: { serviceStationId: stationId }, select: { id: true } }),
        prisma.navio.findMany({ where: { serviceStationId: stationId }, select: { id: true } }),
      ])
    : [[], []];

  const where = stationId
    ? {
        OR: [
          { jangadaId: { in: stationRaftIds.map((item) => item.id) } },
          { navioId: { in: stationNavioIds.map((item) => item.id) } },
        ],
      }
    : {};

  const [inspecoes, total] = await Promise.all([
    prisma.inspecao.findMany({
      where,
      orderBy: [{ dataInspecao: "desc" }, { id: "desc" }],
      take: PAGE_SIZE,
      select: {
        id: true,
        certificadoNumero: true,
        navioNome: true,
        jangadaSerial: true,
        jangadaId: true,
        dataInspecao: true,
        status: true,
        createdAt: true,
        artigos: {
          select: {
            id: true,
            name: true,
            quantidade: true,
            validade: true,
            referencia: true,
          }
        }
      },
    }),
    prisma.inspecao.count({ where }),
  ]);

  const safeInspecoes = inspecoes.map((insp) => ({
    ...insp,
    createdAt: insp.createdAt.toISOString(),
    artigos: insp.artigos.map(a => ({
      ...a,
      validade: a.validade ? a.validade.toISOString().slice(0, 10) : null
    }))
  }));

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Registo de Inspeções</h1>
          <p className="text-slate-500 mt-1">Histórico completo de todas as inspeções realizadas organizadas por mês.</p>
        </div>
      </div>
      
      <InspecoesClient
        initialData={safeInspecoes}
        totalCount={total}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
