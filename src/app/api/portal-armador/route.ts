import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clienteId = url.searchParams.get("clienteId");
  if (!clienteId) {
    return NextResponse.json({ error: "Cliente ID obrigatório." }, { status: 400 });
  }

  try {
    const id = parseInt(clienteId, 10);
    const cliente = await prisma.cliente.findUnique({
      where: { id },
      include: {
        navios: {
          select: { id: true, nome: true, matricula: true, imo: true },
        },
      },
    });

    if (!cliente) {
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      cliente: {
        id: cliente.id,
        nome: cliente.nome,
        numeroCliente: cliente.numeroCliente,
        nif: cliente.nif,
        email: cliente.email,
        navios: cliente.navios,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Erro no portal do armador." }, { status: 500 });
  }
}
