import { NextRequest, NextResponse } from "next/server";
import { generateDgrmDocx, type DgrmData } from "@/lib/dgrm-docx";
import { loadTemplateBuffer } from "@/lib/template-loader";
import { syncNavioFileToOneDrive } from "@/lib/onedrive-sync";

export async function POST(req: NextRequest) {
  try {
    const data = (await req.json()) as DgrmData;

    const templateBuffer = await loadTemplateBuffer("FICHA_DGRM_TEMPLATE.docx");
    const outputBuffer = await generateDgrmDocx(templateBuffer, data);

    const serial = (data.serial || "Sem-Serie").trim();
    const shipName = (data.shipName || data.shipNameManual || "Sem-Navio").trim();
    const filename = `Ficha DGRM - ${serial} - ${shipName}.docx`;

    let savedPath: string | undefined;
    try {
      const syncResult = await syncNavioFileToOneDrive({
        shipName,
        fileName: filename,
        buffer: Buffer.from(outputBuffer),
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        category: "dgrm",
      });
      if (syncResult.synced && syncResult.filePath) {
        savedPath = syncResult.filePath;
      }
    } catch (syncErr) {
      console.warn("[dgrm-docx] Falha ao sincronizar com OneDrive:", syncErr);
    }

    return new NextResponse(new Uint8Array(outputBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        ...(savedPath ? { "X-Orey-Saved-Path": savedPath } : {}),
      },
    });
  } catch (err) {
    console.error("Erro ao gerar DGRM DOCX:", err);
    return NextResponse.json({ error: "Erro interno ao gerar ficha DGRM" }, { status: 500 });
  }
}
