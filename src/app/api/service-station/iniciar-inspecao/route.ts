import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { syncServiceStationQueueForInspection } from "@/lib/service-station-queue-sync";

export const runtime = "nodejs";

/**
 * Marca a jangada como "Em inspeção" no quadro da estação quando o técnico
 * começa a preencher a checklist. Reutiliza a entrada ativa existente para não
 * duplicar a linha do quadro.
 */
export async function POST(request: Request) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const jangadaId = Number(body?.jangadaId ?? body?.raftId ?? body?.id);
    if (!Number.isFinite(jangadaId) || jangadaId <= 0) {
      return NextResponse.json({ error: "jangadaId inválido." }, { status: 400 });
    }

    const queueId = await syncServiceStationQueueForInspection({
      jangadaId,
      phase: "start",
      serviceStationId: access.stationId ?? access.allowedStationIds[0] ?? null,
      tecnico: access.email ?? null,
    });

    return NextResponse.json({ ok: true, queueId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao iniciar a inspeção na estação." },
      { status: 500 },
    );
  }
}