import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";
import { getAccessContext } from "@/lib/access-control";
import { parseServiceStationInput } from "@/lib/service-station-input";

function parseId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }
    if (!access.isAdmin) {
      return NextResponse.json({ error: "Apenas administradores podem gerir estações." }, { status: 403 });
    }

    const id = parseId((await context.params).id);
    if (!id) return NextResponse.json({ error: "Estação inválida." }, { status: 400 });

    const station = await prisma.serviceStation.findUnique({ where: { id }, select: { id: true, codigo: true } });
    if (!station) return NextResponse.json({ error: "Estação não encontrada." }, { status: 404 });

    const body = await req.json().catch(() => null);
    const { data, error } = parseServiceStationInput(body);
    if (error || !data) {
      return NextResponse.json({ error: error || "Dados inválidos." }, { status: 400 });
    }

    if (data.codigo !== station.codigo) {
      const clash = await prisma.serviceStation.findUnique({ where: { codigo: data.codigo }, select: { id: true } });
      if (clash && clash.id !== id) {
        return NextResponse.json({ error: `Já existe uma estação com o código ${data.codigo}.` }, { status: 409 });
      }
    }

    const updated = await prisma.serviceStation.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar estação de serviço.";
    return buildDatabaseErrorResponse(error, message);
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }
    if (!access.isAdmin) {
      return NextResponse.json({ error: "Apenas administradores podem gerir estações." }, { status: 403 });
    }

    const id = parseId((await context.params).id);
    if (!id) return NextResponse.json({ error: "Estação inválida." }, { status: 400 });

    const station = await prisma.serviceStation.findUnique({ where: { id }, select: { id: true, ativo: true } });
    if (!station) return NextResponse.json({ error: "Estação não encontrada." }, { status: 404 });

    const [clientes, navios, jangadas, ordens, stock, tecnicos, agendas, eventos, fila] =
      await Promise.all([
        prisma.cliente.count({ where: { serviceStationId: id } }),
        prisma.navio.count({ where: { serviceStationId: id } }),
        prisma.jangada.count({ where: { serviceStationId: id } }),
        prisma.ordemServico.count({ where: { serviceStationId: id } }),
        prisma.stock.count({ where: { serviceStationId: id } }),
        prisma.tecnico.count({ where: { serviceStationId: id } }),
        prisma.agenda.count({ where: { serviceStationId: id } }),
        prisma.agendaEvento.count({ where: { serviceStationId: id } }),
        prisma.serviceStationQueue.count({ where: { serviceStationId: id } }),
      ]);

    const linked =
      clientes + navios + jangadas + ordens + stock + tecnicos + agendas + eventos + fila;

    if (linked === 0) {
      await prisma.serviceStation.delete({ where: { id } });
      return NextResponse.json({ success: true, removed: true });
    }

    await prisma.serviceStation.update({ where: { id }, data: { ativo: false } });
    return NextResponse.json({ success: true, removed: false, deactivated: true, linked });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao remover estação de serviço.";
    return buildDatabaseErrorResponse(error, message);
  }
}
