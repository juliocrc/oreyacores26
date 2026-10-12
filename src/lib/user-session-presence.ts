import { readAuditoriaJson, writeAuditoriaJson } from "@/lib/auditorias-storage";

const STORE_FILE = "_meta/user-session-presence.json";
const ONLINE_WINDOW_MS = 3 * 60 * 1000;
const RETENTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type UserSessionPresenceRecord = {
  sessionId: string;
  userId: number;
  email: string;
  name?: string | null;
  role: "ADMIN" | "USER" | "CLIENTE";
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  lastPath?: string;
  userAgent?: string;
  revokedAt?: string;
};

export type UserSessionLoginEvent = {
  sessionId: string;
  userId: number;
  email: string;
  name?: string | null;
  role: "ADMIN" | "USER" | "CLIENTE";
  createdAt: string;
  lastSeenAt: string;
  lastPath?: string;
};

export type UserSessionHistoryEntry = {
  sessionId: string;
  userId: number;
  email: string;
  name?: string | null;
  role: "ADMIN" | "USER" | "CLIENTE";
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  lastPath?: string;
  revokedAt?: string;
  isOnline: boolean;
};

type UserSessionPresenceStore = Record<string, UserSessionPresenceRecord>;

export type UserPresenceSummary = {
  isOnline: boolean;
  onlineSessions: number;
  presenceLastSeenAt: string | null;
  activeSessions: Array<{
    sessionId: string;
    createdAt: string;
    lastSeenAt: string;
    lastPath?: string;
  }>;
};

function toIso(value?: string | Date | null) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function normalizePresenceRecord(sessionId: string, raw: unknown): UserSessionPresenceRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const parsedUserId = Number(value.userId);
  const email = String(value.email || "").trim().toLowerCase();

  if (!sessionId || !Number.isFinite(parsedUserId) || parsedUserId <= 0 || !email) {
    return null;
  }

  return {
    sessionId,
    userId: parsedUserId,
    email,
    name: typeof value.name === "string" ? value.name : null,
    role: value.role === "ADMIN" ? "ADMIN" : value.role === "CLIENTE" ? "CLIENTE" : "USER",
    createdAt: toIso(typeof value.createdAt === "string" ? value.createdAt : undefined),
    lastSeenAt: toIso(typeof value.lastSeenAt === "string" ? value.lastSeenAt : undefined),
    expiresAt: toIso(typeof value.expiresAt === "string" ? value.expiresAt : undefined),
    lastPath: typeof value.lastPath === "string" ? value.lastPath : undefined,
    userAgent: typeof value.userAgent === "string" ? value.userAgent : undefined,
    revokedAt: typeof value.revokedAt === "string" ? value.revokedAt : undefined,
  };
}

async function readPresenceStore() {
  const raw = await readAuditoriaJson<UserSessionPresenceStore>(STORE_FILE, {});
  return Object.entries(raw || {}).reduce<UserSessionPresenceStore>((acc, [sessionId, value]) => {
    const normalized = normalizePresenceRecord(sessionId, value);
    if (normalized) {
      acc[sessionId] = normalized;
    }
    return acc;
  }, {});
}

async function writePresenceStore(store: UserSessionPresenceStore) {
  await writeAuditoriaJson(STORE_FILE, store);
}

async function writePresenceStoreSafe(store: UserSessionPresenceStore) {
  // Evita escritas desnecessárias e falhas em corrida (vários heartbeats/GET em paralelo
  // escrevem no mesmo ficheiro). A escrita é o único passo que pode falhar de forma
  // intermitente em dev; leituras continuam a funcionar independentemente.
  try {
    await writePresenceStore(store);
  } catch (error) {
    console.warn("[user-session-presence] Falha não bloqueante ao persistir presence:", error);
  }
}

function cleanupPresenceStore(store: UserSessionPresenceStore, referenceDate = new Date()) {
  const threshold = referenceDate.getTime() - RETENTION_WINDOW_MS;
  return Object.entries(store).reduce<UserSessionPresenceStore>((acc, [sessionId, entry]) => {
    const lastSeenMs = Date.parse(entry.lastSeenAt || "");
    const createdMs = Date.parse(entry.createdAt || "");
    const fallbackMs = Number.isNaN(lastSeenMs) ? createdMs : lastSeenMs;
    if (!Number.isNaN(fallbackMs) && fallbackMs < threshold) {
      return acc;
    }
    acc[sessionId] = entry;
    return acc;
  }, {});
}

export function isPresenceSessionOnline(entry: UserSessionPresenceRecord, referenceDate = new Date()) {
  if (entry.revokedAt) return false;
  const now = referenceDate.getTime();
  const expiresAt = Date.parse(entry.expiresAt || "");
  const lastSeenAt = Date.parse(entry.lastSeenAt || "");

  if (!Number.isNaN(expiresAt) && expiresAt <= now) return false;
  if (Number.isNaN(lastSeenAt)) return false;
  return lastSeenAt >= now - ONLINE_WINDOW_MS;
}

