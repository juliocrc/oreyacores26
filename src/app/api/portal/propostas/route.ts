import { NextResponse } from "next/server";
import { getAuthSession } from "@/auth";
import prisma from "@/lib/prisma";
import { logAuditoria } from "@/lib/auditoria";
import { PortalEquipmentError, parsePortalAssociationItems, parseSavedPortalAssociationItems, type SavedPortalAssociationItem } from "@/lib/portal-equipment-proposal";
import { preparePortalAssociation, applyPortalAssociation } from "@/lib/portal-equipment-approval";

function parse(value: string | null | undefined) { try { return value ? JSON.parse(value) : null; } catch { return null; } }

type ProposalDados = {
  tipo?: string;
  navioId?: number;
  clienteId?: number;
  pirotecnicosBordo?: unknown;
  equipamentos?: Array<{ tipo: string; id: number; changes: Record<string, unknown> }>;
  itens?: SavedPortalAssociationItem[];
  campos?: Record<string, unknown>;
  observacoes?: string | null;
  estado?: string;
  decididoPor?: string | null;
  motivo?: string | null;
};

const FICHA_FIELDS = ["email", "telefone", "telmovel", "morada", "moradaNumero", "codigoPostal", "localidade", "ilha"] as const;

export async function GET() {
  const session = await getAuthSession();
  if (session?.user?.role !== "ADMIN") return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  const rows = await prisma.auditoria.findMany({ where: { tabela: "PortalNavioProposal" }, orderBy: { createdAt: "desc" }, take: 100 });
  const proposals = rows.map((row) => ({ ...row, dados: parse(row.dadosDepois) as ProposalDados | null }));

  const navioIds = Array.from(
    new Set(
      proposals
        .map((p) => Number((p.dados as ProposalDados | null)?.navioId))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
  const clienteIds = Array.from(
    new Set(
      proposals
        .map((p) => Number((p.dados as ProposalDados | null)?.clienteId))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );

  const [navios, clientes] = await Promise.all([
    navioIds.length
      ? prisma.navio.findMany({
          where: { id: { in: navioIds } },
          select: { id: true, nome: true, matricula: true, cliente: { select: { nome: true } } },
        })
      : Promise.resolve([]),
    clienteIds.length
      ? prisma.cliente.findMany({ where: { id: { in: clienteIds } }, select: { id: true, nome: true, nif: true } })
      : Promise.resolve([]),
  ]);

  const navioMap = new Map(navios.map((n) => [n.id, n]));
  const clienteMap = new Map(clientes.map((c) => [c.id, c]));

  return NextResponse.json({
    proposals: proposals.map((p) => {
      const dados = p.dados as ProposalDados | null;
      const navioId = Number(dados?.navioId);
      const clienteId = Number(dados?.clienteId);
      const navio = Number.isFinite(navioId) ? navioMap.get(navioId) : undefined;
      const cliente = Number.isFinite(clienteId) ? clienteMap.get(clienteId) : undefined;
      return {
        ...p,
        navio: navio
          ? { id: navio.id, nome: navio.nome, matricula: navio.matricula, cliente: navio.cliente?.nome || null }
          : null,
        cliente: cliente ? { id: cliente.id, nome: cliente.nome, nif: cliente.nif } : null,
      };
    }),
  });
}

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as (ProposalDados & { tipo?: string }) | null;
  if (!body || !body.tipo) return NextResponse.json({ error: "Tipo de proposta obrigatório." }, { status: 400 });

  const isAdmin = session.user.role === "ADMIN";
  const sessionClienteId = session.user.clienteId != null ? Number(session.user.clienteId) : null;
  if (!isAdmin && (session.user.role !== "CLIENTE" || !Number.isSafeInteger(sessionClienteId) || Number(sessionClienteId) <= 0)) {
    return NextResponse.json({ error: "Conta sem cliente associado." }, { status: 403 });
  }
  const usuario = session.user.email || "cliente";

  if (body.tipo === "ficha") {
    const clienteId = isAdmin && body.clienteId ? Number(body.clienteId) : sessionClienteId;
    if (!clienteId) return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });
    const campos = Object.fromEntries(
      Object.entries(body.campos || {}).filter(([key]) => (FICHA_FIELDS as readonly string[]).includes(key)),
    );
    if (Object.keys(campos).length === 0) return NextResponse.json({ error: "Não existem alterações para submeter." }, { status: 400 });
    const row = await prisma.auditoria.create({
      data: {
        tabela: "PortalNavioProposal",
        tipoOperacao: "CREATE",
        idRegisto: clienteId,
        usuario,
        descricao: "Proposta de alteração de ficha do cliente",
        dadosDepois: JSON.stringify({ tipo: "ficha", clienteId, campos, observacoes: body.observacoes || null, estado: "PENDENTE" }),
      },
    });
    return NextResponse.json({ success: true, proposalId: row.id, message: "Alterações enviadas para aprovação do administrador." });
  }

  if (body.tipo === "associacao" || body.tipo === "verificar-associacao") {
    const navioId = Number(body.navioId);
    if (typeof body.navioId !== "number" || !Number.isSafeInteger(navioId) || navioId <= 0) return NextResponse.json({ error: "Navio inválido." }, { status: 400 });
    const navio = await prisma.navio.findUnique({ where: { id: navioId }, select: { clienteId: true } });
    if (!navio) return NextResponse.json({ error: "Navio não encontrado." }, { status: 404 });
    if (!isAdmin && navio.clienteId !== sessionClienteId) return NextResponse.json({ error: "Navio não pertence à sua conta." }, { status: 403 });
    if (!Number.isSafeInteger(navio.clienteId) || Number(navio.clienteId) <= 0) return NextResponse.json({ error: "Navio sem cliente associado." }, { status: 400 });
    try {
      const itens: SavedPortalAssociationItem[] = [];
      for (const item of parsePortalAssociationItems(body.itens)) {
        itens.push(await preparePortalAssociation(prisma, item, navio.clienteId!, body.tipo === "verificar-associacao"));
      }
      if (body.tipo === "verificar-associacao") {
        return NextResponse.json({ itens: itens.map(item => ({ tipoEquipamento: item.tipoEquipamento, serial: item.serial, novo: item.modo === "novo" })) }, { headers: { "Cache-Control": "private, no-store" } });
      }
      const row = await prisma.auditoria.create({
        data: {
          tabela: "PortalNavioProposal",
          tipoOperacao: "CREATE",
          idRegisto: navioId,
          usuario,
          descricao: "Proposta de associação de equipamentos ao navio",
          dadosDepois: JSON.stringify({ tipo: "associacao", navioId, clienteId: navio.clienteId, itens, observacoes: body.observacoes || null, estado: "PENDENTE" }),
        },
      });
      return NextResponse.json({ success: true, proposalId: row.id, message: "Associações enviadas para aprovação do administrador." });
    } catch (error) {
      if (error instanceof PortalEquipmentError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
      throw error;
    }
  }

  return NextResponse.json({ error: "Tipo de proposta não suportado." }, { status: 400 });
}

export async function PATCH(request: Request) {
  const session = await getAuthSession();
  if (session?.user?.role !== "ADMIN") return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  const body = await request.json().catch(() => null) as { id?: number; decisao?: "APROVADA" | "REJEITADA"; motivo?: string } | null;
  if (!body || !Number.isSafeInteger(body.id) || Number(body.id) <= 0 || !body.decisao) return NextResponse.json({ error: "Proposta e decisão são obrigatórias." }, { status: 400 });
  if (!["APROVADA", "REJEITADA"].includes(body.decisao)) return NextResponse.json({ error: "Decisao invalida." }, { status: 400 });
  const decisao = body.decisao;
  const row = await prisma.auditoria.findUnique({ where: { id: Number(body.id) } });
  const dados = parse(row?.dadosDepois) as ProposalDados | null;
  if (!row || row.tabela !== "PortalNavioProposal" || !dados || dados.estado !== "PENDENTE") return NextResponse.json({ error: "Proposta inválida ou já decidida." }, { status: 404 });

  if (decisao === "APROVADA") {
    try {
      const associations = dados.tipo === "associacao" ? parseSavedPortalAssociationItems(dados.itens) : [];
      if (dados.tipo === "associacao" && (!Number.isSafeInteger(dados.navioId) || Number(dados.navioId) <= 0 || !Number.isSafeInteger(dados.clienteId) || Number(dados.clienteId) <= 0)) throw new PortalEquipmentError("Proposta sem titularidade confirmada. Solicite uma nova proposta.");
      await prisma.$transaction(async (tx) => {
        const claim = await tx.auditoria.updateMany({ where: { id: row.id, tabela: "PortalNavioProposal", dadosDepois: row.dadosDepois }, data: { tipoOperacao: "UPDATE", descricao: "Proposta aprovada pelo administrador", dadosDepois: JSON.stringify({ ...dados, estado: decisao, decididoPor: session.user.email, motivo: body.motivo || null }) } });
        if (claim.count !== 1) throw new PortalEquipmentError("A proposta ja foi decidida. Atualize a pagina.", 409);
        if (dados.tipo === "ficha") {
          const campos = Object.fromEntries(
            Object.entries(dados.campos || {}).filter(([key]) => (FICHA_FIELDS as readonly string[]).includes(key)),
          );
          if (dados.clienteId && Object.keys(campos).length > 0) {
            await tx.cliente.update({ where: { id: Number(dados.clienteId) }, data: campos });
          }
        } else if (dados.tipo === "associacao") {
          // Lock the destination's ownership until commit, including while creating unlinked equipment.
          const locked = await tx.navio.updateMany({ where: { id: dados.navioId, clienteId: dados.clienteId }, data: { clienteId: dados.clienteId } });
          if (locked.count !== 1) throw new PortalEquipmentError("O navio mudou de titularidade. Submeta uma nova proposta.", 409);
          const navio = await tx.navio.findUnique({ where: { id: dados.navioId }, select: { clienteId: true, serviceStationId: true, cliente: { select: { nome: true } } } });
          if (!navio || navio.clienteId !== dados.clienteId || !navio.cliente) throw new PortalEquipmentError("Navio ou cliente indisponivel.", 409);
          for (const item of associations) {
            await applyPortalAssociation(tx, item, dados.clienteId!, dados.navioId!, navio.cliente.nome, navio.serviceStationId);
          }
        } else {
          if (dados.pirotecnicosBordo) await tx.navio.update({ where: { id: Number(dados.navioId) }, data: { pirotecnicosBordoJson: JSON.stringify(dados.pirotecnicosBordo) } });
          for (const item of dados.equipamentos || []) {
            const changes = Object.fromEntries(Object.entries(item.changes || {}).filter(([key]) => ["dataProxInspecao", "dataValidadeBateria", "dataProxRecarga", "dataProxTesteHidraulico", "luzValidade", "apitoValidade", "pastilhaValidade", "observacoes"].includes(key)));
            if (item.tipo === "colete") await tx.colete.update({ where: { id: item.id }, data: changes });
            if (item.tipo === "fato") await tx.fatoImersao.update({ where: { id: item.id }, data: changes });
            if (item.tipo === "epirb") await tx.epirb.update({ where: { id: item.id }, data: changes });
            if (item.tipo === "extintor") await tx.extintor.update({ where: { id: item.id }, data: changes });
          }
        }
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error instanceof PortalEquipmentError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
      if (error && typeof error === "object" && "code" in error && ["P2002", "P2034"].includes(String(error.code))) return NextResponse.json({ error: "Conflito de serial ou alteracao concorrente. Nada foi aplicado; atualize e reveja a proposta." }, { status: 409 });
      throw error;
    }
  } else {
    const result = await prisma.auditoria.updateMany({ where: { id: row.id, tabela: "PortalNavioProposal", dadosDepois: row.dadosDepois }, data: { tipoOperacao: "UPDATE", descricao: "Proposta rejeitada pelo administrador", dadosDepois: JSON.stringify({ ...dados, estado: decisao, decididoPor: session.user.email, motivo: body.motivo || null }) } });
    if (result.count !== 1) return NextResponse.json({ error: "A proposta ja foi decidida." }, { status: 409 });
  }
  await logAuditoria({ tabela: "PortalNavioProposal", tipoOperacao: "UPDATE", idRegisto: row.id, usuario: session.user.email || "admin", descricao: `Proposta ${decisao.toLowerCase()}` });
  return NextResponse.json({ success: true });
}
