import { NextResponse } from "next/server";
import { syncPortoPontaDelgada } from "@/lib/porto-ponta-delgada";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: "Não autorizado. Header Authorization inválido." },
      { status: 401 },
    );
  }

  try {
    const result = await syncPortoPontaDelgada();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[CRON /api/cron/porto-ponta-delgada]", err);
    const message = err instanceof Error ? err.message : "Erro ao sincronizar escalas oficiais.";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
