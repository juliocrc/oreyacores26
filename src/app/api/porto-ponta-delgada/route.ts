import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [escalas, lastSync] = await Promise.all([
      prisma.portoEscala.findMany({
        orderBy: [{ dataChegada: "asc" }, { navioNome: "asc" }],
      }),
      prisma.portoEscala.aggregate({
        _max: { updatedAt: true },
        where: { observacoes: { contains: "[JUL]" } },
      }),
    ]);
    return NextResponse.json({
      escalas,
      lastSync: lastSync._max.updatedAt,
      fonte: "portosdosacores.pt",
      total: escalas.length,
    });
  } catch (err) {
    console.error("[GET /api/porto-ponta-delgada]", err);
    const message = err instanceof Error ? err.message : "Erro ao carregar escalas.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }

    const { navioNome, matricula, tipoCarga, armador, cais, dataChegada, dataPartida, origemDestino, estado, observacoes } = body;
    if (!navioNome || !String(navioNome).trim()) {
      return NextResponse.json({ error: "O nome do navio é obrigatório." }, { status: 400 });
    }

    const novaEscala = await prisma.portoEscala.create({
      data: {
        navioNome: String(navioNome).trim(),
        matricula: matricula ? String(matricula).trim() : null,
        tipoCarga: tipoCarga ? String(tipoCarga).trim() : "Contentores",
        armador: armador ? String(armador).trim() : null,
        cais: cais ? String(cais).trim() : null,
        dataChegada: dataChegada ? new Date(dataChegada) : null,
        dataPartida: dataPartida ? new Date(dataPartida) : null,
        origemDestino: origemDestino ? String(origemDestino).trim() : null,
        estado: estado ? String(estado).trim() : "Previsto",
        observacoes: observacoes ? String(observacoes).trim() : null,
      },
    });

    return NextResponse.json({ success: true, escala: novaEscala });
  } catch (err) {
    console.error("[POST /api/porto-ponta-delgada]", err);
    const message = err instanceof Error ? err.message : "Erro ao criar escala.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
