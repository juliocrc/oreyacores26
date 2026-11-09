import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { enviarComunicacao } from "@/lib/communications";
import { isEmailConfigured } from "@/lib/email-sender";
import { canUseEmailSenderProfiles } from "@/lib/email-sender-access";

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
    const limite = Number(searchParams.get("limite") || 200);
    if (!Number.isInteger(limite) || limite < 1 || limite > 500) {
      return NextResponse.json({ error: "O limite deve ser um inteiro entre 1 e 500." }, { status: 400 });
    }
    const cursorParam = searchParams.get("cursor");
    const cursor = cursorParam === null ? null : Number(cursorParam);
    if (cursor !== null && (!Number.isSafeInteger(cursor) || cursor < 1)) {
      return NextResponse.json({ error: "O cursor deve ser um inteiro positivo." }, { status: 400 });
    }

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
        ...(cursor !== null ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: limite + 1,
      }),
      prisma.comunicacao.count({ where }),
      prisma.comunicacao.groupBy({ by: ["tipo"], _count: true }),
      prisma.comunicacao.groupBy({ by: ["status"], _count: true }),
      prisma.comunicacao.count({ where: { status: "recebido", respondidoEm: null } }),
    ]);

    return NextResponse.json({
      items: items.slice(0, limite),
      nextCursor: items.length > limite ? items[limite - 1].id : null,
      total,
      porTipo,
      porStatus,
      recebidasNaoRespondidas,
      permissions: { canDelete: access.isAdmin },
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
    const senderAccount = body?.senderAccount;
    if (senderAccount !== undefined && !canUseEmailSenderProfiles(access.email)) {
      return NextResponse.json({ error: "Sem permissao para usar contas de envio." }, { status: 403 });
    }
    if (senderAccount !== undefined && senderAccount !== "julio" && senderAccount !== "tecnica") {
      return NextResponse.json({ error: "Conta de envio invalida." }, { status: 400 });
    }
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

    // Scheduled communications always remain drafts: an operator must explicitly
    // reopen and approve them from the communications centre before any delivery.
    if (body?.guardarParaAprovacao === true) {
      const agendadaPara = new Date(String(body?.agendadaPara || ""));
      if (Number.isNaN(agendadaPara.getTime()) || agendadaPara.getTime() <= Date.now()) {
        return NextResponse.json({ error: "Indique uma data e hora futura para o lembrete." }, { status: 400 });
      }
      const draft = await prisma.comunicacao.create({ data: {
        tipo,
        canal: "approval",
        destinatario: destinatario || null,
        assunto: assunto || null,
        mensagem,
        status: "rascunho",
        proximaTentativa: agendadaPara,
        enviadoPor: access.email || null,
      } });
      return NextResponse.json({ ok: true, draftId: draft.id, status: "rascunho" });
    }
    if (tipo === "EMAIL" && senderAccount !== undefined && !isEmailConfigured(senderAccount)) {
      return NextResponse.json({ error: "Conta de email nao configurada. Contacte a administracao.", code: "EMAIL_NOT_CONFIGURED" }, { status: 503 });
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
      ...(tipo === "EMAIL" && senderAccount !== undefined ? { senderAccount } : {}),
      ref,
      enviadoPor: operador?.name || operador?.email || String(access.userId),
    }, { authenticatedEmail: access.email });

    // A manual WhatsApp link is not evidence that a reply was sent.
    if (result.ok && result.status !== "pendente" && !result.whatsappUrl && destinatario && body?.responderA != null) {
      const recebidaId = Number(body.responderA);
      if (Number.isFinite(recebidaId) && recebidaId > 0) {
        await prisma.comunicacao.updateMany({
          where: { id: recebidaId, status: "recebido", tipo, destinatario },
          data: { respondidoEm: new Date() },
        }).catch(() => {});
      }
    }

    return NextResponse.json(
      result.ok
        ? { ok: true, comunicacaoId: result.comunicacaoId, whatsappUrl: result.whatsappUrl, status: result.status, providerId: result.providerId }
        : { error: result.erro || "Falha ao enviar comunicação.", comunicacaoId: result.comunicacaoId, status: result.closed ? "closed" : result.status, closed: result.closed, uncertain: result.uncertain },
      { status: result.ok ? 200 : result.closed || result.uncertain ? 409 : 400 },
    );
  } catch (error) {
    console.error("[POST /api/comunicacoes] Falha ao processar envio.");
    return NextResponse.json({ error: "Erro ao enviar comunicação." }, { status: 500 });
  }
}
