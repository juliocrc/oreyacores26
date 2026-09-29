/**
 * Utilitário Offline-First para Checklists de Inspeção de Jangadas
 * Utiliza localStorage/IndexedDB para guardar rascunhos de inspeção e sincronizar quando online.
 */

export interface OfflineChecklistDraft {
  id: string;
  jangadaId?: number;
  serial: string;
  data: Record<string, unknown>;
  updatedAt: number;
  synced: boolean;
}

const STORAGE_KEY = "orey_offline_checklists_v1";

export const offlineChecklistStore = {
  getAll(): OfflineChecklistDraft[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  saveDraft(draft: Omit<OfflineChecklistDraft, "updatedAt" | "synced">): void {
    if (typeof window === "undefined") return;
    try {
      const items = this.getAll();
      const index = items.findIndex((i) => i.id === draft.id);
      const newItem: OfflineChecklistDraft = {
        ...draft,
        updatedAt: Date.now(),
        synced: false,
      };

      if (index >= 0) {
        items[index] = newItem;
      } else {
        items.push(newItem);
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.error("[OfflineStore] Erro ao guardar rascunho offline:", e);
    }
  },

  removeDraft(id: string): void {
    if (typeof window === "undefined") return;
    try {
      const items = this.getAll().filter((i) => i.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  },

  markSynced(id: string): void {
    if (typeof window === "undefined") return;
    try {
      const items = this.getAll();
      const item = items.find((i) => i.id === id);
      if (item) {
        item.synced = true;
        item.updatedAt = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      }
    } catch {}
  },
};