export async function upsertUserSessionPresence(input: {
  sessionId: string;
  userId: number;
  email: string;
  name?: string | null;
  role: "ADMIN" | "USER" | "CLIENTE";
  lastPath?: string;
  userAgent?: string;
}) {
  const now = new Date();
  const store = cleanupPresenceStore(await readPresenceStore(), now);
  const existing = store[input.sessionId];
  const normalizedPath = input.lastPath ? String(input.lastPath).trim() : undefined;
  const pathChanged = Boolean(normalizedPath && existing?.lastPath && normalizedPath !== existing.lastPath);
  const wasCreated = !existing;

  store[input.sessionId] = {
    sessionId: input.sessionId,
    userId: input.userId,
    email: String(input.email || "").trim().toLowerCase(),
    name: input.name || null,
    role: input.role,
    createdAt: existing?.createdAt || now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ONLINE_WINDOW_MS).toISOString(),
    lastPath: normalizedPath || existing?.lastPath,
    userAgent: input.userAgent || existing?.userAgent,
    revokedAt: undefined,
  };

  await writePresenceStoreSafe(store);

  return {
    record: store[input.sessionId],
    wasCreated,
    pathChanged,
    previousPath: existing?.lastPath,
  };
}

export async function markUserSessionOffline(sessionId: string) {
  if (!sessionId) return false;

  const nowIso = new Date().toISOString();
  const store = cleanupPresenceStore(await readPresenceStore());
  const existing = store[sessionId];
  if (!existing) return false;

  store[sessionId] = {
    ...existing,
    lastSeenAt: nowIso,
    expiresAt: nowIso,
    revokedAt: nowIso,
  };

  await writePresenceStoreSafe(store);
  return true;
}

export async function buildUserPresenceSummaryByUserId() {
  const now = new Date();
  const store = cleanupPresenceStore(await readPresenceStore(), now);
  await writePresenceStoreSafe(store);

  return Object.values(store).reduce<Record<number, UserPresenceSummary>>((acc, entry) => {
    if (!isPresenceSessionOnline(entry, now)) return acc;

    const current = acc[entry.userId] || {
      isOnline: false,
      onlineSessions: 0,
      presenceLastSeenAt: null,
      activeSessions: [],
    };

    current.isOnline = true;
    current.onlineSessions += 1;
    if (!current.presenceLastSeenAt || Date.parse(entry.lastSeenAt) > Date.parse(current.presenceLastSeenAt)) {
      current.presenceLastSeenAt = entry.lastSeenAt;
    }
    current.activeSessions.push({
      sessionId: entry.sessionId,
      createdAt: entry.createdAt,
      lastSeenAt: entry.lastSeenAt,
      lastPath: entry.lastPath,
    });
    current.activeSessions.sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));

    acc[entry.userId] = current;
    return acc;
  }, {});
}

export async function listRecentSessionLogins(args?: { sinceMinutes?: number }) {
  const sinceMinutes = Math.min(180, Math.max(1, Number(args?.sinceMinutes || 15)));
  const now = new Date();
  const threshold = now.getTime() - sinceMinutes * 60 * 1000;

  const store = cleanupPresenceStore(await readPresenceStore(), now);
  await writePresenceStore(store);

  return Object.values(store)
    .filter((entry) => {
      const createdAtMs = Date.parse(entry.createdAt || "");
      return !Number.isNaN(createdAtMs) && createdAtMs >= threshold && !entry.revokedAt;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map<UserSessionLoginEvent>((entry) => ({
      sessionId: entry.sessionId,
      userId: entry.userId,
      email: entry.email,
      name: entry.name,
      role: entry.role,
      createdAt: entry.createdAt,
      lastSeenAt: entry.lastSeenAt,
      lastPath: entry.lastPath,
    }));
}

export async function listUserSessionHistoryByEmail(args: {
  email: string;
  sinceDays?: number;
  includeOffline?: boolean;
}) {
  const email = String(args.email || "").trim().toLowerCase();
  if (!email) return [] as UserSessionHistoryEntry[];

  const sinceDays = Math.min(30, Math.max(1, Number(args.sinceDays || 7)));
  const now = new Date();
  const threshold = now.getTime() - sinceDays * 24 * 60 * 60 * 1000;

  const store = cleanupPresenceStore(await readPresenceStore(), now);
  await writePresenceStoreSafe(store);

  return Object.values(store)
    .filter((entry) => {
      if (entry.email !== email) return false;
      const createdAtMs = Date.parse(entry.createdAt || "");
      const lastSeenMs = Date.parse(entry.lastSeenAt || "");
      const refMs = Number.isFinite(lastSeenMs) ? lastSeenMs : createdAtMs;
      if (!Number.isFinite(refMs) || refMs < threshold) return false;
      if (!args.includeOffline && !isPresenceSessionOnline(entry, now)) return false;
      return true;
    })
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
    .map<UserSessionHistoryEntry>((entry) => ({
      sessionId: entry.sessionId,
      userId: entry.userId,
      email: entry.email,
      name: entry.name,
      role: entry.role,
      createdAt: entry.createdAt,
      lastSeenAt: entry.lastSeenAt,
      expiresAt: entry.expiresAt,
      lastPath: entry.lastPath,
      revokedAt: entry.revokedAt,
      isOnline: isPresenceSessionOnline(entry, now),
    }));
}
