"use client";
import React, { useState } from "react";
import { useColeteWizardStore } from "./store/useColeteWizardStore";
import { ArrowLeft, ChevronRight, Activity, ChevronDown, Package, CheckCircle2, RefreshCw, X } from "lucide-react";
import { maskMonthYearInput, toMonthYearString } from "@/lib/date-utils";

type Props = {
  onNext: () => void;
  onPrev: () => void;
};

export default function Step3_Componentes({ onNext, onPrev }: Props) {
  const { inspectionData, setInspectionData, globalStock } = useColeteWizardStore();
  const componentes = inspectionData.componentes || [];
  const [editingId, setEditingId] = useState<string | null>(null);

  const updateItem = (id: string, field: string, value: any) => {
    setInspectionData({
      componentes: componentes.map((comp) =>
        comp.id === id ? { ...comp, [field]: value } : comp
      )
    });
  };

  const visibleComponentes = componentes.filter((comp) => comp.id !== 'light' || inspectionData.temLuz !== false);

  const handleStockSelect = (id: string, stockIdStr: string) => {
    const stockId = parseInt(stockIdStr, 10);
    const stockItem = globalStock.find((s) => s.id === stockId);
    if (stockItem) {
      setInspectionData({
        componentes: componentes.map((comp) => 
          comp.id === id ? { 
            ...comp, 
            reference: stockItem.referencia,
            stockId: stockItem.id,
            validade: (comp.id === 'cylinder' || comp.id === 'whistle') ? comp.validade : (toMonthYearString(stockItem.validade) || comp.validade),
            lote: stockItem.lote || comp.lote
          } : comp
        )
      });
    }
  };

  const handleConfirmReplace = (id: string) => {
    const comp = componentes.find((c) => c.id === id);
    if (comp && comp.stockId) {
      updateItem(id, 'substituido', true);
      setEditingId(null);
    }
  };

  const handleCancelReplace = (id: string) => {
    updateItem(id, 'substituido', false);
    updateItem(id, 'stockId', null);
    updateItem(id, 'reference', '');
    setEditingId(null);
  };

  const getFilteredStock = (compId: string) => {
    return globalStock.filter(s => {
      const desc = s.descricao.toLowerCase();
      const cat = s.categoria?.toLowerCase() || '';
      if (compId === 'cylinder') return cat.includes('cilindro') || desc.includes('co2') || desc.includes('cylinder');
      if (compId === 'cartridge') return cat.includes('bobbin') || cat.includes('pastilha') || desc.includes('cartridge') || desc.includes('bobbin');
      if (compId === 'light') return cat.includes('luz') || desc.includes('light');
      if (compId === 'whistle') return cat.includes('apito') || desc.includes('whistle') || desc.includes('apito');
      return true;
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">3. Componentes e Peças</h2>
        <p className="text-slate-600 mt-1">Registe as peças de reposição instaladas. Clique em &quot;Substituir&quot; para selecionar um artigo do Stock Global.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Configuração de Componentes</h3>
          <p className="text-xs text-slate-500">Indique quais os componentes instalados neste colete.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-slate-700">Colete tem luz de emergência?</label>
          <select
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            value={inspectionData.temLuz === false ? 'nao' : 'sim'}
            onChange={(e) => setInspectionData({ temLuz: e.target.value === 'sim' })}
          >
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {visibleComponentes.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 bg-slate-50 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
            <Package size={48} className="w-12 h-12 text-slate-300 mb-3" />
            <h3 className="text-lg font-semibold text-slate-700 mb-1">Nenhum componente registado</h3>
            <p className="text-sm text-slate-500 max-w-md">
              {componentes.length > 0
                ? "Todos os componentes deste colete estão ocultos pela configuração atual. Altere a resposta sobre a luz de emergência para os voltar a listar."
                : "Clique em “Substituir” no componente pretendido para associar o artigo do Stock Global."}
            </p>
          </div>
        ) : null}
        {visibleComponentes.map((comp) => {
          const availableStock = getFilteredStock(comp.id);
          const isEditing = editingId === comp.id;

          return (
            <div key={comp.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:border-indigo-200 transition-colors">
              <div className="flex items-center gap-3 mb-5 border-b border-slate-100 pb-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  {comp.id === 'light' ? <Activity size={20} /> : <Package size={20} />}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-800">{comp.name}</h3>
                  {comp.substituido && comp.stockId && (
                    <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1 mt-0.5">
                      <CheckCircle2 size={12} /> Substituído — Ref: {comp.reference}
                    </p>
                  )}
                </div>
                {!isEditing && !comp.substituido && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(comp.id);
                      updateItem(comp.id, 'stockId', null);
                      updateItem(comp.id, 'reference', '');
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors"
                  >
                    <RefreshCw size={14} />
                    Substituir
                  </button>
                )}
                {!isEditing && comp.substituido && (
                  <button
                    type="button"
                    onClick={() => handleCancelReplace(comp.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <X size={14} />
                    Reverter
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Artigo do Stock
                      </label>
                      <div className="relative">
                        <select
                          value={comp.stockId || ""}
                          onChange={(e) => handleStockSelect(comp.id, e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-100 appearance-none font-medium text-sm transition-colors"
                        >
                          <option value="" disabled>Selecione um artigo do stock...</option>
                          {availableStock.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.referencia} - {s.descricao} (Lote: {s.lote || 'N/A'}, Qtd: {s.quantidade})
                            </option>
                          ))}
                        </select>
                        <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                          <ChevronDown size={16} className="text-slate-400" />
                        </div>
                      </div>
                    </div>

                    {comp.id !== 'cylinder' && comp.id !== 'whistle' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Validade
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="MM/AAAA"
                        maxLength={7}
                        value={toMonthYearString(comp.validade)}
                        onChange={(e) => updateItem(comp.id, 'validade', maskMonthYearInput(e.target.value))}
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-100 transition-colors text-sm font-medium"
                      />
                    </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Lote
                      </label>
                      <input
                        type="text"
                        value={comp.lote}
                        placeholder="Ex: L2345"
                        onChange={(e) => updateItem(comp.id, 'lote', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-100 transition-colors text-sm font-medium"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleCancelReplace(comp.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      <X size={14} />
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConfirmReplace(comp.id)}
                      disabled={!comp.stockId}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <CheckCircle2 size={14} />
                      Confirmar Substituição
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5">
                  <div className="lg:col-span-4 space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Referência</label>
                    <div className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 text-slate-700 text-sm font-medium">
                      {comp.reference || '—'}
                    </div>
                  </div>
                  {comp.id !== 'cylinder' && comp.id !== 'whistle' ? (
                  <div className="lg:col-span-3 space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Validade</label>
                    <input
                      type="month"
                      value={comp.validade}
                      onChange={(e) => updateItem(comp.id, 'validade', e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-100 transition-colors text-sm font-medium"
                    />
                  </div>
                  ) : <div className="hidden lg:block lg:col-span-3" />}
                  <div className="lg:col-span-3 space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Lote</label>
                    <input
                      type="text"
                      value={comp.lote}
                      placeholder="Ex: L2345"
                      onChange={(e) => updateItem(comp.id, 'lote', e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-100 transition-colors text-sm font-medium"
                    />
                  </div>
                  <div className="lg:col-span-2 space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Qtd</label>
                    <div className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 text-slate-700 text-sm font-medium">
                      {(comp as any).quantidade || 1}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between pt-4">
        <button
          onClick={onPrev}
          className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm"
        >
          <ArrowLeft size={18} /> Voltar
        </button>
        <button
          onClick={onNext}
          className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-sm"
        >
          Próximo Passo <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
