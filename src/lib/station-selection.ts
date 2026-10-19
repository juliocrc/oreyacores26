import { NextRequest, NextResponse } from "next/server";
import type { AccessContext } from "@/lib/access-control";

export const ACTIVE_SERVICE_STATION_COOKIE = "active_service_station_id";

function parseStationId(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function setActiveServiceStationCookie(response: NextResponse, stationId: number) {
  response.cookies.set(ACTIVE_SERVICE_STATION_COOKIE, String(stationId), {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearActiveServiceStationCookie(response: NextResponse) {
  response.cookies.set(ACTIVE_SERVICE_STATION_COOKIE, "", {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 0,
  });
}

export function resolveRequestedServiceStationId(req: NextRequest) {
  return parseStationId(req.cookies.get(ACTIVE_SERVICE_STATION_COOKIE)?.value);
}

export function resolveActiveServiceStationIdFromCookie(
  cookieValue: string | undefined,
  access: AccessContext,
): number | null {
  const requestedStationId = parseStationId(cookieValue);
  if (requestedStationId && canUseRequestedStation(requestedStationId, access)) {
    return requestedStationId;
  }

  if (access.stationId) return access.stationId;
  if (!access.isAdmin && access.allowedStationIds.length === 1) return access.allowedStationIds[0];
  return null;
}

function canUseRequestedStation(stationId: number, access: AccessContext) {
  if (access.isAdmin) {
    if (access.allowedStationIds.length === 0) return true;
    return access.allowedStationIds.includes(stationId);
  }
  if (access.allowedStationIds.length === 0) return false;
  return access.allowedStationIds.includes(stationId);
}

export function resolveActiveServiceStationId(req: NextRequest, access: AccessContext): number | null {
  return resolveActiveServiceStationIdFromCookie(
    req.cookies.get(ACTIVE_SERVICE_STATION_COOKIE)?.value,
    access,
  );
}
