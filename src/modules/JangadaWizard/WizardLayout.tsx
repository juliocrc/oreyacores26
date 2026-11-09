"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Save, Cloud, FileCheck, CheckCircle, Clock, LifeBuoy, ShieldCheck, Keyboard, X, AlertTriangle, History } from 'lucide-react';
import { useAutoSave } from './useAutoSave';
import { getStepProgress } from './progress';
import { getWizardSteps } from './steps';
import { finalizeInspectionStandalone } from './finalizeInspection';
import Step10_Historico from './Step10_Historico';

export default function WizardLayout({ children }: { children: React.ReactNode }) {
  const { currentStep, nextStep, prevStep, setStep, setStepByKey, validationErrors, clearValidationErrors, inspectionData, isDirty, lastSaved, hideOrcamento, isSaving, hasServerChanges, pendingServerChanges } = useJangadaWizardStore();
  useAutoSave();

  const [now, setNow] = useState(() => new Date());
  const [workshopMode, setWorkshopMode] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const clock = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const todayLabel = now.toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const progress = useMemo(() => getStepProgress(inspectionData, { hideOrcamento }), [inspectionData, hideOrcamento]);
  const overallPct = Math.round(progress.reduce((s, p) => s + p.percent, 0) / progress.length);
  const pendingSteps = progress.filter((p) => (p.percent ?? 0) < 100).length;
  const healthTone = overallPct >= 90 ? 'text-emerald-700 bg-emerald-100 border-emerald-300' : overallPct >= 60 ? 'text-amber-700 bg-amber-100 border-amber-300' : 'text-red-700 bg-red-100 border-red-300';
  const healthLabel = overallPct === 100 ? 'Preenchido' : `${pendingSteps} passo${pendingSteps === 1 ? '' : 's'} por concluir`;

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

  // One explicit final action, only while the last step is visible.
  const finalizeInspection = useCallback(() => {
    if (historyOpen || currentStep !== totalSteps || isSaving) return;
    finalizeInspectionStandalone();
  }, [historyOpen, currentStep, totalSteps, isSaving]);

  // Keyboard shortcuts: Left/Right arrows for navigation, Ctrl+Enter to finish
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (e.key === 'Escape') {
        setShortcutsOpen(false);
        setHistoryOpen(false);
        return;
      }
      if (historyOpen) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        finalizeInspection();
        return;
      }
      if (inInput) return;
      if (e.key === '?' && !shortcutsOpen) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !shortcutsOpen) {
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
  }, [nextStep, prevStep, finalizeInspection, shortcutsOpen, historyOpen]);

  const lastSavedLabel = lastSaved
    ? lastSaved.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  const handleNext = useCallback(() => {
    if (nextStep()) return;
    const errors = useJangadaWizardStore.getState().validationErrors;
    if (errors.length === 0) return;
    const ok = window.confirm(
      'Existem itens por validar neste passo:\n\n' +
        errors.map((e) => `• ${e}`).join('\n') +
        '\n\nAvançar mesmo assim?'
    );
    if (ok) nextStep(true);
  }, [nextStep]);

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
        } catch {
          alert("Erro ao ler ficheiro JSON de backup.");
        }
      };
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-4rem)] bg-slate-50">
      {/* Sidebar Navigation with integrated progress bar at top */}
      <aside className="w-full lg:w-72 xl:w-80 bg-white border-r border-slate-200 flex flex-col shadow-sm z-10 relative lg:flex-shrink-0 lg:sticky lg:top-0 lg:h-[calc(100vh-4rem)] lg:overflow-y-auto">
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
                Rascunho local às {lastSavedLabel}
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

        <nav className="p-3 lg:flex-1 lg:overflow-y-auto">
          <button type="button" onClick={() => setHistoryOpen(!historyOpen)} aria-pressed={historyOpen}
            className="flex items-center gap-3 w-full px-3 py-2.5 mb-3 rounded-xl text-sm font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100">
            <History size={18} />{historyOpen ? 'Voltar à inspeção' : 'Consultar Histórico'}
          </button>
          <ul className="flex flex-row gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {steps.map((step, i) => {
              const stepNum = i + 1;
              const isActive = currentStep === stepNum;
              const isPast = currentStep > stepNum;
              const isReachable = stepNum <= currentStep + 1;
              const p = progress.find((x) => x.step === step.key);
              const pct = p?.percent ?? 0;
              const hasIssue = (p?.missing?.length ?? 0) > 0;

              return (
                <li key={step.key} className="shrink-0 lg:shrink">
                  <button
                    onClick={() => { if (isReachable) { setHistoryOpen(false); setStepByKey(step.key); clearValidationErrors(); } }}
                    disabled={!isReachable}
                    className={`relative flex min-w-[190px] shrink-0 items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-left lg:min-w-0 lg:w-full lg:shrink ${
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
              <button
                type="button"
                onClick={() => setWorkshopMode(!workshopMode)}
                title="Modo Oficina (Alto Contraste e Fontes Maiores para Ecrãs Tácteis)"
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                  workshopMode
                    ? 'bg-amber-400 text-slate-900 border-amber-500 shadow-md ring-2 ring-amber-300'
                    : 'bg-white/70 hover:bg-white text-slate-700 border-sky-300'
                }`}
              >
                🛠️ {workshopMode ? 'Modo Táctil ON' : 'Modo Oficina'}
              </button>
              <button
                type="button"
                onClick={() => setShortcutsOpen(true)}
                title="Atalhos de teclado (?)"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/70 hover:bg-white text-slate-700 text-xs font-bold border border-sky-300 transition"
              >
                <Keyboard size={13} />
                Atalhos
              </button>
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${healthTone}`} title={`Preenchimento atual: ${overallPct}%`}>
              <span className={`w-1.5 h-1.5 rounded-full ${overallPct >= 90 ? 'bg-emerald-500' : overallPct >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} />
              {overallPct}% · {healthLabel}
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
              hasServerChanges ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${hasServerChanges ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
              {hasServerChanges ? 'Nao guardado no servidor' : 'Sem alteracoes pendentes no servidor'}
            </div>
          </div>
        </header>

        <div className={`flex-1 p-4 lg:p-6 overflow-y-auto ${workshopMode ? 'text-base bg-slate-900 text-slate-100' : ''}`}>
          {hasServerChanges && <p role="status" className="mb-3 text-xs font-semibold text-amber-700">
            Por gravar no servidor: {['data', 'review', 'signatures'].filter(key => pendingServerChanges?.[key as 'data' | 'review' | 'signatures']).map(key => ({ data: 'dados da inspecao', review: 'revisao', signatures: 'assinaturas' })[key]).join(', ')}. O autosave e apenas local.
          </p>}
          <AnimatePresence mode="wait">
            <motion.div
              key={historyOpen ? 'historico' : steps[currentStep - 1]?.key}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
               className={`rounded-2xl shadow-sm border p-5 lg:p-6 min-h-full ${workshopMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200'}`}
             >
                 {!historyOpen && (() => {
                 const currentStepObj = steps[currentStep - 1];
                 const stepProg = currentStepObj ? progress.find(p => p.step === currentStepObj.key) : null;
                 if (stepProg && stepProg.missing && stepProg.missing.length > 0) {
                   return (
                     <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
                       <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                       <div>
                         <p className="text-xs font-bold text-amber-800">Itens pendentes neste passo:</p>
                         <ul className="text-xs text-amber-700 list-disc pl-4 mt-1 flex flex-wrap gap-x-4">
                           {stepProg.missing.map((msg, idx) => (
                             <li key={idx} className="font-medium">{msg}</li>
                           ))}
                         </ul>
                       </div>
                     </div>
                   );
                 }
                 return null;
               })()}
                {historyOpen ? <Step10_Historico onClose={() => setHistoryOpen(false)} /> : children}
               {!historyOpen && steps[currentStep - 1]?.key === 'testes' && !inspectionData.reparacoes?.length && inspectionData.repairRequested !== true && (
                 <button type="button" onClick={() => {
                   useJangadaWizardStore.getState().setInspectionData({ repairRequested: true });
                   setStepByKey('reparacoes');
                 }} className="mt-5 px-4 py-2.5 rounded-xl font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-sm">
                   Registar intervenção preventiva
                 </button>
               )}
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
              onClick={() => historyOpen ? setHistoryOpen(false) : prevStep()}
              disabled={!historyOpen && currentStep === 1}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={20} />
              {historyOpen ? 'Voltar à inspeção' : 'Anterior'}
            </button>

            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-500 hidden sm:inline-block">
                Passo {currentStep} de {totalSteps} · {overallPct}%
              </span>
              {historyOpen ? null : currentStep < totalSteps ? (
                <button
                  onClick={handleNext}
                  className="flex items-center gap-2 px-8 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all"
                >
                  Seguinte
                  <ChevronRight size={20} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={finalizeInspection}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-8 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-wait"
                >
                  <FileCheck size={20} />
                  {isSaving ? 'A guardar…' : 'Guardar e finalizar inspeção'}
                </button>
              )}
            </div>
          </div>
        </footer>
      </main>

      <AnimatePresence>
        {shortcutsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShortcutsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 12 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Keyboard className="text-indigo-600" size={18} />
                  Atalhos de Teclado
                </h3>
                <button
                  type="button"
                  onClick={() => setShortcutsOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                  title="Fechar (Esc)"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-5 space-y-2.5">
                {[
                  { keys: ['→'], label: 'Seguinte passo' },
                  { keys: ['←'], label: 'Passo anterior' },
                  { keys: ['Ctrl', 'Enter'], label: 'Guardar e finalizar (apenas no último passo)' },
                  { keys: ['?'], label: 'Abrir/fechar este painel' },
                  { keys: ['Esc'], label: 'Fechar painel' },
                ].map((s) => (
                  <div key={s.label} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-600">{s.label}</span>
                    <span className="flex items-center gap-1">
                      {s.keys.map((k) => (
                        <kbd
                          key={k}
                          className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-700 shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
                <p className="text-xs text-slate-500 pt-2 border-t border-slate-100 mt-3">
                  No passo 2 (Checklist) também podes usar as teclas <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-700">1</kbd>–<kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-700">4</kbd> e <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-700">Espaço</kbd> para um preenchimento rápido.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
