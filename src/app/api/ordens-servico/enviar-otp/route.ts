import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import prisma from "@/lib/prisma";
import { sendSms } from "@/lib/sms-provider";

// Armazenamento em memória volátil para validação de OTP (em produção usaria Redis ou BD)
const otpStore = new Map<string, { code: string; expiresAt: number; orderId: number }>();

function getClientePhone(phoneRaw?: string, cliente?: { telefone?: string | null; telmovel?: string | null } | null): string | null {
  // O telemóvel da ficha do cliente tem prioridade sobre o número passado manualmente
  if (cliente?.telmovel && String(cliente.telmovel).trim()) return String(cliente.telmovel).trim();
  if (cliente?.telefone && String(cliente.telefone).trim()) return String(cliente.telefone).trim();
  if (phoneRaw && String(phoneRaw).trim()) return String(phoneRaw).trim();
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { orderId, phone: phoneOverride } = body;

    if (!orderId) {
      return NextResponse.json({ error: "ID da ordem de serviço obrigatório." }, { status: 400 });
    }

    // Obter a ordem e respetivo cliente para resolver o número de telemóvel
    const ordem = await prisma.ordemServico.findUnique({
      where: { id: Number(orderId) },
      include: {
        cliente: { select: { telefone: true, telmovel: true, nome: true } },
        jangada: { select: { serial: true, owner: true } },
      },
    });

    const phone = getClientePhone(phoneOverride, ordem?.cliente);
    if (!phone) {
      return NextResponse.json(
        { error: "Sem número de telemóvel do cliente para envio do OTP. Indique um número manualmente." },
        { status: 400 },
      );
    }

    const otpCode = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutos

    otpStore.set(String(orderId), { code: otpCode, expiresAt, orderId: Number(orderId) });

    const clienteNome = ordem?.cliente?.nome || ordem?.jangada?.owner || "Cliente";
    const ordemNum = ordem?.numeroOrdem || orderId;
    const message =
      `Orey Tecnica- Serviços Navais, Lda: Código de confirmação ${otpCode} para a sua Ordem de Serviço #${ordemNum}. ` +
      `Válido por 10 minutos. Não partilhe este código com ninguém.`;

    const result = await sendSms(phone, message);

    if (!result.ok) {
      otpStore.delete(String(orderId));
      return NextResponse.json({ error: result.error || "Falha ao enviar SMS OTP." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Código OTP enviado por SMS para ${clienteNome} (${phone}).`,
    });
  } catch (error) {
    console.error("[POST /api/ordens-servico/enviar-otp]", error);
    return NextResponse.json({ error: "Erro ao gerar e enviar código OTP." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { orderId, code } = body;

    if (!orderId || !code) {
      return NextResponse.json({ error: "Ordem e código OTP obrigatórios." }, { status: 400 });
    }

    const record = otpStore.get(String(orderId));
    if (!record) {
      return NextResponse.json({ error: "Nenhum código OTP pendente para esta ordem." }, { status: 400 });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(String(orderId));
      return NextResponse.json({ error: "O código OTP expirou. Solicite um novo." }, { status: 400 });
    }

    if (record.code !== String(code).trim()) {
      return NextResponse.json({ error: "Código OTP inválido." }, { status: 400 });
    }

    otpStore.delete(String(orderId));

    return NextResponse.json({
      success: true,
      verified: true,
      message: "Assinatura digital validada com sucesso por OTP SMS.",
    });
  } catch (error) {
    console.error("[PUT /api/ordens-servico/enviar-otp]", error);
    return NextResponse.json({ error: "Erro ao validar OTP." }, { status: 500 });
  }
}
