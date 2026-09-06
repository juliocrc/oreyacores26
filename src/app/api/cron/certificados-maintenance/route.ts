import { NextResponse } from "next/server";
import { cleanTmpFolder, deduplicateAllFolders } from "@/lib/certificados-organizados";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "all";
    const maxAgeDays = url.searchParams.get("maxAgeDays") ? Number(url.searchParams.get("maxAgeDays")) : 7;

    const results: Record<string, any> = {};

    if (action === "clean" || action === "all") {
      const cleanResult = await cleanTmpFolder(maxAgeDays);
      results.cleanTmp = cleanResult;
    }

    if (action === "dedupe" || action === "all") {
      const dupeResult = await deduplicateAllFolders();
      results.deduplicate = dupeResult;
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

export async function GET(request: Request) {
  // Permite trigger via GET (ex: cron externo com wget/curl)
  return POST(request);
}