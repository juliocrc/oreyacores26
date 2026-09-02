"use client";
import React, { useState } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { Hammer, Plus, Trash2, TriangleAlert, CheckCircle2, Wrench } from 'lucide-react';
import { appToast } from '@/lib/app-toast';

type Reparacao = {
  id: string;
  tipo: string;
  descricao: string;
  zona: string;
  materiais: string;
  custo: number;
};

const TIPOS = [
  'Colagem',
  'Re-colação das costuras',
  'Reparação de furo',
  'Substituição de tecido',
  'Reparação da câmara de insuflação',
  'Reparação de costura',
  'Colagem de patch',
  'Outra',
];

export default function Step6B_Reparacoes() {
  const { inspectionData, setInspectionData } = useJangadaWizardStore();
  const repairList: Reparacao[] = (inspectionData.reparacoes || []) as Reparacao[];
  const nuncaReparada = String(inspectionData.testes?.testeWP || '').toUpperCase() === 'REPROVOU';

  const [draft, setDraft] = useState({
    tipo: TIPOS[0],
    descricao: '',
    zona: '',
    materiais: '',
    custo: '',
  });

  const updateRepairs = (next: Reparacao[]) => {
    setInspectionData({ ...inspectionData, reparacoes: next });
  };

  const addRepair = () => {
    if (!draft.descricao.trim()) {
      appToast.warning("Descreva a reparação/colagem a realizar.");
      return;
    }
    const nova: Reparacao = {
      id: `rep-${Date.now()}`,
      tipo: draft.tipo,
      descricao: draft.descricao.trim(),
      zona: draft.zona.trim(),
      materiais: draft.materiais.trim(),
      custo: Number(draft.custo) || 0,
    };
    updateRepairs([...repairList, nova]);
    setDraft({ tipo: TIPOS[0], descricao: '', zona: '', materiais: '', custo: '' });
    appToast.success("Reparação registada.");
  };

  const removeRepair = (id: string) => {
    updateRepairs(repairList.filter((r) => r.id !== id));
  };

  const custoTotal = repairList.reduce((s, r) => s + (Number(r.custo) || 0), 0);

  const inputCls =
    'w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors';

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
          <Hammer size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800">Reparações / Colagem</h2>
          <p className="text-sm text-slate-500 mt-1">
            O teste WP reprovou, pelo que as reparações indicadas abaixo devem ser registadas antes da nova certificação.
          </p>
        </div>
      </div>

      {!nuncaReparada ? (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 flex items-start gap-3">
          <CheckCircle2 size={20} className="text-blue-500 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-800">
            Sem reprovação no teste WP — este passo é opcional. Pode registar intervenções preventivas se necessário.
          </p>
        </div>
      ) : (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-3">
          <TriangleAlert size={20} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-800">
            <span className="font-bold">Teste WP reprovado.</span> Registe as colagens/reparações necessárias para garantir a
            estanquicidade antes da nova certificação.
          </p>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-3xl p-6 lg:p-8 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
          <Wrench className="text-amber-500" />
          Registar Intervenção
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tipo de Intervenção</label>
            <select className={inputCls} value={draft.tipo} onChange={(e) => setDraft({ ...draft, tipo: e.target.value })}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Zona / Localização</label>
            <input
              type="text"
              className={inputCls}
              placeholder="Ex: Câmara inferior, lado B, terço junto ao bocal"
              value={draft.zona}
              onChange={(e) => setDraft({ ...draft, zona: e.target.value })}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Descrição</label>
            <textarea
              className={`${inputCls} min-h-[90px] resize-y`}
              placeholder="Descreva a reparação/colagem a realizar (dimensões, materiais, estado encontrado...)"
              value={draft.descricao}
              onChange={(e) => setDraft({ ...draft, descricao: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Materiais Utilizados</label>
            <input
              type="text"
              className={inputCls}
              placeholder="Ex: cola, patch PVC 100x100mm"
              value={draft.materiais}
              onChange={(e) => setDraft({ ...draft, materiais: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Custo (EUR)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              placeholder="0.00"
              value={draft.custo}
              onChange={(e) => setDraft({ ...draft, custo: e.target.value })}
            />
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={addRepair}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white bg-amber-500 hover:bg-amber-600 shadow-md transition-all"
          >
            <Plus size={18} />
            Adicionar Intervenção
          </button>
        </div>
      </div>

      {repairList.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 lg:p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Hammer className="text-amber-500" />
              Intervenções Registadas
            </h3>
            <span className="text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
              Custo total: {custoTotal.toFixed(2)} €
            </span>
          </div>

          <div className="space-y-3">
            {repairList.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                      {r.tipo}
                    </span>
                    {r.zona && <span className="text-xs font-semibold text-slate-500">{r.zona}</span>}
                  </div>
                  <p className="text-sm font-semibold text-slate-800 mt-1.5">{r.descricao}</p>
                  {r.materiais && <p className="text-xs text-slate-500 mt-1">Material: {r.materiais}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-bold text-slate-700">
                    {(Number(r.custo) || 0).toFixed(2)} €
                  </span>
                  <button
                    onClick={() => removeRepair(r.id)}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                    title="Remover intervenção"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}