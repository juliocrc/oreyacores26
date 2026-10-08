"use client";

import React, { useMemo, useState } from "react";
import { Gauge, Plus, ShieldAlert } from "lucide-react";
import { appToast } from "@/lib/app-toast";
import {
  CALIBRACAO_TIPO_OPCOES,
  contarPorEstado,
  createInitialCalibracaoForm,
  formFromRegisto,
  isCalibracaoTipo,
} from "@/lib/calibracoes";
import type { CalibracaoFormState, CalibracaoRegisto } from "@/lib/calibracoes";
import { useCalibracoes } from "@/hooks/useCalibracoes";
import { CalibracaoBancada } from "@/components/calibracoes/CalibracaoBancada";
import { CalibracaoFormModal } from "@/components/calibracoes/CalibracaoFormModal";
import { CalibracaoLista } from "@/components/calibracoes/CalibracaoLista";
import { CalibracaoResumo } from "@/components/calibracoes/CalibracaoResumo";

export default function CalibracoesPage() {
  const { items, loading, guardar, eliminar } = useCalibracoes();
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<CalibracaoFormState>(createInitialCalibracaoForm());

  const registos = useMemo(() => items.filter((i) => isCalibracaoTipo(i.tipo)), [items]);
  const { vencidos } = contarPorEstado(registos);

  function handleOpenCreate() {
    setForm(createInitialCalibracaoForm());
    setEditId(null);
    setShowModal(true);
  }

  function handleOpenEdit(registo: CalibracaoRegisto) {
    setForm(formFromRegisto(registo));
    setEditId(registo.id);
    setShowModal(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.nome || !form.referencia || !form.dataCalibracao || !form.dataProxCalibracao) {
      appToast.warning("Preencha todos os campos obrigatórios");
      return;
    }

    try {
      await guardar(form, editId);
      setShowModal(false);
      setForm(createInitialCalibracaoForm());
      setEditId(null);
    } catch (err: unknown) {
      appToast.error(err instanceof Error ? err.message : "Erro ao guardar registo");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="bg-gradient-to-r from-slate-800 to-indigo-950 rounded-3xl p-8 text-white relative overflow-hidden shadow-lg border border-slate-700">
          <div className="absolute top-0 right-0 opacity-10">
            <Gauge className="w-64 h-64 -mt-10 -mr-10" />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <span className="bg-sky-400/20 text-sky-200 border border-sky-400/30 px-3 py-1 rounded-full text-xs font-semibold tracking-wide">
                METROLOGIA
              </span>
              <h1 className="text-3xl font-black mt-2">Calibrações</h1>
              <p className="text-slate-300 text-sm mt-1 max-w-2xl">
                Controlo do calendário de calibração das ferramentas críticas — barómetros de pressão atmosférica,
                manómetros, balanças e chaves dinamométricas — com certificados e avisos de validade.
              </p>
            </div>
            <button
              onClick={handleOpenCreate}
              className="bg-sky-500 hover:bg-sky-400 text-white font-bold px-5 py-3 rounded-xl transition-all shadow-sm flex items-center gap-2 self-start"
            >
              <Plus className="w-5 h-5" />
              Novo Registo
            </button>
          </div>
        </div>

        {vencidos.length > 0 && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-2xl flex items-center gap-3">
            <ShieldAlert className="w-6 h-6 text-red-600 shrink-0" />
            <div>
              <p className="font-bold">Atenção: Calibrações Vencidas!</p>
              <p className="text-xs text-red-700">
                Existem {vencidos.length} registo{vencidos.length === 1 ? "" : "s"} cuja calibração está vencida.
                Regularize para garantir conformidade legal.
              </p>
            </div>
          </div>
        )}

        <CalibracaoResumo registos={registos} rotuloTotal="Equipamentos" />

        <CalibracaoBancada
          registos={registos}
          onEdit={handleOpenEdit}
          rotuloData="Próx. calibração"
          rotuloAtualizacao="Registo atualizado"
          acaoEditar="Editar / Verificar"
          acaoRecalibrar="Recalibrar"
        />

        <CalibracaoLista
          registos={registos}
          loading={loading}
          onEdit={handleOpenEdit}
          onDelete={eliminar}
          vazioTexto="Nenhum equipamento de calibração registado."
        />
      </div>

      {showModal && (
        <CalibracaoFormModal
          editId={editId}
          form={form}
          opcoesTipo={CALIBRACAO_TIPO_OPCOES}
          onChange={setForm}
          onSubmit={handleSubmit}
          onClose={() => {
            setShowModal(false);
            setEditId(null);
          }}
          titulo="Nova Calibração"
        />
      )}
    </div>
  );
}
