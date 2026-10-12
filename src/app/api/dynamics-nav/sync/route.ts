import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { loadDynamicsNavConfig, saveDynamicsNavConfig, syncProFormaToDynamicsNav } from "@/lib/dynamics-nav-integration";

export const runtime = "nodejs";

function publicConfig(config: ReturnType<typeof loadDynamicsNavConfig>) {
  return {
    ...config,
    clientSecret: config.clientSecret ? "••••••••" : "",
    webServiceAccessKey: config.webServiceAccessKey ? "••••••••" : "",
  };
}

export async function GET() {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    if (!access.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });

    const config = loadDynamicsNavConfig();
    return NextResponse.json({ config: publicConfig(config) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Erro ao carregar config Dynamics NAV" }, { status: 500 });
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

    if (body.action === "sync_test" && body.proforma) {
      const res = await syncProFormaToDynamicsNav(body.proforma);
      return NextResponse.json(res);
    }

    if (process.env.VERCEL) {
      return NextResponse.json({ error: "Em produção, a configuração Dynamics NAV deve ser gerida pelas variáveis de ambiente. Não é seguro gravá-la no filesystem efémero." }, { status: 409 });
    }

    const current = loadDynamicsNavConfig();
    const updated = {
      enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled,
      serviceUrl: typeof body.serviceUrl === "string" ? body.serviceUrl.trim() : current.serviceUrl,
      companyName: typeof body.companyName === "string" ? body.companyName.trim() : current.companyName,
      authType: ["oauth", "basic", "key"].includes(body.authType) ? body.authType : current.authType,
      tenantId: typeof body.tenantId === "string" ? body.tenantId.trim() : current.tenantId,
      clientId: typeof body.clientId === "string" ? body.clientId.trim() : current.clientId,
      clientSecret: typeof body.clientSecret === "string" ? body.clientSecret : current.clientSecret,
      username: typeof body.username === "string" ? body.username.trim() : current.username,
      webServiceAccessKey: typeof body.webServiceAccessKey === "string" ? body.webServiceAccessKey.trim() : current.webServiceAccessKey,
      syncMode: (body.syncMode === "automatic" ? "automatic" : "manual") as "automatic" | "manual",
    };

    saveDynamicsNavConfig(updated);
    return NextResponse.json({ success: true, config: publicConfig(updated) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Erro ao atualizar config Dynamics NAV" }, { status: 500 });
  }
}
