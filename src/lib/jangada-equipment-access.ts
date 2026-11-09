import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { canEditPath } from "@/lib/user-permissions";

export async function equipmentAccess(jangadaId: number, write = false) {
  const access = await getAccessContext();
  if (!access) return { error: NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 }) };
  if (!Number.isSafeInteger(jangadaId) || jangadaId <= 0) return { error: NextResponse.json({ error: "ID inválido." }, { status: 400 }) };
  const raft = await prisma.jangada.findUnique({ where: { id: jangadaId }, select: { id: true, serviceStationId: true } });
  if (!raft) return { error: NextResponse.json({ error: "Jangada não encontrada." }, { status: 404 }) };
  if (!access.isAdmin && (!access.allowedStationIds.includes(Number(raft.serviceStationId || 0)) || (write && !canEditPath(access.permissions, "/jangadas")))) {
    return { error: NextResponse.json({ error: "Sem permissão para esta jangada." }, { status: 403 }) };
  }
  return { access, raft };
}
