import fs from "node:fs";
import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { loadOneDriveConfig, saveOneDriveConfig, detectOneDriveBusinessRoots } from "@/lib/onedrive-sync";

export const runtime = "nodejs";

export async function GET() {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const config = loadOneDriveConfig();
    const detectedRoots = detectOneDriveBusinessRoots();
    const rootExists = Boolean(config.rootPath) && fs.existsSync(config.rootPath);

    return NextResponse.json({ config, detectedRoots, rootExists });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Erro ao carregar config OneDrive" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getAccessContext();
    if (!access || !access.isAdmin) {
      return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }

    const current = loadOneDriveConfig();
    const updated = {
      enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled,
      rootPath: typeof body.rootPath === "string" ? body.rootPath.trim() : current.rootPath,
    };

    saveOneDriveConfig(updated);
    return NextResponse.json({ success: true, config: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Erro ao guardar config OneDrive" }, { status: 500 });
  }
}
