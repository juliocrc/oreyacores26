import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/auth";
import { clearClientCache } from "@/app/api/portal/cliente-dados/route";

export async function PUT(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user || session.user.role !== "CLIENTE" || !session.user.clienteId) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const clienteId = Number(session.user.clienteId);
    const body = await req.json();
    const { email, telefone, telmovel, morada, moradaNumero, codigoPostal, localidade, ilha } = body ?? {};

    const updateData: Record<string, string | null> = {};
    if (email !== undefined) updateData.email = email?.trim() || null;
    if (telefone !== undefined) updateData.telefone = telefone?.trim() || null;
    if (telmovel !== undefined) updateData.telmovel = telmovel?.trim() || null;
    if (morada !== undefined) updateData.morada = morada?.trim() || null;
    if (moradaNumero !== undefined) updateData.moradaNumero = moradaNumero?.trim() || null;
    if (codigoPostal !== undefined) updateData.codigoPostal = codigoPostal?.trim() || null;
    if (localidade !== undefined) updateData.localidade = localidade?.trim() || null;
    if (ilha !== undefined) updateData.ilha = ilha?.trim() || null;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Nenhum campo para atualizar." }, { status: 400 });
    }

    await prisma.cliente.update({ where: { id: clienteId }, data: updateData });

    clearClientCache(clienteId);

    return NextResponse.json({ ok: true, message: "Contacto atualizado com sucesso." });
  } catch (error) {
    console.error("[portal/update-contacto] Erro:", error);
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}
