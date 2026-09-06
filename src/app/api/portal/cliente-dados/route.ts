import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/auth";
import { getCachedClientData, setCachedClientData } from "@/lib/client-cache";
import { parseOrdemServicoMeta } from "@/lib/ordens-servico";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const isDev = process.env.NODE_ENV === "development";
    const { searchParams } = new URL(req.url);
    const previewCliente = Number(searchParams.get("previewCliente")) || 0;
    const previewLista = searchParams.get("previewLista") === "1";

    // Modo de pré-visualização (apenas dev): staff ADMIN/USER pode ver o portal como um cliente.
    const isPreview = isDev && session.user.role !== "CLIENTE";
    if (previewLista) {
      if (!isPreview) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
      const clientes = await prisma.cliente.findMany({
        select: { id: true, nome: true, nif: true, numeroCliente: true },
        orderBy: { nome: "asc" },
      });
      return NextResponse.json({ clientes });
    }

    if (session.user.role === "CLIENTE" && !session.user.clienteId) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const clienteId = isPreview && previewCliente > 0
      ? previewCliente
      : session.user.role === "CLIENTE"
        ? Number(session.user.clienteId)
        : 0;

    if (!clienteId) {
      return NextResponse.json({ error: "Cliente não indicado." }, { status: 400 });
    }

    const cached = isPreview ? null : getCachedClientData(clienteId);
    if (cached) return NextResponse.json(cached);

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        id: true,
        nome: true,
        nif: true,
        email: true,
        telefone: true,
        telmovel: true,
        morada: true,
        moradaNumero: true,
        codigoPostal: true,
        localidade: true,
        ilha: true,
        modoPagamento: true,
        tipoCliente: true,
        navios: {
          where: { ativo: true },
          select: {
            id: true,
            nome: true,
            matricula: true,
            ilha: true,
            tipoPesca: true,
            tipoNavio: true,
            lotacao: true,
            comprimentoMetros: true,
            pirotecnicosBordoJson: true,
          },
        },
      },
    });

    if (!cliente) {
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    }

    const navioIds = cliente.navios.map((n) => n.id);

    const [extintoresAll, coletesAll, epirbsAll, ordens, faturas] = await Promise.all([
      navioIds.length > 0
        ? prisma.extintor.findMany({
            where: { shipId: { in: navioIds } },
            select: {
              id: true,
              shipId: true,
              serial: true,
              marca: true,
              modelo: true,
              capacidadeKg: true,
              tipoAgente: true,
              estado: true,
              localizacao: true,
              dataFabrico: true,
              dataUltimaRecarga: true,
              dataProxRecarga: true,
              dataTesteHidraulico: true,
              dataProxTesteHidraulico: true,
              observacoes: true,
            },
          })
        : [],
      navioIds.length > 0
        ? prisma.colete.findMany({
            where: { shipId: { in: navioIds } },
            select: {
              id: true,
              shipId: true,
              serial: true,
              marca: true,
              modelo: true,
              tamanho: true,
              estado: true,
              dataFabrico: true,
              dataInspecao: true,
              dataProxInspecao: true,
              observacoes: true,
            },
          })
        : [],
      navioIds.length > 0
        ? prisma.epirb.findMany({
            where: { shipId: { in: navioIds } },
            select: {
              id: true,
              shipId: true,
              serial: true,
              marca: true,
              modelo: true,
              tipo: true,
              hexId: true,
              estado: true,
              dataInspecao: true,
              dataProxInspecao: true,
              dataValidadeBateria: true,
              observacoes: true,
            },
          })
        : [],
      prisma.ordemServico.findMany({
        where: { clienteId },
        select: {
          id: true,
          numeroOrdem: true,
          tipo: true,
          status: true,
          orcamentoStatus: true,
          prioridade: true,
          descricao: true,
          tecnicoResponsavel: true,
          dataAbertura: true,
          dataPlaneadaInicio: true,
          dataConclusao: true,
          dataPrevista: true,
          valorPecas: true,
          valorMaoObra: true,
          valorDesconto: true,
          valorTotal: true,
          isPesca: true,
          isIsentoIva: true,
          metadados: true,
          jangada: {
            select: {
              serial: true,
              brand: true,
              model: true,
              dataProxInspecao: true,
              shipId: true,
              shipNameManual: true,
            },
          },
        },
        orderBy: { dataAbertura: "desc" },
        take: 50,
      }),
      prisma.fatura.findMany({
        where: { clienteId, cancelada: false },
        select: {
          id: true,
          numeroFatura: true,
          valorSubtotal: true,
          valorIva: true,
          valorTotal: true,
          isIsentoIva: true,
          pagamentoStatus: true,
          dataEmissao: true,
          cancelada: true,
        },
        orderBy: { dataEmissao: "desc" },
        take: 50,
      }),
    ]);

    const extByShip = new Map<number, typeof extintoresAll>();
    for (const e of extintoresAll) {
      if (e.shipId == null) continue;
      const arr = extByShip.get(e.shipId) || [];
      arr.push(e);
      extByShip.set(e.shipId, arr);
    }
    const colByShip = new Map<number, typeof coletesAll>();
    for (const c of coletesAll) {
      if (c.shipId == null) continue;
      const arr = colByShip.get(c.shipId) || [];
      arr.push(c);
      colByShip.set(c.shipId, arr);
    }
    const epiByShip = new Map<number, typeof epirbsAll>();
    for (const e of epirbsAll) {
      if (e.shipId == null) continue;
      const arr = epiByShip.get(e.shipId) || [];
      arr.push(e);
      epiByShip.set(e.shipId, arr);
    }

    for (const navio of cliente.navios) {
      (navio as any).extintores = extByShip.get(navio.id) || [];
      (navio as any).coletes = colByShip.get(navio.id) || [];
      (navio as any).epirbs = epiByShip.get(navio.id) || [];
    }

    const preview = isPreview ? { active: true, clienteId } : undefined;

    const clienteOrdens = ordens.map((o) => {
      const meta = parseOrdemServicoMeta(o.metadados);
      const linhas = Array.isArray(meta.linhas)
        ? meta.linhas
            .filter((l) => l && (l.descricao || l.referencia))
            .map((l) => ({
              referencia: l.referencia ?? "",
              descricao: l.descricao ?? "",
              quantidade: Number(l.quantidade) || 0,
              precoUnitario: Number(l.unitPrice) || 0,
              total: Number(l.total) ?? (Number(l.quantidade) || 0) * (Number(l.unitPrice) || 0),
            }))
        : [];
      const totais = (meta.totais && typeof meta.totais === "object" ? meta.totais : {}) as Record<string, number>;
      const { metadados: _omit, ...ordem } = o;
      const num = (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      return {
        ...ordem,
        orcamento: {
          linhas,
          totais,
          valorPecas: num(o.valorPecas ?? totais.pecas ?? totais.valorPecas),
          valorMaoObra: num(o.valorMaoObra ?? totais.maoObra ?? totais.valorMaoObra),
          valorDesconto: num(o.valorDesconto ?? totais.desconto ?? totais.valorDesconto),
        },
      };
    });

    const result = { cliente, ordens: clienteOrdens, faturas, preview };
    if (!isPreview) setCachedClientData(clienteId, result);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[portal/cliente-dados] Erro:", error);
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}
