import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { cleanTmpFolder } from "@/lib/certificados-organizados";
import { requireApiAccess } from "@/lib/api-access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const authorization = request.headers.get("authorization");
    const cronAuthorized = Boolean(secret && authorization && timingSafeEqual(
      createHash("sha256").update(authorization).digest(),
      createHash("sha256").update(`Bearer ${secret}`).digest(),
    ));
    if (!cronAuthorized) {
      const { error } = await requireApiAccess("/auditorias", { adminOnly: true });
      if (error) return error;
    }
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "clean";
    const rawAge = url.searchParams.get("maxAgeDays");
    const maxAgeDays = rawAge === null ? 7 : Number(rawAge);
    if (!["clean", "dedupe", "all"].includes(action) || !Number.isInteger(maxAgeDays) || maxAgeDays < 7 || maxAgeDays > 3650) {
      return NextResponse.json({ error: "Parâmetros de manutenção inválidos (retenção: 7–3650 dias)." }, { status: 400 });
    }
    // Equal bytes do not prove that separate vessel archives are dispensable.
    if (action !== "clean") {
      return NextResponse.json({ error: "Deduplicação suspensa: exige revisão dos arquivos e plano de recuperação." }, { status: 409 });
    }

    const results: Record<string, unknown> = {};

    if (action === "clean" || action === "all") {
      const cleanResult = await cleanTmpFolder(maxAgeDays);
      results.cleanTmp = cleanResult;
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error("Erro no job de manutenção:", error);
    return NextResponse.json(
      { error: "Erro no job de manutenção", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "Utilize POST autenticado para manutenção." }, { status: 405, headers: { Allow: "POST" } });
}
