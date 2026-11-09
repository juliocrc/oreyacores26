import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Versões mínimas suportadas por app. Atualizar ao publicar novas versões.
// Se o cliente tiver uma versão inferior a minVersionCode, a app avisa para
// atualizar; abaixo de forceUpdateVersionCode, bloqueia.
const CONFIG = {
  cliente: { minVersionCode: 1, forceUpdateVersionCode: 1, versionName: "1.0" },
  tecnicos: { minVersionCode: 5, forceUpdateVersionCode: 5, versionName: "2.3" },
} as const;

// GET /api/app-version?app=cliente&station=acores&versionCode=1
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const app = searchParams.get("app") === "tecnicos" ? "tecnicos" : "cliente";
    const station = (searchParams.get("station") ?? "").toLowerCase();
    const versionCode = Number(searchParams.get("versionCode") ?? "0");
    const cfg = CONFIG[app];

    const update =
      Number.isFinite(versionCode) && versionCode < cfg.minVersionCode;
    const forceUpdate =
      Number.isFinite(versionCode) && versionCode < cfg.forceUpdateVersionCode;

    return NextResponse.json({
      app,
      station: station || null,
      current: cfg,
      updateAvailable: update,
      forceUpdate,
      // O download é feito a partir do link partilhado pela estação (ZIP/APK),
      // não há URL pública de APK no site.
      downloadUrl: null,
    });
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }
}
