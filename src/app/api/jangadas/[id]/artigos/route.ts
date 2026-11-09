import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { normalizeArtigoValidade } from "@/lib/date-utils";
import { equipmentAccess } from "@/lib/jangada-equipment-access";
import { articleSnapshot, auditEquipment } from "@/lib/jangada-equipment-audit";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const jangadaId = Number((await context.params).id);
    const guard = await equipmentAccess(jangadaId);
    if (guard.error) return guard.error;
    return NextResponse.json(await prisma.artigoJangada.findMany({ where: { jangadaId }, orderBy: { id: "asc" } }));
  } catch (error) { return buildDatabaseErrorResponse(error, "Erro ao carregar artigos."); }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const jangadaId = Number((await context.params).id);
    const guard = await equipmentAccess(jangadaId, true);
    if (guard.error) return guard.error;
    const data = await req.json();
    const inspecaoId = data.inspecaoId == null ? null : Number(data.inspecaoId);
    const stockId = data.stockId == null ? null : Number(data.stockId);
    const quantidade = Number(data.quantidade ?? 1);
    const validade = data.validade ? normalizeArtigoValidade(String(data.validade)) : null;
    if (!Number.isSafeInteger(quantidade) || quantidade < 0 ||
        (inspecaoId !== null && (!Number.isSafeInteger(inspecaoId) || inspecaoId <= 0)) ||
        (stockId !== null && (!Number.isSafeInteger(stockId) || stockId <= 0)) || (data.validade && !validade)) {
      return NextResponse.json({ error: "Dados do artigo inválidos." }, { status: 400 });
    }
    if (inspecaoId && !await prisma.inspecao.findFirst({ where: { id: inspecaoId, jangadaId }, select: { id: true } })) {
      return NextResponse.json({ error: "Inspeção não encontrada para esta jangada." }, { status: 400 });
    }
    if (stockId && !await prisma.stock.findFirst({ where: { id: stockId, OR: [{ serviceStationId: guard.raft.serviceStationId }, { serviceStationId: null }] }, select: { id: true } })) {
      return NextResponse.json({ error: "Stock não encontrado nesta estação." }, { status: 400 });
    }
    const artigoData = {
      name: String(data.name || "").trim() || "Artigo", referencia: String(data.referencia || "").trim() || null,
      quantidade, validade, codigoFabricante: String(data.lote || data.codigoFabricante || "").trim() || null,
      stockId, jangadaId, inspecaoId,
    };
    const result = await prisma.$transaction(async tx => {
      const existing = inspecaoId ? await tx.artigoJangada.findFirst({ where: { jangadaId, inspecaoId, OR: [
        ...(artigoData.referencia ? [{ referencia: artigoData.referencia }] : []), { name: artigoData.name },
      ] } }) : null;
      const artigo = existing
        ? await tx.artigoJangada.update({ where: { id: existing.id }, data: artigoData })
        : await tx.artigoJangada.create({ data: artigoData });
      await auditEquipment(tx, { jangadaId, usuario: guard.access.email,
        origem: inspecaoId ? `Artigo da inspeção #${inspecaoId}` : "Artigo da ficha",
        antes: { artigo: existing ? articleSnapshot(existing) : null }, depois: { artigo: articleSnapshot(artigo) },
      });
      return { artigo, created: !existing };
    });
    return NextResponse.json(result.artigo, { status: result.created ? 201 : 200 });
  } catch (error) { return buildDatabaseErrorResponse(error, "Erro ao guardar artigo."); }
}
