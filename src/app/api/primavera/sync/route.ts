import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { loadPrimaveraConfig, savePrimaveraConfig, syncProFormaToPrimavera } from "@/lib/primavera-integration";

export const runtime = "nodejs";

function publicConfig(config: ReturnType<typeof loadPrimaveraConfig>) {
  return {
    ...config,
    password: config.password ? "••••••••" : "",
    apiKey: config.apiKey ? "••••••••" : "",
  };
}

export async function GET() {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    if (!access.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });

    const config = loadPrimaveraConfig();
    return NextResponse.json({ config: publicConfig(config) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Erro ao carregar config Primavera" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access || !access.isAdmin) {
      return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }

    // Se for um pedido de teste/sincronização manual
    if (body.action === "sync_test" && body.proforma) {
      const res = await syncProFormaToPrimavera(body.proforma);
      return NextResponse.json(res);
    }

    if (process.env.VERCEL) {
      return NextResponse.json({ error: "Em produção, a configuração Primavera deve ser gerida pelas variáveis de ambiente. Não é seguro gravá-la no filesystem efémero." }, { status: 409 });
    }

    // Guardar configuração apenas em instalações persistentes.
    const current = loadPrimaveraConfig();
    const updated = {
      enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled,
      apiUrl: typeof body.apiUrl === "string" ? body.apiUrl.trim() : current.apiUrl,
      companyId: typeof body.companyId === "string" ? body.companyId.trim() : current.companyId,
      username: typeof body.username === "string" ? body.username.trim() : current.username,
      password: typeof body.password === "string" ? body.password : current.password,
      apiKey: typeof body.apiKey === "string" ? body.apiKey.trim() : current.apiKey,
      syncMode: (body.syncMode === "automatic" ? "automatic" : "manual") as "automatic" | "manual",
    };

    savePrimaveraConfig(updated);
    return NextResponse.json({ success: true, config: publicConfig(updated) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Erro ao atualizar config Primavera" }, { status: 500 });
  }
}
