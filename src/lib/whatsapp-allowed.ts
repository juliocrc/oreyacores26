/** Email do administrador com permissão para usar WhatsApp. */
export const WHATSAPP_ALLOWED_USER_EMAIL = "julio.correia@orey.com";

/** Verifica se um email corresponde ao administrador com acesso ao WhatsApp. */
export function isWhatsAppAllowedEmail(email: string | null | undefined): boolean {
  return String(email || "").trim().toLowerCase() === WHATSAPP_ALLOWED_USER_EMAIL.toLowerCase();
}
