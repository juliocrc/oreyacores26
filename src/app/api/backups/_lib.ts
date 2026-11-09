import { getAuthSession } from "@/auth";
import { isLocalAuthBypassEnabled } from "@/lib/local-auth";

export async function requireAdminOrBypass(): Promise<{ ok: boolean; status?: number }> {
  if (isLocalAuthBypassEnabled()) return { ok: true };
  const session = await getAuthSession();
  if (!session || session.user?.role !== "ADMIN") {
    return { ok: false, status: 401 };
  }
  return { ok: true };
}
