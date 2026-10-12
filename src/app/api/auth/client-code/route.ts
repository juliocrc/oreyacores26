import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateFiveDigitCode } from "@/lib/code";
import { sendEmail, isEmailConfigured } from "@/lib/email-sender";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
    }

    const { email } = body as {
      email?: string;
    };
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanEmail) {
      return NextResponse.json({ error: "Indique o email para receber o código por email." }, { status: 400 });
    }
    const rateKey = `client-code:${cleanEmail}`;
    const { allowed, retryAfterMs } = checkRateLimit(rateKey, 3, 10 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { error: `Demasiadas tentativas. Tente novamente em ${Math.ceil(retryAfterMs / 60000)} minuto(s).` },
        { status: 429 },
      );
    }

    const cliente = await prisma.cliente.findFirst({
      where: { email: cleanEmail },
      select: {
        id: true,
        nome: true,
        email: true,
      },
    });

    if (!cliente) {
       return NextResponse.json({ error: "Não existe um cliente com este email." }, { status: 404 });
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

    const msg = `O seu código de acesso ao Gestor Naval Pro é: ${code}\nVálido por 10 minutos.\n\nOrey Técnica Açores`;
    if (!isEmailConfigured()) {
      return NextResponse.json({ error: "O envio por email não está configurado. Contacte a Orey Técnica Açores." }, { status: 500 });
    }
    const emailResult = await sendEmail({ to: cleanEmail, subject: "O seu código de acesso ao Gestor Naval Pro", text: msg });
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
