import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  TAREFAS_MANUTENCAO_COMPRESSOR,
  proximaDataManutencao,
  tarefaPorReferencia,
  tarefaPorTipo,
} from "@/lib/compressor-manutencao";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get('tipo');
    const ativo = searchParams.get('ativo');
    const seedCompressor = searchParams.get('seedCompressor') === 'true';

    // Sincroniza o compressor com "Manutenção de ar comprimido v.2.xlsx".
    // Idempotente: upsert por referência. Preserva a data da última manutenção
    // já registada e recalcula SEMPRE a próxima a partir do intervalo do
    // documento — nunca duplica registos e nunca aceita datas fixas erradas.
    // Só corre quando o módulo da oficina pede explicitamente.
    if (seedCompressor) {
      const existentes = await prisma.calibracaoEquipamento.findMany({
        where: { referencia: { in: TAREFAS_MANUTENCAO_COMPRESSOR.map((t) => t.referencia) } },
      });
      const porReferencia = new Map(existentes.map((e) => [e.referencia.toUpperCase(), e]));

      for (const tarefa of TAREFAS_MANUTENCAO_COMPRESSOR) {
        const existente = porReferencia.get(tarefa.referencia.toUpperCase());
        // Sem registo anterior, a última manutenção é hoje e a próxima fica a
        // partir de hoje + intervalo.
        const ultimaManutencao = existente?.dataCalibracao ?? new Date();
        const dataProxCalibracao = proximaDataManutencao(ultimaManutencao, tarefa.intervalo);

        if (!existente) {
          await prisma.calibracaoEquipamento.create({
            data: {
              referencia: tarefa.referencia,
              nome: tarefa.nome,
              tipo: tarefa.tipo,
              dataCalibracao: ultimaManutencao,
              dataProxCalibracao,
              observacoes: tarefa.observacoes,
              certificadoNum: "S/N: 321312566 | Cód: 1498160000",
              ativo: true,
            },
          });
          continue;
        }

        // Só escreve quando algo difere. A página da oficina pede a sincronização
        // em cada visita e não deve gerar 13 escritas iguais sem efeito.
        const precisaDeSync =
          existente.nome !== tarefa.nome ||
          existente.tipo !== tarefa.tipo ||
          !existente.ativo ||
          (existente.observacoes ?? "") !== tarefa.observacoes ||
          existente.dataProxCalibracao.getTime() !== dataProxCalibracao.getTime();

        if (precisaDeSync) {
          await prisma.calibracaoEquipamento.update({
            where: { id: existente.id },
            data: {
              nome: tarefa.nome,
              tipo: tarefa.tipo,
              dataProxCalibracao,
              observacoes: tarefa.observacoes,
              ativo: true,
            },
          });
        }
      }
    }

    const where: Prisma.CalibracaoEquipamentoWhereInput = {};
    if (tipo) {
      where.tipo = tipo;
    }
    if (ativo !== null && ativo !== undefined) {
      where.ativo = ativo === 'true';
    }

    const equips = await prisma.calibracaoEquipamento.findMany({
      where,
      orderBy: { dataProxCalibracao: 'asc' },
    });

    return NextResponse.json(equips);
  } catch (error) {
    console.error('Error fetching calibration equipment:', error);
    return NextResponse.json({ error: (error as Error).message || 'Error fetching calibration equipment' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nome, referencia, tipo, dataCalibracao, dataProxCalibracao, certificadoNum, observacoes, certificadoUrl } = body;

    if (!nome || !referencia || !tipo || !dataCalibracao) {
      return NextResponse.json({ error: 'Falta campos obrigatórios (nome, referencia, tipo, dataCalibracao)' }, { status: 400 });
    }

    // Cálculo automático: nas tarefas do compressor a próxima data nunca vem do
    // cliente — é sempre a última manutenção + o intervalo do documento v.2.
    // É isto que faz a data recalcular quando se regista uma nova manutenção.
    // Fora do compressor mantém-se o comportamento anterior (data do cliente).
    const tarefa = tarefaPorTipo(tipo) ?? tarefaPorReferencia(referencia);
    const ultimaManutencao = new Date(dataCalibracao);
    if (Number.isNaN(ultimaManutencao.getTime())) {
      return NextResponse.json({ error: 'dataCalibracao inválida' }, { status: 400 });
    }

    const proxima = tarefa
      ? proximaDataManutencao(ultimaManutencao, tarefa.intervalo)
      : dataProxCalibracao
        ? new Date(dataProxCalibracao)
        : ultimaManutencao;

    if (!tarefa && !dataProxCalibracao) {
      return NextResponse.json({ error: 'dataProxCalibracao é obrigatória para equipamento sem plano de manutenção' }, { status: 400 });
    }

    const equip = await prisma.calibracaoEquipamento.create({
      data: {
        nome: String(nome).trim(),
        referencia: String(referencia).trim(),
        tipo: String(tipo).trim(),
        dataCalibracao: ultimaManutencao,
        dataProxCalibracao: proxima,
        certificadoNum: certificadoNum ? String(certificadoNum).trim() : null,
        certificadoUrl: certificadoUrl ? String(certificadoUrl).trim() : null,
        ativo: body.ativo !== false,
        observacoes: observacoes ? String(observacoes).trim() : null,
      },
    });

    return NextResponse.json(equip);
  } catch (error) {
    console.error('Error creating calibration equipment:', error);
    return NextResponse.json({ error: (error as Error).message || 'Error creating calibration equipment' }, { status: 500 });
  }
}
