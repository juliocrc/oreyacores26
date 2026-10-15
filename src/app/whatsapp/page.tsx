import ComunicacaoInbox from "@/modules/ComunicacaoInbox";
import { getAuthSession } from "@/auth";
import { redirect } from "next/navigation";

export default async function WhatsAppPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  return (
    <ComunicacaoInbox
      canalInicial="WHATSAPP"
      titulo="Módulo WhatsApp"
      descricao="Conversas de WhatsApp com histórico unificado e envio manual confirmado."
      acento="emerald"
    />
  );
}
