import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get('tipo');
    const ativo = searchParams.get('ativo');

    // Seed default Michelin 300L compressor maintenance items if none exist
    const compressorCount = await prisma.calibracaoEquipamento.count({
      where: { tipo: { startsWith: 'compressor' } }
    });

    if (compressorCount === 0) {
      const today = new Date();
      const nextYear = new Date();
      nextYear.setFullYear(today.getFullYear() + 1);
      const nextMonth = new Date();
      nextMonth.setMonth(today.getMonth() + 3);

      await prisma.calibracaoEquipamento.createMany({
        data: [
          {
            nome: "Compressor Michelin 300L - Substituição de Óleo",
            referencia: "MICHELIN-300L-OLEO",
            tipo: "compressor_oleo",
            dataCalibracao: today,
            dataProxCalibracao: nextMonth,
            certificadoNum: "S/N: 321312566 | Cód: 1498160000",
            ativo: true,
            observacoes: "Óleo sintético para compressor 5.5kW / 400V. Troca trimestral (500h).",
          },
          {
            nome: "Compressor Michelin 300L - Filtro de Ar",
            referencia: "MICHELIN-300L-FILTRO",
            tipo: "compressor_filtro",
            dataCalibracao: today,
            dataProxCalibracao: nextMonth,
            certificadoNum: "S/N: 321312566 | Cód: 1498160000",
            ativo: true,
            observacoes: "Limpeza e verificação mensal, substituição trimestral do elemento filtrante.",
          },
          {
            nome: "Compressor Michelin 300L - Purga de Condensos do Depósito",
            referencia: "MICHELIN-300L-PURGA",
            tipo: "compressor_ar",
            dataCalibracao: today,
            dataProxCalibracao: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000), // 1 semana
            certificadoNum: "S/N: 321312566 | 270L-300L",
            ativo: true,
            observacoes: "Purga diária/semanal de condensados do depósito de 300L para evitar corrosão interna.",
          },
          {
            nome: "Compressor Michelin 300L - Válvula de Segurança e Pressostato",
            referencia: "MICHELIN-300L-VALVULA",
            tipo: "compressor_valvula",
            dataCalibracao: today,
            dataProxCalibracao: nextYear,
            certificadoNum: "Max Press: 10 bar / 145 psi",
            ativo: true,
            observacoes: "Inspeção anual obrigatória da calibração do pressostato e teste da válvula de segurança.",
          },
        ],
      });
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

    if (!nome || !referencia || !tipo || !dataCalibracao || !dataProxCalibracao) {
      return NextResponse.json({ error: 'Falta campos obrigatórios (nome, referencia, tipo, dataCalibracao, dataProxCalibracao)' }, { status: 400 });
    }

    const equip = await prisma.calibracaoEquipamento.create({
      data: {
        nome: String(nome).trim(),
        referencia: String(referencia).trim(),
        tipo: String(tipo).trim(),
        dataCalibracao: new Date(dataCalibracao),
        dataProxCalibracao: new Date(dataProxCalibracao),
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
