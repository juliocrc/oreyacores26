import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getAccessContext();
    if (!access || !access.isAdmin) {
      return NextResponse.json({ error: "Apenas administradores podem gerar códigos." }, { status: 403 });
    }

    const { id } = await params;
    const clienteId = Number(id);
    if (!Number.isFinite(clienteId)) {
      return NextResponse.json({ error: "ID de cliente inválido." }, { status: 400 });
    }

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, nome: true, telmovel: true, telefone: true, nif: true },
    });

    if (!cliente) {
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    }

    const { generateFiveDigitCode } = await import('@/lib/code');
    const code = generateFiveDigitCode();

    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        verificationCode: code,
        verificationCodeExpires: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    return NextResponse.json({
      ok: true,
      code,
      cliente: {
        id: cliente.id,
        nome: cliente.nome,
        nif: cliente.nif,
      },
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      message: `Código gerado para ${cliente.nome}. Comunique o código ${code} ao cliente.`,
    });
  } catch (error) {
    console.error("[admin-generate-code] Erro:", error);
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}
