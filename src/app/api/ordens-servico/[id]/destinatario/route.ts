import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { parseOrdemServicoMeta } from "@/lib/ordens-servico";
import { billingRecipient, validateBillingRecipient } from "@/lib/billing-recipient";

async function handle(req: NextRequest, write: boolean) {
  const access = await getAccessContext();
  if (!access) return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  if (!access.isAdmin) return NextResponse.json({ error: "Acesso reservado a administradores." }, { status: 403 });
  const id = Number(new URL(req.url).pathname.split("/").at(-2));
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "ID invalido." }, { status: 400 });
  let body: { destinatario?: unknown; updatedAt?: string } = {};
  if (write) {
    try {
      body = await req.json();
      body.destinatario = validateBillingRecipient(body.destinatario);
      if (!body.updatedAt || !Number.isFinite(new Date(body.updatedAt).getTime())) throw new Error("Versao obrigatoria.");
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Pedido invalido." }, { status: 400 });
    }
  }
  try {
    return await prisma.$transaction(async tx => {
      const order = await tx.ordemServico.findUnique({ where: { id }, include: { cliente: true } });
      if (!order) return NextResponse.json({ error: "Ordem nao encontrada." }, { status: 404 });
      const link = await tx.faturaOrdemServico.findFirst({ where: { ordemServicoId: id }, include: { fatura: true } });
      const meta = parseOrdemServicoMeta(order.metadados) as ReturnType<typeof parseOrdemServicoMeta> & { destinatarioFaturacao?: unknown };
      const frozen = link?.fatura.metadados ? JSON.parse(link.fatura.metadados) : {};
      if (!write) return NextResponse.json({
        destinatario: billingRecipient(order.cliente, frozen.destinatario ?? meta.destinatarioFaturacao),
        clienteId: order.clienteId, locked: Boolean(link || meta.faturaId || meta.faturaNumero), updatedAt: order.updatedAt,
      });
      if (link || meta.faturaId || meta.faturaNumero) return NextResponse.json({ error: "Fatura emitida: destinatario bloqueado." }, { status: 409 });
      if (order.updatedAt.getTime() !== new Date(body.updatedAt!).getTime()) return NextResponse.json({ error: "A ordem foi alterada. Atualize antes de guardar." }, { status: 409 });
      const updated = await tx.ordemServico.update({ where: { id, updatedAt: order.updatedAt }, data: {
        metadados: JSON.stringify({ ...meta, destinatarioFaturacao: body.destinatario }),
      } });
      return NextResponse.json({ destinatario: body.destinatario, updatedAt: updated.updatedAt });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    return NextResponse.json({ error: "Nao foi possivel carregar ou guardar o destinatario. Atualize e tente novamente." },
      { status: code === "P2025" || code === "P2034" ? 409 : 500 });
  }
}

export const GET = (req: NextRequest) => handle(req, false);
export const PATCH = (req: NextRequest) => handle(req, true);
