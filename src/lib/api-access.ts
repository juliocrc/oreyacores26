import { NextResponse } from "next/server";
import { getAccessContext, type AccessContext } from "@/lib/access-control";
import { canEditPath, canViewPath } from "@/lib/user-permissions";

/** Route-level authorization is required even when the proxy has checked the JWT. */
export async function requireApiAccess(
  page: string,
  options: { write?: boolean; adminOnly?: boolean } = {},
): Promise<{ access: AccessContext; error: null } | { access: null; error: NextResponse }> {
  const access = await getAccessContext();
  if (!access) {
    return { access: null, error: NextResponse.json({ error: "Sessão interna obrigatória." }, { status: 401 }) };
  }
  const allowed = access.isAdmin || (!options.adminOnly && (options.write
    ? canEditPath(access.permissions, page)
    : canViewPath(access.permissions, page) || canEditPath(access.permissions, page)));
  if (!allowed) {
    return { access: null, error: NextResponse.json({ error: "Sem permissão para esta operação." }, { status: 403 }) };
  }
  return { access, error: null };
}

/** Unassigned legacy records are not implicitly shared with every station. */
export function apiStationScope(access: AccessContext, activeStationId: number | null = null) {
  if (activeStationId !== null) {
    if (!Number.isSafeInteger(activeStationId) || activeStationId <= 0 || (!access.isAdmin && !access.allowedStationIds.includes(activeStationId))) {
      return { serviceStationId: { in: [] as number[] } };
    }
    return { serviceStationId: activeStationId };
  }
  if (access.isAdmin) return {};
  return { serviceStationId: { in: access.allowedStationIds } };
}
