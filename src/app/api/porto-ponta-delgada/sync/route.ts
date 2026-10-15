import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // Buscar rotas de contentores cadastradas (ou seed se vazio)
    let routes = await prisma.navioContentorRoute.findMany();
    if (routes.length === 0) {
      const defaultRoutes = [
        { navioNome: "PONTA DELGADA", operador: "Transinsular", rota: "Lisboa - Ponta Delgada - Caniçal", frequencia: "Semanal", capacidadeTeus: 850, diasEscala: "Terça-feira", observacoes: "Itinerário Outubro Açores / Madeira" },
        { navioNome: "SÃO MIGUEL", operador: "Transinsular", rota: "Leixões - Lisboa - Ponta Delgada", frequencia: "Semanal", capacidadeTeus: 720, diasEscala: "Quinta-feira", observacoes: "Itinerário Outubro Açores" },
        { navioNome: "GS PROGRESS", operador: "GS Lines", rota: "Lisboa - Ponta Delgada - Angra", frequencia: "Semanal", capacidadeTeus: 650, diasEscala: "Quarta-feira", observacoes: "Porto de Ponta Delgada - Cais Comercial" },
      ];
      for (const dr of defaultRoutes) {
        await prisma.navioContentorRoute.create({ data: dr });
      }
      routes = await prisma.navioContentorRoute.findMany();
    }

    let sincronizados = 0;
    const now = new Date();

    for (const route of routes) {
      // Verificar se já existe escala prevista para este navio nos próximos 30 dias
      const existing = await prisma.portoEscala.findFirst({
        where: {
          navioNome: route.navioNome,
          estado: "Previsto",
        },
      });

      if (!existing) {
        const chegada = new Date(now);
        chegada.setDate(chegada.getDate() + (sincronizados * 3) + 1);
        const partida = new Date(chegada);
        partida.setDate(partida.getDate() + 1);

        await prisma.portoEscala.create({
          data: {
            navioNome: route.navioNome,
            tipoCarga: "Contentores",
            armador: route.operador,
            cais: "Cais Comercial - Ponta Delgada",
            dataChegada: chegada,
            dataPartida: partida,
            origemDestino: route.rota,
            estado: "Previsto",
            observacoes: `Sincronizado automaticamente com rota de contentores (${route.frequencia || "Regular"})`,
          },
        });
        sincronizados++;
      }
    }

    const escalas = await prisma.portoEscala.findMany({ orderBy: { dataChegada: "desc" } });
    return NextResponse.json({ success: true, sincronizados, escalas });
  } catch (err: any) {
    console.error("[POST /api/porto-ponta-delgada/sync]", err);
    return NextResponse.json({ error: err?.message || "Erro ao sincronizar escalas." }, { status: 500 });
  }
}
