import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateFiveDigitCode } from "@/lib/code";
import { sendEmail, isEmailConfigured } from "@/lib/email-sender";
import { encontrarClientePorContacto } from "@/lib/communications";
import { sendWhatsAppSystem } from "@/lib/whatsapp-provider";
import { sendTextBeeSms } from "@/lib/textbee-sms";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
    }

    const { email, phone, channel } = body as { email?: string; phone?: string; channel?: "whatsapp" | "sms" | "email" };
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPhone = String(phone || "").trim();

    if (!cleanEmail && !cleanPhone) {
      return NextResponse.json(
        { error: "Indique o email ou o número de telemóvel para receber o código." },
        { status: 400 },
      );
    }

    const rateKey = `client-code:${cleanPhone || cleanEmail}`;
    const { allowed, retryAfterMs } = checkRateLimit(rateKey, 3, 10 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { error: `Demasiadas tentativas. Tente novamente em ${Math.ceil(retryAfterMs / 60000)} minuto(s).` },
        { status: 429 },
      );
    }

    let clienteId: number;
    let clienteEmail: string;
    let clientePhone: string = cleanPhone;
    if (cleanPhone) {
      const match = await encontrarClientePorContacto(cleanPhone);
      if (!match) {
        return NextResponse.json(
          { error: "Não existe um cliente com este número de telemóvel." },
          { status: 404 },
        );
      }
      const full = await prisma.cliente.findUnique({
        where: { id: match.id },
        select: { id: true, email: true, telefone: true, telmovel: true },
      });
      if (!full) {
        return NextResponse.json(
          { error: "Não existe um cliente com este número de telemóvel." },
          { status: 404 },
        );
      }
      clienteId = full.id;
      clienteEmail = String(full.email || "").trim().toLowerCase();
      clientePhone = cleanPhone;
    } else {
      const cliente = await prisma.cliente.findFirst({
        where: { email: cleanEmail },
        select: { id: true, email: true, telefone: true, telmovel: true },
      });
      if (!cliente) {
        return NextResponse.json({ error: "Não existe um cliente com este email." }, { status: 404 });
      }
      clienteId = cliente.id;
      clienteEmail = String(cliente.email || "").trim().toLowerCase();
      clientePhone = String(cliente.telmovel || cliente.telefone || "").trim();
    }

    const code = generateFiveDigitCode();

    // Persist verification code regardless of channel so auth verify can validate
    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        verificationCode: code,
        verificationCodeExpires: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const msg = `O seu código de acesso ao Gestor Naval Pro é: ${code}\nVálido por 10 minutos.\n\nOrey Técnica Açores`;

    if (channel === "sms") {
      const targetPhone = cleanPhone || clientePhone;
      if (!targetPhone) {
        return NextResponse.json({ error: "Número de telemóvel não registado para este cliente." }, { status: 400 });
      }
      const smsResult = await sendTextBeeSms(targetPhone, msg);
      if (!smsResult.ok) {
        return NextResponse.json({ error: smsResult.error || "Não foi possível enviar o código por SMS." }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: "Código enviado por SMS." });
    }

    if (channel === "whatsapp" || cleanPhone) {
      const targetPhone = cleanPhone || clientePhone;
      const waResult = await sendWhatsAppSystem(targetPhone, msg);
      if (!waResult.ok) {
        console.error("[client-code] WhatsApp send error:", waResult.erro);
        return NextResponse.json(
          { error: waResult.erro || "Não foi possível enviar o código por WhatsApp." },
          { status: 500 },
        );
      }
      return NextResponse.json({ success: true, message: "Código enviado por WhatsApp." });
    }

    if (!isEmailConfigured()) {
      return NextResponse.json({ error: "O envio por email não está configurado. Contacte a Orey Técnica Açores." }, { status: 500 });
    }
    const emailResult = await sendEmail({ to: clienteEmail, subject: "O seu código de acesso ao Gestor Naval Pro", text: msg });
    if (!emailResult.ok) {
      console.error("[client-code] Email send error:", emailResult.error);
      return NextResponse.json({ error: emailResult.error || "Não foi possível enviar o email." }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: "Código enviado por email." });
  } catch (error) {
    console.error("[client-code] Erro:", error);
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}
