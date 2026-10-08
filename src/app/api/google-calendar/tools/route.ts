import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { listZapierTools, isZapierMcpConfigured } from "@/lib/zapier-mcp";
import { getGoogleCalendarStatus } from "@/lib/google-calendar";

export const runtime = "nodejs";

export async function GET() {
  const access = await getAccessContext();
  if (!access) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }
  if (!access.isAdmin) {
    return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  }

  try {
    const status = await getGoogleCalendarStatus();
    let tools: unknown[] = [];
    if (isZapierMcpConfigured()) {
      const all = await listZapierTools();
      tools = all
        .filter((t) =>
          /calendar|calendário|calendario/i.test(`${t.name} ${t.description || ""}`),
        )
        .map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
    }
    return NextResponse.json({ status, calendarTools: tools });
  } catch (error) {
    console.error("[google-calendar/tools]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao listar tools." },
      { status: 500 },
    );
  }
}
