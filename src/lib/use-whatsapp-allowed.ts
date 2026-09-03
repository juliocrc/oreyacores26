"use client";

import { useSession } from "next-auth/react";
import { isWhatsAppAllowedEmail, WHATSAPP_ALLOWED_USER_EMAIL } from "./whatsapp-allowed";

export { WHATSAPP_ALLOWED_USER_EMAIL };

/**
 * Indica se o utilizador autenticado pode usar WhatsApp (apenas o administrador Júlio Correia).
 */
export function useWhatsAppAllowed(): { allowed: boolean; allowedUserEmail: string } {
  const { data: session } = useSession();
  return {
    allowed: isWhatsAppAllowedEmail(session?.user?.email),
    allowedUserEmail: WHATSAPP_ALLOWED_USER_EMAIL,
  };
}
