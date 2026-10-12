import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { getOneDriveGraphStatus } from "@/lib/onedrive-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    if (!access.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });

    const status = await getOneDriveGraphStatus();
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao verificar o Microsoft Graph.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
