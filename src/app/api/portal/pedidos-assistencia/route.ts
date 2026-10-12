import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }

    const { clienteId, jangadaId, navioId, motivo, descricao, prioridade } = body;
    const requestedClienteId = Number(clienteId);
    const sessionClienteId = session.user.clienteId != null ? Number(session.user.clienteId) : null;
    if (session.user.role !== "ADMIN" && (!sessionClienteId || requestedClienteId !== sessionClienteId)) {
      return NextResponse.json({ error: "Não pode criar pedidos para outro cliente." }, { status: 403 });
    }

    if (!requestedClienteId || !motivo || !descricao?.trim()) {
      return NextResponse.json({ error: "Indique o assunto e descreva o pedido." }, { status: 400 });
    }

    const cliente = await prisma.cliente.findUnique({ where: { id: requestedClienteId } });
    const jangada = jangadaId ? await prisma.jangada.findUnique({ where: { id: Number(jangadaId) } }) : null;
    const navio = navioId ? await prisma.navio.findUnique({ where: { id: Number(navioId) } }) : null;

    const novoPedido = await prisma.pedidoAssistencia.create({
      data: {
        nome: cliente?.nome || "Armador",
        email: cliente?.email || session.user.email || "",
        telefone: "",
        navio: navio?.nome || jangada?.shipNameManual || "Embarcação",
        jangadaSerial: jangada?.serial || null,
        tipoAssistencia: String(motivo).trim(),
        descricao: String(descricao).trim(),
        estado: "novo",
        origem: "portal_cliente",
        metadados: JSON.stringify({ clienteId: requestedClienteId, prioridade: prioridade || "normal" }),
      },
    });

    return NextResponse.json({
      success: true,
      pedido: novoPedido,
      message: "Pedido de assistência e envio registado com sucesso!",
    });
  } catch (err: any) {
    console.error("[POST /api/portal/pedidos-assistencia]", err);
    return NextResponse.json({ error: err?.message || "Erro ao criar pedido de assistência." }, { status: 500 });
  }
}

export async function GET() {
  const session = await getAuthSession();
  const clienteId = session?.user?.clienteId != null ? Number(session.user.clienteId) : null;
  if (!clienteId) return NextResponse.json({ error: "Sessão de cliente obrigatória." }, { status: 403 });
  const pedidos = await prisma.pedidoAssistencia.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  const mine = pedidos.filter((pedido) => {
    try { return Number(JSON.parse(pedido.metadados || "{}").clienteId) === clienteId; } catch { return false; }
  });
  return NextResponse.json({ pedidos: mine.map((pedido) => ({ id: pedido.id, tipoAssistencia: pedido.tipoAssistencia, descricao: pedido.descricao, estado: pedido.estado, createdAt: pedido.createdAt })) });
}
