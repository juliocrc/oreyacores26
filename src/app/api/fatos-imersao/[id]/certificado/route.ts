import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

function buildGeneratedCertificateNumber(fatoImersaoId: number, date = new Date()) {
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `FI-${dateStr}-${fatoImersaoId}`;
}

async function readJsonBody(req: NextRequest): Promise<Record<string, string | undefined>> {
  try {
    const text = await req.text();
    if (!text.trim()) return {};
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object") return parsed as Record<string, string | undefined>;
  } catch {
    /* corpo vazio ou inválido */
  }
  return {};
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const fatoImersaoId = parseInt(id, 10);
    const certificado = await prisma.certificadoFatoImersao.findUnique({
      where: { fatoImersaoId },
      include: {
        fatoImersao: {
          select: {
            id: true,
            serial: true,
            marca: true,
            modelo: true,
            tamanho: true,
            tipo: true,
            estado: true,
            dataInspecao: true,
            dataProxInspecao: true,
          },
        },
      },
    });
    return NextResponse.json(certificado || {});
  } catch (error) {
    console.error("Error fetching certificado fato imersao:", error);
    return NextResponse.json({ message: "Erro ao obter certificado" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const fatoImersaoId = parseInt(id, 10);
    const body = await readJsonBody(req);

    const fato = await prisma.fatoImersao.findUnique({
      where: { id: fatoImersaoId },
      select: {
        id: true,
        verificacoes: { orderBy: { dataVerificacao: "desc" }, take: 1 },
      },
    });
    if (!fato) return NextResponse.json({ message: "Fato de imersão não encontrado" }, { status: 404 });
    if (!fato.verificacoes.length) {
      return NextResponse.json({ message: "É necessária pelo menos uma verificação antes de emitir certificado." }, { status: 400 });
    }

    const dataCertificado = body.dataCertificado ? new Date(body.dataCertificado) : new Date();
    let dataValidade: Date | null = null;
    if (body.dataValidade) {
      dataValidade = new Date(body.dataValidade);
    } else {
      dataValidade = new Date(dataCertificado);
      dataValidade.setFullYear(dataValidade.getFullYear() + 1);
    }

    const numeroCertificado =
      String(body.numeroCertificado || "").trim() || buildGeneratedCertificateNumber(fatoImersaoId, dataCertificado);

    const certificado = await prisma.certificadoFatoImersao.upsert({
      where: { fatoImersaoId },
      create: {
        fatoImersaoId,
        numeroCertificado,
        dataCertificado,
        dataValidade,
        resultado: body.resultado || "Aprovado",
        emitidoPor: body.emitidoPor || null,
        observacoes: body.observacoes || null,
      },
      update: {
        numeroCertificado,
        dataCertificado,
        dataValidade,
        resultado: body.resultado || "Aprovado",
        emitidoPor: body.emitidoPor || null,
        observacoes: body.observacoes || null,
      },
    });

    return NextResponse.json(certificado, { status: 201 });
  } catch (error) {
    console.error("Error creating certificado fato imersao:", error);
    return NextResponse.json({ message: (error as Error).message || "Erro ao emitir certificado" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const fatoImersaoId = parseInt(id, 10);
    await prisma.certificadoFatoImersao.deleteMany({ where: { fatoImersaoId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message || "Erro ao eliminar certificado" }, { status: 500 });
  }
}
