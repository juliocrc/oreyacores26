import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { generateDgrmDocx, type DgrmData } from "@/lib/dgrm-docx";

export async function POST(req: NextRequest) {
  try {
    const data = (await req.json()) as DgrmData;

    const templatePath = path.join(process.cwd(), "templates", "FICHA_DGRM_TEMPLATE.docx");

    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ error: "Template DGRM não encontrado" }, { status: 500 });
    }

    const templateBuffer = fs.readFileSync(templatePath);
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
