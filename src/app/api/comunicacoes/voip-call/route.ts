import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";

export const runtime = "nodejs";

export async function POST() {
  if (!(await getAccessContext())) return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  return NextResponse.json({ error: "Chamadas de voz desativadas. Twilio foi removido; o historico continua disponivel.", code: "VOICE_DISABLED", configured: false }, { status: 410 });
}
