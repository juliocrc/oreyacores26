import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendSms } from "@/lib/sms-provider";
import { enviarComunicacao } from "@/lib/communications";
import { generateFiveDigitCode } from "@/lib/code";
import { sendEmail, isEmailConfigured } from "@/lib/email-sender";

function cleanPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

const CHANNELS = ["sms", "whatsapp", "email"] as const;
type Channel = (typeof CHANNELS)[number];

function isChannel(v: unknown): v is Channel {
  return typeof v === "string" && (CHANNELS as readonly string[]).includes(v.toLowerCase());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
    }

    const { telmovel, nif, channel, email } = body as {
      telmovel?: string;
      nif?: string;
      channel?: string;
      email?: string;
    };

    const chosenChannel = isChannel(channel) ? channel.toLowerCase() : "sms";
    if (chosenChannel === "whatsapp" && !telmovel) {
      return NextResponse.json({ error: "Indique o telemóvel para receber o código por WhatsApp." }, { status: 400 });
    }
    if (chosenChannel === "email" && !email) {
      return NextResponse.json({ error: "Indique o email para receber o código por email." }, { status: 400 });
    }

    const hasTelmovel = Boolean(telmovel);
    if (!hasTelmovel && chosenChannel !== "email") {
      return NextResponse.json({ error: "Telemóvel é obrigatório." }, { status: 400 });
    }
    if (!nif) {
      return NextResponse.json({ error: "NIF é obrigatório." }, { status: 400 });
    }

    const cleanedTarget = hasTelmovel ? cleanPhone(telmovel) : "";
    if (hasTelmovel && !cleanedTarget) {
      return NextResponse.json({ error: "Número de telemóvel inválido." }, { status: 400 });
    }

    const cleanNif = nif.replace(/\D/g, "").trim();
    if (cleanNif.length < 9) {
      return NextResponse.json({ error: "NIF inválido." }, { status: 400 });
    }

    const rateKey = `client-code:${cleanNif}:${chosenChannel}`;
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
        email: true,
      },
    });

    if (!cliente) {
      return NextResponse.json({ error: "Cliente não encontrado com este NIF." }, { status: 404 });
    }

    if (chosenChannel === "email") {
      const cleanEmail = String(email || "").trim().toLowerCase();
      const registeredEmail = String(cliente.email || "").trim().toLowerCase();
      if (!registeredEmail || registeredEmail !== cleanEmail) {
        return NextResponse.json(
          { error: "O email não corresponde ao registado para este cliente." },
          { status: 403 },
        );
      }
    } else {
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

    if (chosenChannel === "whatsapp") {
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
        return NextResponse.json({ error: "Não foi possível preparar o envio por WhatsApp." }, { status: 500 });
      }
    }

    if (chosenChannel === "email") {
      if (!isEmailConfigured()) {
        return NextResponse.json(
          { error: "O envio por email não está configurado. Contacte a Orey Técnica Açores." },
          { status: 500 },
        );
      }
      const emailAddress = String(cliente.email || email || "").trim();
      if (!emailAddress) {
        return NextResponse.json({ error: "O cliente não tem email registado." }, { status: 400 });
      }
      const emailResult = await sendEmail({
        to: emailAddress,
        subject: "O seu código de acesso ao Gestor Naval Pro",
        text: msg,
      });
      if (!emailResult.ok) {
        console.error("[client-code] Email send error:", emailResult.error);
        return NextResponse.json({ error: emailResult.error || "Não foi possível enviar o email." }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: "Código enviado por email." });
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
