"use client";

import React from "react";

export type TecnicoFormState = {
  nome: string;
  email: string;
  serviceStationId: string;
  ativo: boolean;
  observacoes: string;
};

export type EstacaoOpcao = {
  id: number;
  nome: string;
  codigo: string;
};

type Props = {
  editId: number | null;
  form: TecnicoFormState;
  estacoes: EstacaoOpcao[];
  saving: boolean;
  erro: string;
  onChange: (form: TecnicoFormState) => void;
  onSubmit: (event: React.FormEvent) => void;
  onClose: () => void;
};

export function TecnicoFormModal({
  editId,
  form,
  estacoes,
  saving,
  erro,
  onChange,
  onSubmit,
  onClose,
}: Props) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">
            {editId ? "Editar Técnico" : "Novo Técnico"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="space-y-4 px-6 py-5">
            {erro ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {erro}
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Nome *
              </label>
              <input
                type="text"
                required
                value={form.nome}
                onChange={(e) => onChange({ ...form, nome: e.target.value })}
                placeholder="Ex: Julio Correia"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => onChange({ ...form, email: e.target.value })}
                placeholder="nome@orey.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-600"
              />
              <p className="mt-1 text-xs text-slate-500">
                Sem email o técnico não consegue iniciar sessão no arranque.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Estação de Serviço
              </label>
              <select
                value={form.serviceStationId}
                onChange={(e) => onChange({ ...form, serviceStationId: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="">Sem estação atribuída</option>
                {estacoes.map((estacao) => (
                  <option key={estacao.id} value={estacao.id}>
                    {estacao.nome} ({estacao.codigo})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Observações
              </label>
              <textarea
                rows={2}
                value={form.observacoes}
                onChange={(e) => onChange({ ...form, observacoes: e.target.value })}
                placeholder="Notas internas sobre o técnico..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => onChange({ ...form, ativo: e.target.checked })}
              />
              Técnico ativo (disponível para seleção no arranque)
            </label>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 font-bold text-slate-600 transition-colors hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-5 py-2 font-bold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-60"
            >
              {saving ? "A guardar..." : "Gravar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
