/**
 * OREYACORESDELUXE - Offline-First Sync Manager (IndexedDB / Local Queue)
 */

const DB_NAME = "OreyAcoresOfflineDB";
const STORE_NAME = "pendingActions";
const DB_VERSION = 1;

export function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB not supported"));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
  });
}

export async function queueOfflineAction(actionType: string, payload: any): Promise<void> {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.add({ actionType, payload, createdAt: new Date().toISOString() });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Failed to queue offline action:", err);
  }
}

export async function getPendingOfflineActions(): Promise<Array<{ id: number; actionType: string; payload: any; createdAt: string }>> {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

export async function clearOfflineAction(id: number): Promise<void> {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Failed to clear offline action:", err);
  }
}
