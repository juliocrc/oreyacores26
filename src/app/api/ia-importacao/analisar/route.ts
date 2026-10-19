import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { analyzeImportFile } from "@/lib/ia-import-document";
import type { AnalyzeResult } from "@/types/ia-importacao-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILES = 8;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const formData = await req.formData();
    const files = formData.getAll("file").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "Nenhum ficheiro enviado." }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Máximo de ${MAX_FILES} ficheiros por análise.` }, { status: 400 });
    }

    const results: AnalyzeResult[] = [];
    const errors: Array<{ fileName: string; error: string; detail?: string }> = [];

    for (const file of files) {
      const name = file.name || "documento";
      const lower = name.toLowerCase();
      if (!/\.(pdf|xlsx|xlsm|xls)$/.test(lower)) {
        errors.push({ fileName: name, error: "Formato não suportado (use PDF, XLSX, XLSM ou XLS)." });
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        errors.push({ fileName: name, error: "Ficheiro demasiado grande (máx. 25 MB)." });
        continue;
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await analyzeImportFile({ fileName: name, buffer });
        results.push(result);
      } catch (error) {
        console.error("[ia-importacao/analisar]", name, error);
        errors.push({
          fileName: name,
          error: "Não foi possível analisar o ficheiro.",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (results.length === 0 && errors.length > 0) {
      return NextResponse.json({ error: errors[0].error, errors }, { status: 422 });
    }

    return NextResponse.json({ results, errors });
  } catch (error) {
    console.error("[POST /api/ia-importacao/analisar]", error);
    return NextResponse.json({ error: "Erro ao analisar os documentos." }, { status: 500 });
  }
}
