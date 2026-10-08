import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getAuthSecret } from "@/lib/auth";
import { getIsSecureUrl } from "@/auth";

/**
 * OREYACORESDELUXE — versão focada exclusivamente em inspeção.
 *
 * Só funcionam os módulos agenda, jangadas, navios, clientes, stock,
 * coletes e inspeções. Tudo o resto é redireccionado para o início. A lista
 * é centralizada aqui para não haver imports quebrados por apagar ficheiros.
 */

const MODULOS = [
  // Operação
  "/agenda",
  "/estacao-servico",
  "/oficina",
  "/calibracoes",
  "/logistica",
  "/alertas",
  "/pedidos-assistencia",
  "/backups",
  // Ordens de Serviço
  "/criar-ot",
  "/ordens-servico",
  "/orcamentos",
  // Comercial & Faturação
  "/faturacao",
  "/cobrancas",
  "/contas-receber",
  "/relatorio-validades",
  "/rentabilidade",
  // Frota e Equipamento
  "/jangadas",
  "/estado-jangada",
  "/inspecoes",
  "/packs",
  "/navios",
  "/epirbs",
  "/equipamentos", // módulo de Coletes (lista, detalhe e certificado)
  "/fatos-imersao",
  "/cilindros",
  // Stock
  "/stock",
  // Clientes
  "/clientes",
  "/tecnicos",
  "/comunicacoes",
  "/whatsapp",
  // Documentação & Qualidade
  "/qualidade-dados",
  "/integridade",
  "/dgrm",
  "/auditorias",
  "/departamento-tecnico",
  "/legislacao",
  "/fotos",
  "/relatorios",
  "/contactos-internos",
  // Administração
  "/utilizadores",
  "/registar",
] as const;

const ROTAS_LIVRES = [
  "/",
  "/login",
  "/selecionar-tecnico",
] as const;

/**
 * Rotas /api que respondem SEM sessão.
 *
 * É uma lista de excepções, não de permissões: tudo o que não esteja aqui
 * exige sessão. Antes o proxy deixava passar todas as rotas /api sem verificar
 * nada, e a protecção dependia de cada route.ts se lembrar de chamar
 * getAccessContext(). 61 rotas com escrita (POST/PUT/PATCH/DELETE) não o
 * faziam. Centralizar aqui é mais seguro do que corrigir 61 ficheiros: uma
 * rota nova fica protegida por omissão, em vez de depender de alguém se
 * lembrar.
 *
 * As entradas são intencionais e não um esquecimento:
 *   - /api/auth/*        fluxo de login / NextAuth
 *   - /api/cron/*        agendadas por segredo próprio (ver CRON_SECRET)
 *   - /api/public*, /api/publico/*  links públicos com token
 *   - /api/health, /api/service-stations/public  diagnóstico
 *   - /api/whatsapp/webhook, /api/setup-db  integrações com segredo próprio
 */
const API_PUBLICAS_EXATAS = [
  "/api/health",
  "/api/setup-db",
  "/api/whatsapp/webhook",
  "/api/comunicacoes/inbound",
  "/api/service-stations/public",
] as const;

const API_PUBLICAS_POR_PREFIXO = [
  "/api/auth/",
  "/api/cron/",
  "/api/public/",
  "/api/publico/",
] as const;

function isApiPublica(pathname: string) {
  if ((API_PUBLICAS_EXATAS as readonly string[]).includes(pathname)) return true;
  return API_PUBLICAS_POR_PREFIXO.some((p) => pathname.startsWith(p));
}

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

  // A sessão vive num cookie por omissão do Auth.js. O getToken() só encontra
  // o cookie se receber o mesmo nome/flag que a assinatura usou: com https o
  // Auth.js emite "__Secure-authjs.session-token", sem https emite
  // "authjs.session-token". Sem isto o proxy nunca via a sessão e reenviava
  // cada página protegida para /selecionar-tecnico — que, já autenticado,
  // reenviava — num loop infinito.
  const secureCookie = getIsSecureUrl();
  const sessionCookieName = (secureCookie ? "__Secure-" : "") + "authjs.session-token";
  async function sessionToken() {
    return (await getToken({ req, secret: getAuthSecret(), secureCookie, cookieName: sessionCookieName }))?.sub;
  }

  if (isStaticOrInternal(pathname)) {
    return NextResponse.next();
  }

  // Fora do âmbito da Deluxe -> voltar ao início.
  if (!pathname.startsWith("/api") && !isAllowed(pathname)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (pathname.startsWith("/api")) {
    if (isApiPublica(pathname)) return NextResponse.next();
    if (process.env.AUTH_BYPASS === "true") return NextResponse.next();

    try {
      const sub = await sessionToken();
      if (sub) return NextResponse.next();
    } catch (err) {
      console.error("[proxy] Falha ao validar sessão em", pathname, err);
    }

    // 401 e não redirect: uma rota /api tem de devolver JSON, não HTML.
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }

  const isPublicPage = PUBLIC_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isPublicPage) return NextResponse.next();

  // Deluxe: sem login. A sessão é assumida a partir do técnico escolhido.
  if (process.env.AUTH_BYPASS === "true") return NextResponse.next();

  try {
    const sub = await sessionToken();
    if (sub) return NextResponse.next();
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
