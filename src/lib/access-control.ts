import { getAuthSession } from "@/auth";
import prisma from "@/lib/prisma";
import { APP_CONFIG } from "@/lib/app-config";
import { hasElevatedAccess } from "@/lib/permission-access";
import { normalizeCodeToken } from "@/lib/text-normalization";
import { buildVisibleServiceStationWhere } from "@/lib/service-station-visibility";
import { safeFindFirst } from "@/lib/prisma-utils";
import {
  resolveEffectivePermissions,
  type EffectiveUserPermissions,
} from "@/lib/user-permissions";

export type AccessContext = {
  userId: number;
  email: string;
  role: "ADMIN" | "USER";
  isAdmin: boolean;
  stationId: number | null;
  allowedStationIds: number[];
  permissions: EffectiveUserPermissions;
};

function normalizeStationCodeToken(value: unknown) {
  return normalizeCodeToken(value || "");
}

async function resolveDefaultStationId() {
  const station = await safeFindFirst<{ id: number }>(prisma, 'serviceStation', {
    where: buildVisibleServiceStationWhere({ ativo: true, codigo: APP_CONFIG.defaultServiceStationCode }),
    select: { id: true },
  });
  return station?.id ?? null;
}

async function resolveAllowedStationIds(permissions: EffectiveUserPermissions) {
  const allowedCodes = Array.isArray(permissions.allowedStationCodes)
    ? permissions.allowedStationCodes.map((value) => normalizeStationCodeToken(value)).filter(Boolean)
    : [];

  if (!allowedCodes.length) return [] as number[];

  const allowedSet = new Set(allowedCodes);
  const stations = await prisma.serviceStation.findMany({
    where: buildVisibleServiceStationWhere({ ativo: true }),
    select: { id: true, codigo: true, nome: true },
  });

  return stations
    .filter((station) => (
      allowedSet.has(normalizeStationCodeToken(station.codigo))
      || allowedSet.has(normalizeStationCodeToken(station.nome))
    ))
    .map((station) => station.id);
}

async function resolveAllVisibleStationIds() {
  const stations = await prisma.serviceStation.findMany({
    where: buildVisibleServiceStationWhere({ ativo: true }),
    select: { id: true },
  });

  return stations.map((station) => station.id);
}

const BYPASS_ADMIN: AccessContext = {
  userId: 1,
  email: "bypass@render.local",
  role: "ADMIN",
  isAdmin: true,
  stationId: null,
  allowedStationIds: [],
  permissions: {} as never,
};

export async function getAccessContext(): Promise<AccessContext | null> {
  const session = await getAuthSession();
  const user = session?.user;

  if (!user?.id || !user?.email) {
    if (process.env.AUTH_BYPASS === "true") {
      const stationIds = await resolveAllVisibleStationIds();
      return { ...BYPASS_ADMIN, allowedStationIds: stationIds };
    }
    return null;
  }

  const parsedId = Number(user.id);
  if (!Number.isFinite(parsedId) || parsedId <= 0) return null;

  const role = user.role === "ADMIN" ? "ADMIN" : "USER";
  const permissions = await resolveEffectivePermissions({
    userId: parsedId,
    role,
  });
  let allowedStationIds = await resolveAllowedStationIds(permissions);
  const isAdmin = hasElevatedAccess({ role, permissions });
  if ((isAdmin || APP_CONFIG.theme === 'deluxe') && allowedStationIds.length === 0) {
    allowedStationIds = await resolveAllVisibleStationIds();
  }
  const defaultStationId = await resolveDefaultStationId();
  const stationId = isAdmin
    ? null
    : APP_CONFIG.theme === 'deluxe'
      ? null
      : allowedStationIds.length === 1
        ? allowedStationIds[0]
        : allowedStationIds.length > 1
          ? null
          : defaultStationId;

  if (isAdmin) {
    return {
      userId: parsedId,
      email: user.email,
      role,
      isAdmin,
      stationId,
      allowedStationIds,
      permissions,
    };
  }

  return {
    userId: parsedId,
    email: user.email,
    role,
    isAdmin,
    stationId,
    allowedStationIds,
    permissions,
  };
}
