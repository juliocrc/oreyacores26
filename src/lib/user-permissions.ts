import { readAuditoriaJson, writeAuditoriaJson } from "@/lib/auditorias-storage";
import { canonicalizePermissionModuleKey, canonicalizePermissionPathPrefix, pathMatchesPrefix } from "@/lib/permission-access";
import prisma from "@/lib/prisma";
import { normalizeCodeToken } from "@/lib/text-normalization";
import { APP_CONFIG } from "@/lib/app-config";
import {
  EDITABLE_FIELD_GROUPS,
  PAGE_PREFIX_OPTIONS,
  PERMISSION_MODULE_OPTIONS,
  type PermissionModuleKey,
} from "@/lib/permissions-catalog";
import {
  getCachedPermissions,
  invalidatePermissionsCache,
  setCachedPermissions,
} from "@/lib/permissions-cache";

const STORE_FILE = "_meta/user-permissions.json";

export type EffectiveUserPermissions = {
  visibleModules: PermissionModuleKey[];
  visiblePages: string[];
  editablePages: string[];
  editableFields: Record<string, string[]>;
  allowedStationCodes: string[];
};

export type UserPermissionOverride = Partial<EffectiveUserPermissions> & {
  updatedAt?: string;
};

type UserPermissionStore = Record<string, UserPermissionOverride>;

function dedupeStrings(values: unknown, allowed?: Set<string>) {
  if (!Array.isArray(values)) return [] as string[];
  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of values) {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) continue;
    if (allowed && !allowed.has(value)) continue;
    seen.add(value);
    output.push(value);
  }

  return output;
}

function normalizeEditableFieldsMap(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {} as Record<string, string[]>;
  }

  const catalog = EDITABLE_FIELD_GROUPS as Record<string, Array<{ key: string }>>;
  return Object.entries(raw as Record<string, unknown>).reduce<Record<string, string[]>>((acc, [pageKey, values]) => {
    const allowedKeys = new Set((catalog[pageKey] || []).map((item) => item.key));
    acc[pageKey] = dedupeStrings(values, allowedKeys);
    return acc;
  }, {});
}

function moduleAllowSet() {
  return new Set<string>(PERMISSION_MODULE_OPTIONS.map((item) => item.key));
}

function normalizeModuleKeys(values: unknown) {
  if (!Array.isArray(values)) return [] as string[];

  const allowed = moduleAllowSet();
  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of values) {
    const canonical = canonicalizePermissionModuleKey(String(item || "").trim());
    if (!canonical || seen.has(canonical)) continue;
    if (!allowed.has(canonical)) continue;
    seen.add(canonical);
    output.push(canonical);
  }

  return output;
}

function pageAllowSet() {
  return new Set(PAGE_PREFIX_OPTIONS.map((item) => item.prefix));
}

function normalizePagePrefixes(values: unknown) {
  if (!Array.isArray(values)) return [] as string[];

  const allowed = pageAllowSet();
  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of values) {
    const canonical = canonicalizePermissionPathPrefix(String(item || "").trim());
    if (!canonical || seen.has(canonical)) continue;
    if (!allowed.has(canonical)) continue;
    seen.add(canonical);
    output.push(canonical);
  }

  return output;
}

function normalizeStationCodeToken(value: unknown) {
  return normalizeCodeToken(value || "");
}

function normalizeAllowedStationCodes(values: unknown) {
  if (!Array.isArray(values)) return [] as string[];

  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of values) {
    const normalized = normalizeStationCodeToken(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function normalizeOverride(raw: unknown): UserPermissionOverride {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  return {
    visibleModules: normalizeModuleKeys(value.visibleModules) as PermissionModuleKey[],
    visiblePages: normalizePagePrefixes(value.visiblePages),
    editablePages: normalizePagePrefixes(value.editablePages),
    editableFields: normalizeEditableFieldsMap(value.editableFields),
    allowedStationCodes: normalizeAllowedStationCodes(value.allowedStationCodes),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
  };
}

export function defaultPermissionsForRole(role: "ADMIN" | "USER" | "CLIENTE"): EffectiveUserPermissions {
  if (role === "ADMIN") {
    return {
      visibleModules: PERMISSION_MODULE_OPTIONS.map((item) => item.key),
      visiblePages: PAGE_PREFIX_OPTIONS.map((item) => item.prefix),
      editablePages: PAGE_PREFIX_OPTIONS.map((item) => item.prefix),
      editableFields: Object.fromEntries(
        Object.entries(EDITABLE_FIELD_GROUPS).map(([key, entries]) => [key, entries.map((entry) => entry.key)])
      ),
      allowedStationCodes: [],
    };
  }

  if (role === "CLIENTE") {
    return {
      visibleModules: [],
      visiblePages: ["/portal"],
      editablePages: [],
      editableFields: {},
      allowedStationCodes: [],
    };
  }

  const defaultModules = ["dashboard", "jangadas", "estacao-servico"] as PermissionModuleKey[];
  const defaultPages = ["/", "/", "/jangadas", "/estacao-servico"];

  return {
    visibleModules: defaultModules,
    visiblePages: defaultPages,
    editablePages: ["/estacao-servico"],
    editableFields: {
      "jangadas-detail": [],
    },
    allowedStationCodes: [],
  };
}

async function readPermissionStore() {
  const raw = await readAuditoriaJson<UserPermissionStore>(STORE_FILE, {});
  return Object.entries(raw || {}).reduce<UserPermissionStore>((acc, [key, value]) => {
    acc[String(key)] = normalizeOverride(value);
    return acc;
  }, {});
}

async function writePermissionStore(store: UserPermissionStore) {
  await writeAuditoriaJson(STORE_FILE, store);
}

function isPermissionsOverrideStorageError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.toLowerCase().includes("permissionsoverridejson");
}

async function readPermissionOverrideFromDatabase(userId: number | string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      select: { permissionsOverrideJson: true },
    });

    if (!user?.permissionsOverrideJson) return null;

    try {
      return normalizeOverride(JSON.parse(user.permissionsOverrideJson));
    } catch {
      return normalizeOverride({});
    }
  } catch (error) {
    if (isPermissionsOverrideStorageError(error)) return null;
    throw error;
  }
}

