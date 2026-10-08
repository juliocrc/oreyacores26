import { NextRequest, NextResponse } from "next/server";
import { generateDgrmDocx, type DgrmData } from "@/lib/dgrm-docx";
import { loadTemplateBuffer } from "@/lib/template-loader";

export async function POST(req: NextRequest) {
  try {
    const data = (await req.json()) as DgrmData;

    const templateBuffer = await loadTemplateBuffer("FICHA_DGRM_TEMPLATE.docx");
    const outputBuffer = await generateDgrmDocx(templateBuffer, data);

    return new NextResponse(new Uint8Array(outputBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="Ficha_DGRM_Jangada.docx"`,
      },
    });
  } catch (err) {
    console.error("Erro ao gerar DGRM DOCX:", err);
    return NextResponse.json({ error: "Erro interno ao gerar ficha DGRM" }, { status: 500 });
  }
}
