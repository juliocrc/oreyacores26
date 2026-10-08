"use client";

import React from "react";
import type { TecnicoRow } from "@/types/tecnicos-page";

type Props = {
  tecnicos: TecnicoRow[];
  vazioTexto: string;
  onOpenAusencias: (nome: string, id: number) => void;
  onEdit?: (tecnico: TecnicoRow) => void;
  onToggleAtivo?: (tecnico: TecnicoRow) => void;
  onDelete?: (tecnico: TecnicoRow) => void;
};

/**
 * Linhas com id negativo são o roster de fallback (AZORES_TECHNICIANS) devolvido
 * pela API quando a estação ainda não tem técnicos reais na base de dados. Não
 * são linhas persistidas, por isso não são editáveis.
 */
function isTecnicoReal(tecnico: TecnicoRow) {
  return tecnico.id > 0;
}

export function TecnicoTabela({
  tecnicos,
  vazioTexto,
  onOpenAusencias,
  onEdit,
  onToggleAtivo,
  onDelete,
}: Props) {
  const mostrarAcoes = Boolean(onEdit && onToggleAtivo && onDelete);

  return (
    <div className="overflow-x-auto bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead>
          <tr className="bg-slate-100 text-left text-slate-600">
            <th className="px-3 py-2 font-semibold">Nome</th>
            <th className="px-3 py-2 font-semibold">Email</th>
            <th className="px-3 py-2 font-semibold">Estado</th>
            {mostrarAcoes ? <th className="px-3 py-2 font-semibold">Ações</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tecnicos.length === 0 ? (
            <tr>
              <td colSpan={mostrarAcoes ? 4 : 3} className="px-3 py-6 text-center text-sm text-slate-500">
                {vazioTexto}
              </td>
            </tr>
          ) : (
            tecnicos.map((tecnico) => {
              const real = isTecnicoReal(tecnico);
              return (
                <tr key={tecnico.id}>
                  <td className="px-3 py-3 font-medium text-slate-900">
                    <button
                      type="button"
                      onClick={() => onOpenAusencias(tecnico.nome, tecnico.id)}
                      className="rounded px-1 py-0.5 text-left text-blue-700 transition hover:bg-blue-50 hover:underline"
                      title="Gerir ausências/férias"
                    >
                      {tecnico.nome}
                    </button>
                    {!real ? (
                      <span
                        className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600"
                        title="Roster de fallback: ainda não existe na base de dados"
                      >
                        roster
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{tecnico.email || "—"}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        tecnico.ativo ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {tecnico.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  {mostrarAcoes ? (
                    <td className="px-3 py-3">
                      {real ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onEdit?.(tecnico)}
                            className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleAtivo?.(tecnico)}
                            className={`rounded border px-2 py-1 text-xs font-semibold transition ${
                              tecnico.ativo
                                ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                                : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                            }`}
                          >
                            {tecnico.ativo ? "Desativar" : "Ativar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete?.(tecnico)}
                            className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                          >
                            Eliminar
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
