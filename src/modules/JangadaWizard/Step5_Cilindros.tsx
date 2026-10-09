"use client";
import React from "react";
import { useJangadaWizardStore } from "./store/useJangadaWizardStore";
import { Container, Scale, Calendar, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { resolveNominalCharge } from "@/modules/rafts/nominalCharge";
import { getStepNumberByKey } from "./steps";

export default function Step5_Cilindros() {
  const { inspectionData, setInspectionData, hideOrcamento } = useJangadaWizardStore();
  const stepNo = getStepNumberByKey(inspectionData, "cilindros", { hideOrcamento });

  const cylinders: any[] = Array.isArray((inspectionData as any).cylinders) && (inspectionData as any).cylinders.length > 0
    ? (inspectionData as any).cylinders
    : (inspectionData as any).cylinder
      ? [(inspectionData as any).cylinder]
      : [{ serial: "", sistema: "", co2: "", n2: "", tara: "", pesoBruto: "", dataTeste: "", dataProxTeste: "" }];

  const sync = (next: any[]) => {
    setInspectionData({ cylinders: next, cylinder: next[0] || {} } as any);
  };

  const add = () => sync([...cylinders, { serial: "", sistema: "", co2: "", n2: "", tara: "", pesoBruto: "", dataTeste: "", dataProxTeste: "" }]);

  const remove = (idx: number) => {
    if (cylinders.length <= 1) return;
    const next = cylinders.filter((_: any, i: number) => i !== idx);
    sync(next);
  };

  const update = (idx: number, field: string, value: string) => {
    const next = cylinders.map((c: any, i: number) => {
      if (i !== idx) return c;
      const updated: any = { ...c, [field]: value };
      if (field === "dataTeste" && value) {
        const parts = value.split("-");
        if (parts[0] && parts[0].length === 4) {
          const year = parseInt(parts[0]) + 5;
          const month = parts[1] || "01";
          const day = parts[2];
          updated.dataProxTeste = day ? year + "-" + month + "-" + day : year + "-" + month;
        }
      }
      return updated;
    });
    sync(next);
  };

  const calcGross = (c: any) => {
    const tara = parseFloat(c.tara || "0");
    const co2 = parseFloat(c.co2 || "0");
    const n2 = parseFloat(c.n2 || "0");
    if (tara > 0 || co2 > 0 || n2 > 0) return (tara + co2 + n2).toFixed(3);
    return "";
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{stepNo > 0 ? stepNo + ". " : ""}Cilindros e Teste Hidráulico</h2>
          <p className="text-slate-600 mt-1">Registe os dados dos cilindros de insuflação e datas de prova.</p>
        </div>
        <button onClick={add} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold">
          <Plus size={18} /> Adicionar Cilindro
        </button>
      </div>
      {cylinders.map((cyl: any, idx: number) => {
        let hydro: "ok" | "warn" | "expired" = "ok";
        if (cyl.dataProxTeste) {
          const exp = new Date(cyl.dataProxTeste + "-01");
          const insDateStr = (inspectionData as any).dataInspecao || "";
          const ins = insDateStr ? new Date(insDateStr) : new Date();
          if (!isNaN(exp.getTime())) {
            const d = Math.ceil((exp.getTime() - ins.getTime()) / (1000 * 60 * 60 * 24));
            if (d < 0) hydro = "expired";
            else if (d <= 90) hydro = "warn";
          }
        }
        return (
          <div key={idx} className="border border-slate-200 bg-white rounded-2xl p-6 shadow-sm relative">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">Cilindro {idx + 1}</h3>
              {cylinders.length > 1 && (
                <button onClick={() => remove(idx)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="border border-slate-200 bg-white rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                    <Container size={20} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">Identificação</h3>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Nº de Série</label>
                    <input type="text" value={cyl.serial || ""} onChange={(e) => update(idx, "serial", e.target.value)} className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Sistema</label>
                    <input type="text" value={cyl.sistema || ""} onChange={(e) => update(idx, "sistema", e.target.value)} className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 text-sm" />
                  </div>
                </div>
              </div>
              <div className="border border-slate-200 bg-white rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-amber-50 p-2 rounded-lg text-amber-600">
                    <Scale size={20} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">Pesagens (kg)</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tara</label>
                    <input type="number" step="0.001" value={cyl.tara || ""} onChange={(e) => update(idx, "tara", e.target.value)} className="w-full border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">CO₂</label>
                    <input type="number" step="0.001" value={cyl.co2 || ""} onChange={(e) => update(idx, "co2", e.target.value)} className="w-full border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">N₂</label>
                    <input type="number" step="0.001" value={cyl.n2 || ""} onChange={(e) => update(idx, "n2", e.target.value)} className="w-full border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Peso Bruto</label>
                    <input type="number" step="0.001" value={cyl.pesoBruto || ""} onChange={(e) => update(idx, "pesoBruto", e.target.value)} className="w-full border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-sm" />
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="border border-slate-200 bg-white rounded-2xl p-6 shadow-sm">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Data do Teste Hidráulico</label>
                  <input type="month" value={cyl.dataTeste || ""} onChange={(e) => update(idx, "dataTeste", e.target.value)} className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 text-sm" />
                </div>
              </div>
              <div className="border border-slate-200 bg-white rounded-2xl p-6 shadow-sm">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Próximo Teste Hidráulico</label>
                  <input type="month" value={cyl.dataProxTeste || ""} onChange={(e) => update(idx, "dataProxTeste", e.target.value)} className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 text-sm" />
                  {hydro === "expired" && (
                    <div className="text-xs font-semibold text-red-700 flex items-center gap-1.5 mt-2 bg-red-50 p-2 rounded-xl border border-red-200">
                      <AlertTriangle size={16} /> Teste hidráulico expirado!
                    </div>
                  )}
                  {hydro === "warn" && (
                    <div className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mt-2 bg-amber-50 p-2 rounded-xl border border-amber-200">
                      <AlertTriangle size={16} /> Teste hidráulico a expirar
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
