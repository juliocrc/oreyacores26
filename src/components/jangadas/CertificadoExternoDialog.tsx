"use client";
import React, { useState, useEffect } from 'react';
import { FileText, X, Upload } from 'lucide-react';
import { appToast } from "@/lib/app-toast";

interface CertificadoExternoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  jangadaId: number;
  initialNumero: string;
  initialUrl: string;
  onSaved: (numero: string, url: string) => void;
}

export default function CertificadoExternoDialog({
  isOpen,
  onClose,
  jangadaId,
  initialNumero,
  initialUrl,
  onSaved,
}: CertificadoExternoDialogProps) {
  const [numero, setNumero] = useState(initialNumero);
  const [url, setUrl] = useState(initialUrl);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNumero(initialNumero);
      setUrl(initialUrl);
    }
  }, [isOpen, initialNumero, initialUrl]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Certificado Externo (DSB / RFD / Zodiac)</h3>
              <p className="text-xs text-slate-500">Registe o número e carregue o PDF do certificado do fabricante.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Nº do Certificado Externo</label>
            <input
              type="text"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="Ex: DSB-CERT-2026-99"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-amber-100 outline-none font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Documento PDF do Certificado</label>
            <div className="flex items-center gap-3">
              <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-xl cursor-pointer bg-slate-50 hover:bg-amber-50/30 transition-all text-xs font-bold text-slate-600">
                <Upload size={16} className="text-amber-600" />
                <span>{url ? "Substituir Ficheiro PDF" : "Carregar Ficheiro PDF"}</span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      setSaving(true);
                      const fd = new FormData();
                      fd.append("file", file);
                      fd.append("categoria", "certificados");
                      const res = await fetch("/api/upload-documento", {
                        method: "POST",
                        body: fd,
                      });
                      const json = await res.json();
                      if (!res.ok) throw new Error(json.error || "Erro no upload");
                      const fileUrl = json.url || json.path || json.fileUrl;
                      if (fileUrl) {
                        setUrl(fileUrl);
                        appToast.success("PDF carregado com sucesso!");
                      }
                    } catch (err: unknown) {
                      appToast.error(err instanceof Error ? err.message : "Erro ao carregar PDF");
                    } finally {
                      setSaving(false);
                    }
                  }}
                />
              </label>
            </div>
            {url && (
              <div className="mt-2 flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-emerald-800 hover:underline flex items-center gap-1.5 truncate">
                  <FileText size={14} className="shrink-0" />
                  <span className="truncate">Ver Certificado PDF Carregado</span>
                </a>
                <button
                  type="button"
                  onClick={() => setUrl("")}
                  className="text-xs text-red-600 hover:text-red-800 font-semibold ml-2 shrink-0"
                >
                  Remover
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold text-slate-700 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              try {
                setSaving(true);
                const res = await fetch(`/api/jangadas/${jangadaId}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    certificadoExternoNumero: numero,
                    certificadoExternoUrl: url,
                  }),
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || "Erro ao guardar certificado externo");
                onSaved(numero, url);
                appToast.success("Certificado externo guardado com sucesso!");
                onClose();
              } catch (err: unknown) {
                appToast.error(err instanceof Error ? err.message : "Erro ao guardar");
              } finally {
                setSaving(false);
              }
            }}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50"
          >
            {saving ? "A Guardar..." : "Guardar Certificado"}
          </button>
        </div>
      </div>
    </div>
  );
}
