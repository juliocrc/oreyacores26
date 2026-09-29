import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getAuthSecret } from "@/lib/auth";

/**
 * OREYACORESDELUXE — versão focada exclusivamente em inspeção.
 *
 * Só funcionam os módulos agenda, jangadas, navios, clientes, stock,
 * coletes e inspeções. Tudo o resto é redireccionado para o início. A lista
 * é centralizada aqui para não haver imports quebrados por apagar ficheiros.
 */

const MODULOS = [
  "/agenda",
  "/jangadas",
  "/navios",
  "/clientes",
  "/stock",
  "/coletes",
  "/equipamentos", // módulo de Coletes (lista, detalhe e certificado)
  "/inspecoes",
  "/tecnicos",
] as const;

const ROTAS_LIVRES = [
  "/",
  "/login",
  "/selecionar-tecnico",
] as const;

function isStaticOrInternal(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public") ||
    pathname.startsWith("/icons") ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  );
}

function isAllowed(pathname: string) {
  if (pathname === "/") return true;
  if ((ROTAS_LIVRES as readonly string[]).includes(pathname)) return true;
  return MODULOS.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

// Páginas acessíveis sem sessão. Na Deluxe não há login: a sessão é criada
// pela seleção de técnico. Mantido para o caso de AUTH_BYPASS estar desligado.
const PUBLIC_PAGE_PREFIXES = [
  "/login",
  "/selecionar-tecnico",
];

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isStaticOrInternal(pathname)) {
    return NextResponse.next();
  }

  // Fora do âmbito da Deluxe -> voltar ao início.
  if (!pathname.startsWith("/api") && !isAllowed(pathname)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const isPublicPage = PUBLIC_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isPublicPage) return NextResponse.next();

  // Deluxe: sem login. A sessão é assumida a partir do técnico escolhido.
  if (process.env.AUTH_BYPASS === "true") return NextResponse.next();

  try {
    const token = await getToken({ req, secret: getAuthSecret() });
    if (token?.sub) return NextResponse.next();
  } catch (err) {
    console.error("[proxy] Falha ao validar sessão:", err);
  }

  const loginUrl = new URL("/selecionar-tecnico", req.url);
  loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js).*)"],
};
