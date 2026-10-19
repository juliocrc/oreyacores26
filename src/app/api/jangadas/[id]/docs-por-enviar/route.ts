import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { listDocumentosPorEnviar, atualizarDocumentoPorEnviar } from "@/lib/docs-por-enviar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { id } = await context.params;
    const jangadaId = Number(id);
    if (!Number.isFinite(jangadaId) || jangadaId <= 0) {
      return NextResponse.json({ error: "ID de jangada inválido." }, { status: 400 });
    }

    const items = await listDocumentosPorEnviar(jangadaId);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("[GET /api/jangadas/[id]/docs-por-enviar]", error);
    return NextResponse.json({ error: "Erro ao listar documentos por enviar." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { id } = await context.params;
    const jangadaId = Number(id);
    if (!Number.isFinite(jangadaId) || jangadaId <= 0) {
      return NextResponse.json({ error: "ID de jangada inválido." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const docId = Number(body?.id);
    const status = String(body?.status || "enviado").trim() || "enviado";
    if (!Number.isFinite(docId) || docId <= 0) {
      return NextResponse.json({ error: "ID do documento inválido." }, { status: 400 });
    }

    const ok = await atualizarDocumentoPorEnviar(docId, jangadaId, status);
    if (!ok) {
      return NextResponse.json({ error: "Documento por enviar não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    console.error("[PATCH /api/jangadas/[id]/docs-por-enviar]", error);
    return NextResponse.json({ error: "Erro ao atualizar documento por enviar." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { id } = await context.params;
    const jangadaId = Number(id);
    const { searchParams } = new URL(req.url);
    const docId = Number(searchParams.get("docId"));
    if (!Number.isFinite(jangadaId) || jangadaId <= 0 || !Number.isFinite(docId) || docId <= 0) {
      return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
    }

    const ok = await atualizarDocumentoPorEnviar(docId, jangadaId, "descartado");
    if (!ok) {
      return NextResponse.json({ error: "Documento por enviar não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, status: "descartado" });
  } catch (error) {
    console.error("[DELETE /api/jangadas/[id]/docs-por-enviar]", error);
    return NextResponse.json({ error: "Erro ao descartar documento por enviar." }, { status: 500 });
  }
}
