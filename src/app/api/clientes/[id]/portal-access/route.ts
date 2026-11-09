import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logAuditoria } from "@/lib/auditoria";
import { apiStationScope, requireApiAccess } from "@/lib/api-access";
import { resolveActiveServiceStationId } from "@/lib/station-selection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Suspende ou reativa o acesso do cliente ao portal e invalida todas as
 * sessões de dispositivo existentes (incrementa a versão da sessão).
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { access, error } = await requireApiAccess("/clientes", { write: true });
  if (error) return error;

  const scope = apiStationScope(access, resolveActiveServiceStationId(req, access));
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  let ativo: boolean;
  try {
    const body = (await req.json()) as { ativo?: unknown };
    if (typeof body?.ativo !== "boolean") {
      return NextResponse.json({ error: "Indique ativo=true ou ativo=false." }, { status: 400 });
    }
    ativo = body.ativo;
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  try {
    const existing = await prisma.cliente.findFirst({
      where: { id, ...scope },
      select: {
        id: true,
        nome: true,
        portalAtivo: true,
        portalSessionVersion: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    }

    const updated = await prisma.cliente.update({
      where: { id },
      data: {
        portalAtivo: ativo,
        portalSessionVersion: { increment: 1 },
      },
      select: {
        id: true,
        portalAtivo: true,
        portalSessionVersion: true,
      },
    });

    await logAuditoria({
      tabela: "Cliente",
      tipoOperacao: "UPDATE",
      idRegisto: id,
      descricao: ativo
        ? `Reativação do acesso ao portal do cliente ${existing.nome}`
        : `Suspensão do acesso ao portal do cliente ${existing.nome}`,
      dadosAntes: existing,
      dadosDepois: updated,
    });

    return NextResponse.json({
      ok: true,
      portalAtivo: updated.portalAtivo,
      portalSessionVersion: updated.portalSessionVersion,
    });
  } catch (error) {
    console.error("[PATCH /api/clientes/[id]/portal-access]", error);
    return NextResponse.json({ error: "Erro ao alterar o acesso ao portal." }, { status: 500 });
  }
}
