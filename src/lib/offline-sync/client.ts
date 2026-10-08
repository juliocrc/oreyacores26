"use client";

import type { OfflineSyncOperation, OfflineSyncPushResponse, OfflineSyncState } from "./types";

const QUEUE_STORAGE_KEY = "offline-sync-queue-v1";
const STATE_STORAGE_KEY = "offline-sync-state-v1";
const DEVICE_ID_STORAGE_KEY = "offline-sync-device-id-v1";
const WORK_MODE_STORAGE_KEY = "orey-work-mode-v1";
const SNAPSHOT_PREFIX = "offline-sync-snapshot:";
const UPDATE_EVENT = "offline-sync:update";
const MAX_QUEUE_SIZE = 200;
const MAX_RETRY_ATTEMPTS = 5;
const BASE_RETRY_MS = 5000;
const MAX_RETRY_MS = 300000;
const DEFAULT_STATE: OfflineSyncState = {
  pendingCount: 0,
  syncing: false,
  online: true,
  lastSyncAt: null,
  lastError: null,
};

export class OfflineSyncHttpError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "OfflineSyncHttpError";
    this.status = status;
    this.payload = payload;
  }
}

function hasWindow() {
  return typeof window !== "undefined";
}

function dispatchUpdate() {
  if (!hasWindow()) return;
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

function safeParseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function readStoredQueue() {
  if (!hasWindow()) return [] as OfflineSyncOperation[];
  return safeParseJson<OfflineSyncOperation[]>(window.localStorage.getItem(QUEUE_STORAGE_KEY), []);
}

function writeStoredQueue(queue: OfflineSyncOperation[]) {
  if (!hasWindow()) return;
  window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
}

function readStoredState() {
  if (!hasWindow()) return DEFAULT_STATE;
  const state = safeParseJson<Partial<OfflineSyncState>>(window.localStorage.getItem(STATE_STORAGE_KEY), {});
  return {
    ...DEFAULT_STATE,
    ...state,
    pendingCount: readStoredQueue().length,
    online: isEffectivelyOnline(),
  } satisfies OfflineSyncState;
}

function writeStoredState(patch: Partial<OfflineSyncState>) {
  if (!hasWindow()) return DEFAULT_STATE;
  const nextState = {
    ...readStoredState(),
    ...patch,
    pendingCount: readStoredQueue().length,
    online: isEffectivelyOnline(),
  } satisfies OfflineSyncState;
  window.localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(nextState));
  dispatchUpdate();
  return nextState;
}

function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOfflineSyncDeviceId() {
  if (!hasWindow()) return "server";
  const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;
  const next = `device-${randomId()}`;
  window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, next);
  return next;
}

export function getForcedOfflineMode() {
  if (!hasWindow()) return false;
  try {
    return window.localStorage.getItem(WORK_MODE_STORAGE_KEY) === "offline";
  } catch {
    return false;
  }
}

export function isEffectivelyOnline() {
  if (!hasWindow()) return true;
  return navigator.onLine && !getForcedOfflineMode();
}

export function setForcedOfflineMode(forced: boolean) {
  if (!hasWindow()) return;
  try {
    if (forced) {
      window.localStorage.setItem(WORK_MODE_STORAGE_KEY, "offline");
    } else {
      window.localStorage.removeItem(WORK_MODE_STORAGE_KEY);
    }
  } catch {
    // no-op
  }
  writeStoredState({ online: isEffectivelyOnline() });
  if (!forced && navigator.onLine) {
    void flushOfflineSyncQueue();
  }
}

export function subscribeForcedOfflineMode(listener: () => void) {
  if (!hasWindow()) return () => {};
  const wrapped = () => listener();
  window.addEventListener(UPDATE_EVENT, wrapped);
  window.addEventListener("storage", wrapped);
  return () => {
    window.removeEventListener(UPDATE_EVENT, wrapped);
    window.removeEventListener("storage", wrapped);
  };
}

export function getOfflineSyncQueue() {
  return readStoredQueue();
}

export function getOfflineSyncState() {
  return readStoredState();
}

export function subscribeOfflineSync(listener: () => void) {
  if (!hasWindow()) return () => {};
  const wrapped = () => listener();
  window.addEventListener(UPDATE_EVENT, wrapped);
  window.addEventListener("storage", wrapped);
  window.addEventListener("online", wrapped);
  window.addEventListener("offline", wrapped);
  return () => {
    window.removeEventListener(UPDATE_EVENT, wrapped);
    window.removeEventListener("storage", wrapped);
    window.removeEventListener("online", wrapped);
    window.removeEventListener("offline", wrapped);
  };
}

export function updateOfflineSyncConnectivity(online: boolean) {
  return writeStoredState({ online });
}

