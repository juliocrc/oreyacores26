import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";

export const runtime = "nodejs";

/**
 * Remove (descarta) uma comunicação do histórico.
 * Permitido apenas a administradores para evitar perda acidental de registos.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    if (!access.isAdmin) {
      return NextResponse.json({ error: "Apenas administradores podem descartar comunicações." }, { status: 403 });
    }

    const { id } = await params;
    const comunicacaoId = Number(id);
    if (!Number.isFinite(comunicacaoId) || comunicacaoId <= 0) {
      return NextResponse.json({ error: "Id inválido." }, { status: 400 });
    }

    const existente = await prisma.comunicacao.findUnique({
      where: { id: comunicacaoId },
      select: { id: true },
    });
    if (!existente) {
      return NextResponse.json({ error: "Comunicação não encontrada." }, { status: 404 });
    }

    await prisma.comunicacao.delete({ where: { id: comunicacaoId } });

    return NextResponse.json({ ok: true, id: comunicacaoId });
  } catch (error) {
    console.error("[DELETE /api/comunicacoes/[id]]", error);
    return NextResponse.json({ error: "Erro ao descartar comunicação." }, { status: 500 });
  }
}
