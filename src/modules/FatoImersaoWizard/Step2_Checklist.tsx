"use client";

import React from "react";
import { ArrowLeft, ChevronRight, CheckCircle2, AlertCircle, Info, XCircle } from "lucide-react";
import { FATO_CHECKLIST_ITEMS } from "@/lib/fatos-imersao-checklist";
import { useFatoImersaoWizardStore } from "./store/useFatoImersaoWizardStore";
import ImmersionSuitDiagram from "@/components/fatos-imersao/ImmersionSuitDiagram";

type Props = { onNext: () => void; onPrev: () => void };

const BTNS = [
  { v: "OK", label: "OK", icon: CheckCircle2, active: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { v: "F", label: "Falha", icon: AlertCircle, active: "bg-red-100 text-red-800 border-red-200" },
  { v: "R", label: "Reparado", icon: Info, active: "bg-blue-100 text-blue-800 border-blue-200" },
  { v: "N/A", label: "N/A", icon: XCircle, active: "bg-slate-200 text-slate-800 border-slate-300" },
] as const;

export default function Step2_Checklist({ onNext, onPrev }: Props) {
  const { inspectionData, setChecklistItem, toggleZonaFuga } = useFatoImersaoWizardStore();
  const groups = [
    { id: "visual", title: "Inspeção visual" },
    { id: "acessorios", title: "Acessórios" },
    { id: "estrutura", title: "Estrutura / testes" },
  ] as const;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">2. Checklist unificada</h2>
        <p className="text-slate-600 mt-1">Registe cada ponto; selecione N/A apenas quando não for aplicável. A estanquidade é registada no passo do ensaio.</p>
      </div>

      <ImmersionSuitDiagram
        statuses={inspectionData.checklist as Record<string, string>}
        selectedZones={inspectionData.zonasFuga}
        onToggleZone={toggleZonaFuga}
      />

      {groups.map((g) => (
        <div key={g.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b font-bold text-sm text-slate-700 uppercase tracking-wide">
            {g.title}
          </div>
          <div className="divide-y divide-slate-100">
            {FATO_CHECKLIST_ITEMS.filter((i) => i.group === g.id).map((item) => {
              const val = inspectionData.checklist[item.key] || "";
              return (
                <div key={item.key} className="grid grid-cols-12 gap-3 px-5 py-3 items-center">
                  <div className="col-span-12 md:col-span-5">
                    <p className="font-bold text-slate-800 text-sm">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.desc}</p>
                  </div>
                  <div className="col-span-12 md:col-span-7 flex flex-wrap gap-1.5">
                    {BTNS.map((b) => {
                      const Icon = b.icon;
                      const on = val === b.v;
                      return (
                        <button
                          key={b.v}
                          type="button"
                          onClick={() => setChecklistItem(item.key, b.v)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                            on ? b.active : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <Icon size={14} /> {b.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex justify-between pt-2">
        <button onClick={onPrev} className="inline-flex items-center gap-2 border border-slate-200 px-5 py-3 rounded-xl font-bold text-slate-700">
          <ArrowLeft size={18} /> Anterior
        </button>
        <button onClick={onNext} className="inline-flex items-center gap-2 bg-cyan-700 hover:bg-cyan-800 text-white px-6 py-3 rounded-xl font-bold">
          Seguinte <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