export function enqueueOfflineSyncOperation(operation: Omit<OfflineSyncOperation, "id" | "createdAt" | "deviceId"> & { id?: string }) {
  const queue = readStoredQueue();
  if (queue.length >= MAX_QUEUE_SIZE) {
    console.warn(`[OfflineSync] Queue full (${MAX_QUEUE_SIZE} ops). Operation dropped.`);
    return null;
  }
  const nextOperation: OfflineSyncOperation = {
    id: operation.id || randomId(),
    createdAt: new Date().toISOString(),
    deviceId: getOfflineSyncDeviceId(),
    ...operation,
  };
  writeStoredQueue([...queue, nextOperation]);
  writeStoredState({ lastError: null });
  return nextOperation;
}

export function removeOfflineSyncOperations(ids: string[]) {
  const idSet = new Set(ids);
  const nextQueue = readStoredQueue().filter((item) => !idSet.has(item.id));
  writeStoredQueue(nextQueue);
  writeStoredState({});
}

export function clearOfflineSyncError() {
  writeStoredState({ lastError: null });
}

export function retryOfflineSyncOperations(ids?: string[]) {
  const queue = readStoredQueue();
  const idSet = ids ? new Set(ids) : null;
  const nextQueue = queue.map((op) => {
    if (idSet && !idSet.has(op.id)) return op;
    return {
      ...op,
      attemptCount: 0,
      failedPermanently: false,
    };
  });
  writeStoredQueue(nextQueue);
  writeStoredState({ lastError: null });
  if (hasWindow() && navigator.onLine) {
    void flushOfflineSyncQueue();
  }
  return nextQueue;
}

const LEGACY_INSPECTIONS_KEY = "offline_inspections";

export function getLegacyOfflineInspections() {
  if (!hasWindow()) return [] as Record<string, unknown>[];
  const items = safeParseJson<unknown[]>(window.localStorage.getItem(LEGACY_INSPECTIONS_KEY), []);
  return items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
}

export function getLegacyOfflineInspectionsCount() {
  return getLegacyOfflineInspections().length;
}

export function importLegacyOfflineInspections() {
  if (!hasWindow()) return 0;
  const items = getLegacyOfflineInspections();
  if (items.length === 0) return 0;

  let imported = 0;
  const remaining: unknown[] = [];
  for (const item of items) {
    const { jangadaId, id, payload } = item;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      remaining.push(item);
      continue;
    }
    const body = payload as Record<string, unknown>;
    const isNew = typeof id === "string" && id.startsWith("offline_");
    const inspId = !isNew && typeof id === "string" && String(id).trim() ? String(id) : undefined;

    const jangadaTouched = jangadaId != null && String(jangadaId).trim() !== "";
    if (jangadaTouched) {
      const jangadaBody: Record<string, unknown> = { ...body };
      delete jangadaBody.checklist;
      delete jangadaBody.packItems;
      delete jangadaBody.artigosSubstituidos;
      if (isNew) delete jangadaBody.id;
      enqueueOfflineSyncOperation({
        path: `/api/jangadas/${String(jangadaId)}`,
        method: "PUT",
        body: jangadaBody,
        entityType: "jangada",
        entityId: String(jangadaId),
        summary: `Jangada #${String(jangadaId)} (rascunho legado)`,
      });
    }

    const queued = enqueueOfflineSyncOperation({
      path: inspId ? `/api/inspecoes?id=${inspId}` : "/api/inspecoes",
      method: inspId ? "PUT" : "POST",
      body,
      entityType: "inspecao-legado",
      entityId: inspId,
      summary: `Inspeção offline: ${String(body.serial || body.numeroObra || id || "—")}`,
    });

    if (queued) {
      imported++;
    } else {
      remaining.push(item);
    }
  }

  window.localStorage.setItem(LEGACY_INSPECTIONS_KEY, JSON.stringify(remaining));
  writeStoredState({ lastError: null });
  if (imported > 0 && hasWindow() && navigator.onLine) {
    void flushOfflineSyncQueue();
  }
  return imported;
}

export function writeOfflineSnapshot<T>(key: string, value: T) {
  if (!hasWindow()) return;
  window.localStorage.setItem(`${SNAPSHOT_PREFIX}${key}`, JSON.stringify(value));
}

export function readOfflineSnapshot<T>(key: string, fallback: T): T {
  if (!hasWindow()) return fallback;
  return safeParseJson<T>(window.localStorage.getItem(`${SNAPSHOT_PREFIX}${key}`), fallback);
}

export function deleteOfflineSnapshot(key: string) {
  if (!hasWindow()) return;
  window.localStorage.removeItem(`${SNAPSHOT_PREFIX}${key}`);
}

