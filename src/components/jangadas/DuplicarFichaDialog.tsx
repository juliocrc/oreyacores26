"use client";
import React, { useState, useEffect } from 'react';
import { Copy, X, Loader2 } from 'lucide-react';

interface DuplicarFichaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  serial: string;
  brand?: string;
  model?: string;
  capacity?: number | string;
  saving: boolean;
  onDuplicar: (serial: string, copiarArtigos: boolean) => void;
}

export default function DuplicarFichaDialog({
  isOpen,
  onClose,
  serial,
  brand,
  model,
  capacity,
  saving,
  onDuplicar,
}: DuplicarFichaDialogProps) {
  const [duplicarSerial, setDuplicarSerial] = useState("");
  const [copiarArtigos, setCopiarArtigos] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setDuplicarSerial("");
      setCopiarArtigos(true);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center font-bold">
              <Copy size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Duplicar Ficha da Jangada</h3>
              <p className="text-xs text-slate-500">
                Cria uma nova ficha a partir de <span className="font-mono font-semibold">{serial}</span> ({brand || 'EUROVINIL'} {model || 'COMPACT DRY'}, {capacity}P).
              </p>
            </div>
          </div>
          <button onClick={() => !saving && onClose()} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Nº de Série da Nova Jangada</label>
            <input
              type="text"
              value={duplicarSerial}
              onChange={(e) => setDuplicarSerial(e.target.value)}
              placeholder="Ex: 2088-EV-2026-01"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-cyan-100 outline-none font-medium"
            />
            <p className="text-xs text-slate-400 mt-1">Os dados de inspecção, certificados, testes e validades não são copiados.</p>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-all">
            <input
              type="checkbox"
              checked={copiarArtigos}
              onChange={(e) => setCopiarArtigos(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded accent-cyan-600"
            />
            <div>
              <p className="text-sm font-bold text-slate-700">Copiar consumíveis do pack</p>
              <p className="text-xs text-slate-500">Copia os artigos/consumíveis actuais da jangada original para a nova ficha.</p>
            </div>
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold text-slate-700 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !duplicarSerial.trim()}
            onClick={() => onDuplicar(duplicarSerial, copiarArtigos)}
            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />}
            {saving ? "A Duplicar..." : "Duplicar Ficha"}
          </button>
        </div>
      </div>
    </div>
  );
}
