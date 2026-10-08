import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { enviarComunicacao } from "@/lib/communications";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get("tipo");
    const status = searchParams.get("status");
    const direcao = searchParams.get("direcao"); // enviada | recebida
    const clienteId = Number(searchParams.get("clienteId"));
    const jangadaId = Number(searchParams.get("jangadaId"));
    const ordemServicoId = Number(searchParams.get("ordemServicoId"));
    const q = String(searchParams.get("q") || "").trim();
    const limite = Math.min(Number(searchParams.get("limite") || 200), 500);

    const where: Record<string, unknown> = {};
    if (tipo) where.tipo = tipo;
    if (status) where.status = status;
    if (direcao === "recebida") where.status = "recebido";
    if (direcao === "enviada") where.status = { not: "recebido" } as never;
    if (Number.isFinite(clienteId) && clienteId > 0) where.clienteId = clienteId;
    if (Number.isFinite(jangadaId) && jangadaId > 0) where.jangadaId = jangadaId;
    if (Number.isFinite(ordemServicoId) && ordemServicoId > 0) where.ordemServicoId = ordemServicoId;
    if (q) {
      where.OR = [
        { destinatario: { contains: q } },
        { mensagem: { contains: q } },
        { assunto: { contains: q } },
        { enviadoPor: { contains: q } },
      ];
    }

    const [items, total, porTipo, porStatus, recebidasNaoRespondidas] = await Promise.all([
      prisma.comunicacao.findMany({
        where,
        orderBy: [{ enviadoEm: "desc" }, { id: "desc" }],
        take: limite,
      }),
      prisma.comunicacao.count({ where }),
      prisma.comunicacao.groupBy({ by: ["tipo"], _count: true }),
      prisma.comunicacao.groupBy({ by: ["status"], _count: true }),
      prisma.comunicacao.count({ where: { status: "recebido", respondidoEm: null } }),
    ]);

    return NextResponse.json({
      items,
      total,
      porTipo,
      porStatus,
      recebidasNaoRespondidas,
    });
  } catch (error) {
    console.error("[GET /api/comunicacoes]", error);
    return NextResponse.json({ error: "Erro ao listar comunicações." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const tipo = String(body?.tipo || "").toUpperCase();
    const mensagem = String(body?.mensagem || "").trim();
    const destinatario = String(body?.destinatario || "").trim() || undefined;
    const assunto = String(body?.assunto || "").trim() || undefined;

    if (tipo !== "SMS" && tipo !== "WHATSAPP" && tipo !== "EMAIL") {
      return NextResponse.json({ error: "Tipo de comunicação inválido." }, { status: 400 });
    }
    if (!mensagem) {
      return NextResponse.json({ error: "A mensagem não pode estar vazia." }, { status: 400 });
    }

    const ref = {
      refTipo: body?.refTipo ? String(body.refTipo) : undefined,
      refId: body?.refId != null ? Number(body.refId) : null,
      clienteId: body?.clienteId != null ? Number(body.clienteId) : null,
      jangadaId: body?.jangadaId != null ? Number(body.jangadaId) : null,
      ordemServicoId: body?.ordemServicoId != null ? Number(body.ordemServicoId) : null,
    };

    const operador = await prisma.user.findUnique({
      where: { id: access.userId },
      select: { name: true, email: true },
    });

    const result = await enviarComunicacao({
      tipo,
      mensagem,
      assunto,
      destinatario,
      ref,
      enviadoPor: operador?.name || operador?.email || String(access.userId),
    });

    if (result.ok && body?.responderA != null) {
      const recebidaId = Number(body.responderA);
      if (Number.isFinite(recebidaId) && recebidaId > 0) {
        await prisma.comunicacao.update({
          where: { id: recebidaId },
          data: { respondidoEm: new Date() },
        }).catch(() => {});
      }
    }

    return NextResponse.json(
      result.ok
        ? { ok: true, comunicacaoId: result.comunicacaoId, whatsappUrl: result.whatsappUrl }
        : { error: result.erro || "Falha ao enviar comunicação." },
      { status: result.ok ? 200 : 400 },
    );
  } catch (error) {
    console.error("[POST /api/comunicacoes]", error);
    return NextResponse.json({ error: "Erro ao enviar comunicação." }, { status: 500 });
  }
}
