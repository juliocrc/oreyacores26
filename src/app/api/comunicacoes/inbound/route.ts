import { NextRequest, NextResponse } from "next/server";
import { registarComunicacaoRecebida, ComunicacaoTipo } from "@/lib/communications";

export const runtime = "nodejs";

/**
 * Endpoint público para receber comunicações inbound de providers externos
 * (SMS/Telegram/Email/WhatsApp). Requer segredo no header `x-inbound-secret`
 * configurado em COMUNICACOES_INBOUND_SECRET no ambiente.
 *
 * Body:
 *   { tipo: "SMS"|"WHATSAPP"|"EMAIL",
 *     mensagem: string,
 *     remetente: string,
 *     nomeRemetente?: string,
 *     canal?: string,
 *     providerId?: string,
 *     assunto?: string,
 *     recebidoEm?: ISO,
 *     clienteId?, jangadaId?, ordemServicoId?, refTipo?, refId? }
 */
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.COMUNICACOES_INBOUND_SECRET || "";
    if (!secret.trim()) {
      return NextResponse.json({ error: "Webhook inbound não configurado." }, { status: 503 });
    }
    const header = req.headers.get("x-inbound-secret") || "";
    if (header !== secret) {
      return NextResponse.json({ error: "Segredo inválido." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const tipo = String(body?.tipo || "").toUpperCase();
    const mensagem = String(body?.mensagem || body?.message || body?.text || "").trim();
    const remetente = String(body?.remetente || body?.from || body?.sender || body?.phone || "").trim();

    if (tipo !== "SMS" && tipo !== "WHATSAPP" && tipo !== "EMAIL") {
      return NextResponse.json({ error: "Tipo de comunicação inválido." }, { status: 400 });
    }
    if (!mensagem || !remetente) {
      return NextResponse.json({ error: "mensagem e remetente são obrigatórios." }, { status: 400 });
    }

    const resultado = await registarComunicacaoRecebida({
      tipo: tipo as ComunicacaoTipo,
      mensagem,
      remetente,
      nomeRemetente: body?.nomeRemetente ? String(body.nomeRemetente) : undefined,
      canal: body?.canal ? String(body.canal) : undefined,
      providerId: body?.providerId ? String(body.providerId) : undefined,
      assunto: body?.assunto ? String(body.assunto) : undefined,
      recebidoEm: body?.recebidoEm ? new Date(String(body.recebidoEm)) : new Date(),
      ref: {
        refTipo: body?.refTipo ? String(body.refTipo) : undefined,
        refId: body?.refId != null ? Number(body.refId) : null,
        clienteId: body?.clienteId != null ? Number(body.clienteId) : null,
        jangadaId: body?.jangadaId != null ? Number(body.jangadaId) : null,
        ordemServicoId: body?.ordemServicoId != null ? Number(body.ordemServicoId) : null,
      },
    });

    return NextResponse.json(
      resultado.ok
        ? {
            ok: true,
            duplicada: resultado.duplicada ?? false,
            comunicacaoId: resultado.comunicacaoId,
            clienteId: resultado.clienteId,
            clienteNome: resultado.clienteNome,
          }
        : { error: "Não foi possível registar a comunicação." },
      { status: resultado.ok ? 200 : 400 },
    );
  } catch (error) {
    console.error("[POST /api/comunicacoes/inbound]", error);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
