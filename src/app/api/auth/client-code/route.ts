import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateFiveDigitCode } from "@/lib/code";
import { PORTAL_ACCESS_CODE_TTL_MS } from "@/lib/portal-access-code";
import { sendEmail, isEmailConfigured } from "@/lib/email-sender";
import { encontrarClientePorContacto } from "@/lib/communications";
import { sendWhatsAppSystem } from "@/lib/whatsapp-provider";
import { sendTextBeeSms } from "@/lib/textbee-sms";
import { OPENWA_HOURS } from "@/lib/business-hours";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Pedido invÃ¡lido." }, { status: 400 });
    }

    const { email, phone, channel } = body as { email?: string; phone?: string; channel?: "whatsapp" | "sms" | "email" };
    if (channel !== undefined && !["email", "sms", "whatsapp"].includes(channel)) {
      return NextResponse.json({ error: "Canal invalido." }, { status: 400 });
    }
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPhone = String(phone || "").replace(/\D/g, "");
    const suppliedNif = typeof body.nif === "string" ? body.nif.trim().toUpperCase() : "";

    if (!cleanEmail && !cleanPhone) {
      return NextResponse.json(
        { error: "Indique o email ou o nÃºmero de telemÃ³vel para receber o cÃ³digo." },
        { status: 400 },
      );
    }

    const rateKey = `client-code:${cleanPhone ? `phone:${cleanPhone}` : `email:${cleanEmail}`}`;
    const globalLimit = await checkRateLimit("client-code:global", 100, 10 * 60 * 1000);
    const rate = globalLimit.allowed ? await checkRateLimit(rateKey, 3, 10 * 60 * 1000) : globalLimit;
    if (rate.status === 503) return NextResponse.json({ error: "Servico temporariamente indisponivel." }, { status: 503 });
    const { allowed, retryAfterMs } = rate;
    if (!allowed) {
      return NextResponse.json(
        { error: `Demasiadas tentativas. Tente novamente em ${Math.ceil(retryAfterMs / 60000)} minuto(s).` },
        { status: 429 },
      );
    }

    let clienteId: number;
    let clienteEmail: string;
    let clientePhone: string = cleanPhone;
    let clienteNome: string | null = null;
    let serviceStationId: number | null = null;
    if (cleanPhone) {
      const match = await encontrarClientePorContacto(cleanPhone);
      if (!match) {
        return NextResponse.json(
          { error: "NÃ£o existe um cliente com este nÃºmero de telemÃ³vel.", registrationRequired: true },
          { status: 404 },
        );
      }
      const full = await prisma.cliente.findUnique({
        where: { id: match.id },
        select: { id: true, nif: true, nome: true, serviceStationId: true, email: true, telefone: true, telmovel: true, portalAtivo: true },
      });
      if (!full) {
        return NextResponse.json(
          { error: "NÃ£o existe um cliente com este nÃºmero de telemÃ³vel.", registrationRequired: true },
          { status: 404 },
        );
      }
      if (!full.portalAtivo) {
        return NextResponse.json({ error: "O acesso ao portal está suspenso. Contacte a Orey Técnica." }, { status: 403 });
      }
      if (suppliedNif && full.nif?.trim().toUpperCase() !== suppliedNif) {
        return NextResponse.json({ error: "O contacto e o NIF precisam de validacao pela equipa.", registrationRequired: true }, { status: 409 });
      }
      clienteId = full.id;
      clienteNome = full.nome;
      serviceStationId = full.serviceStationId;
      clienteEmail = String(full.email || "").trim().toLowerCase();
      clientePhone = cleanPhone;
    } else {
      const cliente = await prisma.cliente.findFirst({
        where: { email: cleanEmail, ...(suppliedNif ? { nif: suppliedNif } : {}) },
        select: { id: true, nome: true, serviceStationId: true, email: true, telefone: true, telmovel: true, portalAtivo: true },
      });
      if (!cliente) {
        return NextResponse.json({ error: "NÃ£o existe um cliente com este email.", registrationRequired: true }, { status: 404 });
      }
      if (!cliente.portalAtivo) {
        return NextResponse.json({ error: "O acesso ao portal está suspenso. Contacte a Orey Técnica." }, { status: 403 });
      }
      clienteId = cliente.id;
      clienteNome = cliente.nome;
      serviceStationId = cliente.serviceStationId;
      clienteEmail = String(cliente.email || "").trim().toLowerCase();
      clientePhone = String(cliente.telmovel || cliente.telefone || "").trim();
    }

    const clientLimit = await checkRateLimit(`client-code:id:${clienteId}`, 3, 10 * 60 * 1000);
    if (clientLimit.status === 503) return NextResponse.json({ error: "Servico temporariamente indisponivel." }, { status: 503 });
    if (!clientLimit.allowed) {
      return NextResponse.json({ error: "Demasiadas tentativas. Tente novamente mais tarde." }, { status: 429 });
    }

    const deliveryChannel = channel || "email";
    const description = `Pedido de acesso ao portal do cliente por ${deliveryChannel}. O contacto ainda nao foi autenticado. Ficha: /clientes/${clienteId}.`;
    // A durable assistance request also appears in the application's notification feed.
    const pedido = await prisma.pedidoAssistencia.create({ data: {
      nome: clienteNome || "Cliente",
      email: clienteEmail,
      telefone: clientePhone,
      serviceStationId: serviceStationId ?? null,
      tipoAssistencia: "Acesso ao portal do cliente",
      descricao: `${description}\nEstado: pedido recebido; envio por verificar.`,
      estado: "novo",
      origem: "portal_acesso",
      metadados: JSON.stringify({ clienteId, canalPedido: deliveryChannel, estadoEnvio: "por_verificar" }),
    } });
    const assistanceMessage = "O pedido ficou registado em Pedidos de Assistencia e a equipa foi avisada na aplicacao.";
    const finish = async (deliveryStatus: string, detail: string, payload: Record<string, unknown>, status = 200) => {
      await prisma.pedidoAssistencia.update({ where: { id: pedido.id }, data: {
        descricao: `${description}\nEstado: ${detail}`,
        metadados: JSON.stringify({ clienteId, canalPedido: deliveryChannel, estadoEnvio: deliveryStatus }),
      } }).catch(() => { console.error("[client-code] Nao foi possivel atualizar o estado do pedido de acesso."); });
      return NextResponse.json({ ...payload, assistanceRequested: true, message: assistanceMessage }, { status });
    };

    if (!clienteEmail) {
      return finish("aguarda_equipa", "cliente sem email. A equipa deve validar o pedido, gerar um codigo temporario na ficha e comunica-lo diretamente ao cliente.", {
        success: false, manualDelivery: true,
      }, 202);
    }

    if (deliveryChannel === "email" && !isEmailConfigured()) {
      return finish("nao_configurado", "email nao configurado; aguarda contacto da equipa.", {
        error: "O envio por email nao esta configurado. A equipa recebeu o seu pedido e pode fornecer um codigo temporario.",
      }, 503);
    }
    if (deliveryChannel !== "email" && !clientePhone) {
      return finish("sem_contacto", "telemovel nao registado; aguarda contacto da equipa.", {
        error: "Numero de telemovel nao registado para este cliente.",
      }, 400);
    }

    const code = generateFiveDigitCode();

    // Persist verification code regardless of channel so auth verify can validate
    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        verificationCode: code,
        verificationCodeExpires: new Date(Date.now() + PORTAL_ACCESS_CODE_TTL_MS),
      },
    });

    const msg = `O seu cÃ³digo de acesso ao Gestor Naval Pro Ã©: ${code}\nVÃ¡lido por 24 horas.\n\nOrey TÃ©cnica AÃ§ores`;

    if (deliveryChannel === "sms") {
      const targetPhone = cleanPhone || clientePhone;
      const smsResult = await sendTextBeeSms(targetPhone, msg);
      if (!smsResult.ok) {
        return finish("falhou", "envio SMS falhou; aguarda contacto da equipa.", { error: "NÃ£o foi possÃ­vel enviar o cÃ³digo por SMS." }, 500);
      }
      return finish("enviado", "codigo enviado por SMS.", { success: true });
    }

    if (deliveryChannel === "whatsapp") {
      const targetPhone = cleanPhone || clientePhone;
      const waResult = await sendWhatsAppSystem(targetPhone, msg);
      if (!waResult.ok) {
        const deliveryStatus = waResult.closed ? "fora_horario" : waResult.uncertain ? "pendente" : "falhou";
        return finish(deliveryStatus, waResult.closed ? "envio WhatsApp fora do horario; aguarda contacto da equipa."
          : waResult.uncertain ? "envio WhatsApp sem confirmacao; nao repetir sem verificar." : "envio WhatsApp falhou; aguarda contacto da equipa.",
          { error: waResult.closed ? `O envio WhatsApp funciona de ${OPENWA_HOURS} A equipa recebeu o seu pedido.`
            : waResult.uncertain ? "O envio WhatsApp esta sem confirmacao. Aguarde; nao repita o pedido agora."
            : "NÃ£o foi possÃ­vel enviar o cÃ³digo por WhatsApp. A equipa recebeu o seu pedido.",
            closed: waResult.closed, uncertain: waResult.uncertain, status: deliveryStatus },
          waResult.closed || waResult.uncertain ? 409 : 500);
      }
      return finish(waResult.accepted ? "pendente" : "enviado", waResult.accepted ? "pedido WhatsApp aceite; entrega por confirmar." : "codigo enviado por WhatsApp.", {
        success: true, ...(waResult.accepted ? { status: "pendente" } : {}),
      });
    }

    const emailResult = await sendEmail({ to: clienteEmail, subject: "O seu cÃ³digo de acesso ao Gestor Naval Pro", text: msg });
    if (!emailResult.ok) {
      return finish("falhou", "envio de email falhou; aguarda contacto da equipa.", { error: "NÃ£o foi possÃ­vel enviar o email." }, 500);
    }
    return finish("enviado", "codigo enviado por email.", { success: true });
  } catch {
    console.error("[client-code] Erro ao emitir codigo de acesso.");
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}
