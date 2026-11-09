import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export async function PATCH(req: NextRequest) {
  const session = await getAuthSession();
  const id = Number(session?.user?.clienteId);
  if (!session?.user?.id) return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  if (session.user.role !== "CLIENTE" || !Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Sessao de cliente obrigatoria." }, { status: 403 });
  try {
    const limit = await checkRateLimit(`client-registration-update:${id}`, 3, 600_000);
    if (!limit.allowed) return NextResponse.json({ error: "Tente guardar os dados mais tarde." }, { status: limit.status === 503 ? 503 : 429 });
    const body = await req.json().catch(() => null);
    if (!body || typeof body.email !== "string" || Object.keys(body).some(key => key !== "email")) return NextResponse.json({ error: "Dados invalidos." }, { status: 400 });
    const email = body.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Email invalido." }, { status: 400 });
    const cliente = await prisma.cliente.findUnique({ where: { id }, select: { email: true, telefone: true, telmovel: true } });
    if (!cliente) return NextResponse.json({ error: "Cliente nao encontrado." }, { status: 404 });
    if (cliente.email?.trim()) {
      if (cliente.email.trim().toLowerCase() === email) return NextResponse.json({ success: true });
      return NextResponse.json({ error: "A ficha ja tem email. A alteracao tem de ser validada pela equipa." }, { status: 409 });
    }
    if (!cliente.telmovel && !cliente.telefone) return NextResponse.json({ error: "A atualizacao tem de ser validada pela equipa." }, { status: 409 });
    const result = await prisma.cliente.updateMany({ where: { id, email: cliente.email }, data: { email } });
    if (result.count !== 1) return NextResponse.json({ error: "A ficha foi alterada. Atualize antes de tentar novamente." }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Nao foi possivel guardar o email. O pedido continua disponivel para a equipa." }, { status: 500 });
  }
}
