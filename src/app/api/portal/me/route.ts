import { NextResponse } from "next/server";
import { getAuthSession } from "@/auth";
import { buildPortalClienteData } from "@/lib/portal-cliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getAuthSession();
    const user = session?.user;

    if (!user?.id) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }

    const previewId = new URL(request.url).searchParams.get("previewClienteId");
    const clienteId = user.role === "ADMIN" && previewId
      ? Number(previewId)
      : user.clienteId != null ? Number(user.clienteId) : null;

    if (!clienteId || !Number.isFinite(clienteId)) {
      return NextResponse.json(
        { error: "Esta conta não está associada a nenhum cliente." },
        { status: 403 },
      );
    }

    const data = await buildPortalClienteData(clienteId);
    if (!data) {
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[GET /api/portal/me]", err);
    return NextResponse.json({ error: "Erro ao carregar a área de cliente." }, { status: 500 });
  }
}
