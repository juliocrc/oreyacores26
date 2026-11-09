"use client";

import React from "react";
import { ArrowLeft, ChevronRight, Gauge, Droplets, AlertTriangle } from "lucide-react";
import {
  BER_CODES,
  LEAK_METHODS,
} from "@/lib/fatos-imersao-checklist";
import { useFatoImersaoWizardStore } from "./store/useFatoImersaoWizardStore";
import ImmersionSuitDiagram from "@/components/fatos-imersao/ImmersionSuitDiagram";

type Props = { onNext: () => void; onPrev: () => void };

export default function Step4_LeakTest({ onNext, onPrev }: Props) {
  const { inspectionData, setInspectionData, toggleZonaFuga } = useFatoImersaoWizardStore();

  const calcDelta = () => {
    const a = Number(inspectionData.leakPressaoInicial.replace(',', '.'));
    const b = Number(inspectionData.leakPressaoFinal.replace(',', '.'));
    if (inspectionData.leakPressaoInicial.trim() && inspectionData.leakPressaoFinal.trim() && Number.isFinite(a) && Number.isFinite(b)) {
      setInspectionData({ leakDeltaP: (a - b).toFixed(2) });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">4. Ensaio de estanquidade</h2>
        <p className="text-slate-600 mt-1">
          Confirme modelo, material, equipamento e revisão vigente do manual antes de selecionar o método e a pressão. Os critérios variam entre configurações; registe a referência do manual nas observações.
        </p>
        <p className="mt-2 text-sm text-amber-800">Crewsaver: os métodos de retenção e observação de fugas não são intercambiáveis. Viking: confirme o método para o material e esclareça as divergências da edição disponível. Lalizas: o dispositivo 70168 não é automaticamente compatível com outras marcas.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            {([
              ["manualReferencia", "Manual aplicável"],
              ["manualRevisao", "Revisão / edição confirmada"],
              ["equipamentoEnsaio", "Equipamento de ensaio e identificação"],
              ["reparacoes", "Reparações: zona, material e peças"],
            ] as const).map(([key, label]) => <label key={key} className="block text-sm"><span className="text-slate-600 font-semibold">{label}</span><input value={inspectionData[key]} onChange={e => setInspectionData({ [key]: e.target.value })} className="mt-1 w-full border rounded-xl px-3 py-2 bg-slate-50" /></label>)}
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <Gauge className="text-cyan-700" size={18} /> Método e pressão
            </div>
            <label className="block text-sm">
              <span className="text-slate-600 font-semibold">Método</span>
              <select
                value={inspectionData.leakMetodo}
                onChange={(e) => setInspectionData({ leakMetodo: e.target.value })}
                className="mt-1 w-full border rounded-xl px-3 py-2.5 bg-slate-50"
              >
                <option value="">Selecione o método confirmado...</option>
                {LEAK_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="text-slate-600">Unidade</span>
                <select
                  value={inspectionData.leakUnidade}
                  onChange={(e) => setInspectionData({ leakUnidade: e.target.value, leakPressaoInicial: "", leakPressaoFinal: "", leakDeltaP: "" })}
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-slate-50"
                >
                  <option value="kPa">kPa</option>
                  <option value="mbar">mbar</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Duração (min)</span>
                <input
                  value={inspectionData.leakDuracaoMin}
                  onChange={(e) => setInspectionData({ leakDuracaoMin: e.target.value })}
                  placeholder="ex: 180 (3h)"
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-slate-50"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">P inicial</span>
                <input
                  value={inspectionData.leakPressaoInicial}
                  onChange={(e) => setInspectionData({ leakPressaoInicial: e.target.value, leakDeltaP: "" })}
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-slate-50"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">P final</span>
                <input
                  value={inspectionData.leakPressaoFinal}
                  onChange={(e) => setInspectionData({ leakPressaoFinal: e.target.value, leakDeltaP: "" })}
                  onBlur={calcDelta}
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-slate-50"
                />
              </label>
              <label className="text-sm col-span-2">
                <span className="text-slate-600">ΔP (queda)</span>
                <input
                  value={inspectionData.leakDeltaP}
                  onChange={(e) => setInspectionData({ leakDeltaP: e.target.value })}
                  className="mt-1 w-full border rounded-xl px-3 py-2 bg-slate-50"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-slate-600 font-semibold">Resultado leak test</span>
              <select
                value={inspectionData.leakResultado}
                onChange={(e) => {
                  setInspectionData({ leakResultado: e.target.value });
                  if (e.target.value) {
                    setInspectionData({
                      leakResultado: e.target.value,
                      checklist: { ...inspectionData.checklist, impermeabilidade: e.target.value.startsWith("Aprovado") || e.target.value === "OK" ? "OK" : "F" },
                    });
                  }
                }}
                className="mt-1 w-full border rounded-xl px-3 py-2.5 bg-slate-50 font-medium"
              >
                <option value="">Selecione...</option>
                <option value="OK">OK / Aprovado (sem fugas)</option>
                <option value="Fuga">Fuga detetada — reparar + re-test</option>
                <option value="Reprovado">Reprovado</option>
                <option value="BER">BER / Condenado</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Reensaio após reparação — confirme os requisitos do manual</span>
              <select
                value={inspectionData.leakReTest}
                onChange={(e) => setInspectionData({ leakReTest: e.target.value })}
                className="mt-1 w-full border rounded-xl px-3 py-2 bg-slate-50"
              >
                <option value="N/A">N/A</option>
                <option value="Pendente">Pendente</option>
                <option value="OK">Aprovado após re-test</option>
                <option value="Falha">Falhou re-test</option>
              </select>
            </label>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <AlertTriangle size={18} /> Condenação BER (Viking 11.3)
            </div>
            <label className="block text-sm">
              <span className="text-amber-900 font-semibold">Código BER</span>
              <select
                value={inspectionData.codigoBER}
                onChange={(e) => setInspectionData({ codigoBER: e.target.value })}
                className="mt-1 w-full border border-amber-200 rounded-xl px-3 py-2 bg-white"
              >
                <option value="">— não condenado —</option>
                {BER_CODES.map((b) => (
                  <option key={b.code} value={b.code}>{b.code} — {b.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-amber-900 font-semibold">Motivo / notas BER</span>
              <textarea
                value={inspectionData.motivoBER}
                onChange={(e) => setInspectionData({ motivoBER: e.target.value })}
                className="mt-1 w-full border border-amber-200 rounded-xl px-3 py-2 bg-white min-h-[70px]"
              />
            </label>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <Droplets className="text-blue-600" size={18} /> Zonas de fuga (form 11.1)
          </div>
          <ImmersionSuitDiagram
            statuses={inspectionData.checklist as Record<string, string>}
            selectedZones={inspectionData.zonasFuga}
            onToggleZone={toggleZonaFuga}
          />
          <label className="block text-sm">
            <span className="text-slate-600 font-semibold">Observações</span>
            <textarea
              value={inspectionData.observacoes}
              onChange={(e) => setInspectionData({ observacoes: e.target.value })}
              className="mt-1 w-full border rounded-xl px-3 py-2 bg-slate-50 min-h-[100px]"
              placeholder="Manual e revisão confirmados, equipamento, reparações e observações..."
            />
          </label>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <button onClick={onPrev} className="inline-flex items-center gap-2 border border-slate-200 px-5 py-3 rounded-xl font-bold">
          <ArrowLeft size={18} /> Anterior
        </button>
        <button
          disabled={(!inspectionData.leakResultado && !inspectionData.codigoBER) || (inspectionData.leakResultado === "OK" && !inspectionData.leakMetodo && !inspectionData.codigoBER)}
          onClick={onNext}
          className="inline-flex items-center gap-2 bg-cyan-700 disabled:opacity-40 text-white px-6 py-3 rounded-xl font-bold"
        >
          Seguinte <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
