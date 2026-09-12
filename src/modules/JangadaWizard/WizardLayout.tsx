"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Save, Cloud, FileCheck, CheckCircle, Clock, LifeBuoy, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAutoSave } from './useAutoSave';
import { getStepProgress } from './progress';
import { getWizardSteps } from './steps';

export default function WizardLayout({ children }: { children: React.ReactNode }) {
  const { currentStep, nextStep, prevStep, setStep, validationErrors, clearValidationErrors, inspectionData, isDirty, lastSaved, hideOrcamento } = useJangadaWizardStore();
  const router = useRouter();
  useAutoSave();

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const clock = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const todayLabel = now.toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const progress = useMemo(() => getStepProgress(inspectionData, { hideOrcamento }), [inspectionData, hideOrcamento]);
  const overallPct = Math.round(progress.reduce((s, p) => s + p.percent, 0) / progress.length);

  const steps = useMemo(() => getWizardSteps(inspectionData, { hideOrcamento }), [inspectionData, hideOrcamento]);
  const totalSteps = steps.length;

  const progressRef = useRef(overallPct);
  useEffect(() => {
    progressRef.current = overallPct;
  }, [overallPct]);

  // When the step list changes (e.g. orçamento hidden for technicians),
  // clamp the current step so navigation stays valid.
  useEffect(() => {
    if (currentStep > totalSteps) {
      setStep(totalSteps);
    }
  }, [currentStep, totalSteps, setStep]);

  // Keyboard shortcuts: Left/Right arrows for navigation, Ctrl+S for draft save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('wizard-save-draft'));
        return;
      }
      if (inInput) return;
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          nextStep();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          prevStep();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nextStep, prevStep]);

  const lastSavedLabel = lastSaved
    ? lastSaved.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  const exportBlackBox = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ inspectionData, lastSaved: new Date().toISOString() }, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `blackbox-draft-${inspectionData.serial || 'jangada'}-${new Date().toISOString().slice(0,10)}.json`);
    dlAnchorElem.click();
    dlAnchorElem.remove();
  };

  const importBlackBox = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed.inspectionData) {
            useJangadaWizardStore.getState().setInspectionData(parsed.inspectionData);
            alert("Rascunho importado com sucesso via Box Negra!");
          }
        } catch (err) {
          alert("Erro ao ler ficheiro JSON de backup.");
        }
      };
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-4rem)] bg-slate-50">
      {/* Sidebar Navigation with integrated progress bar at top */}
      <aside className="w-full lg:w-80 bg-white border-r border-slate-200 flex flex-col shadow-sm z-10 relative lg:flex-shrink-0 lg:sticky lg:top-0 lg:h-[calc(100vh-4rem)] lg:overflow-y-auto">
        {/* Progress bar integrated at top of sidebar */}
        <div className="px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Progresso da Inspeção</span>
            <span className="text-xs font-extrabold text-slate-700">{overallPct}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${overallPct}%` }}
            />
          </div>
          {/* Step segment indicators */}
          <div className="flex gap-1 mt-1.5">
            {progress.map((p, i) => (
              <div
                key={p.step}
                title={`Passo ${i + 1} — ${p.percent}%`}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  p.percent === 100
                    ? 'bg-emerald-400'
                    : p.percent > 0
                      ? 'bg-indigo-300'
                      : i + 1 <= currentStep
                        ? 'bg-amber-300'
                        : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
          {/* Save status badge */}
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold">
            {lastSaved ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Cloud size={13} />
                Guardado às {lastSavedLabel}
              </span>
            ) : isDirty ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                <Save size={13} className="animate-pulse" />
                Por guardar...
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 text-slate-500 border border-slate-200">
                <Cloud size={13} />
                Sem alterações
              </span>
            )}
            <span className="ml-auto text-[11px] text-slate-400 font-medium">Passo {currentStep} de {totalSteps}</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="flex flex-col gap-1.5">
            {steps.map((step, i) => {
              const stepNum = i + 1;
              const isActive = currentStep === stepNum;
              const isPast = currentStep > stepNum;
              const isReachable = stepNum <= currentStep + 1;
              const p = progress.find((x) => x.step === step.key);
              const pct = p?.percent ?? 0;
              const hasIssue = (p?.missing?.length ?? 0) > 0;

              return (
                <li key={step.key}>
                  <button
                    onClick={() => { if (isReachable) { setStep(stepNum); clearValidationErrors(); } }}
                    disabled={!isReachable}
                    className={`relative flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all duration-200 text-left ${
                      isActive ? 'bg-indigo-50 border border-indigo-100 shadow-sm' : isReachable ? 'hover:bg-slate-50 border border-transparent' : 'border border-transparent cursor-not-allowed opacity-45'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                      isActive ? 'bg-indigo-600 text-white shadow-md' : pct === 100 ? 'bg-emerald-100 text-emerald-600' : isPast ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {pct === 100 && !isActive ? <CheckCircle size={18} /> : <step.icon size={18} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[10px] font-semibold uppercase tracking-wider ${isActive ? 'text-indigo-600' : pct === 100 ? 'text-emerald-600' : 'text-slate-500'}`}>Passo {stepNum} · {pct}%</p>
                      <p className={`text-sm font-bold truncate ${isActive ? 'text-slate-900' : 'text-slate-600'}`}>{step.title}</p>
                    </div>
                    {hasIssue && !isActive && (
                      <span
                        className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700"
                        title={(p?.missing || []).join('\n')}
                      >
                        {p?.missing?.length}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative w-full">
        {/* Operational header — realistic inspection station */}
        <header className="bg-gradient-to-r from-sky-200 via-sky-100 to-indigo-100 text-slate-900 border-b border-sky-300/60 px-4 lg:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 shrink-0 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-700 flex items-center justify-center shadow-lg shrink-0">
              <LifeBuoy className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Oficina · Posto de Inspeção
              </p>
              <p className="text-sm font-black truncate text-slate-900">
                {[inspectionData.brand, inspectionData.model, inspectionData.serial].filter(Boolean).join(' · ') || 'Jangada sem identificação'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:ml-auto">
            {inspectionData.capacity ? (
              <span className="px-2.5 py-1 rounded-lg bg-white/70 border border-sky-300 text-xs font-bold text-slate-700">{inspectionData.capacity} pax</span>
            ) : null}
            {inspectionData.packType ? (
              <span className="px-2.5 py-1 rounded-lg bg-white/70 border border-sky-300 text-xs font-bold text-slate-700">{inspectionData.packType}</span>
            ) : null}
            {inspectionData.numeroObra ? (
              <span className="px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold">OB {inspectionData.numeroObra}</span>
            ) : null}
            <div className="hidden md:flex flex-col items-end leading-tight">
              <span className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold">{todayLabel}</span>
              <span className="flex items-center gap-1.5 font-mono text-lg font-black text-emerald-700 tabular-nums">
                <Clock className="w-4 h-4 text-emerald-600" />
                {clock}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={exportBlackBox}
                title="Exportar backup instantâneo (Box Negra)"
                className="px-2.5 py-1 rounded-lg bg-white/70 hover:bg-white text-slate-700 text-xs font-bold border border-sky-300 transition"
              >
                💾 Exportar JSON
              </button>
              <label
                title="Restaurar de backup JSON"
                className="px-2.5 py-1 rounded-lg bg-white/70 hover:bg-white text-slate-700 text-xs font-bold border border-sky-300 transition cursor-pointer"
              >
                📂 Importar JSON
                <input type="file" accept=".json" onChange={importBlackBox} className="hidden" />
              </label>
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
              isDirty ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isDirty ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
              {isDirty ? 'Por guardar' : lastSaved ? 'Síncrono' : 'Pronto'}
            </div>
          </div>
        </header>

        <div className="flex-1 p-4 lg:p-6 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 lg:p-6 min-h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>

        <footer className="bg-white border-t border-slate-200 p-4 lg:p-6 shadow-lg z-10 sticky bottom-0">
          {validationErrors.length > 0 && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-xs font-bold text-red-700 mb-1">Corrija os seguintes erros:</p>
              <ul className="text-xs text-red-600 list-disc pl-4">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center justify-between">
            <button
              onClick={prevStep}
              disabled={currentStep === 1}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={20} />
              Anterior
            </button>

            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-500 hidden sm:inline-block">
                Passo {currentStep} de {totalSteps} · {overallPct}%
              </span>
              {currentStep < totalSteps ? (
                <button
                  onClick={nextStep}
                  className="flex items-center gap-2 px-8 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all"
                >
                  Seguinte
                  <ChevronRight size={20} />
                </button>
              ) : (
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('wizard-save-draft'));
                    router.push('/jangadas');
                  }}
                  className="flex items-center gap-2 px-8 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md hover:shadow-lg transition-all"
                >
                  <FileCheck size={20} />
                  Finalizar Inspeção
                </button>
              )}
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
