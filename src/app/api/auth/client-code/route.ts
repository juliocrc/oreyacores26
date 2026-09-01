import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendSms } from "@/lib/sms-provider";
import { enviarComunicacao } from "@/lib/communications";
import { generateFiveDigitCode } from "@/lib/code";

function cleanPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
    }

    const { telmovel, nif, channel } = body as { telmovel?: string; nif?: string; channel?: string };

    if (!telmovel || !nif) {
      return NextResponse.json({ error: "Telemóvel e NIF são obrigatórios." }, { status: 400 });
    }

    const cleanedTarget = cleanPhone(telmovel);
    if (!cleanedTarget) {
      return NextResponse.json({ error: "Número de telemóvel inválido." }, { status: 400 });
    }

    const cleanNif = nif.replace(/\D/g, "").trim();
    if (cleanNif.length < 9) {
      return NextResponse.json({ error: "NIF inválido." }, { status: 400 });
    }

    const rateKey = `client-code:${cleanedTarget}`;
    const { allowed, retryAfterMs } = checkRateLimit(rateKey, 3, 10 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { error: `Demasiadas tentativas. Tente novamente em ${Math.ceil(retryAfterMs / 60000)} minuto(s).` },
        { status: 429 },
      );
    }

    const cliente = await prisma.cliente.findFirst({
      where: { nif: cleanNif },
      select: {
        id: true,
        nome: true,
        telmovel: true,
        telefone: true,
      },
    });

    if (!cliente) {
      return NextResponse.json({ error: "Cliente não encontrado com este NIF." }, { status: 404 });
    }

    const phoneMatch = (() => {
      const t1 = cleanPhone(cliente.telmovel);
      const t2 = cleanPhone(cliente.telefone);
      return (
        (t1 && t1.endsWith(cleanedTarget)) ||
        (t2 && t2.endsWith(cleanedTarget)) ||
        (cleanedTarget.endsWith(t1) && t1) ||
        (cleanedTarget.endsWith(t2) && t2)
      );
    })();

    if (!phoneMatch) {
      return NextResponse.json(
        { error: "O telemóvel não corresponde ao registado para este cliente." },
        { status: 403 },
      );
    }

    const code = generateFiveDigitCode();

    // Persist verification code regardless of channel so auth.verify can validate
    await prisma.cliente.update({
      where: { id: cliente.id },
      data: {
        verificationCode: code,
        verificationCodeExpires: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const phone = String(cliente.telmovel || "").trim() || String(cliente.telefone || "").trim();
    const msg = `O seu código de acesso ao Gestor Naval Pro é: ${code}\nVálido por 10 minutos.\n\nOrey Técnica Açores`;

    const chosen = String(channel || "sms").toLowerCase();
    if (chosen === "whatsapp") {
      try {
        const res = await enviarComunicacao({
          tipo: "WHATSAPP",
          mensagem: msg,
          destinatario: phone,
          ref: { clienteId: cliente.id },
        });
        return NextResponse.json({ success: true, message: "Código registado.", whatsappUrl: res.whatsappUrl });
      } catch (e) {
        console.error("[client-code] WhatsApp send error:", e);
        // fallthrough to SMS attempt
      }
    }

    if (phone) {
      const smsResult = await sendSms(phone, msg);
      if (!smsResult.ok) {
        console.error("[client-code] SMS falhou:", smsResult.error);
      }
    }

    return NextResponse.json({ success: true, message: "Código enviado com sucesso." });
  } catch (error) {
    console.error("[client-code] Erro:", error);
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}
