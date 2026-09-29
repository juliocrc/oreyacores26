"use client";

import * as React from "react";
import {
  clearOfflineSyncError,
  flushOfflineSyncQueue,
  getLegacyOfflineInspectionsCount,
  getOfflineSyncQueue,
  getOfflineSyncState,
  importLegacyOfflineInspections,
  removeOfflineSyncOperations,
  retryOfflineSyncOperations,
  subscribeOfflineSync,
} from "@/lib/offline-sync/client";
import type { OfflineSyncOperation, OfflineSyncState } from "@/lib/offline-sync/types";
import { RotateCcw, Trash2, WifiOff, DatabaseBackup, RefreshCw, X } from "lucide-react";

const subscribeToHydration = () => () => {};
const getHydratedSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

function formatSyncMoment(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("pt-PT");
}

function formatOperationTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function shortPath(path: string) {
  try {
    const url = path.includes("/api/") ? path.substring(path.indexOf("/api/")) : path;
    return url.length > 46 ? `${url.slice(0, 43)}…` : url;
  } catch {
    return path;
  }
}

const ENTITY_LABELS: Record<string, string> = {
  "jangada-inspection": "Inspeção de jangada",
  "inspecao-legado": "Inspeção legada",
  "ordem-servico": "Ordem de serviço",
  "stock-artigo": "Artigo de stock",
  "fato-imersao": "Fato de imersão",
  "colete-inspection": "Insp. de colete",
  "colete": "Colete",
  "jangada": "Jangada",
  "outros": "Outros",
};

const ENTITY_TONES: Record<string, string> = {
  "jangada-inspection": "bg-sky-100 text-sky-700",
  "inspecao-legado": "bg-sky-100 text-sky-700",
  "ordem-servico": "bg-indigo-100 text-indigo-700",
  "stock-artigo": "bg-emerald-100 text-emerald-700",
  "fato-imersao": "bg-cyan-100 text-cyan-700",
  "colete-inspection": "bg-violet-100 text-violet-700",
  "colete": "bg-violet-100 text-violet-700",
  "jangada": "bg-amber-100 text-amber-700",
  "outros": "bg-slate-100 text-slate-600",
};

const METHOD_TONES: Record<string, string> = {
  POST: "bg-green-100 text-green-700",
  PUT: "bg-amber-100 text-amber-700",
  PATCH: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
};

