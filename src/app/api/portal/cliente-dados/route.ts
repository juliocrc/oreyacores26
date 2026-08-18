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
            extintores: {
              select: {
                id: true,
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
            },
            coletes: {
              select: {
                id: true,
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
            },
            epirbs: {
              select: {
                id: true,
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
            },
          },
        },
      },
    });

    if (!cliente) {
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    }

    const [ordens, faturas] = await Promise.all([
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
          jangada: { select: { serial: true, brand: true, model: true } },
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

    const result = { cliente, ordens, faturas };
    setCachedClientData(clienteId, result);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[portal/cliente-dados] Erro:", error);
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}
