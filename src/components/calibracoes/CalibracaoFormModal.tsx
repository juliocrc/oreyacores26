"use client";

import React, { useState } from "react";
import { appToast } from "@/lib/app-toast";
import { agruparTipoOpcoes } from "@/lib/calibracoes";
import type { CalibracaoFormState, TipoOpcao } from "@/lib/calibracoes";

type Props = {
  editId: number | null;
  form: CalibracaoFormState;
  opcoesTipo: TipoOpcao[];
  onChange: (form: CalibracaoFormState) => void;
  onSubmit: (event: React.FormEvent) => void;
  onClose: () => void;
  titulo: string;
};

export function CalibracaoFormModal({ editId, form, opcoesTipo, onChange, onSubmit, onClose, titulo }: Props) {
  const [uploading, setUploading] = useState(false);
  const grupos = agruparTipoOpcoes(opcoesTipo);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const uploadFormData = new FormData();
    uploadFormData.append("file", file);
    uploadFormData.append("folder", "documentacao");

    setUploading(true);
    try {
      const res = await fetch("/api/upload-documento", {
        method: "POST",
        body: uploadFormData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Erro no upload");
      }

      const data = await res.json();
      onChange({ ...form, certificadoUrl: data.filename });
      appToast.success("Ficheiro carregado com sucesso!");
    } catch (err: unknown) {
      appToast.error(err instanceof Error ? err.message : "Erro ao carregar ficheiro");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex justify-end bg-black/45 backdrop-blur-sm transition-all">
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col" style={{ height: "100dvh", maxHeight: "100vh" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-lg font-bold text-slate-900">{editId ? "Editar Registo" : titulo}</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Tipo de Registo *
              </label>
              <select
                value={form.tipo}
                onChange={(e) => onChange({ ...form, tipo: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-600"
              >
                {grupos.map((grupo) => (
                  <optgroup key={grupo.label} label={grupo.label}>
                    {grupo.items.map((opcao) => (
                      <option key={opcao.valor} value={opcao.valor}>
                        {opcao.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Referência / Código *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: BAR-01, MAN-02"
                value={form.referencia}
                onChange={(e) => onChange({ ...form, referencia: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Nome do Equipamento *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Barómetro Digital Testo 511"
                value={form.nome}
                onChange={(e) => onChange({ ...form, nome: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Última Data *
                </label>
                <input
                  type="date"
                  required
                  value={form.dataCalibracao}
                  onChange={(e) => onChange({ ...form, dataCalibracao: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-600 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Próxima Data *
                </label>
                <input
                  type="date"
                  required
                  value={form.dataProxCalibracao}
                  onChange={(e) => onChange({ ...form, dataProxCalibracao: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-600 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Nº Certificado / Documento
              </label>
              <input
                type="text"
                placeholder="Ex: CERT-2026-XYZ"
                value={form.certificadoNum}
                onChange={(e) => onChange({ ...form, certificadoNum: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Observações
              </label>
              <textarea
                rows={2}
                placeholder="Insira notas adicionais..."
                value={form.observacoes}
                onChange={(e) => onChange({ ...form, observacoes: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-600 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Upload do Certificado (PDF / Imagem)
              </label>
              {form.certificadoUrl ? (
                <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <a
                    href={`/api/documentacao/${form.certificadoUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm truncate max-w-[220px]"
                  >
                    {form.certificadoUrl}
                  </a>
                  <button
                    type="button"
                    onClick={() => onChange({ ...form, certificadoUrl: "" })}
                    className="text-red-500 hover:text-red-700 text-xs font-bold"
                  >
                    Remover
                  </button>
                </div>
              ) : (
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  disabled={uploading}
                  onChange={handleUpload}
                  className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer disabled:opacity-60"
                />
              )}
            </div>
          </div>

          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all hover:shadow-xl hover:shadow-indigo-300 active:scale-95"
            >
              💾 Gravar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
