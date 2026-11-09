"use client";
import { useEffect } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';

const AUTOSAVE_INTERVAL = 60000;
const EXIT_WARNING = 'Existem alteracoes nao guardadas no servidor. O rascunho local nao substitui a gravacao da inspecao. Sair mesmo assim?';

export function saveLocalWizardDraft(): boolean {
  const state = useJangadaWizardStore.getState();
  if (typeof localStorage === 'undefined') return false;
  if (!state.jangadaId) return false;
  try {
    localStorage.setItem(`jangada-wizard-draft-${state.jangadaId}`, JSON.stringify({
      inspectionData: state.inspectionData,
      jangadaId: state.jangadaId,
      inspecaoId: state.inspecaoId,
      editVersions: state.editVersions,
      hasServerChanges: state.hasServerChanges,
      currentStep: state.currentStep,
      currentStepKey: state.currentStepKey(),
      savedAt: new Date().toISOString(),
    }));
    state.setLastSaved(new Date());
    return true;
  } catch (error) {
    console.error('[AutoSave] Error saving draft:', error);
    return false;
  }
}

export function confirmWizardExit(): boolean {
  const state = useJangadaWizardStore.getState();
  if (!state.hasServerChanges) return true;
  const saved = saveLocalWizardDraft();
  return window.confirm(saved ? EXIT_WARNING : `${EXIT_WARNING}\nNao foi possivel preservar o rascunho local.`);
}

export function useAutoSave() {
  useEffect(() => {
    const savePending = () => {
      const state = useJangadaWizardStore.getState();
      if (state.isDirty || state.hasServerChanges) saveLocalWizardDraft();
    };
    const interval = setInterval(savePending, AUTOSAVE_INTERVAL);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      savePending();
      if (useJangadaWizardStore.getState().hasServerChanges) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.download || (anchor.target && anchor.target !== '_self')) return;
      const next = new URL(anchor.href, window.location.href);
      if (next.pathname === location.pathname && next.search === location.search) return;
      if (!confirmWizardExit()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const visibility = () => { if (document.visibilityState === 'hidden') savePending(); };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('pagehide', savePending);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('click', click, true);
    return () => {
      savePending();
      clearInterval(interval);
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('pagehide', savePending);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('click', click, true);
    };
  }, []);

  return {
    saveDraft: saveLocalWizardDraft,
    loadDraft: () => {
      try {
        return JSON.parse(localStorage.getItem(`jangada-wizard-draft-${useJangadaWizardStore.getState().jangadaId}`) || 'null');
      } catch { return null; }
    },
    clearDraft: () => localStorage.removeItem(`jangada-wizard-draft-${useJangadaWizardStore.getState().jangadaId}`),
  };
}
