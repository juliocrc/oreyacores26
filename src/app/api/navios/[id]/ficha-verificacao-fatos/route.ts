import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { APP_CONFIG } from '@/lib/app-config';
import { buildNavioFatosImersaoVerificationSheet } from '@/lib/fato-imersao-verification-sheet-template';
import { FATO_CHECKLIST_ITEMS } from '@/lib/fatos-imersao-checklist';
import { normalizeMonthInput } from '@/lib/fato-date-utils';

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

function parseChecklist(raw: string | null | undefined) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function buildChecklist(verification: Record<string, unknown> | null) {
  const stored = parseChecklist(String(verification?.checklistJson || ''));
  const result: Record<string, string> = {};
  for (const item of FATO_CHECKLIST_ITEMS) {
    const fromJson = stored[item.key];
    const fromField = item.mapField ? verification?.[item.mapField] : null;
    const value = fromJson ?? fromField;
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      result[item.key] = String(value);
    }
  }
  return result;
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);

    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'ID de navio inválido.' }, { status: 400 });
    }

    const [navio, fatos] = await Promise.all([
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
      prisma.fatoImersao.findMany({
        where: { shipId: id },
        orderBy: [{ serial: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          serial: true,
          marca: true,
          modelo: true,
          designNo: true,
          tamanho: true,
          dataFabrico: true,
          dataInspecao: true,
          dataProxInspecao: true,
          leakResultado: true,
          codigoBER: true,
          verificacoes: {
            orderBy: { dataVerificacao: 'desc' },
            take: 1,
            select: {
              dataVerificacao: true,
              inspectorNome: true,
              observacoes: true,
              checklistJson: true,
              tecidoExterior: true,
              costuras: true,
              fecho: true,
              fitasReflectoras: true,
              capuz: true,
              botas: true,
              luvas: true,
              luz: true,
              apito: true,
              impermeabilidade: true,
              leakResultado: true,
              resultadoGeral: true,
              codigoBER: true,
            },
          },
        },
      }),
    ]);

    if (!navio) {
      return NextResponse.json({ error: 'Navio não encontrado.' }, { status: 404 });
    }

    if (!fatos.length) {
      return NextResponse.json(
        { error: 'Este navio não tem fatos de imersão associados para gerar a ficha de verificação.' },
        { status: 400 }
      );
    }

    const latestInspectionDate =
      getMostRecentDate(fatos.map((fato) => fato.verificacoes[0]?.dataVerificacao)) ||
      getMostRecentDate(fatos.map((fato) => fato.dataInspecao)) ||
      new Date();
    const nextInspectionDate =
      getNearestFutureDate(fatos.map((fato) => fato.dataProxInspecao)) || latestInspectionDate;
    const technicians = fatos
      .map((fato) => String(fato.verificacoes[0]?.inspectorNome || '').trim())
      .filter(Boolean);
    const technician = technicians[0] || APP_CONFIG.issuerName;
    const clientOrVessel = [
      String(navio.cliente?.nome || navio.proprietario || '').trim(),
      String(navio.nome || '').trim(),
    ]
      .filter(Boolean)
      .join(' / ');

    const { buffer, fileName } = await buildNavioFatosImersaoVerificationSheet({
      shipName: String(navio.nome || '').trim(),
      shipFlag: String(navio.bandeira || 'Portugal').trim(),
      clientOrVessel,
      serviceStation: String(navio.serviceStation?.nome || APP_CONFIG.name).trim(),
      technician,
      inspectionDate: latestInspectionDate.toISOString().slice(0, 10),
      nextInspectionDate: nextInspectionDate.toISOString().slice(0, 10),
      notes: 'Gerado automaticamente a partir da ficha dos fatos de imersão associados ao navio.',
      rows: fatos.map((fato) => {
        const verification = fato.verificacoes[0] || null;
        return {
          serial: String(fato.serial || `Fato ${fato.id}`).trim(),
          marca: fato.marca,
          modelo: fato.modelo,
          tamanho: fato.tamanho,
          designNo: fato.designNo,
          dataFabrico: normalizeMonthInput(fato.dataFabrico) || fato.dataFabrico,
          dataInspecao: fato.dataInspecao,
          dataProxInspecao: fato.dataProxInspecao,
          resultadoGeral:
            verification?.resultadoGeral || (fato.codigoBER ? 'BER' : 'OK'),
          leakResultado: verification?.leakResultado || fato.leakResultado,
          codigoBER: verification?.codigoBER || fato.codigoBER,
          inspectorNome: verification?.inspectorNome || null,
          checklist: buildChecklist(verification as Record<string, unknown> | null),
        };
      }),
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
      { error: 'Não foi possível gerar a ficha de verificação dos fatos de imersão.' },
      { status: 500 }
    );
  }
}
