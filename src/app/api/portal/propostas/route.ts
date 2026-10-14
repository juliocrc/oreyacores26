import { NextResponse } from "next/server";
import { getAuthSession } from "@/auth";
import prisma from "@/lib/prisma";
import { logAuditoria } from "@/lib/auditoria";

function parse(value: string | null | undefined) { try { return value ? JSON.parse(value) : null; } catch { return null; } }

type ProposalDados = {
  tipo?: string;
  navioId?: number;
  clienteId?: number;
  pirotecnicosBordo?: unknown;
  equipamentos?: Array<{ tipo: string; id: number; changes: Record<string, unknown> }>;
  itens?: Array<{ tipoEquipamento?: string; serial?: string }>;
  campos?: Record<string, unknown>;
  observacoes?: string | null;
  estado?: string;
  decididoPor?: string | null;
  motivo?: string | null;
};

const FICHA_FIELDS = ["email", "telefone", "telmovel", "morada", "moradaNumero", "codigoPostal", "localidade", "ilha"] as const;
const EQUIPAMENTO_TIPOS = new Set(["jangada", "colete", "fato", "epirb", "extintor"]);

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
  if (!isAdmin && sessionClienteId == null) {
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

  if (body.tipo === "associacao") {
    const navioId = Number(body.navioId);
    if (!Number.isFinite(navioId) || navioId <= 0) return NextResponse.json({ error: "Navio inválido." }, { status: 400 });
    if (!isAdmin && sessionClienteId != null) {
      const navio = await prisma.navio.findUnique({ where: { id: navioId }, select: { clienteId: true } });
      if (!navio) return NextResponse.json({ error: "Navio não encontrado." }, { status: 404 });
      // Permitir associar equipamentos que o cliente já possui (dados a aprovar), mas o navio tem de ser dele.
      if (navio.clienteId !== sessionClienteId) return NextResponse.json({ error: "Navio não pertence à sua conta." }, { status: 403 });
    }
    const itens = Array.isArray(body.itens)
      ? body.itens
          .map((i) => ({ tipoEquipamento: String(i.tipoEquipamento || "").trim(), serial: String(i.serial || "").trim() }))
          .filter((i) => i.tipoEquipamento && i.serial)
      : [];
    if (itens.length === 0) return NextResponse.json({ error: "Indique o número de série." }, { status: 400 });
    for (const item of itens) {
      if (!EQUIPAMENTO_TIPOS.has(item.tipoEquipamento)) {
        return NextResponse.json({ error: `Tipo de equipamento inválido: ${item.tipoEquipamento}` }, { status: 400 });
      }
      const exists = await findEquipmentBySerial(item.tipoEquipamento, item.serial);
      if (!exists) {
        return NextResponse.json({ error: `Nenhum equipamento encontrado com o serial ${item.serial}.` }, { status: 404 });
      }
    }
    const row = await prisma.auditoria.create({
      data: {
        tabela: "PortalNavioProposal",
        tipoOperacao: "CREATE",
        idRegisto: navioId,
        usuario,
        descricao: "Proposta de associação de equipamentos ao navio",
        dadosDepois: JSON.stringify({ tipo: "associacao", navioId, itens, observacoes: body.observacoes || null, estado: "PENDENTE" }),
      },
    });
    return NextResponse.json({ success: true, proposalId: row.id, message: "Associações enviadas para aprovação do administrador." });
  }

  return NextResponse.json({ error: "Tipo de proposta não suportado." }, { status: 400 });
}

export async function PATCH(request: Request) {
  const session = await getAuthSession();
  if (session?.user?.role !== "ADMIN") return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  const body = await request.json().catch(() => null) as { id?: number; decisao?: "APROVADA" | "REJEITADA"; motivo?: string } | null;
  if (!body?.id || !body.decisao) return NextResponse.json({ error: "Proposta e decisão são obrigatórias." }, { status: 400 });
  const decisao = body.decisao;
  const row = await prisma.auditoria.findUnique({ where: { id: Number(body.id) } });
  const dados = parse(row?.dadosDepois) as ProposalDados | null;
  if (!row || row.tabela !== "PortalNavioProposal" || !dados || dados.estado !== "PENDENTE") return NextResponse.json({ error: "Proposta inválida ou já decidida." }, { status: 404 });

  if (decisao === "APROVADA") {
    await prisma.$transaction(async (tx) => {
      if (dados.tipo === "ficha") {
        const campos = Object.fromEntries(
          Object.entries(dados.campos || {}).filter(([key]) => (FICHA_FIELDS as readonly string[]).includes(key)),
        );
        if (dados.clienteId && Object.keys(campos).length > 0) {
          await tx.cliente.update({ where: { id: Number(dados.clienteId) }, data: campos });
        }
      } else if (dados.tipo === "associacao") {
        for (const item of dados.itens || []) {
          const tipoEquipamento = String(item.tipoEquipamento || "").trim();
          const serial = String(item.serial || "").trim();
          if (!EQUIPAMENTO_TIPOS.has(tipoEquipamento) || !serial) continue;
          const found = await findEquipmentBySerial(tipoEquipamento, serial);
          if (!found) continue;
          if (tipoEquipamento === "jangada") await tx.jangada.update({ where: { id: found.id }, data: { shipId: Number(dados.navioId) } });
          if (tipoEquipamento === "colete") await tx.colete.update({ where: { id: found.id }, data: { shipId: Number(dados.navioId) } });
          if (tipoEquipamento === "fato") await tx.fatoImersao.update({ where: { id: found.id }, data: { shipId: Number(dados.navioId) } });
          if (tipoEquipamento === "epirb") await tx.epirb.update({ where: { id: found.id }, data: { shipId: Number(dados.navioId) } });
          if (tipoEquipamento === "extintor") await tx.extintor.update({ where: { id: found.id }, data: { shipId: Number(dados.navioId) } });
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
      await tx.auditoria.update({ where: { id: row.id }, data: { tipoOperacao: "UPDATE", descricao: `Proposta ${decisao.toLowerCase()} pelo administrador`, dadosDepois: JSON.stringify({ ...dados, estado: decisao, decididoPor: session.user.email, motivo: body.motivo || null }) } });
    });
  } else {
    await prisma.auditoria.update({ where: { id: row.id }, data: { tipoOperacao: "UPDATE", descricao: "Proposta rejeitada pelo administrador", dadosDepois: JSON.stringify({ ...dados, estado: decisao, decididoPor: session.user.email, motivo: body.motivo || null }) } });
  }
  await logAuditoria({ tabela: "PortalNavioProposal", tipoOperacao: "UPDATE", idRegisto: row.id, usuario: session.user.email || "admin", descricao: `Proposta ${decisao.toLowerCase()}` });
  return NextResponse.json({ success: true });
}

async function findEquipmentBySerial(tipoEquipamento: string, serial: string): Promise<{ id: number } | null> {
  if (tipoEquipamento === "jangada") return prisma.jangada.findFirst({ where: { serial }, select: { id: true } });
  if (tipoEquipamento === "colete") return prisma.colete.findFirst({ where: { serial }, select: { id: true } });
  if (tipoEquipamento === "fato") return prisma.fatoImersao.findFirst({ where: { serial }, select: { id: true } });
  if (tipoEquipamento === "epirb") return prisma.epirb.findFirst({ where: { serial }, select: { id: true } });
  if (tipoEquipamento === "extintor") return prisma.extintor.findFirst({ where: { serial }, select: { id: true } });
  return null;
}
