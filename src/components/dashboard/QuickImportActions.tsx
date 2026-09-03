"use client";

import React, { useState } from "react";
import { HardDrive, Loader2, CheckCircle, AlertCircle } from "lucide-react";

import {
  importFromGoogleDriveAction,
  exportToGoogleDriveAction,
} from "@/app/backups/actions";

export default function QuickImportActions() {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const run = async (
    fn: () => Promise<{ success: boolean; message?: string; error?: string }>,
    setLoading: (v: boolean) => void,
    onStarted?: boolean,
  ) => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fn();
      if (res.success) {
        setMsg({ text: res.message || "Operação concluída.", type: "success" });
      } else {
        setMsg({ text: res.error || "Erro na operação.", type: "error" });
      }
    } catch (e) {
      setMsg({ text: "Erro de rede ao executar operação.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <HardDrive className="text-blue-600" size={20} /> Sincronização & Dados
        </h3>
      </div>

      <p className="text-sm text-slate-500">
        Importar a base de dados real do Google Drive para esta instância, ou exportar um backup para a cloud.
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => run(importFromGoogleDriveAction, setImporting)}
          disabled={importing}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-md shadow-blue-600/20 transition disabled:opacity-50"
        >
          {importing ? <Loader2 size={16} className="animate-spin" /> : <HardDrive size={16} />}
          Importar BD do Google Drive
        </button>
        <button
          onClick={() => run(exportToGoogleDriveAction, setExporting)}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-md shadow-emerald-600/20 transition disabled:opacity-50"
        >
          {exporting ? <Loader2 size={16} className="animate-spin" /> : <HardDrive size={16} />}
          Exportar backup p/ Drive
        </button>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 text-sm font-semibold px-4 py-3 rounded-2xl border ${
            msg.type === "success"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-rose-50 text-rose-700 border-rose-200"
          }`}
        >
          {msg.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {msg.text}
        </div>
      )}
    </div>
  );
}
