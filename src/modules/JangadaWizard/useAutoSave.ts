"use client";
import { useEffect, useRef, useCallback } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';

const AUTOSAVE_INTERVAL = 60000;

function getDraftKey(jangadaId: number | string | null): string | null {
  if (!jangadaId) return null;
  return `jangada-wizard-draft-${jangadaId}`;
}

export function useAutoSave() {
  const { inspectionData, jangadaId, inspecaoId, currentStep, currentStepKey, isDirty, setLastSaved } = useJangadaWizardStore();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastDataRef = useRef<string>('');

  const saveDraft = useCallback(() => {
    try {
      const key = getDraftKey(jangadaId);
      if (!key) return;

      const draft = {
        inspectionData,
        jangadaId,
        inspecaoId,
        currentStep,
        currentStepKey: currentStepKey() || null,
        savedAt: new Date().toISOString(),
      };
      const dataStr = JSON.stringify(draft);

      if (dataStr !== lastDataRef.current) {
        localStorage.setItem(key, dataStr);
        lastDataRef.current = dataStr;
        setLastSaved(new Date());
      }
    } catch (err) {
      console.error('[AutoSave] Error saving draft:', err);
    }
  }, [inspectionData, jangadaId, inspecaoId, currentStep, currentStepKey, setLastSaved]);

  const loadDraft = useCallback(() => {
    try {
      const key = getDraftKey(jangadaId);
      if (!key) return null;
      const saved = localStorage.getItem(key);
      if (!saved) return null;
      return JSON.parse(saved);
    } catch (err) {
      console.error('[AutoSave] Error loading draft:', err);
      return null;
    }
  }, [jangadaId]);

  const clearDraft = useCallback(() => {
    try {
      const key = getDraftKey(jangadaId);
      if (!key) return;
      localStorage.removeItem(key);
      lastDataRef.current = '';
    } catch (err) {
      console.error('[AutoSave] Error clearing draft:', err);
    }
  }, [jangadaId]);

  useEffect(() => {
    if (isDirty) {
      intervalRef.current = setInterval(saveDraft, AUTOSAVE_INTERVAL);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isDirty, saveDraft]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        saveDraft();
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, saveDraft]);

  return { saveDraft, loadDraft, clearDraft };
}
