import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { normalizeArtigoValidade } from "@/lib/date-utils";
import { logAuditoria } from "@/lib/auditoria";

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
    parsedValidade = normalizeArtigoValidade(String(data.validade));
  }

  const inspecaoId = Number.isInteger(Number(data.inspecaoId)) && Number(data.inspecaoId) > 0
    ? Number(data.inspecaoId)
    : null;

  const artigoData = {
    name: String(data.name || "").trim() || "Artigo",
    referencia: String(data.referencia || "").trim() || null,
    quantidade: Number(data.quantidade || 1),
    validade: parsedValidade,
    codigoFabricante: String(data.lote || data.codigoFabricante || "").trim() || null,
    stockId: Number.isInteger(Number(data.stockId))
      ? Number(data.stockId)
      : undefined,
    jangadaId,
  };

  if (inspecaoId) {
    const jangada = await prisma.jangada.findUnique({
      where: { id: jangadaId },
      select: { serial: true },
    });
    if (!jangada) {
      return NextResponse.json({ error: "Jangada não encontrada." }, { status: 404 });
    }

    const inspecao = await prisma.inspecao.findFirst({
      where: {
        id: inspecaoId,
        OR: [
          { jangadaId },
          ...(jangada.serial ? [{ jangadaSerial: jangada.serial }] : []),
        ],
      },
      select: { id: true },
    });
    if (!inspecao) {
      return NextResponse.json({ error: "Inspeção não encontrada para esta jangada." }, { status: 400 });
    }

    const existing = await artigoJangadaDelegate.findFirst({
      where: {
        jangadaId,
        inspecaoId,
        OR: [
          ...(artigoData.referencia ? [{ referencia: artigoData.referencia }] : []),
          { name: artigoData.name },
        ],
      },
    });

    if (existing) {
      const updated = await artigoJangadaDelegate.update({
        where: { id: existing.id },
        data: artigoData,
      });
      await logAuditoria({
        tabela: "ArtigoJangada",
        tipoOperacao: "UPDATE",
        idRegisto: updated.id,
        descricao: `Quantidade substituída atualizada: ${updated.name} — inspeção #${inspecaoId}.`,
        usuario: "sistema",
        dadosAntes: existing,
        dadosDepois: updated,
      });
      return NextResponse.json(updated);
    }

    const created = await artigoJangadaDelegate.create({
      data: { ...artigoData, inspecaoId },
    });
    await logAuditoria({
      tabela: "ArtigoJangada",
      tipoOperacao: "CREATE",
      idRegisto: created.id,
      descricao: `Quantidade substituída registada: ${created.name} — inspeção #${inspecaoId}.`,
      usuario: "sistema",
      dadosDepois: created,
    });
    return NextResponse.json(created, { status: 201 });
  }

  const artigo = await artigoJangadaDelegate.create({ data: artigoData });
  await logAuditoria({
    tabela: "ArtigoJangada",
    tipoOperacao: "CREATE",
    idRegisto: artigo.id,
    descricao: `Artigo criado na jangada: ${artigo.name} — quantidade ${artigo.quantidade}.`,
    usuario: "sistema",
    dadosDepois: artigo,
  });
  return NextResponse.json(artigo, { status: 201 });
}
