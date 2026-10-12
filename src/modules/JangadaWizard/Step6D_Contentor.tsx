"use client";
import React from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { Box } from 'lucide-react';
import { ContainerClosureSection } from './ContainerClosureSection';
import type { ClosureItemState } from './containerClosure';
import { getStepNumberByKey } from './steps';

export default function Step6D_Contentor() {
  const { inspectionData, setInspectionData, hideOrcamento } = useJangadaWizardStore();
  const stepNo = getStepNumberByKey(inspectionData, 'contentor', { hideOrcamento });

  const globalStock = inspectionData.globalStock || [];
  const selected = inspectionData.containerClosureItems || [];

  const toggleClosureItem = (item: ClosureItemState, checked: boolean) => {
    const current = selected.filter((c) => c.key !== item.key);
    const next = checked ? [...current, item] : current;
    setInspectionData({ containerClosureItems: next });
  };

  const updateClosureQuantity = (key: string, quantidade: number) => {
    setInspectionData({
      containerClosureItems: selected.map((c) =>
        c.key === key ? { ...c, quantidade: Number(quantidade) || 0 } : c,
      ),
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">{stepNo > 0 ? `${stepNo}. ` : ''}Contentor</h2>
        <p className="text-slate-600 mt-1">
          Equipamento de fecho e vedação do contentor da jangada — cintas, autocolantes/selos, HRU e reparo.
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-5 py-3">
        <Box className="text-emerald-700 shrink-0" size={18} />
        <p className="text-sm text-emerald-800">
          Os artigos marcados aqui entram automaticamente nas linhas do orçamento. A quantidade disponível é lida do stock.
        </p>
      </div>

      <ContainerClosureSection
        inspectionData={inspectionData}
        globalStock={globalStock}
        selected={selected}
        onToggle={toggleClosureItem}
        onUpdateQuantity={updateClosureQuantity}
      />
    </div>
  );
}