import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getAuthSecret } from "@/lib/auth";
import { getIsSecureUrl } from "@/auth";
import { isLocalAuthBypassEnabled } from "@/lib/local-auth";

/**
 * OREYACORESDELUXE â€” versÃ£o focada exclusivamente em inspeÃ§Ã£o.
 *
 * SÃ³ funcionam os mÃ³dulos agenda, jangadas, navios, clientes, stock,
 * coletes e inspeÃ§Ãµes. Tudo o resto Ã© redireccionado para o inÃ­cio. A lista
 * Ã© centralizada aqui para nÃ£o haver imports quebrados por apagar ficheiros.
 */

const MODULOS = [
  // OperaÃ§Ã£o
  "/agenda",
  "/estacao-servico",
  "/oficina",
  "/calibracoes",
  "/logistica",
  "/alertas",
  "/notificacoes",
  "/pedidos-assistencia",
  "/backups",
  "/aplicacoes",
  "/porto-ponta-delgada",
  "/contentores",
   "/marinha",
   "/globalfishazores",
  // Ordens de ServiÃ§o
  "/criar-ot",
  "/obras",
  "/ordens-servico",
  "/orcamentos",
  // Comercial & FaturaÃ§Ã£o
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
  "/equipamentos", // mÃ³dulo de Coletes (lista, detalhe e certificado)
  "/fatos-imersao",
  "/cilindros",
  // Stock
  "/stock",
  // Clientes
  "/clientes",
  "/tecnicos",
  "/comunicacoes",
  "/whatsapp",
  // DocumentaÃ§Ã£o & Qualidade
  "/qualidade-dados",
  "/integridade",
   "/dgrm",
   "/survitec-auditoria",
   "/auditorias",
  "/departamento-tecnico",
  "/legislacao",
  "/fotos",
  "/estatisticas",
  "/portal-propostas",
  "/relatorios",
  "/contactos-internos",
  // AdministraÃ§Ã£o
  "/utilizadores",
  "/registar",
  "/onedrive",
] as const;

const ROTAS_LIVRES = [
  "/",
  "/login",
  "/selecionar-tecnico",
  "/area-cliente",
  "/portal-cliente",
  "/verificar",
] as const;

/**
 * Rotas /api que respondem SEM sessÃ£o.
 *
 * Ã‰ uma lista de excepÃ§Ãµes, nÃ£o de permissÃµes: tudo o que nÃ£o esteja aqui
 * exige sessÃ£o. Antes o proxy deixava passar todas as rotas /api sem verificar
 * nada, e a protecÃ§Ã£o dependia de cada route.ts se lembrar de chamar
 * getAccessContext(). 61 rotas com escrita (POST/PUT/PATCH/DELETE) nÃ£o o
 * faziam. Centralizar aqui Ã© mais seguro do que corrigir 61 ficheiros: uma
 * rota nova fica protegida por omissÃ£o, em vez de depender de alguÃ©m se
 * lembrar.
 *
 * As entradas sÃ£o intencionais e nÃ£o um esquecimento:
 *   - /api/auth/*        fluxo de login / NextAuth
 *   - /api/cron/*        agendadas por segredo prÃ³prio (ver CRON_SECRET)
 *   - /api/public*, /api/publico/*  links pÃºblicos com token
 *   - /api/health, /api/service-stations/public  diagnÃ³stico
 *   - /api/whatsapp/webhook, /api/setup-db  integraÃ§Ãµes com segredo prÃ³prio
 */
const API_PUBLICAS_EXATAS = [
  "/api/health",
  "/api/whatsapp/webhook",
  "/api/comunicacoes/inbound",
  "/api/comunicacoes/twilio",
  "/api/comunicacoes/infinireach",
  "/api/service-stations/public",
  // O certificado PDF valida a sessÃ£o OU um token assinado com expiraÃ§Ã£o dentro
  // da prÃ³pria rota (GET). O POST continua a exigir sessÃ£o. Deixar passar o
  // middleware Ã© necessÃ¡rio para o link pÃºblico `?serial=...&t=...` funcionar.
  "/api/certificados/pdf",
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
  if ((ROTAS_LIVRES as readonly string[]).some((r) => pathname === r || pathname.startsWith(`${r}/`))) return true;
  return MODULOS.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

// Public login pages do not themselves grant a staff session.
const PUBLIC_PAGE_PREFIXES = [
  "/login",
  "/selecionar-tecnico",
  "/area-cliente",
  "/portal-cliente",
  "/verificar",
];

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // A sessÃ£o vive num cookie por omissÃ£o do Auth.js. O getToken() sÃ³ encontra
  // o cookie se receber o mesmo nome/flag que a assinatura usou: com https o
  // Auth.js emite "__Secure-authjs.session-token", sem https emite
  // "authjs.session-token". Sem isto o proxy nunca via a sessÃ£o e reenviava
  // cada pÃ¡gina protegida para /selecionar-tecnico â€” que, jÃ¡ autenticado,
  // reenviava â€” num loop infinito.
  const secureCookie = getIsSecureUrl();
  const sessionCookieName = (secureCookie ? "__Secure-" : "") + "authjs.session-token";
  async function sessionToken() {
    return getToken({ req, secret: getAuthSecret(), secureCookie, cookieName: sessionCookieName });
  }

  // API identifiers can contain dots: an extension must never bypass API auth.
  if (!pathname.startsWith("/api") && isStaticOrInternal(pathname)) {
    return NextResponse.next();
  }

  // Fora do Ã¢mbito da Deluxe -> voltar ao inÃ­cio.
  if (!pathname.startsWith("/api") && !isAllowed(pathname)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (pathname.startsWith("/api")) {
    if (isApiPublica(pathname)) return NextResponse.next();
    if (isLocalAuthBypassEnabled()) return NextResponse.next();

    try {
      const token = await sessionToken();
      if (token?.sub) {
        if (token.role === "CLIENTE" && !pathname.startsWith("/api/portal/")) {
          return NextResponse.json({ error: "Apenas utilizadores internos." }, { status: 403 });
        }
        if (token.role !== "ADMIN" && token.role !== "USER" && token.role !== "CLIENTE") {
          return NextResponse.json({ error: "Perfil de sessÃ£o invÃ¡lido. Inicie sessÃ£o novamente." }, { status: 401 });
        }
        return NextResponse.next();
      }
    } catch (err) {
      console.error("[proxy] Falha ao validar sessÃ£o em", pathname, err);
    }

    // 401 e nÃ£o redirect: uma rota /api tem de devolver JSON, nÃ£o HTML.
    return NextResponse.json({ error: "SessÃ£o obrigatÃ³ria." }, { status: 401 });
  }

  const isPublicPage = PUBLIC_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isPublicPage) return NextResponse.next();

  if (isLocalAuthBypassEnabled()) return NextResponse.next();

  try {
    const token = await sessionToken();
    if (token?.sub && token.role === "CLIENTE") {
      return NextResponse.redirect(new URL("/area-cliente", req.url));
    }
    if (token?.sub && (token.role === "ADMIN" || token.role === "USER")) return NextResponse.next();
  } catch (err) {
    console.error("[proxy] Falha ao validar sessÃ£o:", err);
  }

  const loginUrl = new URL("/selecionar-tecnico", req.url);
  loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js).*)"],
};
