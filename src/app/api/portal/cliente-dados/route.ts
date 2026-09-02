import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/auth";

const clientDataCache = new Map<string, { data: unknown; expiresAt: number }>();

function getCachedClientData(clienteId: number) {
  const key = `client:${clienteId}`;
  const cached = clientDataCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  clientDataCache.delete(key);
  return null;
}

function setCachedClientData(clienteId: number, data: unknown) {
  const key = `client:${clienteId}`;
  clientDataCache.set(key, { data, expiresAt: Date.now() + 30 * 60 * 1000 });
}

export function clearClientCache(clienteId: number) {
  clientDataCache.delete(`client:${clienteId}`);
}

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user || session.user.role !== "CLIENTE" || !session.user.clienteId) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const clienteId = Number(session.user.clienteId);

    const cached = getCachedClientData(clienteId);
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
          valorTotal: true,
          isPesca: true,
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

    const result = { cliente, ordens, faturas };
    setCachedClientData(clienteId, result);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[portal/cliente-dados] Erro:", error);
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}
