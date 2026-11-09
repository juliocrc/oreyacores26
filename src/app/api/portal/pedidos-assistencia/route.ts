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

    const { clienteId, jangadaId, navioId, motivo, descricao, prioridade, dataPreferida } = body;
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
    if (session.user.role !== "ADMIN") {
      const jangadaNavio = jangada?.shipId
        ? await prisma.navio.findUnique({ where: { id: jangada.shipId }, select: { clienteId: true } })
        : null;
      if ((navioId && (!navio || navio.clienteId !== sessionClienteId)) ||
          (jangadaId && (!jangada || jangadaNavio?.clienteId !== sessionClienteId))) {
        return NextResponse.json({ error: "Equipamento ou navio sem acesso." }, { status: 403 });
      }
    }

    const dataPreferidaNorm = String(dataPreferida || "").trim() || null;

    const novoPedido = await prisma.pedidoAssistencia.create({
      data: {
        nome: cliente?.nome || "Armador",
        email: cliente?.email || session.user.email || "",
        telefone: cliente?.telmovel || cliente?.telefone || "",
        navio: navio?.nome || jangada?.shipNameManual || "Embarcação",
        jangadaSerial: jangada?.serial || null,
        tipoAssistencia: String(motivo).trim(),
        descricao: String(descricao).trim(),
        dataPreferida: dataPreferidaNorm,
        estado: "novo",
        origem: "portal_cliente",
        metadados: JSON.stringify({ clienteId: requestedClienteId, prioridade: prioridade || "normal", navioId: navio?.id ?? null }),
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
  if (!session?.user?.id || session.user.role !== "CLIENTE" || !clienteId || !Number.isSafeInteger(clienteId) || clienteId <= 0) return NextResponse.json({ error: "Sessão de cliente obrigatória." }, { status: 403 });
  // Narrow candidates before applying the result limit; compare the parsed ID
  // exactly so client 12 cannot see client 123's requests.
  const pedidos = await prisma.pedidoAssistencia.findMany({
    where: { OR: [
      { metadados: { contains: `"clienteId":${clienteId}` } },
      { metadados: { contains: `"clienteId": ${clienteId}` } },
    ] },
    orderBy: { createdAt: "desc" },
    select: { id: true, metadados: true, tipoAssistencia: true, descricao: true, dataPreferida: true, estado: true, createdAt: true },
  });
  const mine = pedidos.filter((pedido) => {
    try { return Number(JSON.parse(pedido.metadados || "{}").clienteId) === clienteId; } catch { return false; }
  });
  return NextResponse.json({ pedidos: mine.slice(0, 20).map((pedido) => ({ id: pedido.id, tipoAssistencia: pedido.tipoAssistencia, descricao: pedido.descricao, dataPreferida: pedido.dataPreferida, estado: pedido.estado, createdAt: pedido.createdAt })) }, { headers: { "Cache-Control": "private, no-store" } });
}
