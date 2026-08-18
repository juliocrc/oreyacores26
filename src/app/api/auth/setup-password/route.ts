import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

const ADMIN_EMAILS = ["julio.correia@orey.com"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

    const { email, password, secret } = body as { email?: string; password?: string; secret?: string };

    if (!secret || secret !== "orey-setup-2026") {
      return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
    }

    const normalizedEmail = (email || "").trim().toLowerCase();
    if (!normalizedEmail) return NextResponse.json({ error: "Email obrigatório." }, { status: 400 });
    if (!password || password.length < 6) return NextResponse.json({ error: "Password deve ter pelo menos 6 caracteres." }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) return NextResponse.json({ error: "Utilizador não encontrado." }, { status: 404 });

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return NextResponse.json({ ok: true, message: `Password definida para ${normalizedEmail}.` });
  } catch (error) {
    console.error("[setup-password] Erro:", error);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
