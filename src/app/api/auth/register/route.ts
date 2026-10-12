import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { normalizeEmail, resolveUserRole } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAuthSession } from "@/auth";

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Só um administrador pode criar utilizadores." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const rateKey = `register:${req.headers.get("x-forwarded-for") || "unknown"}`;
  const { allowed } = checkRateLimit(rateKey, 5, 15 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Demasiadas tentativas. Tente novamente mais tarde." }, { status: 429 });
  }

  const { name, email: rawEmail, password } = body as Record<string, string>;

  const email = normalizeEmail(rawEmail);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "A password deve ter pelo menos 8 caracteres." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Já existe uma conta com este email." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const role = resolveUserRole(email);

  await prisma.user.create({
    data: {
      email,
      name: (name || "").trim() || null,
      passwordHash,
      role,
      lastLoginAt: new Date(),
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
