import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { syncNavioFileToOneDrive } from "@/lib/onedrive-sync";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png"]);

function safeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*]/g, "_").replace(/\.\./g, "_").trim().slice(0, 180);
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await getAccessContext();
  if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

  try {
    const id = Number((await context.params).id);
    const navio = await prisma.navio.findUnique({ where: { id }, select: { id: true, nome: true } });
    if (!navio) return NextResponse.json({ error: "Navio não encontrado." }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get("file");
    const category = formData.get("category") === "certificados" ? "certificados" : "documentos";
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione um ficheiro." }, { status: 400 });
    if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "O ficheiro deve ter entre 1 byte e 4 MB." }, { status: 400 });

    const fileName = safeFileName(file.name);
    const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) return NextResponse.json({ error: "Formato não permitido. Use PDF, Office, JPG ou PNG." }, { status: 400 });

    const result = await syncNavioFileToOneDrive({
      shipName: navio.nome,
      fileName,
      buffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream",
      category,
    });
    if (!result.synced) return NextResponse.json({ error: result.reason || "Não foi possível guardar no OneDrive." }, { status: 503 });

    return NextResponse.json({ success: true, fileName, category, path: result.filePath });
  } catch (error) {
    console.error("Erro no upload do navio:", error);
    return NextResponse.json({ error: "Não foi possível carregar o ficheiro." }, { status: 500 });
  }
}