function isNetworkFailure(error: unknown) {
  if (!error) return false;
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("network") || message.includes("fetch") || message.includes("failed to fetch");
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function performOfflineAwareJsonRequest<T>(options: {
  path: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  queueEntry?: Partial<Pick<OfflineSyncOperation, "entityType" | "entityId" | "summary">>;
}) {
  const body = options.body;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const queueFallback = () => {
    const queued = enqueueOfflineSyncOperation({
      path: options.path,
      method: options.method,
      headers,
      body,
      entityType: options.queueEntry?.entityType,
      entityId: options.queueEntry?.entityId,
      summary: options.queueEntry?.summary,
    });
    return { queued: true as const, data: null as T | null, queuedOperation: queued };
  };

  if (hasWindow() && !isEffectivelyOnline()) {
    return queueFallback();
  }

  try {
    const response = await fetch(options.path, {
      method: options.method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
    });
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      throw new OfflineSyncHttpError(
        typeof payload === "object" && payload && "error" in (payload as Record<string, unknown>)
          ? String((payload as Record<string, unknown>).error || "Erro no pedido.")
          : "Erro no pedido.",
        response.status,
        payload,
      );
    }
    return { queued: false as const, data: payload as T, queuedOperation: null };
  } catch (error) {
    if (error instanceof OfflineSyncHttpError) {
      throw error;
    }
    if (isNetworkFailure(error)) {
      return queueFallback();
    }
    throw error;
  }
}

let flushPromise: Promise<OfflineSyncPushResponse | null> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  const delay = Math.min(BASE_RETRY_MS * Math.pow(2, retryAttempt), MAX_RETRY_MS);
  retryAttempt++;
  writeStoredState({ retryAfterMs: delay });
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushOfflineSyncQueue();
  }, delay);
}

function clearRetryTimer() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryAttempt = 0;
  writeStoredState({ retryAfterMs: undefined });
}

export async function flushOfflineSyncQueue() {
  if (!hasWindow()) return null;
  if (flushPromise) return flushPromise;
  if (!isEffectivelyOnline()) {
    writeStoredState({ online: false, syncing: false });
    return null;
  }

  const queue = readStoredQueue();
  if (queue.length === 0) {
    clearRetryTimer();
    writeStoredState({ syncing: false, online: true, lastError: null });
    return {
      ok: true,
      processedCount: 0,
      successCount: 0,
      results: [],
    } satisfies OfflineSyncPushResponse;
  }

  flushPromise = (async () => {
    writeStoredState({ syncing: true, online: true, lastError: null });
    try {
      const response = await fetch("/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operations: queue }),
      });
      const payload = await parseJsonResponse(response);
      if (!response.ok) {
        const message = typeof payload === "object" && payload && "error" in (payload as Record<string, unknown>)
          ? String((payload as Record<string, unknown>).error || "Falha na sincronização offline.")
          : "Falha na sincronização offline.";
        writeStoredState({ syncing: false, lastError: message });
        scheduleRetry();
        throw new OfflineSyncHttpError(message, response.status, payload);
      }

      const parsed = payload as OfflineSyncPushResponse;
      const successfulIds = Array.isArray(parsed.results)
        ? parsed.results.filter((result) => result.ok).map((result) => result.id)
        : [];
      if (successfulIds.length > 0) {
        removeOfflineSyncOperations(successfulIds);
      }

      const failedOps = Array.isArray(parsed.results)
        ? parsed.results.filter((result) => !result.ok && !result.skipped)
        : [];
      if (failedOps.length > 0) {
        const updatedQueue = readStoredQueue().map((op) => {
          const failed = failedOps.find((f) => f.id === op.id);
          if (!failed) return op;
          const attempts = (op.attemptCount || 0) + 1;
          return {
            ...op,
            attemptCount: attempts,
            failedPermanently: attempts >= MAX_RETRY_ATTEMPTS,
          };
        });
        writeStoredQueue(updatedQueue);
      }

      const remaining = readStoredQueue();
      if (remaining.length > 0 && remaining.some((op) => !op.failedPermanently)) {
        scheduleRetry();
      } else {
        clearRetryTimer();
      }

      writeStoredState({
        syncing: false,
        lastSyncAt: successfulIds.length > 0 ? new Date().toISOString() : readStoredState().lastSyncAt,
        lastError: parsed.ok ? null : parsed.results.find((result) => !result.ok)?.error || null,
      });
      return parsed;
    } catch (error) {
      if (error instanceof OfflineSyncHttpError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : "Falha ao sincronizar operações offline.";
      writeStoredState({ syncing: false, lastError: message });
      scheduleRetry();
      throw error;
    } finally {
      flushPromise = null;
      dispatchUpdate();
    }
  })();

  return flushPromise;
}
