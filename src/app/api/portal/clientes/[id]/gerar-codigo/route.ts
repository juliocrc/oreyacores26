import { NextResponse } from "next/server";
import { getAuthSession } from "@/auth";
import prisma from "@/lib/prisma";
import { generateFiveDigitCode } from "@/lib/code";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem gerar códigos." }, { status: 403 });
  }
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });
  const cliente = await prisma.cliente.findUnique({ where: { id }, select: { id: true } });
  if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  const code = generateFiveDigitCode();
  // Código de acesso permanente: o administrador gera e fornece ao cliente.
  // Mantém-se válido até o administrador gerar um novo código.
  await prisma.cliente.update({ where: { id }, data: { verificationCode: code, verificationCodeExpires: null } });
  return NextResponse.json({ success: true, code, expiresAt: null });
}
