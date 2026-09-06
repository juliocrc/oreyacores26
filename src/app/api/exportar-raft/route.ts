import { NextResponse } from 'next/server';
import { buildQuadroInspectionArtifacts, type QuadroTemplateInput } from '@/lib/quadro-template';
import { getAccessContext } from '@/lib/access-control';
import { saveQuadroToNavioFolder } from '@/lib/certificados-organizados';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const payload = (await request.json()) as QuadroTemplateInput;

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

    // Guardar no folder organizado por navio (NAVIOS/{navio}/)
    if (payload.shipName && buffer) {
      await saveQuadroToNavioFolder(payload.shipName, fileName, buffer, {
        serial: payload.raftSerial || undefined,
        date: payload.inspectionDate ? new Date(payload.inspectionDate) : undefined,
      });
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
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
