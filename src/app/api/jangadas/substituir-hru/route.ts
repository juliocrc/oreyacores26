import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { resolveLotStock } from '@/lib/ordens-servico';
import type { Prisma } from '@prisma/client';
import { parseFlexibleDateValue } from '@/lib/date-display';
import { equipmentAccess } from '@/lib/jangada-equipment-access';
import { auditEquipment, equipmentSnapshot } from '@/lib/jangada-equipment-audit';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jangadaId = searchParams.get('jangadaId');
    const guard = await equipmentAccess(Number(jangadaId));
    if (guard.error) return guard.error;

    if (!jangadaId) {
      return NextResponse.json(
        { error: 'jangadaId é obrigatório' },
        { status: 400 }
      );
    }

    const jangada = await prisma.jangada.findUnique({
      where: { id: parseInt(jangadaId, 10) },
    });

    if (!jangada) {
      return NextResponse.json(
        { error: 'Jangada não encontrada' },
        { status: 404 }
      );
    }

    // Obter HRUs disponíveis em stock
    const stockDisponivel = await prisma.stock.findMany({
      where: {
        serviceStationId: jangada.serviceStationId,
        estadoArtigo: 'ATIVO',
        OR: [
          { referencia: '20701002' },
          { referencia: '20701001' },
          { descricao: { contains: 'HRU' } },
          { descricao: { contains: 'Disparo' } },
          { categoria: { contains: 'HRU' } }
        ]
      },
      orderBy: { descricao: 'asc' },
    });

    return NextResponse.json({
      jangada,
      stockDisponivel,
    });
  } catch (error) {
    console.error('Erro ao buscar opções de HRU:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar opções de HRU' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jangadaId, novaReferencia, dataInstalacao, stockId } = body;
    const guard = await equipmentAccess(Number(jangadaId), true);
    if (guard.error) return guard.error;

    const parsedJangadaId = parseInt(jangadaId, 10);
    if (isNaN(parsedJangadaId) || !novaReferencia || !dataInstalacao) {
      return NextResponse.json(
        { error: 'Campos obrigatórios em falta (jangadaId, novaReferencia, dataInstalacao)' },
        { status: 400 }
      );
    }

    const instDate = parseFlexibleDateValue(dataInstalacao);
    if (!instDate) {
      return NextResponse.json(
        { error: 'Data de instalação inválida' },
        { status: 400 }
      );
    }

    const dataInstalacaoIso = `${instDate.getFullYear()}-${String(instDate.getMonth() + 1).padStart(2, '0')}-${String(instDate.getDate()).padStart(2, '0')}`;

    const expiryDate = new Date(instDate);
    expiryDate.setFullYear(expiryDate.getFullYear() + 2);
    const hruValidadeStr = expiryDate.toISOString().slice(0, 10);

    const resultado = await prisma.$transaction(async (tx) => {
      // 1. Verificar jangada
      const jangada = await tx.jangada.findUnique({
        where: { id: parsedJangadaId },
      });

      if (!jangada) {
        throw new Error('Jangada não encontrada');
      }

      // 2. Verificar stock do novo HRU
      const novoStock = await resolveLotStock(tx, { stockId, referencia: novaReferencia }, jangada.serviceStationId);

      if (!novoStock) {
        throw new Error('Artigo do stock não encontrado');
      }

      if (novoStock.quantidade - novoStock.quantidadeReservada < 1) {
        throw new Error(`Stock insuficiente para o artigo ${novoStock.descricao} (${novaReferencia}).`);
      }

      // 3. Atualizar HRU na Jangada
      const jangadaAtualizada = await tx.jangada.update({
        where: { id: parsedJangadaId },
        data: {
          hruReferencia: novaReferencia,
          hruDataInstalacao: dataInstalacaoIso,
          hruValidade: hruValidadeStr,
        },
      });

      // 4. Reduzir 1 unidade do Stock
      const stockAntes = novoStock.quantidade;
      const stockDepois = stockAntes - 1;

      const stockUpdated = await tx.stock.updateMany({
        where: { id: novoStock.id, quantidade: stockAntes, quantidadeReservada: novoStock.quantidadeReservada },
        data: { quantidade: stockDepois },
      });
      if (stockUpdated.count !== 1) throw new Error('Lote alterado; tente novamente.');

      // 5. Registar movimentação de stock
      await tx.movimentacaoStock.create({
        data: {
          stockId: novoStock.id,
          tipo: 'saida',
          quantidade: 1,
          quantidadeAntes: stockAntes,
          quantidadeDepois: stockDepois,
          motivo: `Substituição de HRU na jangada serial ${jangada.serial}`,
          usuario: guard.access.email,
        },
      });

      // 6. Associar como artigo substituído na última inspeção (se existir)
      const lastInspecao = await tx.inspecao.findFirst({
        where: { jangadaId: parsedJangadaId },
        orderBy: { dataInspecao: 'desc' },
      });

      if (lastInspecao) {
        const existingArticle = await tx.artigoJangada.findFirst({
          where: {
            inspecaoId: lastInspecao.id,
            stockId: novoStock.id,
          }
        });

        if (existingArticle) {
          await tx.artigoJangada.update({
            where: { id: existingArticle.id },
            data: {
              quantidade: existingArticle.quantidade + 1,
              referencia: novaReferencia,
              stockId: novoStock.id,
              name: novoStock.descricao,
              codigoFabricante: novoStock.codigoFabricante || undefined,
              validade: expiryDate,
            },
          });
        } else {
          await tx.artigoJangada.create({
            data: {
              inspecaoId: lastInspecao.id,
              jangadaId: parsedJangadaId,
              name: novoStock.descricao,
              quantidade: 1,
              referencia: novaReferencia,
              stockId: novoStock.id,
              codigoFabricante: novoStock.codigoFabricante || undefined,
              validade: expiryDate,
            },
          });
        }
        const snapshot = (lastInspecao.checklistSnapshot || {}) as Record<string, unknown>;
        const expiry = (snapshot._articleExpiry || {}) as Record<string, unknown>;
        const replacements = Array.isArray(expiry.replacements) ? expiry.replacements : [];
        await tx.inspecao.update({ where: { id: lastInspecao.id }, data: {
          checklistSnapshot: { ...snapshot, _articleExpiry: { ...expiry, replacements: [...replacements, {
            stockId: novoStock.id, lote: novoStock.lote, referencia: novoStock.referencia,
            quantidade: 1, validade: hruValidadeStr,
          }] } } as Prisma.InputJsonValue,
        } });
      }

      await auditEquipment(tx, { jangadaId: parsedJangadaId, usuario: guard.access.email,
        origem: "Substituição de HRU", antes: equipmentSnapshot(jangada), depois: equipmentSnapshot(jangadaAtualizada),
      });

      return jangadaAtualizada;
    }, { isolationLevel: 'Serializable' });

    return NextResponse.json({
      success: true,
      jangada: resultado,
      mensagem: 'HRU substituído com sucesso',
    });
  } catch (error: unknown) {
    console.error('Erro ao substituir HRU:', error);
    const message = error instanceof Error ? error.message : 'Erro ao substituir HRU';
    return NextResponse.json(
      { error: message },
      { status: /stockId|lote|Lote|Stock insuficiente/.test(message) ? 400 : 500 }
    );
  }
}
