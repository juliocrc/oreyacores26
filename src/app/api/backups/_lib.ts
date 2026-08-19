import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export async function requireAdminOrBypass(): Promise<{ ok: boolean; status?: number }> {
  if (process.env.AUTH_BYPASS === "true") return { ok: true };
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "ADMIN") {
    return { ok: false, status: 401 };
  }
  return { ok: true };
}
