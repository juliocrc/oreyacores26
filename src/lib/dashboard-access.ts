import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/auth';
import { getAccessContext } from '@/lib/access-control';
import { resolveActiveServiceStationId } from '@/lib/station-selection';

export async function getDashboardScope(request: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Sessão obrigatória.' }, { status: 401 }) };
  }
  if (session.user.role !== 'ADMIN' && session.user.role !== 'USER') {
    return { error: NextResponse.json({ error: 'Apenas utilizadores internos.' }, { status: 403 }) };
  }
  const access = await getAccessContext();
  if (!access) return { error: NextResponse.json({ error: 'Sessão obrigatória.' }, { status: 401 }) };

  const raw = request.nextUrl.searchParams.get('stationId');
  const stationId = raw === null ? resolveActiveServiceStationId(request, access) : raw === '' ? null : Number(raw);
  if (stationId !== null && (!Number.isSafeInteger(stationId) || stationId <= 0)) {
    return { error: NextResponse.json({ error: 'Estação inválida.' }, { status: 400 }) };
  }
  if (stationId !== null && !access.isAdmin && !access.allowedStationIds.includes(stationId)) {
    return { error: NextResponse.json({ error: 'Sem acesso a esta estação.' }, { status: 403 }) };
  }
  // An empty station allowlist must never turn into an unrestricted query.
  const where = stationId !== null ? { serviceStationId: stationId }
    : access.isAdmin ? {} : { serviceStationId: { in: access.allowedStationIds } };
  return { access, where, stationId };
}
