import { isInfinireachConfigured, sendInfinireachSms } from "./infinireach-sms";

export type SmsProviderName = "infinireach";

export type SmsSendResult = {
  ok: boolean;
  error?: string;
  /** Provider que tratou o envio (quando ok). */
  provider?: SmsProviderName;
  /** Provider identifier, when the delivery API supplies one. */
  providerId?: string;
  uncertain?: boolean;
};

/**
 * SMS usa exclusivamente InfiniReach.
 * Uma falha de envio nao provoca reenvio automatico por outro fornecedor.
 */
export async function sendSms(
  phoneRaw: string,
  message: string,
): Promise<SmsSendResult> {
  if (isInfinireachConfigured()) {
    const result = await sendInfinireachSms(phoneRaw, message);
    return {
      ok: result.ok,
      error: result.error,
      uncertain: result.uncertain,
      providerId: result.providerId,
      provider: result.ok ? "infinireach" : undefined,
    };
  }

  return {
    ok: false,
    error:
      "SMS nao configurado. Defina INFINIREACH_API_KEY/INFINIREACH_FROM.",
  };
}

export function smsProviderName(): "InfiniReach" | null {
  if (isInfinireachConfigured()) return "InfiniReach";
  return null;
}