async function writePermissionOverrideToDatabase(userId: number | string, override: UserPermissionOverride | null) {
  try {
    await prisma.user.update({
      where: { id: Number(userId) },
      data: {
        permissionsOverrideJson: override ? JSON.stringify(override) : null,
      },
    });
    return true;
  } catch (error) {
    if (isPermissionsOverrideStorageError(error)) return false;
    throw error;
  }
}

async function getLegacyUserPermissionOverride(userId: number | string) {
  const store = await readPermissionStore();
  return normalizeOverride(store[String(userId)]);
}

async function setLegacyUserPermissionOverride(userId: number | string, override: UserPermissionOverride) {
  const store = await readPermissionStore();
  store[String(userId)] = override;
  await writePermissionStore(store);
  return store[String(userId)];
}

async function removeLegacyUserPermissionOverride(userId: number | string) {
  const store = await readPermissionStore();
  const key = String(userId);
  if (!(key in store)) return false;
  delete store[key];
  await writePermissionStore(store);
  return true;
}

export async function getUserPermissionOverride(userId: number | string) {
  const databaseOverride = await readPermissionOverrideFromDatabase(userId);
  if (databaseOverride) return databaseOverride;
  return getLegacyUserPermissionOverride(userId);
}

export async function resolveEffectivePermissions(args: {
  userId: number | string;
  role: "ADMIN" | "USER" | "CLIENTE";
}) {
  const defaults = defaultPermissionsForRole(args.role);
  if (args.role === "CLIENTE") {
    return defaults;
  }

  const cached = getCachedPermissions(args.userId, args.role);
  if (cached) return cached;

  const override = await getUserPermissionOverride(args.userId);

  const effective: EffectiveUserPermissions = {
    visibleModules: (override.visibleModules && override.visibleModules.length > 0
      ? (override.visibleModules as PermissionModuleKey[])
      : defaults.visibleModules),
    visiblePages: (override.visiblePages && override.visiblePages.length > 0
      ? override.visiblePages
      : defaults.visiblePages),
    editablePages: (override.editablePages && override.editablePages.length > 0
      ? override.editablePages
      : defaults.editablePages),
    editableFields: {
      ...defaults.editableFields,
      ...(override.editableFields || {}),
    },
    allowedStationCodes: (override.allowedStationCodes && override.allowedStationCodes.length > 0
      ? override.allowedStationCodes
      : defaults.allowedStationCodes),
  };

  setCachedPermissions(args.userId, args.role, effective);
  return effective;
}

export async function setUserPermissionOverride(userId: number | string, overrideInput: unknown) {
  const normalized = normalizeOverride(overrideInput);
  const override = {
    ...normalized,
    updatedAt: new Date().toISOString(),
  };

  const storedInDatabase = await writePermissionOverrideToDatabase(userId, override);
  invalidatePermissionsCache(userId);
  if (storedInDatabase) {
    await removeLegacyUserPermissionOverride(userId).catch(() => false);
    return override;
  }

  return setLegacyUserPermissionOverride(userId, override);
}

export async function removeUserPermissionOverride(userId: number | string) {
  const removedFromDatabase = await writePermissionOverrideToDatabase(userId, null);
  const removedFromLegacy = await removeLegacyUserPermissionOverride(userId);
  invalidatePermissionsCache(userId);
  return removedFromDatabase || removedFromLegacy;
}

export function canViewPath(permissions: EffectiveUserPermissions, pathname: string) {
  return permissions.visiblePages.some((prefix) => pathMatchesPrefix(pathname, prefix));
}

export function canEditPath(permissions: EffectiveUserPermissions, pathname: string) {
  return permissions.editablePages.some((prefix) => pathMatchesPrefix(pathname, prefix));
}
