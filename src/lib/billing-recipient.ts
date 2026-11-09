export const recipientFields = ["nome", "nif", "morada", "localidade", "ilha"] as const;
export type BillingRecipient = Record<(typeof recipientFields)[number], string>;

export function billingRecipient(client: unknown, draft?: unknown): BillingRecipient {
  const base = client && typeof client === "object" ? client as Record<string, unknown> : {};
  const override = draft && typeof draft === "object" ? draft as Record<string, unknown> : {};
  return Object.fromEntries(recipientFields.map(field => [field, String(override[field] ?? base[field] ?? "").trim()])) as BillingRecipient;
}

export function validateBillingRecipient(value: unknown): BillingRecipient {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Destinatario invalido.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !recipientFields.includes(key as typeof recipientFields[number])) ||
    recipientFields.some(field => typeof input[field] !== "string" || (input[field] as string).length > 500)) {
    throw new Error("Campos do destinatario invalidos.");
  }
  return billingRecipient(input);
}
