import { NextRequest, NextResponse } from "next/server";
import { syncRaftArticlesWithPackType } from "@/lib/checklist-sync";
import prisma from "@/lib/prisma";
import { equipmentAccess } from "@/lib/jangada-equipment-access";
import { auditEquipment, readEquipmentSnapshot } from "@/lib/jangada-equipment-audit";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    const guard = await equipmentAccess(id, true);
    if (guard.error) return guard.error;
    if (isNaN(id)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const linkStock = body.linkStock !== false;

    const antes = await readEquipmentSnapshot(id);
    const result = await syncRaftArticlesWithPackType(id, { linkStock });
    await auditEquipment(prisma, { jangadaId: id, usuario: guard.access.email, origem: "Sincronização do pack", antes, depois: await readEquipmentSnapshot(id) });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Erro ao sincronizar artigos da jangada:", error);
    return NextResponse.json(
      { error: "Erro interno ao sincronizar artigos" },
      { status: 500 }
    );
  }
}
