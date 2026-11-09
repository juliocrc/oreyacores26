import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { resolveLotStock } from '@/lib/ordens-servico';
import { normalizeArtigoValidade } from '@/lib/date-utils';
import type { Prisma } from '@prisma/client';
import { equipmentAccess } from '@/lib/jangada-equipment-access';
import { articleSnapshot, auditEquipment } from '@/lib/jangada-equipment-audit';

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
    const guard = await equipmentAccess(Number(jangadaId));
    if (guard.error) return guard.error;

    if (!jangadaId) {
      return NextResponse.json(
        { error: 'jangadaId é obrigatório' },
        { status: 400 }
      );
    }

    // Obter jangada e seus artigos
    const jangada = await prisma.jangada.findUnique({
      where: { id: parseInt(jangadaId) },
      include: { artigos: { where: { inspecaoId: null } } },
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
      where: { serviceStationId: jangada.serviceStationId, ...(orConditions.length > 0 ? { OR: orConditions } : {}) },
      orderBy: { descricao: 'asc' },
    });

    // Se o filtro por relevância não encontrar nada, devolver o stock completo
    if (orConditions.length > 0 && stockDisponivel.length === 0) {
      stockDisponivel = await prisma.stock.findMany({
        where: { serviceStationId: jangada.serviceStationId },
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
    const { jangadaId, artigoId, referenciaAtual, novaReferencia, quantidade, stockId } = body;
    const guard = await equipmentAccess(Number(jangadaId), true);
    if (guard.error) return guard.error;

    if (!jangadaId || !novaReferencia || (!artigoId && !referenciaAtual)) {
      return NextResponse.json(
        { error: 'Campos obrigatórios faltando' },
        { status: 400 }
      );
    }

    // Esconder a transação Prisma
    const resultado = await prisma.$transaction(async (tx) => {
      // 1. Obter artigo atual (que está na jangada, ou seja, inspecaoId: null)
      const currentArticles = await tx.artigoJangada.findMany({
        where: {
          jangadaId: parseInt(jangadaId),
          inspecaoId: null,
          ...(artigoId
            ? { id: Number(artigoId) }
            : { referencia: String(referenciaAtual) }),
        },
      });
      if (currentArticles.length > 1) throw new Error('Selecione o artigoId concreto para substituicao.');
      const artigoAtual = currentArticles[0];

      if (!artigoAtual) {
        throw new Error('Artigo atual não encontrado');
      }

      // 2. Obter informações do novo stock
      const raft = await tx.jangada.findUnique({ where: { id: Number(jangadaId) }, select: { serviceStationId: true } });
      if (!raft) throw new Error('Jangada nao encontrada');
      const novoStock = await resolveLotStock(tx, { stockId, referencia: novaReferencia }, raft.serviceStationId);

      if (!novoStock) {
        throw new Error('Novo artigo do stock não encontrado');
      }

      const requestedQuantity = Number(quantidade || artigoAtual.quantidade);
      if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
        throw new Error('Quantidade inválida para substituição');
      }

      const stockDisponivel = Math.max(0, novoStock.quantidade - novoStock.quantidadeReservada);
      if (novoStock.quantidade < requestedQuantity) {
        throw new Error(`Quantidade do stock insuficiente. Tem ${novoStock.quantidade}, pediu ${requestedQuantity}.`);
      }
      if (requestedQuantity > stockDisponivel) {
        throw new Error(
          `Quantidade indisponível: ${novoStock.quantidadeReservada} unidade(s) reservadas; disponível para substituição é ${stockDisponivel}.`
        );
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
          codigoFabricante: novoStock.codigoFabricante || null,
          stockId: novoStock.id,
          validade: normalizeArtigoValidade(novoStock.validade),
        },
      });

      const stockUpdated = await tx.stock.updateMany({
        where: { id: novoStock.id, quantidade: stockAntes, quantidadeReservada: novoStock.quantidadeReservada },
        data: { quantidade: stockDepois },
      });
      if (stockUpdated.count !== 1) throw new Error('Lote alterado; tente novamente.');

      await tx.movimentacaoStock.create({
        data: {
          stockId: novoStock.id,
          tipo: 'saida',
          quantidade: requestedQuantity,
          quantidadeAntes: stockAntes,
          quantidadeDepois: stockDepois,
          motivo: `Substituição de artigo na jangada serial ${artigoAtual.jangadaId}`,
          usuario: guard.access.email,
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
            stockId: novoStock.id,
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
              validade: normalizeArtigoValidade(novoStock.validade) || undefined,
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
              validade: normalizeArtigoValidade(novoStock.validade) || undefined,
            }
          });
        }
      }

      if (lastInspecao) {
        const snapshot = (lastInspecao.checklistSnapshot || {}) as Record<string, unknown>;
        const expiry = (snapshot._articleExpiry || {}) as Record<string, unknown>;
        const replacements = Array.isArray(expiry.replacements) ? expiry.replacements : [];
        await tx.inspecao.update({ where: { id: lastInspecao.id }, data: {
          checklistSnapshot: { ...snapshot, _articleExpiry: { ...expiry, replacements: [...replacements, {
            artigoId: artigoAtual.id, stockId: novoStock.id, lote: novoStock.lote,
            referencia: novoStock.referencia, quantidade: requestedQuantity, validade: novoStock.validade,
          }] } } as Prisma.InputJsonValue,
        } });
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
          (l) => String(l.stockId) === String(novoStock.id),
        );

        if (existenteIdx >= 0) {
          linhas[existenteIdx] = {
            ...linhas[existenteIdx],
            quantidade: requestedQuantity,
            unitPrice,
            total,
            descricao: novoStock.descricao || String(linhas[existenteIdx].descricao || ""),
            stockId: novoStock.id,
            lote: novoStock.lote,
          };
        } else {
          linhas.push({
            id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            stockId: novoStock.id,
            lote: novoStock.lote,
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

      await auditEquipment(tx, { jangadaId: Number(jangadaId), usuario: guard.access.email,
        origem: `Substituição de artigo #${artigoAtual.id}`,
        antes: { artigo: articleSnapshot(artigoAtual) }, depois: { artigo: articleSnapshot(artigoAtualizado) },
      });

      return {
        artigoAtualizado,
        originalArticle: artigoAtual,
        stockChange: {
          stockId: novoStock.id,
          lote: novoStock.lote,
          referencia: novaReferencia,
          quantidadeAntes: stockAntes,
          quantidadeDepois: stockDepois,
          quantidadeConsumida: requestedQuantity,
        },
      };
    }, { isolationLevel: 'Serializable' });

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
      { status: /stockId|lote|Lote|Quantidade|quantidade|artigoId/.test(message) ? 400 : 500 }
    );
  }
}
