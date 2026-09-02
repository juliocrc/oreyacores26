import WhatsAppModule from "@/modules/WhatsAppModule";
import { getAuthSession } from "@/auth";
import { redirect } from "next/navigation";

export default async function WhatsAppPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  return <WhatsAppModule />;
}
