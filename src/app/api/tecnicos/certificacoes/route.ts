import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tecnicoId = searchParams.get('tecnicoId');
    const fabricante = searchParams.get('fabricante');

    const where: Prisma.CertificacaoFabricanteTecnicoWhereInput = {};
    if (tecnicoId) {
      where.tecnicoId = parseInt(tecnicoId, 10);
    }
    if (fabricante) {
      where.fabricante = { equals: fabricante };
    }

    const certs = await prisma.certificacaoFabricanteTecnico.findMany({
      where,
      include: {
        tecnico: {
          select: { id: true, nome: true },
        },
      },
      orderBy: { dataValidade: 'desc' },
    });

    return NextResponse.json(certs);
  } catch (error: unknown) {
    console.error('Error fetching certifications:', error);
    const message = error instanceof Error ? error.message : 'Error fetching certifications';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID obrigatorio' }, { status: 400 });
    }
    await prisma.certificacaoFabricanteTecnico.delete({
      where: { id: parseInt(id, 10) },
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting certification:', error);
    const message = error instanceof Error ? error.message : 'Error deleting certification';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tecnicoId, fabricante, numeroCertificado, dataEmissao, dataValidade, observacoes } = body;

    if (!tecnicoId || !fabricante || !dataEmissao || !dataValidade) {
      return NextResponse.json({ error: 'Falta campos obrigatórios (tecnicoId, fabricante, dataEmissao, dataValidade)' }, { status: 400 });
    }

    const cert = await prisma.certificacaoFabricanteTecnico.create({
      data: {
        tecnicoId: parseInt(tecnicoId, 10),
        fabricante: String(fabricante).trim(),
        numeroCertificado: numeroCertificado ? String(numeroCertificado).trim() : null,
        dataEmissao: new Date(dataEmissao),
        dataValidade: new Date(dataValidade),
        ativo: body.ativo !== false,
        observacoes: observacoes ? String(observacoes).trim() : null,
      },
    });

    return NextResponse.json(cert);
  } catch (error: unknown) {
    console.error('Error creating certification:', error);
    const message = error instanceof Error ? error.message : 'Error creating certification';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
