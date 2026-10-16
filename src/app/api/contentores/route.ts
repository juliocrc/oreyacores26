import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const routes = await prisma.navioContentorRoute.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ routes });
  } catch (err: any) {
    console.error("[GET /api/contentores]", err);
    return NextResponse.json({ error: err?.message || "Erro ao carregar rotas." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }

    const { navioNome, imo, operador, rota, frequencia, capacidadeTeus, diasEscala, observacoes } = body;
    if (!navioNome || !String(navioNome).trim()) {
      return NextResponse.json({ error: "O nome do navio é obrigatório." }, { status: 400 });
    }

    const novaRota = await prisma.navioContentorRoute.create({
      data: {
        navioNome: String(navioNome).trim(),
        imo: imo ? String(imo).trim() : null,
        operador: operador ? String(operador).trim() : "Transinsular",
        rota: rota ? String(rota).trim() : "Lisboa - Ponta Delgada",
        frequencia: frequencia ? String(frequencia).trim() : null,
        capacidadeTeus: capacidadeTeus ? Number(capacidadeTeus) : null,
        diasEscala: diasEscala ? String(diasEscala).trim() : null,
        observacoes: observacoes ? String(observacoes).trim() : null,
      },
    });

    return NextResponse.json({ success: true, route: novaRota });
  } catch (err: any) {
    console.error("[POST /api/contentores]", err);
    return NextResponse.json({ error: err?.message || "Erro ao criar rota." }, { status: 500 });
  }
}
