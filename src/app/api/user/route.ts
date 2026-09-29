import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/auth";
import { normalizeEmail } from "@/lib/auth";
import { logAuditoria } from "@/lib/auditoria";
import { hasElevatedAccess } from "@/lib/permission-access";
import {
  removeUserPermissionOverride,
  resolveEffectivePermissions,
} from "@/lib/user-permissions";
import { buildUserPresenceSummaryByUserId } from "@/lib/user-session-presence";

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  image: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  clienteId: true,
  cliente: {
    select: {
      id: true,
      nome: true,
    },
  },
  _count: {
    select: {
      posts: true,
    },
  },
} as const;

async function requireAdminSession() {
  const session = await getAuthSession();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 }) };
  }

  if (!hasElevatedAccess({ role: session.user.role, permissions: session.user.permissions })) {
    return { error: NextResponse.json({ error: "Apenas administradores podem gerir utilizadores." }, { status: 403 }) };
  }

  return { session };
}

function parseRole(value: unknown) {
  if (value == null || value === "") return null;
  if (value === "ADMIN") return UserRole.ADMIN;
  if (value === "USER") return UserRole.USER;
  if (value === "CLIENTE") return UserRole.CLIENTE;
  return undefined;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseUserId(value: unknown) {
  const userId = Number(value);
  return Number.isFinite(userId) && userId > 0 ? userId : null;
}

async function countOtherAdmins(userId: number) {
  return prisma.user.count({
    where: {
      role: UserRole.ADMIN,
      NOT: { id: userId },
    },
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(req.url);
  const where: Prisma.UserWhereInput = {};
  const emailParam = searchParams.get("email"); if (emailParam) where.email = { contains: emailParam };
  const nameParam = searchParams.get("name"); if (nameParam) where.name = { contains: nameParam };
  const roleParam = searchParams.get("role");
  if (roleParam === "ADMIN" || roleParam === "USER" || roleParam === "CLIENTE") {
    where.role = roleParam;
  }

  const users = await prisma.user.findMany({
    where,
    select: userSelect,
    orderBy: [{ role: "asc" }, { name: "asc" }, { email: "asc" }],
  });

  const presenceByUserId = await buildUserPresenceSummaryByUserId();

  const enrichedUsers = await Promise.all(
    users.map(async (user) => ({
      ...user,
      permissions: await resolveEffectivePermissions({
        userId: user.id,
        role: user.role === "ADMIN" ? "ADMIN" : user.role === "CLIENTE" ? "CLIENTE" : "USER",
      }),
      ...(presenceByUserId[user.id] || {
        isOnline: false,
        onlineSessions: 0,
        presenceLastSeenAt: null,
        activeSessions: [],
      }),
    }))
  );

  return NextResponse.json(enrichedUsers);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminSession();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
  const password = typeof body.password === "string" ? body.password : "";
  const role = parseRole(body.role);

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }

  if (!password || password.length < 8) {
    return NextResponse.json({ error: "A password deve ter pelo menos 8 caracteres." }, { status: 400 });
  }

  if (!role) {
    return NextResponse.json({ error: "Perfil inválido." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Já existe um utilizador com este email." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const createdUser = await prisma.user.create({
    data: {
      email,
      name: name || null,
      passwordHash,
      role,
      clienteId: body.clienteId ? Number(body.clienteId) : null,
    },
    select: userSelect,
  });

  await logAuditoria({
    tabela: "User",
    tipoOperacao: "CREATE",
    idRegisto: createdUser.id,
    descricao: `Criação do utilizador ${createdUser.email}`,
    usuario: auth.session?.user?.email || "sistema",
    dadosDepois: createdUser,
  });

  return NextResponse.json(createdUser, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminSession();
  if (auth.error) return auth.error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const userId = parseUserId(body.userId);
  if (!userId) {
    return NextResponse.json({ error: "userId inválido." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...userSelect,
      passwordHash: true,
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Utilizador não encontrado." }, { status: 404 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : existing.name || "";
  const emailInput = typeof body.email === "string" ? body.email : existing.email;
  const email = normalizeEmail(emailInput);
  const password = typeof body.password === "string" ? body.password : "";
  const roleInput = body.role;
  const role = roleInput == null || roleInput === "" ? existing.role : parseRole(roleInput);

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }

  if (role === undefined || role === null) {
    return NextResponse.json({ error: "Perfil inválido." }, { status: 400 });
  }

  if (password && password.length < 8) {
    return NextResponse.json({ error: "A password deve ter pelo menos 8 caracteres." }, { status: 400 });
  }

  const isSelf = Number(auth.session?.user?.id) === existing.id;
  if (isSelf && role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Não é permitido remover o perfil de administrador do utilizador autenticado." }, { status: 400 });
  }

  if (existing.role === UserRole.ADMIN && role !== UserRole.ADMIN) {
    const otherAdmins = await countOtherAdmins(existing.id);
    if (otherAdmins === 0) {
      return NextResponse.json({ error: "Tem de existir pelo menos um administrador ativo." }, { status: 400 });
    }
  }

  if (email !== existing.email) {
    const emailOwner = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (emailOwner && emailOwner.id !== existing.id) {
      return NextResponse.json({ error: "Já existe um utilizador com este email." }, { status: 409 });
    }
  }

  const clienteIdInput = body.clienteId;
  const clienteId = clienteIdInput === null ? null : clienteIdInput !== undefined ? Number(clienteIdInput) : existing.clienteId;

  const data: {
    name?: string | null;
    email?: string;
    role?: UserRole;
    clienteId?: number | null;
    passwordHash?: string;
  } = {};

  if (name !== (existing.name || "")) data.name = name || null;
  if (email !== existing.email) data.email = email;
  if (role !== existing.role) data.role = role;
  if (clienteId !== existing.clienteId) data.clienteId = clienteId;
  if (password) data.passwordHash = await bcrypt.hash(password, 12);

  const updatedUser = Object.keys(data).length > 0
    ? await prisma.user.update({
        where: { id: existing.id },
        data,
        select: userSelect,
      })
    : existing;

  await logAuditoria({
    tabela: "User",
    tipoOperacao: "UPDATE",
    idRegisto: existing.id,
    descricao: `Atualização do utilizador ${updatedUser.email}`,
    usuario: auth.session?.user?.email || "sistema",
    dadosAntes: existing,
    dadosDepois: updatedUser,
  });

  return NextResponse.json(updatedUser);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdminSession();
  if (auth.error) return auth.error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const userId = parseUserId(body.userId);
  if (!userId) {
    return NextResponse.json({ error: "userId inválido." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: userSelect,
  });

  if (!existing) {
    return NextResponse.json({ error: "Utilizador não encontrado." }, { status: 404 });
  }

  if (Number(auth.session?.user?.id) === existing.id) {
    return NextResponse.json({ error: "Não pode eliminar o utilizador autenticado." }, { status: 400 });
  }

  if (existing.role === UserRole.ADMIN) {
    const otherAdmins = await countOtherAdmins(existing.id);
    if (otherAdmins === 0) {
      return NextResponse.json({ error: "Tem de existir pelo menos um administrador ativo." }, { status: 400 });
    }
  }

  await prisma.$transaction([
    prisma.post.deleteMany({ where: { authorId: existing.id } }),
    prisma.user.delete({ where: { id: existing.id } }),
  ]);

  await removeUserPermissionOverride(existing.id);

  await logAuditoria({
    tabela: "User",
    tipoOperacao: "DELETE",
    idRegisto: existing.id,
    descricao: `Eliminação do utilizador ${existing.email}`,
    usuario: auth.session?.user?.email || "sistema",
    dadosAntes: existing,
  });

  return NextResponse.json({ success: true, userId: existing.id });
}
