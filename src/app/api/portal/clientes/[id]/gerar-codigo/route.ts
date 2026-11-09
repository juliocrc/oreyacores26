import { NextResponse } from 'next/server';
import { getAuthSession } from '@/auth';
import prisma from '@/lib/prisma';
import { generateFiveDigitCode } from '@/lib/code';
import { checkRateLimit } from '@/lib/rate-limit';
import { PORTAL_ACCESS_CODE_TTL_MS } from '@/lib/portal-access-code';
import { isEmailConfigured, sendEmail } from '@/lib/email-sender';
import { sendWhatsAppSystem, whatsappApiConfigurado } from '@/lib/whatsapp-provider';
import { isWhatsAppAllowedEmail } from '@/lib/whatsapp-allowed';
import { normalizeE164 } from '@/lib/textbee-sms';
import { isOpenwaSelected } from '@/lib/openwa';
import { openwaBusinessHours, OPENWA_HOURS } from '@/lib/business-hours';

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'ADMIN') {
      return json({ error: 'Apenas administradores podem gerar códigos.' }, 403);
    }
    const text = await request.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      return json({ error: 'Pedido invalido.' }, 400);
    }
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some(key => key !== 'channel') ||
      (body.channel !== undefined && body.channel !== 'email' && body.channel !== 'whatsapp')
    ) {
      return json({ error: 'Canal ou pedido invalido.' }, 400);
    }
    const channel = body.channel as 'email' | 'whatsapp' | undefined;
    if (channel === 'whatsapp' && !isWhatsAppAllowedEmail(session.user.email)) {
      return json({ error: 'WhatsApp disponivel apenas para o administrador autorizado.' }, 403);
    }
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) return json({ error: 'Cliente inválido.' }, 400);
    const adminLimit = await checkRateLimit(
      `client-code:admin:${session.user.id}`,
      20,
      10 * 60 * 1000,
    );
    const rate = adminLimit.allowed
      ? await checkRateLimit(`client-code:id:${id}`, 3, 10 * 60 * 1000)
      : adminLimit;
    if (rate.status === 503) return json({ error: 'Servico temporariamente indisponivel.' }, 503);
    if (!rate.allowed) {
      return json({ error: 'Demasiadas tentativas. Tente novamente mais tarde.' }, 429);
    }
    const cliente = await prisma.cliente.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        telefone: true,
        telmovel: true,
        verificationCode: true,
        verificationCodeExpires: true,
        portalAtivo: true,
      },
    });
    if (!cliente) return json({ error: 'Cliente não encontrado.' }, 404);
    if (!cliente.portalAtivo) {
      return json({ error: 'O acesso ao portal está suspenso. Reative o acesso antes de gerar um código.' }, 403);
    }
    let target = '';
    if (channel === 'email') {
      target = String(cliente.email || '').trim();
      if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(target))
        return json({ error: 'Email do cliente em falta ou invalido.' }, 400);
      if (!isEmailConfigured()) return json({ error: 'Envio por email nao configurado.' }, 503);
    }
    if (channel === 'whatsapp') {
      target = normalizeE164(cliente.telmovel?.trim() || cliente.telefone || '') || '';
      if (!target) return json({ error: 'Telefone do cliente em falta ou invalido.' }, 400);
      if (!whatsappApiConfigurado()) return json({ error: 'Envio WhatsApp nao configurado.' }, 503);
      if (isOpenwaSelected() && !openwaBusinessHours().open)
        return json({ error: `WhatsApp: ${OPENWA_HOURS}`, closed: true }, 409);
    }
    const reusable =
      channel &&
      /^\d{5}$/.test(cliente.verificationCode || '') &&
      cliente.verificationCodeExpires &&
      cliente.verificationCodeExpires.getTime() > Date.now();
    const code = reusable ? cliente.verificationCode! : generateFiveDigitCode();
    const expiresAt = reusable
      ? cliente.verificationCodeExpires!
      : new Date(Date.now() + PORTAL_ACCESS_CODE_TTL_MS);
    if (!reusable)
      await prisma.cliente.update({
        where: { id },
        data: { verificationCode: code, verificationCodeExpires: expiresAt },
      });
    if (!channel) return json({ success: true, code, expiresAt });
    const message = `O seu codigo de acesso ao Gestor Naval Pro e: ${code}\nValido ate ${expiresAt.toISOString()} (validade maxima: 24 horas). Utilizacao unica.\n\nOrey Tecnica Acores`;
    if (channel === 'email') {
      const result = await sendEmail({
        to: target,
        subject: 'Codigo de acesso ao Gestor Naval Pro',
        text: message,
      });
      if (!result.ok)
        return json({ error: 'Nao foi possivel enviar o email. Verifique antes de repetir.' }, 502);
      return json({
        success: true,
        status: 'enviado',
        target,
        expiresAt,
        message: 'Codigo enviado por email.',
      });
    }
    const result = await sendWhatsAppSystem(target, message);
    if (result.uncertain)
      return json(
        {
          error: 'Envio WhatsApp sem confirmacao. Nao repita sem verificar o historico.',
          uncertain: true,
          status: 'pendente',
        },
        409,
      );
    if (!result.ok)
      return json(
        {
          error: result.closed
            ? `WhatsApp: ${OPENWA_HOURS}`
            : 'Nao foi possivel enviar por WhatsApp. Verifique antes de repetir.',
          closed: !!result.closed,
        },
        result.closed ? 409 : 502,
      );
    return json({
      success: true,
      status: 'pendente',
      target,
      expiresAt,
      message: 'Pedido WhatsApp aceite; entrega por confirmar.',
    });
  } catch {
    return json(
      {
        error:
          'Erro ao processar o codigo. Se pediu envio, verifique o historico antes de repetir.',
      },
      500,
    );
  }
}
