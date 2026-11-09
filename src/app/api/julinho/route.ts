import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getDashboardScope } from "@/lib/dashboard-access";
import { answerJulinho, type JulinhoStationWhere } from "@/lib/julinho/julinho-answer";
import { GET as searchGlobal } from "@/app/api/search/global/route";
import { parseJulinhoIntent } from "@/lib/julinho/julinho-intents";
import { hasModulePermission, hasVisiblePathPermission } from "@/lib/permission-access";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BODY_BYTES = 8 * 1024;
const MAX_TEXT_LENGTH = 600;

type JulinhoRequestBody = {
  text?: unknown;
  pathname?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(req: NextRequest) {
  const scope = await getDashboardScope(req);
  if ("error" in scope && scope.error) return scope.error;

  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Pedido demasiado grande." }, { status: 413 });
  }

  let body: JulinhoRequestBody;
  try {
    const parsed: unknown = await req.json();
    if (!isRecord(parsed)) throw new Error("invalid body");
    body = parsed;
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const pathname = typeof body.pathname === "string" ? body.pathname.slice(0, 300) : null;

  if (!text || text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: `O pedido deve ter entre 1 e ${MAX_TEXT_LENGTH} caracteres.` }, { status: 400 });
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    return NextResponse.json({ error: "O pedido contém caracteres inválidos." }, { status: 400 });
  }

  const intent = parseJulinhoIntent(text);
  if (!scope.access.isAdmin && intent.kind === "query") {
    const modules: Record<string, [string, string]> = {
      jangada: ["jangadas", "/jangadas"], certificate: ["jangadas", "/jangadas"],
      inspections: ["jangadas", "/jangadas"], "inspections-week": ["jangadas", "/jangadas"],
      "inspections-period": ["jangadas", "/jangadas"],
      "station-waiting": ["estacao-servico", "/estacao-servico"],
      navio: ["navios", "/navios"], cliente: ["clientes", "/clientes"],
      "stock-item": ["stock", "/stock"], "stock-low": ["stock", "/stock"],
      "work-orders": ["ordens-servico", "/ordens-servico"], invoices: ["faturacao", "/faturacao"],
    };
    const countModule: Record<string, string> = { jangada: "jangada", navio: "navio", cliente: "cliente", stock: "stock-item" };
    const needed = intent.topic === "summary"
      ? ["jangada", "navio", "cliente", "stock-item", "work-orders", "invoices"]
      : [intent.topic === "count" ? countModule[intent.term || ""] : intent.topic];
    if (needed.some(key => !key || !modules[key] || !hasModulePermission(scope.access.permissions, modules[key][0]) || !hasVisiblePathPermission(scope.access.permissions, modules[key][1]))) {
      return NextResponse.json({ error: "Sem permissão para consultar esta informação." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    }
  }

  try {
    const search = /^(?:pesquisa|pesquisar|procura|procurar)\s+(?:na\s+)?(?:pesquisa\s+)?global\s+(?:por\s+)?(.+)$/i.exec(text);
    if (search && search[1].trim().length >= 2) {
      const url = new URL("/api/search/global", req.nextUrl.origin);
      url.searchParams.set("q", search[1].trim());
      const station = req.nextUrl.searchParams.get("stationId");
      if (station !== null) url.searchParams.set("stationId", station);
      const result = await searchGlobal(new NextRequest(url, { headers: req.headers }));
      if (!result.ok) return NextResponse.json({ error: "Não foi possível pesquisar agora." }, { status: result.status });
      const matches = await result.json() as Array<{ type: string; label: string; href: string }>;
      const reply = matches.length
        ? `Encontrei ${matches.length} resultados acessíveis na pesquisa global. Primeiros resultados: ${matches.slice(0, 5).map(item => `${item.type}: ${item.label}`).join('; ')}${matches.length > 5 ? '. Consulte a pesquisa global para ver os restantes' : ''}.`
        : "Não encontrei resultados acessíveis na pesquisa global para esse termo.";
      return NextResponse.json({ reply, results: matches.slice(0, 5) }, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    const station = scope.stationId
      ? await prisma.serviceStation.findUnique({
          where: { id: scope.stationId },
          select: { nome: true },
        })
      : null;

    const answer = await answerJulinho(text, {
      where: scope.where as JulinhoStationWhere,
      stationName: station?.nome ?? null,
      pathname,
    });

    return NextResponse.json(answer, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Não consegui consultar os dados agora. Tenta novamente." },
      { status: 500 },
    );
  }
}
