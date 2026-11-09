import { NextRequest, NextResponse } from "next/server";
import { POST as create } from "@/app/api/stock/route";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const response = await create(new NextRequest(req.url, {
    method: "POST", headers: req.headers,
    body: JSON.stringify({ ...body, descricao: body.descricao || `Artigo pack: ${body.referencia}`,
      categoria: body.categoria || "CONSUMIVEIS", associavelJangada: true,
      aplicavelMarcaJangada: body.marcaJangada, aplicavelModeloJangada: body.modeloJangada }),
  }));
  if (!response.ok) return response;
  return NextResponse.json({ success: true, stock: await response.json() }, { status: 201 });
}
