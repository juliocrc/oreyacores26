import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

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

    const passwordHash = await bcrypt.hash(password, 12);

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash },
      });
      return NextResponse.json({ ok: true, message: `Password atualizada para ${normalizedEmail}.` });
    }

    const newUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: "Admin",
        passwordHash,
        role: "ADMIN",
        lastLoginAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, message: `Utilizador ${normalizedEmail} criado com password definida.`, userId: newUser.id });
  } catch (error: any) {
    console.error("[setup-password] Erro:", error?.message || error);
    return NextResponse.json({ error: error?.message || "Erro interno." }, { status: 500 });
  }
}
