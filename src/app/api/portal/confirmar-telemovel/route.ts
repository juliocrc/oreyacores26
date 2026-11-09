import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/auth";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { phoneIdentity } from "@/lib/communication-inbox";

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  const clienteId = Number(session?.user?.clienteId);
  if (!session?.user?.id || session.user.role !== "CLIENTE" || !Number.isSafeInteger(clienteId) || clienteId <= 0) {
    return NextResponse.json({ error: "Sessão de cliente obrigatória." }, { status: 401 });
  }
  const limit = await checkRateLimit(`portal-phone-confirm:${clienteId}`, 5, 600_000);
  if (!limit.allowed) return NextResponse.json({ error: "Não foi possível verificar o número. Tente mais tarde." }, { status: limit.status === 503 ? 503 : 429 });
  if (Number(req.headers.get("content-length")) > 1024) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  let phone: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.phone === "string" && body.phone.length <= 40) phone = phoneIdentity(body.phone);
  } catch { /* generic response */ }
  if (!phone) return NextResponse.json({ error: "Não foi possível confirmar o telemóvel. Verifique o número ou contacte a equipa." }, { status: 400 });
  const client = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { telmovel: true } });
  if (!client?.telmovel || phoneIdentity(client.telmovel) !== phone) {
    return NextResponse.json({ error: "Não foi possível confirmar o telemóvel. Verifique o número ou contacte a equipa." }, { status: 400 });
  }
  return NextResponse.json({ confirmed: true }, { headers: { "Cache-Control": "private, no-store" } });
}
