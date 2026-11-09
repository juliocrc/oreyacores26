import { NextResponse } from "next/server";
import { isWhatsAppAllowed, whatsappApiConfigurado } from "@/lib/whatsapp-provider";
import { isZapierWhatsAppConfigured } from "@/lib/zapier-webhook";
import { isInfinireachConfigured } from "@/lib/infinireach-sms";
import { isOpenwaConfigured, isOpenwaSelected } from "@/lib/openwa";
import { openwaBusinessHours } from "@/lib/business-hours";
import { getAccessContext } from "@/lib/access-control";
import { smsProviderName } from "@/lib/sms-provider";
import { getEmailSenderAccounts, isEmailConfigured } from "@/lib/email-sender";
import { isVoiceConfigured } from "@/lib/voice-call";
import { isSpeechConfigured } from "@/lib/speech-synthesis";
import { isTtsVoice } from "@/lib/tts-voices";
import { canUseEmailSenderProfiles } from "@/lib/email-sender-access";

/**
 * Estado de configuração real do módulo de comunicações (apenas booleans;
 * nunca expõe segredos). A rota está protegida pelo proxy (requer sessão).
 */
export async function GET() {
  const access = await getAccessContext();
  if (!access) return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  const wabaAccessToken = Boolean((process.env.WHATSAPP_ACCESS_TOKEN || "").trim());
  const wabaPhoneNumberId = Boolean((process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim());
  const webhookAppSecret = Boolean((process.env.WHATSAPP_APP_SECRET || "").trim());
  const webhookVerifyToken = Boolean((process.env.WHATSAPP_VERIFY_TOKEN || "").trim());
  const zapier = isZapierWhatsAppConfigured();
  const infinireach = isInfinireachConfigured();
  const waba = wabaAccessToken && wabaPhoneNumberId;

  const openwaSelected = isOpenwaSelected();
  const openwa = isOpenwaConfigured();
  const audioDelivery = openwaSelected ? openwa : infinireach;

  const provider = openwaSelected ? "OpenWA" : infinireach
    ? "InfiniReach"
      : zapier
        ? "Zapier"
        : waba
          ? "WABA Cloud API"
          : null;

  return NextResponse.json({
    configured: whatsappApiConfigurado(),
    canSend: whatsappApiConfigurado(),
    readinessRequired: openwaSelected,
    documents: { configured: !openwaSelected && waba, code: openwaSelected ? "OPENWA_DOCUMENT_UNSUPPORTED" : null },
    allowed: await isWhatsAppAllowed(),
    provider,
    email: { configured: isEmailConfigured(), accounts: canUseEmailSenderProfiles(access.email) ? getEmailSenderAccounts().map(({ id, email, label, configured }) => ({ id, email, label, configured })) : [] },
    voice: { configured: isVoiceConfigured(), provider: null, disabled: true, code: "VOICE_DISABLED", maxMessageLength: 1500 },
    openwa: { selected: openwaSelected, configured: openwa, statusUrl: "/api/comunicacoes/openwa", connectAction: "connect", disconnectSupported: false, ...openwaBusinessHours() },
    audio: {
      configured: audioDelivery && isSpeechConfigured(),
      speechConfigured: isSpeechConfigured(),
      deliveryConfigured: audioDelivery,
      provider: openwaSelected ? "OpenWA" : "InfiniReach",
      speechProvider: "Edge TTS",
      defaultVoice: isTtsVoice((process.env.TTS_VOICE ?? "pt-BR-AntonioNeural").trim()) ? (process.env.TTS_VOICE ?? "pt-BR-AntonioNeural").trim() : null,
      language: (process.env.TTS_VOICE ?? "pt-BR-AntonioNeural").trim().startsWith("pt-PT-") ? "pt-PT" : "pt-BR",
      maxMessageLength: 1500,
    },
    sms: {
      configured: infinireach,
      provider: smsProviderName(),
    },
    waba: {
      configured: waba,
      accessToken: wabaAccessToken,
      phoneNumberId: wabaPhoneNumberId,
      apiVersion: Boolean((process.env.WHATSAPP_API_VERSION || "").trim()),
    },
    zapier: {
      configured: zapier,
    },
    infinireach: {
      configured: infinireach,
    },
    webhookInbound: {
      appSecret: webhookAppSecret,
      verifyToken: webhookVerifyToken,
    },
    // O envio pela API é, por política, restringido ao utilizador autorizado.
    emailRestricted: true,
  }, { headers: { "Cache-Control": "no-store" } });
}
