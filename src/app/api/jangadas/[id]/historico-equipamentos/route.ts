import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { equipmentAccess } from "@/lib/jangada-equipment-access";
import { EQUIPMENT_AUDIT_TABLE, equipmentChanges } from "@/lib/jangada-equipment-audit";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const jangadaId = Number((await context.params).id);
    const guard = await equipmentAccess(jangadaId);
    if (guard.error) return guard.error;
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 20);
    const cursorRaw = req.nextUrl.searchParams.get("cursor");
    const cursor = cursorRaw === null ? undefined : Number(cursorRaw);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || (cursor !== undefined && (!Number.isSafeInteger(cursor) || cursor <= 0))) {
      return NextResponse.json({ error: "Paginação inválida." }, { status: 400 });
    }
    const rows = await prisma.auditoria.findMany({
      where: { tabela: EQUIPMENT_AUDIT_TABLE, idRegisto: jangadaId, ...(cursor === undefined ? {} : { id: { lt: cursor } }) },
      orderBy: { id: "desc" }, take: limit + 1,
      select: { id: true, createdAt: true, usuario: true, descricao: true, dadosAntes: true, dadosDepois: true },
    });
    const items = rows.slice(0, limit).map(row => ({
      id: row.id, quando: row.createdAt, quem: row.usuario, origem: row.descricao,
      alteracoes: equipmentChanges(JSON.parse(row.dadosAntes || "{}"), JSON.parse(row.dadosDepois || "{}")),
    }));
    return NextResponse.json({ items, nextCursor: rows.length > limit ? items[items.length - 1].id : null });
  } catch (error) {
    return buildDatabaseErrorResponse(error, "Erro ao carregar histórico de equipamentos.");
  }
}
