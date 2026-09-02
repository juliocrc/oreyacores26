"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Save, Cloud, FileCheck, Clock, CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAutoSave } from './useAutoSave';
import { getStepProgress } from './progress';
import { getWizardSteps } from './steps';

export default function WizardLayout({ children }: { children: React.ReactNode }) {
  const { currentStep, nextStep, prevStep, setStep, validationErrors, clearValidationErrors, inspectionData, isDirty, lastSaved } = useJangadaWizardStore();
  const router = useRouter();
  useAutoSave();

  const progress = useMemo(() => getStepProgress(inspectionData), [inspectionData]);
  const overallPct = Math.round(progress.reduce((s, p) => s + p.percent, 0) / progress.length);

  const steps = useMemo(() => getWizardSteps(inspectionData), [inspectionData]);
  const totalSteps = steps.length;

  const progressRef = useRef(overallPct);
  useEffect(() => {
    progressRef.current = overallPct;
  }, [overallPct]);

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

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-4rem)] bg-slate-50">
      {/* Global progress bar (top, full width) */}
      <div className="w-full lg:w-full bg-white border-b border-slate-200 px-4 lg:px-6 py-3 z-20">
        <div className="flex items-center gap-4">
          <div className="hidden sm:block">
            <h2 className="text-lg font-bold text-slate-800 leading-none">Inspeção</h2>
            <p className="text-xs text-slate-500 mt-0.5">Fluxo passo a passo</p>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Progresso da Inspeção</span>
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
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs font-semibold">
            {lastSaved ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Cloud size={14} />
                Guardado às {lastSavedLabel}
              </span>
            ) : isDirty ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                <Save size={14} className="animate-pulse" />
                Por guardar...
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 text-slate-500 border border-slate-200">
                <Cloud size={14} />
                Sem alterações
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar Navigation */}
      <aside className="w-full lg:w-72 bg-white border-r border-slate-200 p-4 lg:p-6 flex flex-col shadow-sm z-10 relative">
        <nav className="flex-1 overflow-x-auto lg:overflow-visible">
          <ul className="flex lg:flex-col gap-2 min-w-max lg:min-w-0 pb-2 lg:pb-0">
            {steps.map((step, i) => {
              const stepNum = i + 1;
              const isActive = currentStep === stepNum;
              const isPast = currentStep > stepNum;
              const isReachable = stepNum <= currentStep + 1;
              const p = progress.find((x) => x.step === step.key);
              const pct = p?.percent ?? 0;
              const hasIssue = (p?.missing?.length ?? 0) > 0;

              return (
                <li key={step.key} className="relative">
                  <button
                    onClick={() => { if (isReachable) { setStep(stepNum); clearValidationErrors(); } }}
                    disabled={!isReachable}
                    className={`relative z-10 flex items-center gap-4 w-full p-3 rounded-xl transition-all duration-200 text-left ${
                      isActive ? 'bg-indigo-50 border border-indigo-100 shadow-sm' : isReachable ? 'hover:bg-slate-50 border border-transparent' : 'border border-transparent cursor-not-allowed opacity-50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                      isActive ? 'bg-indigo-600 text-white shadow-md' : pct === 100 ? 'bg-emerald-100 text-emerald-600' : isPast ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {pct === 100 && !isActive ? <CheckCircle size={20} /> : <step.icon size={20} />}
                    </div>
                    <div className="hidden lg:block flex-1 min-w-0">
                      <p className={`text-xs font-semibold uppercase tracking-wider ${isActive ? 'text-indigo-600' : 'text-slate-500'}`}>Passo {stepNum} · {pct}%</p>
                      <p className={`text-sm font-bold truncate ${isActive ? 'text-slate-900' : 'text-slate-600'}`}>{step.title}</p>
                    </div>
                    {hasIssue && !isActive && (
                      <span
                        className="hidden lg:inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"
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
      <main className="flex-1 flex flex-col relative max-w-6xl w-full mx-auto">
        <div className="flex-1 p-4 lg:p-8 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 lg:p-8 min-h-full"
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
                  onClick={() => router.push('/jangadas')}
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
