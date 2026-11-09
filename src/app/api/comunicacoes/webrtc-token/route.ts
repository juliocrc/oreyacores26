import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";

export async function GET() {
  const access = await getAccessContext();
  if (!access) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }

  return NextResponse.json(
    { error: "WebRTC desativado. Twilio foi removido.", code: "VOICE_DISABLED", configured: false },
    { status: 410 },
  );
}
