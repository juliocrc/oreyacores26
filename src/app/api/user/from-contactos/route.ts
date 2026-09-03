import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/auth";
import { normalizeEmail } from "@/lib/auth";
import { logAuditoria } from "@/lib/auditoria";
import { hasElevatedAccess } from "@/lib/permission-access";

const DEFAULT_PASSWORD = "cabouco321";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseContactoIds(body: unknown): number[] {
  if (!body || typeof body !== "object") return [];
  const raw = (body as { contactoIds?: unknown }).contactoIds;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }
  if (!hasElevatedAccess({ role: session.user.role, permissions: session.user.permissions })) {
    return NextResponse.json({ error: "Apenas administradores podem gerir utilizadores." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const contactoIds = parseContactoIds(body);
  if (contactoIds.length === 0) {
    return NextResponse.json({ error: "Selecione pelo menos um contacto interno." }, { status: 400 });
  }

  const contactos = await prisma.contactoInterno.findMany({
    where: { id: { in: contactoIds } },
    select: { id: true, nome: true, email: true },
  });

  if (contactos.length === 0) {
    return NextResponse.json({ error: "Nenhum contacto interno encontrado." }, { status: 404 });
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  const created: Array<{ id: number; contactoId: number; email: string; name: string | null }> = [];
  const skippedDuplicates: string[] = [];
  const skippedNoEmail: string[] = [];

  for (const contacto of contactos) {
    const email = normalizeEmail(contacto.email || "");
    if (!email || !isValidEmail(email)) {
      skippedNoEmail.push(contacto.nome || contacto.email || `#${contacto.id}`);
      continue;
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      skippedDuplicates.push(email);
      continue;
    }

    const createdUser = await prisma.user.create({
      data: {
        email,
        name: contacto.nome?.trim() || null,
        passwordHash,
        role: UserRole.USER,
      },
      select: { id: true, email: true, name: true },
    });

    await logAuditoria({
      tabela: "User",
      tipoOperacao: "CREATE",
      idRegisto: createdUser.id,
      descricao: `Criação do utilizador ${createdUser.email} a partir de contacto interno`,
      usuario: session.user.email || "sistema",
      dadosDepois: createdUser,
    });

    created.push({
      id: createdUser.id,
      contactoId: contacto.id,
      email: createdUser.email,
      name: createdUser.name,
    });
  }

  return NextResponse.json({
    created,
    skippedDuplicates,
    skippedNoEmail,
    defaultPassword: DEFAULT_PASSWORD,
  });
}
