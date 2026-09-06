import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

type StockWhereInput = {
  descricao?: { contains: string };
  categoria?: string;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jangadaId = searchParams.get('jangadaId');
    const referenciaAtual = searchParams.get('referencia');
    const artigoIdRaw = searchParams.get('artigoId');
    const artigoId = Number(artigoIdRaw);

    if (!jangadaId) {
      return NextResponse.json(
        { error: 'jangadaId é obrigatório' },
        { status: 400 }
      );
    }

    // Obter jangada e seus artigos
    const jangada = await prisma.jangada.findUnique({
      where: { id: parseInt(jangadaId) },
      include: { artigos: true },
    });

    if (!jangada) {
      return NextResponse.json(
        { error: 'Jangada não encontrada' },
        { status: 404 }
      );
    }

    // Obter artigo atual (por id, depois por referência, depois por nome)
    let artigoAtual = null;
    if (Number.isFinite(artigoId) && artigoId > 0) {
      artigoAtual = jangada.artigos.find((a) => a.id === artigoId) || null;
    }
    if (!artigoAtual && referenciaAtual) {
      artigoAtual = jangada.artigos.find((a) => a.referencia === referenciaAtual) || null;
    }
    if (!artigoAtual && referenciaAtual) {
      const nomeProcurado = String(referenciaAtual).toLowerCase();
      artigoAtual = jangada.artigos.find((a) => a.name && a.name.toLowerCase() === nomeProcurado) || null;
    }

    // Obter stock disponível para substituição
    const searchTerms: string[] = [];
    const orConditions: StockWhereInput[] = [];

    if (artigoAtual) {
      const nameNorm = String(artigoAtual.name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const has = (term: string) => new RegExp(`\\b${term}\\b`).test(nameNorm);

      if (has('battery') || has('batteries') || has('pilha') || has('bateria')) {
        searchTerms.push('pilha', 'bateria', 'battery', 'batter');
      } else if (has('torch') || has('flashlight') || has('lanterna')) {
        searchTerms.push('lanterna', 'torch', 'flashlight');
      } else if (has('rocket') || has('paraquedas')) {
        searchTerms.push('paraquedas', 'rocket', 'foguet');
      } else if (has('flare') || has('facho')) {
        searchTerms.push('facho', 'flare');
      } else if (has('smoke') || has('fumo')) {
        searchTerms.push('fumo', 'smoke', 'pote');
      } else if (has('aid') || has('farmac') || has('ambulanc')) {
        searchTerms.push('farmac', 'kit', 'aid', 'ambulanc', 'estojo');
      } else if (has('sick') || has('enjoo')) {
        searchTerms.push('enjoo', 'sick', 'comprimido');
      } else if (has('food') || has('ration') || has('racao') || has('racoes')) {
        searchTerms.push('racao', 'racoes', 'food', 'ration', 'emerg');
      } else if (has('water') || has('agua')) {
        searchTerms.push('agua', 'water');
      } else if (has('reparacao') || has('repair') || has('jogo')) {
        searchTerms.push('repara', 'repair', 'kit');
      } else {
        const firstWord = String(artigoAtual.name || '').split(' ')[0];
        if (firstWord) {
          searchTerms.push(
            firstWord.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          );
        }
      }
    }

    searchTerms.forEach((term) => {
      orConditions.push({
        descricao: {
          contains: term,
        },
      });
    });

    if (artigoAtual?.name.includes('Facho')) {
      orConditions.push({
        categoria: 'Emergência',
      });
    }

    let stockDisponivel = await prisma.stock.findMany({
      where: orConditions.length > 0 ? { OR: orConditions } : undefined,
      orderBy: { descricao: 'asc' },
    });

    // Se o filtro por relevância não encontrar nada, devolver o stock completo
    if (orConditions.length > 0 && stockDisponivel.length === 0) {
      stockDisponivel = await prisma.stock.findMany({
        orderBy: { descricao: 'asc' },
      });
    }

    return NextResponse.json({
      jangada,
      artigoAtual,
      stockDisponivel,
    });
  } catch (error) {
    console.error('Erro ao buscar artigos:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar artigos' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jangadaId, artigoId, referenciaAtual, novaReferencia, quantidade } = body;

    if (!jangadaId || !novaReferencia || (!artigoId && !referenciaAtual)) {
      return NextResponse.json(
        { error: 'Campos obrigatórios faltando' },
        { status: 400 }
      );
    }

    // Esconder a transação Prisma
    const resultado = await prisma.$transaction(async (tx) => {
      // 1. Obter artigo atual (que está na jangada, ou seja, inspecaoId: null)
      const artigoAtual = await tx.artigoJangada.findFirst({
        where: {
          jangadaId: parseInt(jangadaId),
          inspecaoId: null,
          ...(artigoId
            ? { id: Number(artigoId) }
            : { referencia: String(referenciaAtual) }),
        },
      });

      if (!artigoAtual) {
        throw new Error('Artigo atual não encontrado');
      }

      // 2. Obter informações do novo stock
      const novoStock = await tx.stock.findFirst({
        where: { referencia: novaReferencia },
      });

      if (!novoStock) {
        throw new Error('Novo artigo do stock não encontrado');
      }

      const requestedQuantity = Number(quantidade || artigoAtual.quantidade);
      if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
        throw new Error('Quantidade inválida para substituição');
      }

      if (novoStock.quantidade < requestedQuantity) {
        throw new Error(`Quantidade do stock insuficiente. Tem ${novoStock.quantidade}, pediu ${requestedQuantity}.`);
      }

      const stockAntes = novoStock.quantidade;
      const stockDepois = stockAntes - requestedQuantity;

      // 3. Atualizar artigo na jangada
      const artigoAtualizado = await tx.artigoJangada.update({
        where: { id: artigoAtual.id },
        data: {
          referencia: novaReferencia,
          name: novoStock.descricao,
          quantidade: requestedQuantity,
          codigoFabricante: novoStock.codigoFabricante || undefined,
          stockId: novoStock.id,
          validade: novoStock.validade ? new Date(novoStock.validade) : undefined,
        },
      });

      await tx.stock.update({
        where: { id: novoStock.id },
        data: { quantidade: stockDepois },
      });

      await tx.movimentacaoStock.create({
        data: {
          stockId: novoStock.id,
          tipo: 'saida',
          quantidade: requestedQuantity,
          quantidadeAntes: stockAntes,
          quantidadeDepois: stockDepois,
          motivo: `Substituição de artigo na jangada serial ${artigoAtual.jangadaId}`,
          usuario: 'sistema',
        },
      });

      // 3b. Registar na última inspeção (se existir) para que apareça em Qtd. Subst.
      const lastInspecao = await tx.inspecao.findFirst({
        where: { jangadaId: parseInt(jangadaId) },
        orderBy: { dataInspecao: 'desc' },
      });

      if (lastInspecao) {
        const artigoExistenteInspecao = await tx.artigoJangada.findFirst({
          where: {
            inspecaoId: lastInspecao.id,
            OR: [
              { referencia: novaReferencia },
              { name: novoStock.descricao }
            ]
          }
        });

        if (artigoExistenteInspecao) {
          await tx.artigoJangada.update({
            where: { id: artigoExistenteInspecao.id },
            data: {
              quantidade: requestedQuantity,
              referencia: novaReferencia,
              name: novoStock.descricao,
              codigoFabricante: novoStock.codigoFabricante || undefined,
              stockId: novoStock.id,
              validade: novoStock.validade ? new Date(novoStock.validade) : undefined,
            }
          });
        } else {
          await tx.artigoJangada.create({
            data: {
              inspecaoId: lastInspecao.id,
              jangadaId: parseInt(jangadaId),
              name: novoStock.descricao,
              quantidade: requestedQuantity,
              referencia: novaReferencia,
              codigoFabricante: novoStock.codigoFabricante || undefined,
              stockId: novoStock.id,
              validade: novoStock.validade ? new Date(novoStock.validade) : undefined,
            }
          });
        }
      }

      // 3c. Atualizar orçamento da inspeção com a linha do artigo substituído
      if (lastInspecao && novoStock.precoVenda) {
        const orcamento = lastInspecao.orcamento && typeof lastInspecao.orcamento === "object"
          ? lastInspecao.orcamento as Record<string, unknown>
          : null;
        const linhas = Array.isArray(orcamento?.linhas) ? [...(orcamento.linhas as Array<Record<string, unknown>>)] : [];
        const unitPrice = Number(novoStock.precoVenda) || 0;
        const total = Math.round(unitPrice * requestedQuantity * 100) / 100;

        const existenteIdx = linhas.findIndex(
          (l) => String(l.referencia) === novaReferencia || String(l.stockId) === String(novoStock.id),
        );

        if (existenteIdx >= 0) {
          linhas[existenteIdx] = {
            ...linhas[existenteIdx],
            quantidade: requestedQuantity,
            unitPrice,
            total,
            descricao: novoStock.descricao || String(linhas[existenteIdx].descricao || ""),
            stockId: novoStock.id,
          };
        } else {
          linhas.push({
            id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            stockId: novoStock.id,
            referencia: novaReferencia,
            descricao: novoStock.descricao || "",
            quantidade: requestedQuantity,
            unitPrice,
            total,
            source: "stock",
          });
        }

        const orcamentoAtualizado = {
          ...(orcamento || {}),
          linhas,
          valorMaoObra: Number(orcamento?.valorMaoObra) || 0,
          valorDesconto: Number(orcamento?.valorDesconto) || 0,
          isIsentoIva: Boolean(orcamento?.isIsentoIva),
          usarOrcamento: true,
        };

        await tx.inspecao.update({
          where: { id: lastInspecao.id },
          data: { orcamento: orcamentoAtualizado as Prisma.InputJsonValue },
        });
      }

      // 4. Registar a mudança na auditoria (se o client gerado expuser o model)
      const auditoriaClient = (tx as unknown as {
        auditoria?: {
          create: (args: {
            data: {
              tabela: string;
              tipoOperacao: string;
              idRegisto: number;
              descricao?: string;
              usuario?: string;
              dadosAntes?: string;
              dadosDepois?: string;
            };
          }) => Promise<unknown>;
        };
      }).auditoria;

      if (auditoriaClient) {
        await auditoriaClient.create({
          data: {
            tabela: 'ArtigoJangada',
            tipoOperacao: 'UPDATE',
            idRegisto: artigoAtual.id,
            descricao: `Substituição de artigo: ${artigoAtual.name} (${referenciaAtual}) → ${novoStock.descricao} (${novaReferencia})`,
            usuario: 'sistema',
            dadosAntes: JSON.stringify({
              referencia: referenciaAtual,
              name: artigoAtual.name,
              quantidade: artigoAtual.quantidade,
            }),
            dadosDepois: JSON.stringify({
              referencia: novaReferencia,
              name: novoStock.descricao,
              quantidade: requestedQuantity,
            }),
          },
        });
      }

      return {
        artigoAtualizado,
        originalArticle: artigoAtual,
        stockChange: {
          referencia: novaReferencia,
          quantidadeAntes: stockAntes,
          quantidadeDepois: stockDepois,
          quantidadeConsumida: requestedQuantity,
        },
      };
    });

    return NextResponse.json({
      success: true,
      artigo: resultado.artigoAtualizado,
      originalArticle: {
        id: Number(resultado.originalArticle.id),
        name: resultado.originalArticle.name,
        referencia: resultado.originalArticle.referencia,
        quantidade: resultado.originalArticle.quantidade,
      },
      stock: resultado.stockChange,
      movimentacaoStock: true,
      mensagem: 'Artigo substituído com sucesso',
    });
  } catch (error: unknown) {
    console.error('Erro ao substituir artigo:', error);
    const message = error instanceof Error ? error.message : 'Erro ao substituir artigo';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
