import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/auth";
import { hasElevatedAccess } from "@/lib/permission-access";
import { logAuditoria } from "@/lib/auditoria";
import prisma from "@/lib/prisma";
import {
  listRecentSessionLogins,
  listUserSessionHistoryByEmail,
  markUserSessionOffline,
  upsertUserSessionPresence,
} from "@/lib/user-session-presence";

function parsePathname(value: unknown) {
  const pathname = String(value || "").trim();
  return pathname.startsWith("/") ? pathname : undefined;
}

function parseJsonObject(value: unknown) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }

  if (!hasElevatedAccess({ role: session.user.role, permissions: session.user.permissions })) {
    return NextResponse.json({ error: "Apenas administradores podem consultar alertas de sessão." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const email = String(searchParams.get("email") || "").trim().toLowerCase();

  if (email) {
    const sinceDays = Math.min(30, Math.max(1, Number(searchParams.get("sinceDays") || 7)));
    const limit = Math.min(500, Math.max(10, Number(searchParams.get("limit") || 200)));
    const includeOffline = String(searchParams.get("includeOffline") || "true") !== "false";

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true },
    });

    const sessions = await listUserSessionHistoryByEmail({ email, sinceDays, includeOffline });

    const auditRows = await prisma.auditoria.findMany({
      where: {
        OR: [
          { tabela: "UserNavigation", usuario: email },
          { tabela: "UserSession", usuario: email },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const navigationTrail = auditRows
      .filter((row) => row.tabela === "UserNavigation")
      .map((row) => {
        const payload = parseJsonObject(row.dadosDepois);
        return {
          at: (payload?.at as string) || row.createdAt,
          sessionId: typeof payload?.sessionId === "string" ? payload.sessionId : null,
          currentPath: typeof payload?.currentPath === "string" ? payload.currentPath : null,
          previousPath: typeof payload?.previousPath === "string" ? payload.previousPath : null,
        };
      })
      .filter((item) => item.currentPath)
      .slice(0, limit);

    const loginEvents = auditRows
      .filter((row) => row.tabela === "UserSession" && row.tipoOperacao === "CREATE")
      .map((row) => {
        const payload = parseJsonObject(row.dadosDepois);
        return {
          at: row.createdAt,
          sessionId: typeof payload?.sessionId === "string" ? payload.sessionId : null,
          role: typeof payload?.role === "string" ? payload.role : null,
          lastPath: typeof payload?.lastPath === "string" ? payload.lastPath : null,
        };
      });

    return NextResponse.json({
      email,
      user,
      sinceDays,
      sessions,
      loginEvents,
      navigationTrail,
      serverTime: new Date().toISOString(),
    });
  }

  const sinceMinutes = Number(searchParams.get("sinceMinutes") || 15);
  const events = await listRecentSessionLogins({ sinceMinutes });

  return NextResponse.json({
    events,
    serverTime: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id || !session.user.email || !session.user.sessionId) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const offline = Boolean((body as Record<string, unknown>)?.offline);

  if (offline) {
    await markUserSessionOffline(String(session.user.sessionId));
    return NextResponse.json({ success: true, offline: true });
  }

  const result = await upsertUserSessionPresence({
    sessionId: String(session.user.sessionId),
    userId: Number(session.user.id),
    email: session.user.email,
    name: session.user.name,
    role: session.user.role === "ADMIN" ? "ADMIN" : session.user.role === "CLIENTE" ? "CLIENTE" : "USER",
    lastPath: parsePathname((body as Record<string, unknown>)?.pathname),
    userAgent: req.headers.get("user-agent") || undefined,
  });

  if (result.wasCreated) {
    await logAuditoria({
      tabela: "UserSession",
      tipoOperacao: "CREATE",
      idRegisto: Number(session.user.id),
      descricao: `Utilizador ${session.user.email} iniciou sessão`,
      usuario: session.user.email,
      dadosDepois: {
        sessionId: result.record.sessionId,
        role: result.record.role,
        startedAt: result.record.createdAt,
        lastPath: result.record.lastPath || null,
      },
    });
  }

  if (result.pathChanged && result.record.lastPath) {
    await logAuditoria({
      tabela: "UserNavigation",
      tipoOperacao: "CREATE",
      idRegisto: Number(session.user.id),
      descricao: `Utilizador ${session.user.email} visitou ${result.record.lastPath}`,
      usuario: session.user.email,
      dadosDepois: {
        sessionId: result.record.sessionId,
        previousPath: result.previousPath || null,
        currentPath: result.record.lastPath,
        at: result.record.lastSeenAt,
      },
    });
  }

  return NextResponse.json({
    success: true,
    sessionId: result.record.sessionId,
    expiresAt: result.record.expiresAt,
  });
}
