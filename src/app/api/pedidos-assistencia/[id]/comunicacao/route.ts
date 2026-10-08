import { NextRequest, NextResponse } from "next/server";
import { getApiSessionToken } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import {
  buildWhatsAppUrl,
  registarComunicacaoManual,
  type ComunicacaoTipo,
} from "@/lib/communications";

export const runtime = "nodejs";

function parseIdFromRequest(req: NextRequest) {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const rawId = segments[segments.length - 2];
  const id = Number(rawId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function buildPedidoContextLabel(pedido: { tipoAssistencia: string | null; navio: string | null }) {
  const parts = [
    pedido.tipoAssistencia ? `Tipo: ${pedido.tipoAssistencia}` : "",
    pedido.navio ? `Navio: ${pedido.navio}` : "",
  ].filter(Boolean);
  return parts.length ? `${parts.join(" · ")}.` : "";
}

// POST /api/pedidos-assistencia/[id]/comunicacao
// Regista uma comunicação (whatsapp/chamada/email/sms) relacionada com o pedido.
// Não envia nada por si só — os links wa.me e as chamadas são acionados no browser.
export async function POST(req: NextRequest) {
  try {
    const token = await getApiSessionToken(req);
    if (!token?.sub && !token?.email) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }

    const id = parseIdFromRequest(req);
    if (!id) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const pedido = await prisma.pedidoAssistencia.findUnique({ where: { id } });
    if (!pedido) {
      return NextResponse.json({ error: "Pedido de assistência não encontrado." }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    const tipoRaw = String(body?.tipo || "whatsapp").trim().toLowerCase();
    const canalNome = String(body?.canal || "").trim();

    if (!["whatsapp", "chamada", "email", "sms"].includes(tipoRaw)) {
      return NextResponse.json({ error: "tipo inválido (whatsapp | chamada | email | sms)." }, { status: 400 });
    }

    const tipo: ComunicacaoTipo =
      tipoRaw === "chamada" ? "CHAMADA" : tipoRaw === "email" ? "EMAIL" : tipoRaw === "sms" ? "SMS" : "WHATSAPP";

    const mensagem = String(body?.mensagem || "").trim() || [
      `Olá ${pedido.nome || "Exmo. Cliente"},`,
      "",
      `Referente ao seu pedido de assistência #${pedido.id}${buildPedidoContextLabel(pedido) ? ` (${buildPedidoContextLabel(pedido)})` : ""}`,
      "Estamos à sua disposição para agendar a intervenção.",
      "",
      "Orey Azores",
    ].join("\n");

    const destinatario =
      (tipoRaw === "email"
        ? String(body?.destinatario || "") || String(pedido.email || "").trim()
        : String(body?.destinatario || "") || String(pedido.telefone || "").trim());

    const mensagemTrim = String(mensagem || "").trim();
    if (!destinatario || !mensagemTrim) {
      return NextResponse.json(
        { error: tipoRaw === "email" ? "O pedido não tem email associado." : "O pedido não tem telemóvel associado." },
        { status: 400 },
      );
    }

    const canal = canalNome || (tipoRaw === "whatsapp" ? "wa.me" : tipoRaw === "email" ? "email" : tipoRaw === "sms" ? "textbee" : "chamada");
    const status = tipoRaw === "whatsapp" ? "pendente" : "enviado";

    const result = await registarComunicacaoManual({
      tipo,
      canal,
      destinatario,
      mensagem: mensagemTrim,
      status,
      ref: { refTipo: "PedidoAssistencia", refId: pedido.id },
      enviadoPor: token?.email || "sistema",
    });

    if (!result.ok) {
      return NextResponse.json({ error: "Não foi possível registar a comunicação." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      comunicacaoId: result.comunicacaoId,
      tipo,
      canal,
      status,
      destinatario,
      whatsappUrl: tipoRaw === "whatsapp" ? buildWhatsAppUrl(destinatario, mensagemTrim) : undefined,
    }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/pedidos-assistencia/[id]/comunicacao]", error);
    return NextResponse.json({ error: "Erro ao registar comunicação." }, { status: 500 });
  }
}