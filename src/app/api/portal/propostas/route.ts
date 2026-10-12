import { NextResponse } from "next/server";
import { getAuthSession } from "@/auth";
import prisma from "@/lib/prisma";
import { logAuditoria } from "@/lib/auditoria";

function parse(value: string | null | undefined) { try { return value ? JSON.parse(value) : null; } catch { return null; } }

export async function GET() {
  const session = await getAuthSession();
  if (session?.user?.role !== "ADMIN") return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  const rows = await prisma.auditoria.findMany({ where: { tabela: "PortalNavioProposal" }, orderBy: { createdAt: "desc" }, take: 100 });
  const proposals = rows.map((row) => ({ ...row, dados: parse(row.dadosDepois) }));

  const navioIds = Array.from(
    new Set(
      proposals
        .map((p) => Number((p.dados as { navioId?: number } | null)?.navioId))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );

  const navios = navioIds.length
    ? await prisma.navio.findMany({
        where: { id: { in: navioIds } },
        select: { id: true, nome: true, matricula: true, cliente: { select: { nome: true } } },
      })
    : [];

  const navioMap = new Map(navios.map((n) => [n.id, n]));

  return NextResponse.json({
    proposals: proposals.map((p) => {
      const navioId = Number((p.dados as { navioId?: number } | null)?.navioId);
      const navio = Number.isFinite(navioId) ? navioMap.get(navioId) : undefined;
      return {
        ...p,
        navio: navio
          ? { id: navio.id, nome: navio.nome, matricula: navio.matricula, cliente: navio.cliente?.nome || null }
          : null,
      };
    }),
  });
}

export async function PATCH(request: Request) {
  const session = await getAuthSession();
  if (session?.user?.role !== "ADMIN") return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  const body = await request.json().catch(() => null) as { id?: number; decisao?: "APROVADA" | "REJEITADA"; motivo?: string } | null;
  if (!body?.id || !body.decisao) return NextResponse.json({ error: "Proposta e decisão são obrigatórias." }, { status: 400 });
  const decisao = body.decisao;
  const row = await prisma.auditoria.findUnique({ where: { id: Number(body.id) } });
  const dados = parse(row?.dadosDepois) as { navioId?: number; pirotecnicosBordo?: unknown; equipamentos?: Array<{ tipo: string; id: number; changes: Record<string, unknown> }>; estado?: string } | null;
  if (!row || row.tabela !== "PortalNavioProposal" || !dados || dados.estado !== "PENDENTE") return NextResponse.json({ error: "Proposta inválida ou já decidida." }, { status: 404 });

  if (decisao === "APROVADA") {
    await prisma.$transaction(async (tx) => {
      if (dados.pirotecnicosBordo) await tx.navio.update({ where: { id: Number(dados.navioId) }, data: { pirotecnicosBordoJson: JSON.stringify(dados.pirotecnicosBordo) } });
      for (const item of dados.equipamentos || []) {
        const changes = Object.fromEntries(Object.entries(item.changes || {}).filter(([key]) => ["dataProxInspecao", "dataValidadeBateria", "dataProxRecarga", "dataProxTesteHidraulico", "luzValidade", "apitoValidade", "pastilhaValidade", "observacoes"].includes(key)));
        if (item.tipo === "colete") await tx.colete.update({ where: { id: item.id }, data: changes });
        if (item.tipo === "fato") await tx.fatoImersao.update({ where: { id: item.id }, data: changes });
        if (item.tipo === "epirb") await tx.epirb.update({ where: { id: item.id }, data: changes });
        if (item.tipo === "extintor") await tx.extintor.update({ where: { id: item.id }, data: changes });
      }
      await tx.auditoria.update({ where: { id: row.id }, data: { tipoOperacao: "UPDATE", descricao: `Proposta ${decisao.toLowerCase()} pelo administrador`, dadosDepois: JSON.stringify({ ...dados, estado: decisao, decididoPor: session.user.email, motivo: body.motivo || null }) } });
    });
  } else {
    await prisma.auditoria.update({ where: { id: row.id }, data: { tipoOperacao: "UPDATE", descricao: "Proposta rejeitada pelo administrador", dadosDepois: JSON.stringify({ ...dados, estado: decisao, decididoPor: session.user.email, motivo: body.motivo || null }) } });
  }
  await logAuditoria({ tabela: "PortalNavioProposal", tipoOperacao: "UPDATE", idRegisto: row.id, usuario: session.user.email || "admin", descricao: `Proposta ${decisao.toLowerCase()}` });
  return NextResponse.json({ success: true });
}
