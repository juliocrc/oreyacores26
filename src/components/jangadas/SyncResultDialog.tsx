"use client";
import React from 'react';
import { X, AlertCircle } from 'lucide-react';

export interface SyncResultData {
  success: boolean;
  warning?: string;
  summary?: { added: number; updated: number; stockLinked: number; total: number };
  hasSnapshot?: boolean;
  details?: string;
  packSource?: string;
}

interface SyncResultDialogProps {
  isOpen: boolean;
  loading: boolean;
  result: SyncResultData | null;
  jangadaId: number;
  onClose: () => void;
  onReverted: () => void;
}

export default function SyncResultDialog({
  isOpen,
  loading,
  result,
  jangadaId,
  onClose,
  onReverted,
}: SyncResultDialogProps) {
  if (!isOpen || !result) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800">
            {loading ? 'A sincronizar...' : result.success !== false ? 'Sincronização concluída' : 'Erro na sincronização'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : result.success === false ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-4">
              <AlertCircle size={20} />
              <p className="text-sm">{result.warning || 'Erro desconhecido'}</p>
            </div>
            {result.details && (
              <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 font-mono">{result.details}</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {result.warning && (
              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 rounded-xl p-4">
                <AlertCircle size={20} />
                <p className="text-sm">{result.warning}</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-green-700">{result.summary?.added || 0}</p>
                <p className="text-xs text-green-600 font-medium">Adicionados</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-blue-700">{result.summary?.updated || 0}</p>
                <p className="text-xs text-blue-600 font-medium">Atualizados</p>
              </div>
              <div className="bg-purple-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-purple-700">{result.summary?.stockLinked || 0}</p>
                <p className="text-xs text-purple-600 font-medium">Stock ligado</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 text-center">
              Total de itens no pack: {result.summary?.total ?? '?'}
              {result.packSource ? ` · Fonte: ${result.packSource}` : ''}
            </p>
            {result.hasSnapshot && (
              <button
                onClick={async () => {
                  if (!confirm('Tem a certeza? Isto irá restaurar os artigos ao estado anterior à sincronização.')) return;
                  try {
                    const revRes = await fetch(`/api/jangadas/${jangadaId}/revert-sync`, { method: 'POST' });
                    const revJson = await revRes.json();
                    if (!revRes.ok) throw new Error(revJson.error || revJson.details);
                    alert(`Sync revertido com sucesso! ${revJson.restored} artigos restaurados.`);
                    onReverted();
                  } catch (err: unknown) {
                    alert('Erro ao reverter: ' + (err instanceof Error ? err.message : String(err)));
                  }
                }}
                className="w-full text-center text-sm text-red-600 hover:text-red-800 font-medium py-2 border border-red-200 rounded-xl hover:bg-red-50 transition"
              >
                Reverter sincronização (restaurar artigos anteriores)
              </button>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-medium transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
