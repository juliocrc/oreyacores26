import { NextRequest, NextResponse } from "next/server";
import { APP_CONFIG } from "@/lib/app-config";
import prisma from "@/lib/prisma";

function buildGeneratedCertificateNumber(coleteId: number, date = new Date()) {
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `CERT-${dateStr}-${coleteId}`;
}

type CertificadoBody = {
  numeroCertificado?: string | null;
  dataCertificado?: string | null;
  dataValidade?: string | null;
  resultado?: string | null;
  emitidoPor?: string | null;
  observacoes?: string | null;
};

// O wizard emite o certificado com `body: undefined`, ou seja, um pedido sem
// corpo nenhum. Todos os campos sao opcionais e tem valor por omissao, logo um
// corpo vazio e legitimo aqui -- mas `await req.json()` lancaria SyntaxError e
// a rota responderia 500 em vez de criar o certificado.
async function readJsonBody<T>(req: Request): Promise<T> {
  const raw = await req.text();
  if (!raw.trim()) return {} as T;
  const parsed: unknown = JSON.parse(raw);
  return parsed && typeof parsed === "object" ? (parsed as T) : ({} as T);
}

function invalidJsonResponse() {
  return NextResponse.json(
    { error: "Corpo do pedido invalido.", message: "Corpo do pedido invalido." },
    { status: 400 }
  );
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const coleteId = parseInt(id, 10);

    const certificado = await prisma.certificadoColete.findUnique({
      where: { coleteId },
      include: {
        colete: {
          select: {
            id: true,
            shipId: true,
            serial: true,
            marca: true,
            modelo: true,
            tamanho: true,
            estado: true,
            dataFabrico: true,
            dataInspecao: true,
            dataProxInspecao: true,
            observacoes: true,
            createdAt: true,
            updatedAt: true,
            verificacoes: {
              orderBy: { dataVerificacao: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    return NextResponse.json(certificado || {});
  } catch (error) {
    console.error("Error fetching certificado:", error);
    return NextResponse.json(
      { message: "Error fetching certificado" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const coleteId = parseInt(id, 10);

    let body: CertificadoBody;
    try {
      body = await readJsonBody<CertificadoBody>(req);
    } catch {
      return invalidJsonResponse();
    }

    // Check if colete exists and has verification records
    const colete = await prisma.colete.findUnique({
      where: { id: coleteId },
      select: {
        id: true,
        serial: true,
        verificacoes: {
          orderBy: { dataVerificacao: "desc" },
          take: 1,
        },
      },
    });

    if (!colete) {
      return NextResponse.json(
        { error: "Colete not found", message: "Colete not found" },
        { status: 404 }
      );
    }

    if (!colete.verificacoes || colete.verificacoes.length === 0) {
      return NextResponse.json(
        { error: "Colete must have at least one inspection record", message: "Colete must have at least one inspection record" },
        { status: 400 }
      );
    }

    const generatedNumeroCertificado = buildGeneratedCertificateNumber(coleteId);

    const existing = await prisma.certificadoColete.findUnique({
      where: { coleteId },
    });

    const certificado = await prisma.certificadoColete.upsert({
      where: { coleteId },
      create: {
        coleteId,
        numeroCertificado: body.numeroCertificado || generatedNumeroCertificado,
        dataCertificado: body.dataCertificado ? new Date(body.dataCertificado) : new Date(),
        dataValidade: body.dataValidade
          ? new Date(body.dataValidade)
          : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        resultado: body.resultado || "Aprovado",
        emitidoPor: body.emitidoPor || APP_CONFIG.issuerName,
        observacoes: body.observacoes || null,
      },
      update: {
        numeroCertificado: body.numeroCertificado || existing?.numeroCertificado || generatedNumeroCertificado,
        dataCertificado: body.dataCertificado ? new Date(body.dataCertificado) : existing?.dataCertificado || new Date(),
        dataValidade: body.dataValidade
          ? new Date(body.dataValidade)
          : existing?.dataValidade || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        resultado: body.resultado || existing?.resultado || "Aprovado",
        emitidoPor: body.emitidoPor || existing?.emitidoPor || APP_CONFIG.issuerName,
        observacoes: Object.prototype.hasOwnProperty.call(body || {}, "observacoes")
          ? (body.observacoes || null)
          : (existing?.observacoes || null),
      },
    });

    return NextResponse.json(certificado, { status: existing ? 200 : 201 });
  } catch (error) {
    console.error("Error creating certificado:", error);
    return NextResponse.json(
      { error: "Error creating certificado", message: "Error creating certificado" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const coleteId = parseInt(id, 10);

    let body: CertificadoBody;
    try {
      body = await readJsonBody<CertificadoBody>(req);
    } catch {
      return invalidJsonResponse();
    }

    const existing = await prisma.certificadoColete.findUnique({
      where: { coleteId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Certificate not found", message: "Certificate not found" },
        { status: 404 }
      );
    }

    const certificado = await prisma.certificadoColete.update({
      where: { coleteId },
      data: {
        numeroCertificado: body.numeroCertificado || existing.numeroCertificado,
        dataCertificado: body.dataCertificado ? new Date(body.dataCertificado) : existing.dataCertificado,
        dataValidade: body.dataValidade ? new Date(body.dataValidade) : existing.dataValidade,
        resultado: body.resultado || existing.resultado,
        emitidoPor: body.emitidoPor || existing.emitidoPor || APP_CONFIG.issuerName,
        observacoes: Object.prototype.hasOwnProperty.call(body || {}, "observacoes")
          ? (body.observacoes || null)
          : existing.observacoes,
      },
    });

    return NextResponse.json(certificado);
  } catch (error) {
    console.error("Error updating certificado:", error);
    return NextResponse.json(
      { error: "Error updating certificado", message: "Error updating certificado" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const coleteId = parseInt(id, 10);

    const certificado = await prisma.certificadoColete.findUnique({
      where: { coleteId },
    });

    if (!certificado) {
      return NextResponse.json(
        { error: "Certificate not found", message: "Certificate not found" },
        { status: 404 }
      );
    }

    await prisma.certificadoColete.delete({
      where: { coleteId },
    });

    return NextResponse.json({ message: "Certificate deleted" });
  } catch (error) {
    console.error("Error deleting certificado:", error);
    return NextResponse.json(
      { error: "Error deleting certificado", message: "Error deleting certificado" },
      { status: 500 }
    );
  }
}
