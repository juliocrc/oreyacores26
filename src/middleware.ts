import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = new Set(["/login", "/registar", "/area-cliente", "/estado-jangada"]);
const SESSION_COOKIE = "__Secure-next-auth.session-token";
const SESSION_COOKIE_INSECURE = "next-auth.session-token";

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname);
}

function isStaticOrInternal(pathname: string) {
  return pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.startsWith("/public") || /\.[a-zA-Z0-9]+$/.test(pathname);
}

function pathMatchesPrefix(pathname: string, prefix: string) {
  if (prefix === "/") return pathname === "/";
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function canUserAccessPath(pathname: string, visiblePages: string[], role?: string) {
  if (visiblePages.length === 0) {
    if (pathname === "/") return true;
    if (pathname.startsWith("/dashboard")) return true;
    if (pathname.startsWith("/estacao-servico")) return true;
    if (pathname.startsWith("/jangadas")) return true;
    if (pathname.startsWith("/inspecoes")) return true;
    if (pathname.startsWith("/agenda")) return true;
    if (pathname.startsWith("/oficina")) return true;
    if (pathname.startsWith("/relatorio-validades")) return true;
    if (pathname.startsWith("/stock")) return true;
    if (pathname.startsWith("/equipamentos")) return true;
    if (pathname.startsWith("/fatos-imersao")) return true;
    if (pathname.startsWith("/navios")) return true;
    if (pathname.startsWith("/clientes")) return true;
    if (pathname.startsWith("/epirbs")) return true;
    if (pathname.startsWith("/tecnicos")) return true;
    if (pathname.startsWith("/cilindros")) return true;
    if (pathname.startsWith("/packs")) return true;
    if (pathname.startsWith("/alertas")) return true;
    if (pathname.startsWith("/logistica")) return true;
    if (pathname.startsWith("/backups") && role === "ADMIN") return true;
    return false;
  }

  // Páginas de acesso garantido independentemente de visiblePages
  if (pathname.startsWith("/estacao-servico")) return true;
  if (pathname.startsWith("/oficina")) return true;
  if (pathname.startsWith("/backups") && role === "ADMIN") return true;

  return visiblePages.some((prefix) => pathMatchesPrefix(pathname, prefix));
}

export default async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) return NextResponse.next();

  const isSecure = (process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "").startsWith("https");
  const cookieName = isSecure ? SESSION_COOKIE : SESSION_COOKIE_INSECURE;
  const token = await getToken({ req, secret, secureCookie: isSecure, cookieName });

  if (pathname.startsWith("/api/auth") || isStaticOrInternal(pathname)) {
    return NextResponse.next();
  }

  // Proteger rotas API — exigir autenticação JWT (apenas em produção)
  if (pathname.startsWith("/api")) {
    // Rotas públicas da API que não requerem autenticação
    const isPedidosAssistenciaWebhook = pathname === "/api/pedidos-assistencia" && req.method === "POST";
    const isPublicApi = pathname.startsWith("/api/auth")
      || pathname === "/api/health"
      || pathname === "/api/portal/cliente-auth"
      || pathname === "/api/publico/jangada"
      || pathname === "/api/setup-db"
      || pathname.startsWith("/api/debug")
      || isPedidosAssistenciaWebhook;
    
    // Rotas cron protegidas por CRON_SECRET
    const isCronRoute = pathname.startsWith("/api/cron");
    if (isCronRoute) {
      const authHeader = req.headers.get("authorization");
      const cronSecret = process.env.CRON_SECRET;
      if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
        return NextResponse.next();
      }
      if (token) return NextResponse.next();
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Exigir autenticação para APIs em todos os ambientes
    if (!isPublicApi) {
      if (!token) {
        return NextResponse.json(
          { error: "Não autenticado" },
          { status: 401 }
        );
      }
      // Clientes só podem aceder a rotas /api/portal
      if (token.role === "CLIENTE" && !pathname.startsWith("/api/portal") && !pathname.startsWith("/api/auth")) {
        return NextResponse.json(
          { error: "Acesso negado" },
          { status: 403 }
        );
      }
    }
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    if (token) {
      const target = token.role === "CLIENTE" ? "/portal" : "/";
      return NextResponse.redirect(new URL(target, req.nextUrl));
    }
    return NextResponse.next();
  }

  if (!token) {
    const loginUrl = new URL("/login", req.nextUrl);
    if (pathname && pathname !== "/") {
      loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Debug log apenas em desenvolvimento
  if (process.env.NODE_ENV === "development") {
    console.log("PROXY - PATHNAME:", pathname, "TOKEN ROLE:", token.role);
  }

  if (token.role === "CLIENTE") {
    if (!pathname.startsWith("/portal") && !pathname.startsWith("/api")) {
      return NextResponse.redirect(new URL("/portal", req.nextUrl));
    }
    return NextResponse.next();
  }

  const role = token.role === "ADMIN" ? "ADMIN" : "USER";
  const rawPermissions = token.permissions;
  const permissions = rawPermissions && typeof rawPermissions === "object"
    ? (rawPermissions as Record<string, unknown>)
    : {};
  const visiblePages = Array.isArray(permissions.visiblePages) 
    ? permissions.visiblePages.map((item: unknown) => String(item))
    : [];
  const visibleModules = Array.isArray(permissions.visibleModules) 
    ? permissions.visibleModules
    : [];

  // ADMINs têm acesso total — não verificar visiblePages
  if (role === "ADMIN") {
    return NextResponse.next();
  }

  if (!canUserAccessPath(pathname, visiblePages, role)) {
    return NextResponse.redirect(new URL("/estacao-servico", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js).*)"],
};
