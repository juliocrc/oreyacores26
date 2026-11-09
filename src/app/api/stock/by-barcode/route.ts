import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { canEditStock, stockStationWhere } from "@/lib/stock-utils";
import { canViewPath } from "@/lib/user-permissions";
import { resolveActiveServiceStationId } from "@/lib/station-selection";

export async function GET(request: NextRequest) {
  const access = await getAccessContext();
  if (!access) return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  if (!canEditStock(access) && !canViewPath(access.permissions, "/stock")) return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  const code = new URL(request.url).searchParams.get("code")?.trim();
  if (!code) return NextResponse.json({ error: "code query parameter required" }, { status: 400 });
  const scope = stockStationWhere(access, resolveActiveServiceStationId(request, access));
  const matches = await prisma.stock.findMany({ where: {
    AND: [scope, { estadoArtigo: { not: "INATIVO" } }, { OR: [{ codigoBarras: code }, { referencia: code }] }],
  } });
  if (matches.length > 1) return NextResponse.json({ error: "Codigo ambiguo. Leia o codigo de barras especifico do lote.", stockIds: matches.map(row => row.id) }, { status: 409 });
  if (!matches.length) return NextResponse.json({ error: "Stock not found" }, { status: 404 });
  return NextResponse.json(matches[0]);
}
