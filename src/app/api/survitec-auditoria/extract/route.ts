import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // Try pdf-parse v2 first
  try {
    const pdfParseModule = await import("pdf-parse");
    // pdf-parse v2 exports a default function
    const pdfParse = (pdfParseModule as unknown as { default: (buffer: Buffer) => Promise<{ text: string }> }).default;
    
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch (e) {
    console.warn("pdf-parse failed, trying pdfjs-dist directly:", e);
  }

// Fallback: try pdfjs-dist directly
    try {
      const pdfjsDist = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const { getDocument, GlobalWorkerOptions } = pdfjsDist;
      
      // Set up worker - use the worker from the pdfjs-dist package
      GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsDist.version}/pdf.worker.min.mjs`;

      const loadingTask = getDocument({ data: buffer });
      const pdfDocument = await loadingTask.promise;
      let fullText = "";

      for (let i = 1; i <= pdfDocument.numPages; i++) {
        const page = await pdfDocument.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .filter((item) => {
            const obj = item as Record<string, unknown>;
            return "str" in obj && typeof obj.str === "string";
          })
          .map((item) => (item as Record<string, unknown>).str as string)
          .join(" ");
        fullText += pageText + "\n\n";
      }

      return fullText;
  } catch (e) {
    console.error("All PDF extraction methods failed:", e);
    throw new Error("Não foi possível extrair texto do PDF");
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Nenhum ficheiro enviado" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Apenas ficheiros PDF são suportados" }, { status: 400 });
    }

    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "Ficheiro demasiado grande (máx. 25 MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractTextFromPdf(buffer);

    return NextResponse.json({
      text: text.trim(),
      fileName: file.name,
      fileSize: file.size,
    });
  } catch (error) {
    console.error("[survitec-auditoria/extract]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao processar PDF" },
      { status: 500 }
    );
  }
}