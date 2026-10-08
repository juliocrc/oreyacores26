import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import {
  getGoogleCalendarConfig,
  saveGoogleCalendarConfig,
} from "@/lib/google-calendar-config";

export const runtime = "nodejs";

type ConfigBody = {
  enabled?: boolean;
  calendarId?: string;
  connectionLabel?: string;
  janelaDiasApp?: number;
  expiracoesNoGoogle?: boolean;
  incluirInspecoesNoGoogle?: boolean;
};

export async function GET() {
  const access = await getAccessContext();
  if (!access) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }
  if (!access.isAdmin) {
    return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  }
  return NextResponse.json(getGoogleCalendarConfig());
}

export async function POST(req: NextRequest) {
  const access = await getAccessContext();
  if (!access) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }
  if (!access.isAdmin) {
    return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  }

  try {
    const body = (await req.json()) as ConfigBody;
    const config = saveGoogleCalendarConfig({
      enabled: body.enabled,
      calendarId: body.calendarId,
      connectionLabel: body.connectionLabel,
      janelaDiasApp: body.janelaDiasApp,
      expiracoesNoGoogle: body.expiracoesNoGoogle,
      incluirInspecoesNoGoogle: body.incluirInspecoesNoGoogle,
    });
    return NextResponse.json(config);
  } catch {
    return NextResponse.json({ error: "Não foi possível guardar a configuração." }, { status: 500 });
  }
}
