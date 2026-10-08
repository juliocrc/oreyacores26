import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { syncAgendaToGoogleCalendar } from "@/lib/google-calendar";

export const runtime = "nodejs";

export async function POST() {
  const access = await getAccessContext();
  if (!access) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }
  if (!access.isAdmin) {
    return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  }

  try {
    const result = await syncAgendaToGoogleCalendar();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[google-calendar/sync]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha na sincronização." },
      { status: 500 },
    );
  }
}