export default function OfflineSyncStatus() {
  const mounted = React.useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydrationSnapshot,
  );
  const [state, setState] = React.useState<OfflineSyncState>({
    online: true,
    pendingCount: 0,
    syncing: false,
    lastSyncAt: null,
    lastError: null,
  });
  const [queue, setQueue] = React.useState<OfflineSyncOperation[]>([]);
  const [expanded, setExpanded] = React.useState(false);
  const [legacyCount, setLegacyCount] = React.useState(0);

  const refresh = React.useCallback(() => {
    setState(getOfflineSyncState());
    setQueue(getOfflineSyncQueue());
    setLegacyCount(getLegacyOfflineInspectionsCount());
  }, []);

  React.useEffect(() => {
    const unsubscribe = subscribeOfflineSync(refresh);
    const refreshTimeout = window.setTimeout(refresh, 0);
    return () => {
      window.clearTimeout(refreshTimeout);
      unsubscribe();
    };
  }, [refresh]);

  const groups = React.useMemo(() => {
    const grouped = new Map<string, OfflineSyncOperation[]>();
    for (const op of queue) {
      const key = (op.entityType || "outros") in ENTITY_LABELS ? (op.entityType || "outros") : "outros";
      const list = grouped.get(key) || [];
      list.push(op);
      grouped.set(key, list);
    }
    return Array.from(grouped.entries());
  }, [queue]);

  if (!mounted) {
    return null;
  }

  const hasPending = state.pendingCount > 0;
  const toneClasses = !state.online
    ? "border-amber-300 bg-amber-50 text-amber-800"
    : hasPending
      ? "border-blue-300 bg-blue-50 text-blue-800"
      : "border-emerald-300 bg-emerald-50 text-emerald-800";

  const handleSyncAll = async () => {
    await flushOfflineSyncQueue();
    refresh();
  };

  const handleImportLegacy = async () => {
    const imported = importLegacyOfflineInspections();
    if (imported > 0) {
      refresh();
    }
  };

  const handleRemove = (opId: string) => {
    removeOfflineSyncOperations([opId]);
    refresh();
  };

  const handleRetry = (opId: string) => {
    retryOfflineSyncOperations([opId]);
    refresh();
  };

  return (
    <div className={`fixed bottom-4 right-4 z-[1200] w-[min(92vw,24rem)] rounded-xl border shadow-lg ${toneClasses}`}>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <div className="text-sm font-semibold">
            {!state.online ? "Modo offline ativo" : hasPending ? "Sincronização pendente" : "Dados sincronizados"}
          </div>
          <div className="text-xs opacity-90">
            {hasPending
              ? `${state.pendingCount} operação(ões) por sincronizar`
              : legacyCount > 0
                ? `${legacyCount} rascunho(s) antigo(s) para importar`
                : "Sem pendências na fila local"}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
          {!state.online ? <WifiOff size={14} /> : state.syncing ? <RefreshCw size={14} className="animate-spin" /> : null}
          {state.syncing ? "sync..." : expanded ? "menos" : "mais"}
        </div>
      </button>

      {expanded ? (
        <div className="max-h-[70vh] overflow-y-auto border-t border-black/10 px-4 py-3 text-xs">
          <div className="space-y-1">
            <p>
              <b>Estado:</b> {state.online ? "online" : "offline"}
            </p>
            <p>
              <b>Pendentes:</b> {state.pendingCount}
            </p>
            <p>
              <b>Última sincronização:</b> {formatSyncMoment(state.lastSyncAt)}
            </p>
            {state.lastError ? (
              <p className="text-rose-700">
                <b>Último erro:</b> {state.lastError}
              </p>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSyncAll()}
              disabled={!state.online || state.syncing || state.pendingCount === 0}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:opacity-50"
            >
              Sincronizar agora
            </button>
            {legacyCount > 0 ? (
              <button
                type="button"
                onClick={() => void handleImportLegacy()}
                className="flex items-center gap-1 rounded border border-sky-300 bg-sky-50 px-3 py-1.5 font-medium text-sky-700"
              >
                <DatabaseBackup size={13} /> Importar rascunhos antigos ({legacyCount})
              </button>
            ) : null}
            {state.lastError ? (
              <button
                type="button"
                onClick={() => clearOfflineSyncError()}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700"
              >
                Limpar erro
              </button>
            ) : null}
          </div>

          {queue.length > 0 ? (
            <div className="mt-4 space-y-3">
              <p className="font-semibold uppercase tracking-wide text-[10px] text-slate-500">Operações por sincronizar</p>
              {groups.map(([entityType, ops]) => (
                <div key={entityType}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ENTITY_TONES[entityType]}`}>
                      {ENTITY_LABELS[entityType]}
                    </span>
                    <span className="text-[10px] text-slate-400">{ops.length}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {ops.map((op) => (
                      <li key={op.id} className="rounded-lg border border-slate-200 bg-white p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`rounded px-1 py-0.5 text-[9px] font-bold ${METHOD_TONES[op.method] || "bg-slate-100 text-slate-600"}`}>
                                {op.method}
                              </span>
                              <span className="truncate font-medium text-slate-700">{oppSummary(op)}</span>
                            </div>
                            <div className="mt-0.5 text-slate-400">{shortPath(op.path)}</div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {op.failedPermanently ? (
                              <span className="rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold text-red-700">FALHOU</span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => handleRetry(op.id)}
                              disabled={op.attemptCount === 0 && !op.failedPermanently}
                              title="Repetir"
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                            >
                              <RotateCcw size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemove(op.id)}
                              title="Remover da fila"
                              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[9px] text-slate-400">
                          <span>{formatOperationTime(op.createdAt)}</span>
                          {typeof op.attemptCount === "number" && op.attemptCount > 0 ? (
                            <span>{op.attemptCount} tentativa(s)</span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-slate-400">A fila local está vazia. Nenhuma operação por sincronizar.</p>
          )}
        </div>
      ) : null}

      {expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="absolute -top-2 -right-2 rounded-full border border-slate-200 bg-white p-1 text-slate-500 shadow-sm hover:text-slate-800"
          title="Fechar"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}

function oppSummary(op: OfflineSyncOperation) {
  if (op.summary) return op.summary;
  return `${op.method} ${shortPath(op.path)}`;
}