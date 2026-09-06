import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getAuthSecret } from "@/lib/auth";

function isStaticOrInternal(pathname: string) {
  return pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.startsWith("/public") || /\.[a-zA-Z0-9]+$/.test(pathname);
}

// Páginas acessíveis sem sessão (login, registo, consulta pública de estado,
// portal de cliente). As APIs protegidas continuam a validar sessão por si.
const PUBLIC_PAGE_PREFIXES = [
  "/login",
  "/registar",
  "/area-cliente",
  "/estado-jangada",
  "/portal",
  "/demo",
];

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isStaticOrInternal(pathname) || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const isPublicPage = PUBLIC_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isPublicPage) return NextResponse.next();

  // Enquanto AUTH_BYPASS estiver ativo no deployment, mantém o comportamento
  // atual (sem bloqueio ao nível da página) para não interromper o acesso.
  if (process.env.AUTH_BYPASS === "true") return NextResponse.next();

  try {
    const token = await getToken({ req, secret: getAuthSecret() });
    if (token?.sub) return NextResponse.next();
  } catch (err) {
    console.error("[middleware] Falha ao validar sessão:", err);
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js).*)"],
};