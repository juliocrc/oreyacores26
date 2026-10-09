import { NextResponse } from "next/server";
import { whatsappApiConfigurado } from "@/lib/whatsapp-provider";
import { isZapierWhatsAppConfigured } from "@/lib/zapier-webhook";

/**
 * Estado de configuração real do módulo WhatsApp (apenas booleans; nunca expõe
 * segredos). A rota está protegida pelo proxy (requer sessão autenticada).
 */
export async function GET() {
  const wabaAccessToken = Boolean((process.env.WHATSAPP_ACCESS_TOKEN || "").trim());
  const wabaPhoneNumberId = Boolean((process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim());
  const webhookAppSecret = Boolean((process.env.WHATSAPP_APP_SECRET || "").trim());
  const webhookVerifyToken = Boolean((process.env.WHATSAPP_VERIFY_TOKEN || "").trim());
  const zapier = isZapierWhatsAppConfigured();

  return NextResponse.json({
    canSend: whatsappApiConfigurado(),
    waba: {
      configured: wabaAccessToken && wabaPhoneNumberId,
      accessToken: wabaAccessToken,
      phoneNumberId: wabaPhoneNumberId,
      apiVersion: Boolean((process.env.WHATSAPP_API_VERSION || "").trim()),
    },
    zapier: {
      configured: zapier,
    },
    webhookInbound: {
      appSecret: webhookAppSecret,
      verifyToken: webhookVerifyToken,
    },
    // O envio pela API é, por política, restringido ao utilizador autorizado.
    emailRestricted: true,
  });
}