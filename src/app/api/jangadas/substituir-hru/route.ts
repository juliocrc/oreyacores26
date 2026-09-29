import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { parseFlexibleDateValue } from '@/lib/date-display';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jangadaId = searchParams.get('jangadaId');

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
    const { jangadaId, novaReferencia, dataInstalacao } = body;

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
      const novoStock = await tx.stock.findFirst({
        where: { referencia: novaReferencia },
      });

      if (!novoStock) {
        throw new Error('Artigo do stock não encontrado');
      }

      if (novoStock.quantidade < 1) {
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

      await tx.stock.update({
        where: { id: novoStock.id },
        data: { quantidade: stockDepois },
      });

      // 5. Registar movimentação de stock
      await tx.movimentacaoStock.create({
        data: {
          stockId: novoStock.id,
          tipo: 'saida',
          quantidade: 1,
          quantidadeAntes: stockAntes,
          quantidadeDepois: stockDepois,
          motivo: `Substituição de HRU na jangada serial ${jangada.serial}`,
          usuario: 'sistema',
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
            OR: [
              { referencia: novaReferencia },
              { name: { contains: 'HRU' } },
              { name: { contains: 'Disparo' } }
            ]
          }
        });

        if (existingArticle) {
          await tx.artigoJangada.update({
            where: { id: existingArticle.id },
            data: {
              quantidade: existingArticle.quantidade + 1,
              referencia: novaReferencia,
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
              codigoFabricante: novoStock.codigoFabricante || undefined,
              validade: expiryDate,
            },
          });
        }
      }

      // 7. Registar na auditoria
      const auditoriaClient = tx.auditoria;
      if (auditoriaClient) {
        await auditoriaClient.create({
          data: {
            tabela: 'Jangada',
            tipoOperacao: 'UPDATE',
            idRegisto: parsedJangadaId,
            descricao: `Substituição de HRU: ${jangada.hruReferencia || 'Sem HRU'} → ${novaReferencia}`,
            usuario: 'sistema',
            dadosAntes: JSON.stringify({
              hruReferencia: jangada.hruReferencia,
              hruDataInstalacao: jangada.hruDataInstalacao,
              hruValidade: jangada.hruValidade,
            }),
            dadosDepois: JSON.stringify({
              hruReferencia: novaReferencia,
              hruDataInstalacao: dataInstalacao,
              hruValidade: hruValidadeStr,
            }),
          },
        });
      }

      return jangadaAtualizada;
    });

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
      { status: 500 }
    );
  }
}
