import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { buildQuadroInspectionArtifacts, type QuadroTemplateInput } from '@/lib/quadro-template';
import { getAccessContext } from '@/lib/access-control';
import { saveQuadroToNavioFolder } from '@/lib/certificados-organizados';
import { syncEmittedDocumentToOneDrive } from '@/lib/onedrive-sync';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const payload = (await request.json()) as QuadroTemplateInput;

    // A validade das rações vem como timestamp sem timezone. O Prisma pode
    // deslocar o dia/mês conforme o TZ do servidor; ler como texto preserva a
    // data gravada (ex.: 2030-02-01) e evita "01-2030" no F67.
    try {
      const raftSerial = String(payload.raftSerial || '').trim();
      if (raftSerial) {
        const raft = await prisma.jangada.findFirst({
          where: { serial: raftSerial },
          select: { id: true },
        });
        if (raft) {
          const articles = await prisma.artigoJangada.findMany({
            where: { jangadaId: raft.id, inspecaoId: null },
            select: { id: true, name: true, referencia: true },
            take: 2000,
          });
          const normalize = (value: unknown) =>
            String(value || '')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase();
          const rations = articles.find((article) => {
            const text = `${normalize(article.name)} ${normalize(article.referencia)}`;
            return (
              text.includes('racao') ||
              text.includes('racoes') ||
              text.includes('ration') ||
              text.includes('food')
            );
          });

          if (rations) {
            const rows = await prisma.$queryRaw<Array<{ validadeText: string | null }>>`
              SELECT to_char(validade, 'YYYY-MM-DD') AS "validadeText"
              FROM "ArtigoJangada"
              WHERE id = ${rations.id}
            `;
            if (rows[0]?.validadeText) {
              payload.checklist = {
                ...(payload.checklist || {}),
                validade_racoes: rows[0].validadeText,
              };
            }
          }
        }
      }
    } catch (error) {
      console.warn('[exportar-raft] Não foi possível corrigir a validade das rações:', error);
    }

    // Se o caller não enviar substituicoes explicitamente mas tiver artigos
    // (ex.: raft cru de /api/jangadas), derivar a lista de artigos substituídos
    // para que o quadro gerado seja consistente em todos os pontos de entrada.
    const rawPayload = payload as QuadroTemplateInput & { artigos?: Array<Record<string, unknown>> };
    if (!Array.isArray(payload.substituicoes) && Array.isArray(rawPayload.artigos)) {
      payload.substituicoes = rawPayload.artigos
        .filter((art) => art && typeof art === "object")
        .map((art) => ({
          descricao: String(art.name || art.descricao || art.nome || "") || undefined,
          name: String(art.name || "") || undefined,
          referencia: art.referencia ? String(art.referencia) : undefined,
          quantidade: Number(art.quantidade || 0) || undefined,
          validade: art.validade ? String(art.validade) : undefined,
          codigoFabricante: art.codigoFabricante ? String(art.codigoFabricante) : undefined,
        }));
    }

    const { buffer, fileName } = await buildQuadroInspectionArtifacts(payload);

    let savedPath: string | undefined;

    // Sincronização direta com OneDrive na pasta do navio
    if (buffer) {
      try {
        const syncRes = await syncEmittedDocumentToOneDrive({
          kind: "quadro",
          shipName: payload.shipName || "Geral",
          fileName,
          buffer,
        });
        if (syncRes.synced && syncRes.filePath) {
          savedPath = syncRes.filePath;
        }
      } catch (syncErr) {
        console.warn('[exportar-raft] Erro ao sincronizar OneDrive:', syncErr);
      }

      // Gravação local em public/ opcional em dev
      if (payload.shipName && process.env.CERTIFICADOS_SAVE_TO_PUBLIC === 'true') {
        try {
          const saved = await saveQuadroToNavioFolder(payload.shipName, fileName, buffer, {
            serial: payload.raftSerial || undefined,
            date: payload.inspectionDate ? new Date(payload.inspectionDate) : undefined,
          });
          if (!savedPath) savedPath = saved.relativePath;
        } catch (saveErr) {
          console.warn('Gravação em public/ ignorada:', saveErr);
        }
      }
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
        ...(savedPath ? { 'X-Orey-Saved-Path': savedPath } : {}),
      },
    });
  } catch (error) {
    console.error('Erro ao gerar quadro de inspeção:', error);
    return NextResponse.json(
      { error: 'Não foi possível gerar o quadro de inspeção.' },
      { status: 500 }
    );
  }
}
