"use client";

import React, { useMemo, useState } from "react";
import { Plus, ShieldAlert, Wrench } from "lucide-react";
import { appToast } from "@/lib/app-toast";
import {
  COMPRESSOR_TIPO_OPCOES,
  contarPorEstado,
  createInitialCalibracaoForm,
  formFromRegisto,
  isCompressorTipo,
} from "@/lib/calibracoes";
import type { CalibracaoFormState, CalibracaoRegisto } from "@/lib/calibracoes";
import { useCalibracoes } from "@/hooks/useCalibracoes";
import { CalibracaoBancada } from "@/components/calibracoes/CalibracaoBancada";
import { CalibracaoFormModal } from "@/components/calibracoes/CalibracaoFormModal";
import { CalibracaoLista } from "@/components/calibracoes/CalibracaoLista";
import { CalibracaoResumo } from "@/components/calibracoes/CalibracaoResumo";

export default function OficinaPage() {
  const { items, loading, guardar, eliminar } = useCalibracoes({ seedCompressor: true });
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<CalibracaoFormState>(createInitialCalibracaoForm("compressor_oleo"));

  const registos = useMemo(() => items.filter((i) => isCompressorTipo(i.tipo)), [items]);
  const { vencidos } = contarPorEstado(registos);

  function handleOpenCreate() {
    setForm(createInitialCalibracaoForm("compressor_oleo"));
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
      setForm(createInitialCalibracaoForm("compressor_oleo"));
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
            <Wrench className="w-64 h-64 -mt-10 -mr-10" />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <span className="bg-sky-400/20 text-sky-200 border border-sky-400/30 px-3 py-1 rounded-full text-xs font-semibold tracking-wide">
                OFICINA
              </span>
              <h1 className="text-3xl font-black mt-2">Manutenção do Compressor</h1>
              <p className="text-slate-300 text-sm mt-1 max-w-2xl">
                Manutenção programada do compressor Michelin 300L — substituição de óleo, filtro de ar, purga de
                condensados e inspeção da válvula de segurança.
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
              <p className="font-bold">Atenção: Manutenção Vencida!</p>
              <p className="text-xs text-red-700">
                Existem {vencidos.length} registo{vencidos.length === 1 ? "" : "s"} de manutenção por executar.
                Regularize para garantir conformidade legal.
              </p>
            </div>
          </div>
        )}

        <CalibracaoResumo registos={registos} rotuloTotal="Registos" />

        <CalibracaoBancada
          registos={registos}
          onEdit={handleOpenEdit}
          rotuloData="Próxima manutenção"
          rotuloAtualizacao="Registo atualizado"
          acaoEditar="Editar / Verificar"
          acaoRecalibrar="Executar"
        />

        <CalibracaoLista
          registos={registos}
          loading={loading}
          onEdit={handleOpenEdit}
          onDelete={eliminar}
          vazioTexto="Nenhum registo de manutenção do compressor."
        />
      </div>

      {showModal && (
        <CalibracaoFormModal
          editId={editId}
          form={form}
          opcoesTipo={COMPRESSOR_TIPO_OPCOES}
          onChange={setForm}
          onSubmit={handleSubmit}
          onClose={() => {
            setShowModal(false);
            setEditId(null);
          }}
          titulo="Nova Manutenção"
        />
      )}
    </div>
  );
}
