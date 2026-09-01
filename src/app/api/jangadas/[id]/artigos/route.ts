import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { parseFlexibleDateValue } from "@/lib/date-display";

const artigoJangadaDelegate = prisma.artigoJangada;

function ensureArtigoJangadaDelegate() {
  if (!artigoJangadaDelegate) {
    return NextResponse.json(
      { error: "Modelo ArtigoJangada indisponível no Prisma Client atual" },
      { status: 500 }
    );
  }
  return null;
}

// GET /api/jangadas/[id]/artigos - Lista artigos de uma jangada
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const delegateError = ensureArtigoJangadaDelegate();
  if (delegateError) return delegateError;

  const { id } = await context.params;
  const jangadaId = Number(id);
  if (isNaN(jangadaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const artigos = await artigoJangadaDelegate.findMany({ where: { jangadaId } });
  return NextResponse.json(artigos);
}

// POST /api/jangadas/[id]/artigos - Cria artigo para uma jangada
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const delegateError = ensureArtigoJangadaDelegate();
  if (delegateError) return delegateError;

  const { id } = await context.params;
  const jangadaId = Number(id);
  if (isNaN(jangadaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const data = await req.json();

  let parsedValidade: Date | null = null;
  if (data.validade) {
    const d = parseFlexibleDateValue(String(data.validade));
    if (d) parsedValidade = d;
  }

  const artigo = await artigoJangadaDelegate.create({
    data: { 
      name: String(data.name || "").trim() || "Artigo",
      referencia: String(data.referencia || "").trim() || null,
      quantidade: Number(data.quantidade || 1),
      validade: parsedValidade,
      codigoFabricante: String(data.lote || data.codigoFabricante || "").trim() || null,
      jangadaId 
    }
  });
  return NextResponse.json(artigo, { status: 201 });
}
