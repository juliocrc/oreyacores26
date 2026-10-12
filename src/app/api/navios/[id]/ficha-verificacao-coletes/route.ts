import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { APP_CONFIG } from '@/lib/app-config';
import { buildNavioColetesVerificationSheet } from '@/lib/colete-verification-sheet-template';

export const runtime = 'nodejs';

function getMostRecentDate(values: Array<Date | string | null | undefined>) {
  const parsed = values
    .map((value) => {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    })
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime());

  return parsed[0] || null;
}

function getNearestFutureDate(values: Array<Date | string | null | undefined>) {
  const now = new Date();
  const parsed = values
    .map((value) => {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    })
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime());

  return parsed.find((value) => value.getTime() >= now.getTime()) || parsed[0] || null;
}

function getPreferredTechnician(rows: Array<{ latestVerification?: { inspectorNome?: string | null } | null }>) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const name = String(row.latestVerification?.inspectorNome || '').trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || APP_CONFIG.issuerName;
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);

    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'ID de navio inválido.' }, { status: 400 });
    }

    const [navio, coletes] = await Promise.all([
      prisma.navio.findUnique({
        where: { id },
        select: {
          id: true,
          nome: true,
          bandeira: true,
          proprietario: true,
          cliente: {
            select: {
              nome: true,
            },
          },
          serviceStation: {
            select: {
              nome: true,
            },
          },
        },
      }),
      prisma.colete.findMany({
        where: { shipId: id },
        orderBy: [{ serial: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          serial: true,
          marca: true,
          modelo: true,
          tamanho: true,
          dataFabrico: true,
          dataProxInspecao: true,
          cilindroRef: true,
          cilindroValidade: true,
          pastilhaRef: true,
          pastilhaValidade: true,
          luzRef: true,
          luzValidade: true,
          apitoRef: true,
          apitoValidade: true,
          verificacoes: {
            orderBy: { dataVerificacao: 'desc' },
            take: 1,
            select: {
              dataVerificacao: true,
              inspectorNome: true,
              observacoes: true,
              tecidoExterior: true,
              colagens: true,
              zataosVelcro: true,
              fitasReflectoras: true,
              sistemaInflacao: true,
              mecanismoInflacao: true,
              camaras: true,
              garrafaCO2: true,
              tuboInflador: true,
            },
          },
        },
      }),
    ]);

    if (!navio) {
      return NextResponse.json({ error: 'Navio não encontrado.' }, { status: 404 });
    }

    if (!coletes.length) {
      return NextResponse.json({ error: 'Este navio não tem coletes associados para gerar a ficha de verificação.' }, { status: 400 });
    }

    const latestInspectionDate = getMostRecentDate(coletes.map((colete) => colete.verificacoes[0]?.dataVerificacao)) || new Date();
    const nextInspectionDate = getNearestFutureDate(coletes.map((colete) => colete.dataProxInspecao)) || latestInspectionDate;
    const clientOrVessel = [String(navio.cliente?.nome || navio.proprietario || '').trim(), String(navio.nome || '').trim()]
      .filter(Boolean)
      .join(' / ');

    const { buffer, fileName } = await buildNavioColetesVerificationSheet({
      shipName: String(navio.nome || '').trim(),
      shipFlag: String(navio.bandeira || 'Portugal').trim(),
      clientOrVessel,
      serviceStation: String(navio.serviceStation?.nome || APP_CONFIG.name).trim(),
      technician: getPreferredTechnician(coletes.map((colete) => ({ latestVerification: colete.verificacoes[0] || null }))),
      workNumber: `NAV-${navio.id}`,
      inspectionDate: latestInspectionDate,
      nextInspectionDate,
      notes: 'Gerado automaticamente a partir da ficha dos coletes associados ao navio.',
      rows: coletes.map((colete) => ({
        id: colete.id,
        serial: String(colete.serial || `Colete ${colete.id}`).trim(),
        marca: colete.marca,
        modelo: colete.modelo,
        tamanho: colete.tamanho,
        dataFabrico: colete.dataFabrico,
        cilindroRef: colete.cilindroRef,
        cilindroValidade: colete.cilindroValidade,
        pastilhaRef: colete.pastilhaRef,
        pastilhaValidade: colete.pastilhaValidade,
        luzRef: colete.luzRef,
        luzValidade: colete.luzValidade,
        apitoRef: colete.apitoRef,
        apitoValidade: colete.apitoValidade,
        latestVerification: colete.verificacoes[0] || null,
      })),
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Não foi possível gerar a ficha de verificação dos coletes.' },
      { status: 500 }
    );
  }
}
