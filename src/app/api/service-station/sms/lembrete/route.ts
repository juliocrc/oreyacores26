import { NextRequest, NextResponse } from "next/server";
import {
  notifyJangadaLembreteValidade,
  recordComunicacao,
  resolveLembreteValidadeInfo,
  tryNotifySms,
} from "@/lib/notify-jangada-sms";
import { isWhatsAppAllowed } from "@/lib/whatsapp-provider";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const raftId = Number(req.nextUrl.searchParams.get("raftId"));
    const dataProxInspecao = String(req.nextUrl.searchParams.get("dataProxInspecao") || "") || null;

    if (!Number.isFinite(raftId) || raftId <= 0) {
      return NextResponse.json({ error: "raftId inválido." }, { status: 400 });
    }

    const info = await resolveLembreteValidadeInfo(raftId, dataProxInspecao);
    if (!info) {
      return NextResponse.json({ error: "Cliente/telemóvel não encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      raftId,
      name: info.name,
      phone: info.phone,
      serial: info.serial,
      message: info.message,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao preparar lembrete.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const raftId = Number(body?.raftId);
    const channel = String(body?.channel || "sms") as "sms" | "whatsapp";
    const dataProxInspecao = String(body?.dataProxInspecao || "") || null;
    const customText = String(body?.text || "").trim();

    if (!Number.isFinite(raftId) || raftId <= 0) {
      return NextResponse.json({ error: "raftId inválido." }, { status: 400 });
    }

    const info = await resolveLembreteValidadeInfo(raftId, dataProxInspecao);
    if (!info) {
      return NextResponse.json({ error: "Cliente/telemóvel não encontrado." }, { status: 404 });
    }

    // Usa o texto editado pelo operador se fornecido, senao o template
    const message = customText.trim() ? customText.trim() : info.message;

    if (channel === "whatsapp") {
      // WhatsApp apenas funcional para o administrador Júlio Correia
      if (!(await isWhatsAppAllowed())) {
        return NextResponse.json(
          { ok: false, error: "WhatsApp disponível apenas para o administrador Júlio Correia." },
          { status: 403 },
        );
      }
      // Wa.me exige nº internacional sem "+", apenas dígitos
      const digits = info.phone.replace(/\D/g, "");
      const intl = digits.startsWith("351") ? digits : `351${digits}`;
      const url = `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
      await recordComunicacao({
        jangadaId: raftId,
        serial: info.serial,
        channel: "whatsapp",
        clientName: info.name,
        phone: info.phone,
        message,
        ok: true,
      });
      return NextResponse.json({ ok: true, url, message, phone: info.phone });
    }

    const result = await tryNotifySms<{ sent: boolean; pending?: boolean; reason?: string; phone?: string; message?: string }>(() =>
      notifyJangadaLembreteValidade(raftId, {
        dataProxInspecao: dataProxInspecao || null,
        useConfig: false,
        confirmada: true,
        customText: customText.trim() || undefined,
      }),
    );

    return NextResponse.json(
      result.sent
        ? { ok: true, message: "Lembrete SMS enviado." }
        : { ok: false, error: result.reason || "Falha ao enviar SMS." },
      result.sent ? {} : { status: 400 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao processar lembrete.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}