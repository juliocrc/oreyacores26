import { NextResponse } from "next/server";
import { getAuthSession } from "@/auth";
import prisma from "@/lib/prisma";
import { logAuditoria } from "@/lib/auditoria";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  const id = Number((await context.params).id);
  const navio = await prisma.navio.findUnique({ where: { id } });
  if (!navio || (session.user.role !== "ADMIN" && navio.clienteId !== Number(session.user.clienteId))) {
    return NextResponse.json({ error: "Navio não encontrado ou sem acesso." }, { status: 404 });
  }
  const body = await request.json().catch(() => null) as { pirotecnicosBordo?: unknown; equipamentos?: unknown; observacoes?: string } | null;
  if (!body || (!body.pirotecnicosBordo && !body.equipamentos)) return NextResponse.json({ error: "Não existem alterações para submeter." }, { status: 400 });
  const allowedTypes = new Set(["colete", "fato", "epirb", "extintor"]);
  if (Array.isArray(body.equipamentos)) {
    for (const raw of body.equipamentos as Array<{ tipo?: string; id?: number }>) {
      if (!raw || !allowedTypes.has(String(raw.tipo)) || !Number.isInteger(Number(raw.id))) return NextResponse.json({ error: "Equipamento inválido." }, { status: 400 });
      const equipmentId = Number(raw.id);
      const found = raw.tipo === "colete"
        ? await prisma.colete.findFirst({ where: { id: equipmentId, shipId: id }, select: { id: true } })
        : raw.tipo === "fato"
          ? await prisma.fatoImersao.findFirst({ where: { id: equipmentId, shipId: id }, select: { id: true } })
          : raw.tipo === "epirb"
            ? await prisma.epirb.findFirst({ where: { id: equipmentId, shipId: id }, select: { id: true } })
            : await prisma.extintor.findFirst({ where: { id: equipmentId, shipId: id }, select: { id: true } });
      if (!found) return NextResponse.json({ error: "O equipamento não pertence a este navio." }, { status: 403 });
    }
  }

  const proposal = await prisma.auditoria.create({
    data: {
      tabela: "PortalNavioProposal",
      tipoOperacao: "CREATE",
      idRegisto: id,
      usuario: session.user.email || "cliente",
      descricao: `Proposta do cliente para o navio ${navio.nome}`,
      dadosDepois: JSON.stringify({ navioId: id, clienteId: navio.clienteId, pirotecnicosBordo: body.pirotecnicosBordo, equipamentos: body.equipamentos, observacoes: body.observacoes || null, estado: "PENDENTE" }),
    },
  });
  return NextResponse.json({ success: true, proposalId: proposal.id, message: "Alterações enviadas para aprovação do administrador." });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (session?.user?.role !== "ADMIN") return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  const id = Number((await context.params).id);
  const proposals = await prisma.auditoria.findMany({ where: { tabela: "PortalNavioProposal", idRegisto: id }, orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ proposals });
}
