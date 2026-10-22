import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { inferArmador } from "@/lib/porto-armadores";

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

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }

    const id = Number((body as Record<string, unknown>).id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "ID da escala inválido." }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    if (typeof payload.estado === "string" && payload.estado.trim()) {
      data.estado = payload.estado.trim();
    }
    if (typeof payload.cais === "string") {
      data.cais = payload.cais.trim() || null;
    }
    if (typeof payload.armador === "string") {
      data.armador = payload.armador.trim() || null;
    }
    if (typeof payload.observacoes === "string") {
      data.observacoes = payload.observacoes.trim() || null;
    }
    if (typeof payload.tipoCarga === "string" && payload.tipoCarga.trim()) {
      data.tipoCarga = payload.tipoCarga.trim();
    }
    for (const field of ["dataChegada", "dataPartida"] as const) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        const raw = payload[field];
        data[field] = raw ? new Date(String(raw)) : null;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
    }

    const escalaAtualizada = await prisma.portoEscala.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, escala: escalaAtualizada });
  } catch (err) {
    console.error("[PATCH /api/porto-ponta-delgada]", err);
    const message = err instanceof Error ? err.message : "Erro ao atualizar a escala.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "ID da escala inválido." }, { status: 400 });
    }

    await prisma.portoEscala.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/porto-ponta-delgada]", err);
    const message = err instanceof Error ? err.message : "Erro ao eliminar a escala.";
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
        armador:
          armador && String(armador).trim()
            ? String(armador).trim()
            : inferArmador(String(navioNome)),
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
