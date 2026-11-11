"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { getTestRecommendations, getGiDateContext, type TestRecommendation } from '@/modules/rafts/testRules';
import { getDlLoadReference } from '@/modules/rafts/dlLoadReference';
import { getStepNumberByKey } from './steps';
import { parseFlexibleDateValue } from '@/lib/date-display';
import { missingTestEvidence } from './testEvidence';
import { calibrationEvidence } from './calibrationEvidence';
import ManualReferenceNotice from './ManualReferenceNotice';
import { Activity, Gauge, ArrowDownToLine, Droplet, Clock, Timer, Play, Pause, RotateCcw, AlertTriangle, Info, CheckCircle2, XCircle, HelpCircle, ShieldAlert, CalendarClock, Bell } from 'lucide-react';

const TEST_ICONS: Record<string, React.ElementType> = {
  testeWP: Gauge,
  testeGI: Droplet,
  testeFS: Activity,
  testeNAP: Clock,
  testeDL: ArrowDownToLine,
};

const STATUS_CONFIG: Record<string, { bg: string; border: string; text: string; label: string; icon: React.ElementType }> = {
  required: {
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    text: 'text-amber-800',
    label: 'Obrigatório',
    icon: AlertTriangle,
  },
  'not-required': {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    text: 'text-slate-500',
    label: 'Não aplicável',
    icon: XCircle,
  },
  overdue: {
    bg: 'bg-red-50',
    border: 'border-red-300',
    text: 'text-red-800',
    label: 'Atrasado',
    icon: AlertTriangle,
  },
  optional: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    label: 'Recomendado',
    icon: Info,
  },
  unknown: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    text: 'text-slate-500',
    label: 'Sem dados',
    icon: HelpCircle,
  },
};

export default function Step6_Testes() {
  const { inspectionData, setInspectionData, hideOrcamento } = useJangadaWizardStore();
  const stepNo = getStepNumberByKey(inspectionData, 'testes', { hideOrcamento });
  const testes = inspectionData.testes || {};
  const evidenceWarnings = missingTestEvidence(testes);
  const [equipments, setEquipments] = useState<any[]>([]);

  const raftSerial = String(inspectionData.jangadaSerial || inspectionData.serial || '').trim();
  const WP_TIMER_STORAGE_KEY = raftSerial ? `wp-timer-${raftSerial}` : 'wp-timer-default';

  type WPTimerState = {
    timerSec: number;
    timerRunning: boolean;
    timerEndTime: number | null;
    stabilizationMinutes: number;
    stabilizationSec: number;
    stabilizationRunning: boolean;
    stabilizationEndTime: number | null;
    phase: 'idle' | 'stabilizing' | 'ready-for-initial' | 'measuring-final' | 'completed';
    finalSec: number;
    finalRunning: boolean;
    finalEndTime: number | null;
    alertAcked: boolean;
  };

  const loadWPTimerState = (): WPTimerState | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(WP_TIMER_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as WPTimerState;
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const saveWPTimerState = (state: WPTimerState) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(WP_TIMER_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // localStorage indisponível ou excedido; ignora silenciosamente
    }
  };

  const clearWPTimerState = () => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(WP_TIMER_STORAGE_KEY);
    } catch {
      // ignora
    }
  };

  const [timerSec, setTimerSec] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerEndTime, setTimerEndTime] = useState<number | null>(null);
  const [stabilizationMinutes, setStabilizationMinutes] = useState(30);
  const [stabilizationSec, setStabilizationSec] = useState(0);
  const [stabilizationRunning, setStabilizationRunning] = useState(false);
  const [stabilizationEndTime, setStabilizationEndTime] = useState<number | null>(null);
  const [phase, setPhase] = useState<'idle' | 'stabilizing' | 'ready-for-initial' | 'measuring-final' | 'completed'>('idle');
  const [finalSec, setFinalSec] = useState(0);
  const [finalRunning, setFinalRunning] = useState(false);
  const [finalEndTime, setFinalEndTime] = useState<number | null>(null);
  const [alertAcked, setAlertAcked] = useState(false);
  const [audioInitialized, setAudioInitialized] = useState(false);

  const timerRef = useRef<number | null>(null);
  const stabilizationRef = useRef<number | null>(null);
  const finalRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const hydratedRef = useRef(false);

  // Hidrata o estado do temporizador a partir do localStorage (sobrevive a refresh)
  useEffect(() => {
    if (hydratedRef.current) return;
    const saved = loadWPTimerState();
    if (!saved) return;

    // Ajusta os endTimes com base no tempo decorrido desde que foram guardados.
    // Se o endTime já passou, o temporizador está expirado; mantém o valor
    // para que o useEffect do temporizador detete o fim e dispare o alerta.
    const now = Date.now();
    setTimerSec(saved.timerSec);
    setTimerRunning(saved.timerRunning);
    setTimerEndTime(saved.timerEndTime);
    setStabilizationMinutes(saved.stabilizationMinutes);
    setStabilizationSec(saved.stabilizationSec);
    setStabilizationRunning(saved.stabilizationRunning);
    setStabilizationEndTime(saved.stabilizationEndTime);
    setPhase(saved.phase);
    setFinalSec(saved.finalSec);
    setFinalRunning(saved.finalRunning);
    setFinalEndTime(saved.finalEndTime);
    setAlertAcked(saved.alertAcked);
    hydratedRef.current = true;
  }, []);

  // Persiste o estado do temporizador sempre que muda
  useEffect(() => {
    if (!hydratedRef.current) return;
    const state: WPTimerState = {
      timerSec,
      timerRunning,
      timerEndTime,
      stabilizationMinutes,
      stabilizationSec,
      stabilizationRunning,
      stabilizationEndTime,
      phase,
      finalSec,
      finalRunning,
      finalEndTime,
      alertAcked,
    };
    saveWPTimerState(state);
  }, [
    timerSec,
    timerRunning,
    timerEndTime,
    stabilizationMinutes,
    stabilizationSec,
    stabilizationRunning,
    stabilizationEndTime,
    phase,
    finalSec,
    finalRunning,
    finalEndTime,
    alertAcked,
    hydratedRef.current,
  ]);

  // Limpa o estado guardado quando o teste WP é reposto ou concluído com confirmação
  useEffect(() => {
    if (phase === 'completed' && alertAcked) {
      // Mantém o estado para o utilizador ver "Novo Teste"; limpa apenas quando
      // o utilizador clica "Novo Teste" (handleResetStabilization).
    }
  }, [phase, alertAcked]);

  // Inicialização de áudio apenas por gesto do utilizador
  const ensureAudio = useCallback(() => {
    if (audioInitialized) return audioCtxRef.current;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      setAudioInitialized(true);
      return ctx;
    } catch {
      return null;
    }
  }, [audioInitialized]);

  const playAlertTone = useCallback(() => {
    try {
      const ctx = ensureAudio();
      if (!ctx) return;

      // Se o contexto foi suspenso (ex: iOS/WebView bloqueado), tenta retomar
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      // Tom grave descendente (A2 → A1) para alerta sonoro grave
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, now); // A2
      osc.frequency.exponentialRampToValueAtTime(55, now + 1.5); // desce para A1

      // Controlo correto do ganho através de gainNode.gain
      gainNode.gain.setValueAtTime(0.5, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 2);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 2);
    } catch {
      // Áudio bloqueado pelo navegador; ignora silenciosamente
    }
  }, [ensureAudio, audioInitialized]);

  // Tick do relógio real para calcular prazos
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const nowHHMMSS = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  // Calcula segundos restantes baseado em timestamp de fim real
  const useRemaining = (endTime: number | null) => {
    if (!endTime) return 0;
    const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
    return remaining;
  };

  useEffect(() => {
    if (!timerRunning || !timerEndTime) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    const update = () => {
      const remaining = useRemaining(timerEndTime);
      setTimerSec(remaining);
      if (remaining <= 0) {
        setTimerRunning(false);
        timerRef.current = null;
      }
    };
    update();
    timerRef.current = window.setInterval(update, 1000);
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [timerRunning, timerEndTime, tick]);

  useEffect(() => {
    if (!stabilizationRunning || !stabilizationEndTime) {
      if (stabilizationRef.current) {
        window.clearInterval(stabilizationRef.current);
        stabilizationRef.current = null;
      }
      return;
    }
    const update = () => {
      const remaining = useRemaining(stabilizationEndTime);
      setStabilizationSec(remaining);
      if (remaining <= 0) {
        setStabilizationRunning(false);
        setPhase('ready-for-initial');
        setAlertAcked(false);
        stabilizationRef.current = null;
        playAlertTone();
      }
    };
    update();
    stabilizationRef.current = window.setInterval(update, 1000);
    return () => {
      if (stabilizationRef.current) {
        window.clearInterval(stabilizationRef.current);
        stabilizationRef.current = null;
      }
    };
  }, [stabilizationRunning, stabilizationEndTime, tick, playAlertTone]);

  useEffect(() => {
    if (!finalRunning || !finalEndTime) {
      if (finalRef.current) {
        window.clearInterval(finalRef.current);
        finalRef.current = null;
      }
      return;
    }
    const update = () => {
      const remaining = useRemaining(finalEndTime);
      setFinalSec(remaining);
      if (remaining <= 0) {
        setFinalRunning(false);
        setPhase('completed');
        setAlertAcked(false);
        finalRef.current = null;
        playAlertTone();
      }
    };
    update();
    finalRef.current = window.setInterval(update, 1000);
    return () => {
      if (finalRef.current) {
        window.clearInterval(finalRef.current);
        finalRef.current = null;
      }
    };
  }, [finalRunning, finalEndTime, tick, playAlertTone]);

  const nowHHMM = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const formatTimer = (total: number) => {
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleStartTimer = () => {
    const end = Date.now() + timerSec * 1000;
    setTimerEndTime(end);
    setTimerRunning(true);
    if (!testes.wpHoraInicio) handleTestChange('wpHoraInicio', nowHHMM());
  };

  const handleStopTimer = () => {
    setTimerRunning(false);
    setTimerEndTime(null);
    if (timerSec > 0) handleTestChange('wpHoraFim', nowHHMM());
  };

  const handleResetTimer = () => {
    setTimerRunning(false);
    setTimerEndTime(null);
    setTimerSec(0);
  };

  const stabilizationLimit = stabilizationMinutes * 60;

  const handleStartStabilization = () => {
    const end = Date.now() + stabilizationMinutes * 60 * 1000;
    setStabilizationEndTime(end);
    setStabilizationSec(stabilizationMinutes * 60);
    setStabilizationRunning(true);
    setPhase('stabilizing');
    setAlertAcked(false);
    if (!testes.wpHoraInicio) handleTestChange('wpHoraInicio', nowHHMM());
  };

  const handleStopStabilization = () => {
    setStabilizationRunning(false);
    setStabilizationEndTime(null);
  };

  const handleResetStabilization = () => {
    setStabilizationRunning(false);
    setStabilizationEndTime(null);
    setStabilizationSec(0);
    setPhase('idle');
    setAlertAcked(false);
    clearWPTimerState();
    hydratedRef.current = false;
  };

  const handleMarkInitialPressure = () => {
    const end = Date.now() + 60 * 60 * 1000;
    setFinalEndTime(end);
    setFinalSec(60 * 60);
    setPhase('measuring-final');
    setFinalRunning(true);
    setAlertAcked(false);
    handleTestChange('wpHoraInicio', nowHHMM());
  };

  const handleMarkFinalPressure = () => {
    setFinalRunning(false);
    setFinalEndTime(null);
    setPhase('completed');
    setAlertAcked(false);
    handleTestChange('wpHoraFim', nowHHMM());
  };

  const handleAckAlert = () => {
    ensureAudio();
    setAlertAcked(true);
  };

  const recommendations = useMemo(() => getTestRecommendations({
    brand: inspectionData.brand,
    model: inspectionData.model,
    launchType: inspectionData.launchType,
    dataFabrico: inspectionData.dataFabrico,
    inspectionDate: inspectionData.dataInspecao,
  }), [inspectionData.brand, inspectionData.model, inspectionData.launchType, inspectionData.dataFabrico, inspectionData.dataInspecao]);

  const recMap = useMemo(() => {
    const map: Record<string, TestRecommendation> = {};
    for (const rec of recommendations) map[rec.testId] = rec;
    return map;
  }, [recommendations]);

  const ageYears = recommendations[0]?.ageYears ?? null;

  const isDavit = useMemo(() => {
    const launch = (inspectionData.launchType || '').toLowerCase();
    return launch === 'dl' || launch.includes('davit') || launch.includes('turco');
  }, [inspectionData.launchType]);

  const dlReference = useMemo(
    () =>
      getDlLoadReference({
        brand: inspectionData.brand,
        model: inspectionData.model,
        capacity: inspectionData.capacity,
      }),
    [inspectionData.brand, inspectionData.model, inspectionData.capacity],
  );

  const requiredButSkipped = useMemo(() => {
    return recommendations.filter(r =>
      r.status === 'required' && testes[r.testId] === 'N/A'
    );
  }, [recommendations, testes]);

  useEffect(() => {
    fetch('/api/equipamentos-calibracao')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setEquipments(data);
        }
      })
      .catch(err => console.error('Erro ao carregar equipamentos de calibração:', err));
  }, []);

  const checkCalibrationWarning = (sensorId: string) => {
    if (!sensorId) return null;
    const sensor = equipments.find(e => String(e.id) === String(sensorId));
    return calibrationEvidence(sensor, inspectionData.dataInspecao);
  };

  const handleTestChange = (testId: string, result: string) => {
    const nextTestes: Record<string, unknown> = {
      ...testes,
      [testId]: result,
    };

    setInspectionData({
      testes: nextTestes as typeof testes,
    });
  };

  // Data do ultimo ensaio GI. O store guarda o valor para o passo 8 o persistir
  // no checklistSnapshot da inspecao.
  const dataUltimoGi = inspectionData.dataUltimoGi || '';

  const setDataUltimoGi = (value: string) => {
    setInspectionData({ dataUltimoGi: value });
  };

  const giDateContext = useMemo(
    () =>
      getGiDateContext({
        dataFabrico: inspectionData.dataFabrico,
        dataUltimoGi,
        referenceDate: inspectionData.dataInspecao,
      }),
    [inspectionData.dataFabrico, inspectionData.dataInspecao, dataUltimoGi],
  );

  // Se o utilizador escreveu uma data manualmente, o proximo GI e sempre essa
  // data + 5 anos; caso contrario usa a data sugerida pela regra.
  const formatGiDate = (suggested: string | null, registada: string) => {
    if (registada) {
      const registadaDate = parseFlexibleDateValue(registada);
      if (registadaDate) {
        const proxima = new Date(registadaDate.getTime());
        proxima.setFullYear(proxima.getFullYear() + 5);
        return proxima.toLocaleDateString('pt-PT');
      }
    }
    return suggested ? parseFlexibleDateValue(suggested)?.toLocaleDateString('pt-PT') || suggested : '—';
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">{stepNo > 0 ? `${stepNo}. ` : ''}Testes Operacionais e de Pressão</h2>
        <p className="text-slate-600 mt-1">Registe os resultados dos testes estruturais realizados na jangada.</p>
        <p role="status" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">As recomendações automáticas são indicativas e não confirmam o manual, a aprovação nem o histórico de ensaios. Confirme a aplicabilidade e registe apenas medições e horas efetivamente observadas.</p>
        {evidenceWarnings.length > 0 && <div role="status" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">Registos de ensaio por completar</p><ul className="mt-1 list-disc pl-5">{evidenceWarnings.map(warning => <li key={warning.test}>{warning.test}: {warning.missing.join(', ')}.</li>)}</ul><p className="mt-1">Aviso informativo: confirme os campos exigidos para esta jangada e o procedimento aplicável.</p></div>}
      </div>

      <ManualReferenceNotice brand={inspectionData.brand} model={inspectionData.model} topic="testes" />

      {/* State summary strip */}
      <div className="bg-sky-50 rounded-2xl p-4 text-slate-900 border border-sky-200 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="grid grid-cols-3 gap-3 flex-1 text-center">
          <div className="bg-emerald-50 border border-emerald-300 rounded-lg py-2 shadow-sm">
            <p className="text-lg font-black text-emerald-700 flex items-center justify-center gap-1.5">
              {recommendations.filter((r) => testes[r.testId] === 'PASSOU').length}
              <CheckCircle2 className="w-4 h-4" />
            </p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Passou</p>
          </div>
          <div className="bg-red-50 border border-red-300 rounded-lg py-2 shadow-sm">
            <p className="text-lg font-black text-red-700 flex items-center justify-center gap-1.5">
              {recommendations.filter((r) => testes[r.testId] === 'REPROVOU').length}
              <XCircle className="w-4 h-4" />
            </p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Reprovou</p>
          </div>
          <div className="bg-slate-100 border border-slate-300 rounded-lg py-2 shadow-sm">
            <p className="text-lg font-black text-slate-700 flex items-center justify-center gap-1.5">
              {recommendations.filter((r) => !testes[r.testId] || testes[r.testId] === 'N/A').length}
              <HelpCircle className="w-4 h-4" />
            </p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Por registar</p>
          </div>
        </div>
        <div className="hidden sm:block text-right">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Situação global</p>
          {requiredButSkipped.length > 0 ? (
            <p className="text-sm font-bold text-amber-700 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" />
              {requiredButSkipped.length} obrigatório(s) como N/A
            </p>
          ) : (
            <p className="text-sm font-bold text-emerald-700">
              {recommendations.filter((r) => testes[r.testId] === 'REPROVOU').length > 0 ? 'Com reprovações' : 'Pronto para avançar'}
            </p>
          )}
        </div>
      </div>

      {/* Age-Based Test Summary */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-indigo-100 p-2 rounded-xl">
            <Info size={20} className="text-indigo-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-wider">Testes Recomendados pela Idade</h3>
            <p className="text-xs text-indigo-700 mt-0.5">
              {ageYears !== null
                ? `Jangada com ${ageYears} ano(s) desde fabrico — regras SOLAS/ISO aplicáveis`
                : 'Idade desconhecida — sem data de fabrico registada'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {recommendations.map((rec) => {
            const cfg = STATUS_CONFIG[rec.status] || STATUS_CONFIG.unknown;
            const Icon = cfg.icon;
            const currentResult = testes[rec.testId] || '';
            const isSkipped = currentResult === 'N/A' && rec.status === 'required';

            return (
              <div
                key={rec.testId}
                className={`rounded-xl p-3 border ${cfg.bg} ${cfg.border} ${isSkipped ? 'ring-2 ring-red-400 ring-offset-1' : ''}`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={14} className={cfg.text} />
                  <span className={`text-xs font-bold ${cfg.text}`}>{rec.shortLabel}</span>
                </div>
                <p className={`text-[11px] font-semibold ${cfg.text} leading-tight`}>{cfg.label}</p>
                {rec.nextGiYear !== null && rec.testId === 'testeGI' && rec.status !== 'overdue' && (
                  <p className="text-[10px] text-indigo-600 mt-1">Próx. GI: {rec.nextGiYear}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Warning: Required Tests Skipped */}
      {requiredButSkipped.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-800">
              Testes obrigatórios marcados como N/A
            </p>
            <p className="text-xs text-red-700 mt-1">
              {requiredButSkipped.map(r => r.shortLabel).join(', ')} — {requiredButSkipped.length === 1 ? 'é obrigatório' : 'são obrigatórios'} para uma jangada com {ageYears} ano(s).
              Altere o resultado para PASSOU ou REPROVOU antes de avançar.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">Painel de Testes</h3>
        </div>

        <div className="divide-y divide-slate-100 p-6 space-y-6">
          {recommendations.map((rec) => {
            const currentResult = testes[rec.testId] || '';
            const isWP = rec.testId === 'testeWP';
            const cfg = STATUS_CONFIG[rec.status] || STATUS_CONFIG.unknown;
            const StatusIcon = cfg.icon;
            const isSkipped = currentResult === 'N/A' && rec.status === 'required';
            const TestIcon = TEST_ICONS[rec.testId] || Gauge;

            return (
              <div
                key={rec.testId}
                className={`pt-6 first:pt-0 border-t border-slate-100 first:border-0 ${isSkipped ? 'bg-red-50/50 -mx-6 px-6 rounded-xl' : ''}`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl shrink-0 ${
                      rec.status === 'required' ? 'bg-amber-100 text-amber-600' :
                      rec.status === 'overdue' ? 'bg-red-100 text-red-600' :
                      rec.status === 'not-required' ? 'bg-slate-100 text-slate-400' :
                      'bg-indigo-50 text-indigo-600'
                    }`}>
                      <TestIcon size={24} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-base font-bold text-slate-800">{rec.label}</h4>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.border} border ${cfg.text}`}>
                          <StatusIcon size={12} />
                          {cfg.label}
                        </span>
                        {isSkipped && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 border border-red-300 text-red-700">
                            <AlertTriangle size={12} />
                            Obrigatório — não pode ser N/A
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-1">{rec.reason}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{rec.detail}</p>
                    </div>
                  </div>

                  <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
                    {['PASSOU', 'REPROVOU', 'N/A'].map((option) => (
                      <button
                        key={option}
                        onClick={() => handleTestChange(rec.testId, option)}
                        className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
                          currentResult === option
                            ? option === 'PASSOU'
                              ? 'bg-emerald-500 text-white shadow-sm'
                              : option === 'REPROVOU'
                                ? 'bg-red-500 text-white shadow-sm'
                                : 'bg-slate-600 text-white shadow-sm'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                {rec.testId === 'testeGI' && (
                  <div className="mt-5 ml-[3.25rem] rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <CalendarClock size={16} className="text-indigo-600" />
                      <p className="text-sm font-bold text-indigo-900">Data do último teste GI</p>
                      {giDateContext.origem === 'registada' && (
                        <span className="inline-flex items-center rounded-full border border-indigo-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-800">
                          Registada
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-xs font-semibold text-indigo-900">
                        Último GI
                        <input
                          type="date"
                          value={dataUltimoGi}
                          onChange={(e) => setDataUltimoGi(e.target.value)}
                          className="mt-1 block w-full px-3 py-2 border border-indigo-300 rounded-md text-sm bg-white"
                        />
                      </label>
                      {dataUltimoGi && (
                        <button
                          type="button"
                          onClick={() => setDataUltimoGi('')}
                          className="px-3 py-2 rounded-md text-xs font-semibold text-indigo-700 underline underline-offset-2"
                        >
                          Limpar
                        </button>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-indigo-900">
                      <span>
                        Próximo GI {giDateContext.origem === 'registada' ? '(estimado a partir do registo)' : '(sem histórico confirmado)'}:{' '}
                        <strong className="font-bold">
                          {giDateContext.origem === 'registada' ? formatGiDate(giDateContext.proximaGiDate, dataUltimoGi) : 'Por confirmar'}
                        </strong>
                      </span>
                      {giDateContext.origem === 'registada' && giDateContext.anosDesdeUltimaGi !== null && (
                        <span>
                          {giDateContext.anosDesdeUltimaGi} ano(s) desde o último ensaio
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-[11px] text-indigo-700">
                      Confirme o último ensaio documentado, a periodicidade aplicável e a data com o manual e a aprovação da jangada.
                    </p>
                  </div>
                )}

                {rec.testId === 'testeDL' && isDavit && dlReference && (
                  <div className={`mt-5 ml-[3.25rem] rounded-xl border p-4 ${
                    rec.status === 'required'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-sky-50 border-sky-200'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <ArrowDownToLine size={16} className={rec.status === 'required' ? 'text-amber-600' : 'text-sky-600'} />
                      <p className={`text-sm font-bold ${rec.status === 'required' ? 'text-amber-800' : 'text-sky-900'}`}>
                        {rec.status === 'required'
                          ? 'Carga de suspensão/sobrecarga (1,1 × G) — obrigatória este ano'
                          : 'Referência de suspensão (1,1 × G) — só suspensão com sobrecarga a cada 2º serviço'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                      <p className="text-2xl font-black tabular-nums text-slate-900">
                        {dlReference.minKg !== null && dlReference.maxKg !== null
                          ? dlReference.minKg === dlReference.maxKg
                            ? `${dlReference.minKg.toLocaleString('pt-PT')} kg`
                            : `${dlReference.minKg.toLocaleString('pt-PT')} – ${dlReference.maxKg.toLocaleString('pt-PT')} kg`
                          : dlReference.formulaKg !== null
                            ? `≈ ${dlReference.formulaKg.toLocaleString('pt-PT')} kg`
                            : '—'}
                      </p>
                      <p className="text-xs text-slate-500">
                        medido no anel de elevação · mínimo {dlReference.durationMinutes} min
                        {dlReference.minKg !== null && dlReference.maxKg !== null && dlReference.minKg !== dlReference.maxKg
                          ? ' · P1 min–max (pele + lastro)'
                          : ''}
                      </p>
                    </div>
                    {dlReference.maxKg === null && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Fórmula: 75 kg × {dlReference.capacity} pessoas × 1,1 — confirmar com o fabricante.
                      </p>
                    )}
                    {dlReference.source && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        {dlReference.source.doc}
                        {dlReference.source.note ? ` — ${dlReference.source.note}` : ''}
                      </p>
                    )}
                  </div>
                )}

                {isWP && currentResult === 'PASSOU' && (
                  <div className="mt-6 ml-[3.25rem] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <div className="col-span-full mb-2 flex justify-between items-center">
                      <h5 className="text-sm font-bold text-slate-700">Parâmetros do Teste WP</h5>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Unidade:</label>
                        <select 
                          value={testes.wpUnidadePressao || 'hpa'}
                          onChange={(e) => handleTestChange('wpUnidadePressao', e.target.value)}
                          className="border-slate-200 rounded-xl px-2 py-1 text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-100"
                        >
                          <option value="hpa">hPa</option>
                          <option value="mbar">mbar</option>
                          <option value="inh2o">inH2O</option>
                          <option value="inhg">inHg</option>
                        </select>
                      </div>
                    </div>

                    {/* Equipamentos de Medição */}
                    <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-4 mb-2 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100/50">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 font-semibold text-slate-700">Manómetro (Pressão das Câmaras)</label>
                        <select
                          value={testes.wpManometroId || ''}
                          onChange={(e) => handleTestChange('wpManometroId', e.target.value)}
                          className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100 font-medium text-slate-700"
                        >
                          <option value="">-- Selecione o Manómetro --</option>
                          {equipments.filter(e => e.tipo === 'manometro').map(e => (
                            <option key={e.id} value={e.id}>{e.nome} ({e.referencia})</option>
                          ))}
                        </select>
                        {(() => {
                          const warning = checkCalibrationWarning(testes.wpManometroId);
                          if (warning) {
                            return (
                              <div className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mt-1 bg-amber-50 p-1.5 rounded border border-amber-200">
                                <AlertTriangle size={14} className="shrink-0" />
                                <span>{warning}</span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 font-semibold text-slate-700">Barómetro (Pressão Atmosférica)</label>
                        <select
                          value={testes.wpBarometroId || ''}
                          onChange={(e) => handleTestChange('wpBarometroId', e.target.value)}
                          className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100 font-medium text-slate-700"
                        >
                          <option value="">-- Selecione o Barómetro --</option>
                          {equipments.filter(e => e.tipo === 'barometro').map(e => (
                            <option key={e.id} value={e.id}>{e.nome} ({e.referencia})</option>
                          ))}
                        </select>
                        {(() => {
                          const warning = checkCalibrationWarning(testes.wpBarometroId);
                          if (warning) {
                            return (
                              <div className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mt-1 bg-amber-50 p-1.5 rounded border border-amber-200">
                                <AlertTriangle size={14} className="shrink-0" />
                                <span>{warning}</span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>

<div className="col-span-full bg-amber-50 rounded-xl p-4 border border-amber-200 flex flex-wrap items-center gap-x-4 gap-y-3 shadow-sm">
                      {/* Seletor de duração de estabilização */}
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Estabilização válvulas:</label>
                        <select
                          value={stabilizationMinutes}
                          onChange={(e) => setStabilizationMinutes(Number(e.target.value))}
                          disabled={stabilizationRunning || finalRunning || phase === 'completed'}
                          className="border-slate-200 rounded-xl px-2 py-1 text-xs font-bold bg-white focus:ring-2 focus:ring-amber-100"
                        >
                          <option value={30}>30 min</option>
                          <option value={60}>60 min</option>
                        </select>
                        <span className="text-[10px] text-slate-400">antes da pressão inicial</span>
                      </div>

                      {/* Temporizador de estabilização */}
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <div className={`p-2 rounded-lg shrink-0 ${phase === 'stabilizing' ? 'bg-orange-100' : phase === 'ready-for-initial' ? 'bg-yellow-100' : phase === 'measuring-final' ? 'bg-blue-100' : phase === 'completed' ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                          {phase === 'stabilizing' ? <Clock size={20} className="text-orange-700 animate-spin" /> : phase === 'ready-for-initial' ? <AlertTriangle size={20} className="text-yellow-700" /> : phase === 'measuring-final' ? <Clock size={20} className="text-blue-700" /> : phase === 'completed' ? <CheckCircle2 size={20} className="text-emerald-700" /> : <Timer size={20} className="text-slate-600" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wider text-slate-600 font-bold">Temporizador WP</p>
                          <p className="text-2xl font-black tabular-nums font-mono text-slate-900 leading-none mt-0.5">{phase === 'stabilizing' ? formatTimer(stabilizationSec) : phase === 'measuring-final' ? formatTimer(finalSec) : formatTimer(timerSec)}</p>
                          {stabilizationRunning && (
                            <p className="text-[10px] text-orange-700 font-bold mt-1 flex items-center gap-1">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                              Estabilização em curso…
                            </p>
                          )}
                          {finalRunning && (
                            <p className="text-[10px] text-blue-700 font-bold mt-1 flex items-center gap-1">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                              Aguardando pressão final…
                            </p>
                          )}
                          {phase === 'ready-for-initial' && !alertAcked && (
                            <p className="text-[10px] text-yellow-700 font-bold mt-1 flex items-center gap-1">
                              <AlertTriangle size={14} className="shrink-0" />
                              Tempo de estabilização esgotado — leia a <strong>pressão inicial das câmaras</strong>.
                            </p>
                          )}
                          {phase === 'completed' && !alertAcked && (
                            <p className="text-[10px] text-emerald-700 font-bold mt-1 flex items-center gap-1">
                              <CheckCircle2 size={14} className="shrink-0" />
                              Tempo final esgotado — registe a <strong>pressão final das câmaras</strong>.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-auto flex-wrap">
                        <div className="flex flex-col items-end mr-2 hidden md:flex">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Hora atual (real)</p>
                          <p className="text-2xl font-black tabular-nums font-mono text-slate-900 leading-none mt-0.5">{nowHHMMSS()}</p>
                          {testes.wpHoraInicio && (
                            <p className="text-[10px] text-indigo-600 font-bold mt-1">
                              Início registado: {testes.wpHoraInicio}
                            </p>
                          )}
                          {testes.wpHoraFim && (
                            <p className="text-[10px] text-indigo-600 font-bold mt-1">
                              Fim registado: {testes.wpHoraFim}
                            </p>
                          )}
                        </div>
                        {phase === 'idle' && (
                          <>
                            <button
                              type="button"
                              onClick={handleStartStabilization}
                              disabled={stabilizationRunning}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-40 transition"
                            >
                              <Play size={14} />
                              Iniciar Estabilização
                            </button>
                            <button
                              type="button"
                              onClick={handleResetStabilization}
                              disabled={!stabilizationRunning && stabilizationSec === 0 && phase === 'idle'}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition"
                            >
                              <RotateCcw size={14} />
                              Repor
                            </button>
                          </>
                        )}
                        {phase === 'stabilizing' && (
                          <>
                            <button
                              type="button"
                              onClick={handleStopStabilization}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 transition"
                            >
                              <Pause size={14} />
                              Pausar Estab.
                            </button>
                            <button
                              type="button"
                              onClick={handleResetStabilization}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-red-600 bg-white border border-red-200 hover:bg-red-50 transition"
                            >
                              <RotateCcw size={14} />
                              Repor
                            </button>
                          </>
                        )}
                        {phase === 'ready-for-initial' && !alertAcked && (
                          <>
                            <button
                              type="button"
                              onClick={handleAckAlert}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-yellow-700 bg-white border border-yellow-200 hover:bg-yellow-50 transition"
                            >
                              <Bell size={14} />
                              Li a Pressão Inicial
                            </button>
                            <button
                              type="button"
                              onClick={handleMarkInitialPressure}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 transition"
                            >
                              <Clock size={14} />
                              Iniciar Pressão Final (60 min)
                            </button>
                          </>
                        )}
                        {phase === 'ready-for-initial' && alertAcked && (
                          <button
                            type="button"
                            onClick={handleMarkInitialPressure}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition"
                          >
                            <Clock size={14} />
                            Iniciar Pressão Final (60 min)
                          </button>
                        )}
                        {phase === 'measuring-final' && (
                          <>
                            <button
                              type="button"
                              onClick={() => setFinalRunning(!finalRunning)}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold ${finalRunning ? 'text-white bg-indigo-600 hover:bg-indigo-700' : 'text-white bg-blue-600 hover:bg-blue-700'} disabled:opacity-40 transition`}
                            >
                              {finalRunning ? <Pause size={14} /> : <Play size={14} />}
                              {finalRunning ? 'Pausar Pressão Final' : 'Retomar Pressão Final'}
                            </button>
                            <button
                              type="button"
                              onClick={handleMarkFinalPressure}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-emerald-600 bg-white border border-emerald-200 hover:bg-emerald-50 transition"
                            >
                              <CheckCircle2 size={14} />
                              Registar Pressão Final
                            </button>
                          </>
                        )}
                        {phase === 'completed' && !alertAcked && (
                          <button
                            type="button"
                            onClick={handleAckAlert}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50 transition"
                          >
                            <CheckCircle2 size={14} />
                            Pressão Final Registada
                          </button>
                        )}
                        {phase === 'completed' && alertAcked && (
                          <button
                            type="button"
                            onClick={handleResetStabilization}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition"
                          >
                            <RotateCcw size={14} />
                            Novo Teste
                          </button>
                        )}
                      </div>
                    </div>

<div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between gap-2">
                        Hora Início
                        <button
                          type="button"
                          onClick={() => {
                            handleTestChange('wpHoraInicio', nowHHMM());
                            setTimerRunning(true);
                          }}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-200"
                        >
                          Agora
                        </button>
                      </label>
                      <input
                        type="time"
                        value={testes.wpHoraInicio || ''}
                        onChange={(e) => handleTestChange('wpHoraInicio', e.target.value)}
                        className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    <div className="space-y-1.5">
<label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between gap-2">
                        Hora Fim
                        <button
                          type="button"
                          onClick={() => {
                            handleTestChange('wpHoraFim', nowHHMM());
                            setTimerRunning(false);
                          }}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-200"
                        >
                          Agora
                        </button>
                      </label>
                      <input
                        type="time"
                        value={testes.wpHoraFim || ''}
                        onChange={(e) => handleTestChange('wpHoraFim', e.target.value)}
                        className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between gap-2">
                        Temp. Inicial (ºC)
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=37.7688&longitude=-25.5825&current=temperature_2m,pressure_msl&timezone=auto`);
                              const data = await res.json();
                              const temp = data?.current?.temperature_2m;
                              const press = data?.current?.pressure_msl;
                              const nextTestes = { ...testes };
                              if (temp !== undefined && temp !== null) {
                                nextTestes.wpTempInicio = String(temp);
                                nextTestes.wpTempFim = String(temp);
                              }
                              if (press !== undefined && press !== null) {
                                nextTestes.wpPressaoAtmInicio = String(Math.round(press));
                                nextTestes.wpPressaoAtmFim = String(Math.round(press));
                              }
                              setInspectionData({ testes: nextTestes });
                            } catch (e) {
                              console.error(e);
                            }
                          }}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200"
                        >
                          Meteorologia (Agora)
                        </button>
                      </label>
                      <input 
                        type="number" step="0.1"
                        value={testes.wpTempInicio || ''}
                        onChange={(e) => handleTestChange('wpTempInicio', e.target.value)}
                        className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Temp. Final (ºC)</label>
                      <input 
                        type="number" step="0.1"
                        value={testes.wpTempFim || ''}
                        onChange={(e) => handleTestChange('wpTempFim', e.target.value)}
                        className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">P. Atmosférica Inicial (hPa)</label>
                      <input 
                        type="number" step="0.1"
                        value={testes.wpPressaoAtmInicio || ''}
                        onChange={(e) => handleTestChange('wpPressaoAtmInicio', e.target.value)}
                        className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">P. Atmosférica Final (hPa)</label>
                      <input 
                        type="number" step="0.1"
                        value={testes.wpPressaoAtmFim || ''}
                        onChange={(e) => handleTestChange('wpPressaoAtmFim', e.target.value)}
                        className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>

                    <div className="col-span-full border-t border-slate-200 my-2"></div>

                    {/* Câmara Superior — com unidade própria */}
                    <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-4">
                      <div className="col-span-full flex flex-wrap items-center justify-between gap-2">
                        <h6 className="text-sm font-bold text-slate-700">Câmara Superior</h6>
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Unidade:</label>
                          <select
                            value={testes.wpCamaraSupUnidade || testes.wpUnidadePressao || 'hpa'}
                            onChange={(e) => handleTestChange('wpCamaraSupUnidade', e.target.value)}
                            className="border-slate-200 rounded-xl px-2 py-1 text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-100"
                          >
                            <option value="hpa">hPa</option>
                          <option value="mbar">mbar</option>
                            <option value="inh2o">inH2O</option>
                            <option value="inhg">inHg</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Pressão Câm. Sup. (Início)</label>
                        <input
                          type="number" step="0.01"
                          value={testes.wpCamaraSupInicio || ''}
                          onChange={(e) => handleTestChange('wpCamaraSupInicio', e.target.value)}
                          className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Pressão Câm. Sup. (Fim)</label>
                        <input
                          type="number" step="0.01"
                          value={testes.wpCamaraSupFim || ''}
                          onChange={(e) => handleTestChange('wpCamaraSupFim', e.target.value)}
                          className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                        />
                      </div>
                    </div>

                    {/* Câmara Inferior — com unidade própria */}
                    <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-4">
                      <div className="col-span-full flex flex-wrap items-center justify-between gap-2">
                        <h6 className="text-sm font-bold text-slate-700">Câmara Inferior</h6>
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Unidade:</label>
                          <select
                            value={testes.wpCamaraInfUnidade || testes.wpUnidadePressao || 'hpa'}
                            onChange={(e) => handleTestChange('wpCamaraInfUnidade', e.target.value)}
                            className="border-slate-200 rounded-xl px-2 py-1 text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-100"
                          >
                            <option value="hpa">hPa</option>
                          <option value="mbar">mbar</option>
                            <option value="inh2o">inH2O</option>
                            <option value="inhg">inHg</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Pressão Câm. Inf. (Início)</label>
                        <input
                          type="number" step="0.01"
                          value={testes.wpCamaraInfInicio || ''}
                          onChange={(e) => handleTestChange('wpCamaraInfInicio', e.target.value)}
                          className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Pressão Câm. Inf. (Fim)</label>
                        <input
                          type="number" step="0.01"
                          value={testes.wpCamaraInfFim || ''}
                          onChange={(e) => handleTestChange('wpCamaraInfFim', e.target.value)}
                          className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                        />
                      </div>
                    </div>

                    {/* Cálculos Automáticos WP */}
                    <div className="col-span-full mt-4 p-4 rounded-xl bg-indigo-50 border border-indigo-100">
                      <h5 className="text-sm font-bold text-indigo-900 mb-3 flex items-center gap-2">
                        <Activity size={16} />
                        Resultados Calculados WP
                      </h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(() => {
                          const tIn = parseFloat(testes.wpTempInicio);
                          const tOut = parseFloat(testes.wpTempFim);
                          const pAtmIn = parseFloat(testes.wpPressaoAtmInicio);
                          const pAtmOut = parseFloat(testes.wpPressaoAtmFim);
                          
                          const supIn = parseFloat(testes.wpCamaraSupInicio);
                          const supOut = parseFloat(testes.wpCamaraSupFim);
                          const infIn = parseFloat(testes.wpCamaraInfInicio);
                          const infOut = parseFloat(testes.wpCamaraInfFim);

                          const defaultUnit = testes.wpUnidadePressao || 'hpa';
                          const supUnit = testes.wpCamaraSupUnidade || defaultUnit;
                          const infUnit = testes.wpCamaraInfUnidade || defaultUnit;

                          const toMbarUnit = (val: number, u: string) => {
                            if (isNaN(val)) return NaN;
                            if (u === 'inhg') return val * 33.8638866667;
                            if (u === 'inh2o') return val * 2.490889;
                            return val;
                          };

                          const fromMbarUnit = (val: number, u: string) => {
                            if (isNaN(val)) return NaN;
                            if (u === 'inhg') return val / 33.8638866667;
                            if (u === 'inh2o') return val / 2.490889;
                            return val;
                          };

                          if (isNaN(tIn) || isNaN(tOut) || isNaN(pAtmIn) || isNaN(pAtmOut)) {
                            return <div className="text-xs text-indigo-700 col-span-2">Preencha a temperatura e pressão atmosférica para ver as correções.</div>;
                          }

                          const tempDelta = tOut - tIn;
                          const baroDelta = pAtmOut - pAtmIn;
                          const correctionTempMb = -(tempDelta * 4);
                          const correctionBaroMb = baroDelta;
                          const totalCorrectionMb = correctionTempMb + correctionBaroMb;
                          const tempValid = Math.abs(tempDelta) <= 3.5;

                          const analyzeChamber = (startRaw: number, endRaw: number, u: string) => {
                            if (isNaN(startRaw) || isNaN(endRaw)) return null;
                            const startMb = toMbarUnit(startRaw, u);
                            const endMb = toMbarUnit(endRaw, u);

                            const correctedEndMb = endMb + totalCorrectionMb;
                            const dropMbRaw = startMb - correctedEndMb;
                            const dropMb = Math.max(0, dropMbRaw);
                            const percent = startMb > 0 ? (dropMb / startMb) * 100 : 0;
                            const passes = percent <= 5 && tempValid;
                            
                            return { 
                              correctedEndDisplay: fromMbarUnit(correctedEndMb, u), 
                              dropDisplay: fromMbarUnit(dropMb, u), 
                              percent, 
                              passes,
                              unit: u,
                            };
                          };

                          const sup = analyzeChamber(supIn, supOut, supUnit);
                          const inf = analyzeChamber(infIn, infOut, infUnit);

                          return (
                            <>
                              <div className="bg-white p-3 rounded-lg border border-indigo-50 shadow-sm">
                                <p className="text-xs font-bold text-slate-500 uppercase">Câmara Superior</p>
                                {sup ? (
                                  <div className="mt-2 space-y-1">
                                    <p className="text-sm">P. Corrigida: <span className="font-semibold text-slate-800">{sup.correctedEndDisplay.toFixed(2)} {sup.unit}</span></p>
                                    <p className="text-sm">Queda: <span className="font-semibold text-red-500">{sup.dropDisplay.toFixed(2)} {sup.unit} ({sup.percent.toFixed(2)}%)</span></p>
                                    <p className={`text-sm font-bold mt-1.5 flex items-center gap-1 ${sup.passes ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {sup.passes ? '✓ APROVADO' : '✗ REPROVADO'}
                                    </p>
                                    {sup.percent > 5 && (
                                      <p className="text-[10px] text-red-650 font-bold bg-rose-50 p-1.5 rounded-lg border border-rose-100 mt-1.5 flex items-center gap-1">
                                        ⚠️ Queda de pressão excedeu o limite regulamentar de 5%!
                                      </p>
                                    )}
                                  </div>
                                ) : <p className="text-xs text-slate-400 mt-1">A aguardar pressões...</p>}
                              </div>

                              <div className="bg-white p-3 rounded-lg border border-indigo-50 shadow-sm">
                                <p className="text-xs font-bold text-slate-500 uppercase">Câmara Inferior</p>
                                {inf ? (
                                  <div className="mt-2 space-y-1">
                                    <p className="text-sm">P. Corrigida: <span className="font-semibold text-slate-800">{inf.correctedEndDisplay.toFixed(2)} {inf.unit}</span></p>
                                    <p className="text-sm">Queda: <span className="font-semibold text-red-500">{inf.dropDisplay.toFixed(2)} {inf.unit} ({inf.percent.toFixed(2)}%)</span></p>
                                    <p className={`text-sm font-bold mt-1.5 flex items-center gap-1 ${inf.passes ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {inf.passes ? '✓ APROVADO' : '✗ REPROVADO'}
                                    </p>
                                    {inf.percent > 5 && (
                                      <p className="text-[10px] text-red-650 font-bold bg-rose-50 p-1.5 rounded-lg border border-rose-100 mt-1.5 flex items-center gap-1">
                                        ⚠️ Queda de pressão excedeu o limite regulamentar de 5%!
                                      </p>
                                    )}
                                  </div>
                                ) : <p className="text-xs text-slate-400 mt-1">A aguardar pressões...</p>}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Bloco idêntico para NAP */}
                {rec.testId === 'testeNAP' && currentResult === 'PASSOU' && (
                  <div className="mt-6 ml-[3.25rem] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <div className="col-span-full mb-2 flex justify-between items-center">
                      <h5 className="text-sm font-bold text-slate-700">Parâmetros do Teste NAP</h5>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Unidade:</label>
                        <select 
                          value={testes.napUnidadePressao || 'hpa'}
                          onChange={(e) => handleTestChange('napUnidadePressao', e.target.value)}
                          className="border-slate-200 rounded-xl px-2 py-1 text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-100"
                        >
                          <option value="hpa">hPa</option>
                          <option value="mbar">mbar</option>
                          <option value="inh2o">inH2O</option>
                          <option value="inhg">inHg</option>
                        </select>
                      </div>
                    </div>

                    {/* Equipamento de Medição NAP */}
                    <div className="col-span-full grid grid-cols-1 gap-4 mb-2 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100/50">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 font-semibold text-slate-700">Manómetro (Pressão Adicional)</label>
                        <select
                          value={testes.napManometroId || ''}
                          onChange={(e) => handleTestChange('napManometroId', e.target.value)}
                          className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100 font-medium text-slate-700"
                        >
                          <option value="">-- Selecione o Manómetro --</option>
                          {equipments.filter(e => e.tipo === 'manometro').map(e => (
                            <option key={e.id} value={e.id}>{e.nome} ({e.referencia})</option>
                          ))}
                        </select>
                        {(() => {
                          const warning = checkCalibrationWarning(testes.napManometroId);
                          if (warning) {
                            return (
                              <div className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mt-1 bg-amber-50 p-1.5 rounded border border-amber-200">
                                <AlertTriangle size={14} className="shrink-0" />
                                <span>{warning}</span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between gap-2">
                        Hora Início
                        <button
                          type="button"
                          onClick={() => handleTestChange('napHoraInicio', nowHHMM())}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-200"
                        >
                          Agora
                        </button>
                      </label>
                      <input 
                        type="time" 
                        value={testes.napHoraInicio || ''}
                        onChange={(e) => handleTestChange('napHoraInicio', e.target.value)}
                        className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between gap-2">
                        Hora Fim
                        <button
                          type="button"
                          onClick={() => handleTestChange('napHoraFim', nowHHMM())}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-200"
                        >
                          Agora
                        </button>
                      </label>
                      <input 
                        type="time" 
                        value={testes.napHoraFim || ''}
                        onChange={(e) => handleTestChange('napHoraFim', e.target.value)}
                        className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Temp. Inicial (ºC)</label>
                      <input 
                        type="number" step="0.1"
                        value={testes.napTempInicio || ''}
                        onChange={(e) => handleTestChange('napTempInicio', e.target.value)}
                        className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Temp. Final (ºC)</label>
                      <input 
                        type="number" step="0.1"
                        value={testes.napTempFim || ''}
                        onChange={(e) => handleTestChange('napTempFim', e.target.value)}
                        className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">P. Atmosférica Inicial (hPa)</label>
                      <input 
                        type="number" step="0.1"
                        value={testes.napPressaoAtmInicio || ''}
                        onChange={(e) => handleTestChange('napPressaoAtmInicio', e.target.value)}
                        className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">P. Atmosférica Final (hPa)</label>
                      <input 
                        type="number" step="0.1"
                        value={testes.napPressaoAtmFim || ''}
                        onChange={(e) => handleTestChange('napPressaoAtmFim', e.target.value)}
                        className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>

                    <div className="col-span-full border-t border-slate-200 my-2"></div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Pressão Câm. Sup. (Início)</label>
                      <input 
                        type="number" step="0.01"
                        value={testes.napCamaraSupInicio || ''}
                        onChange={(e) => handleTestChange('napCamaraSupInicio', e.target.value)}
                        className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Pressão Câm. Sup. (Fim)</label>
                      <input 
                        type="number" step="0.01"
                        value={testes.napCamaraSupFim || ''}
                        onChange={(e) => handleTestChange('napCamaraSupFim', e.target.value)}
                        className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Pressão Câm. Inf. (Início)</label>
                      <input 
                        type="number" step="0.01"
                        value={testes.napCamaraInfInicio || ''}
                        onChange={(e) => handleTestChange('napCamaraInfInicio', e.target.value)}
                        className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Pressão Câm. Inf. (Fim)</label>
                      <input 
                        type="number" step="0.01"
                        value={testes.napCamaraInfFim || ''}
                        onChange={(e) => handleTestChange('napCamaraInfFim', e.target.value)}
                        className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>

                    {/* Cálculos Automáticos NAP */}
                    <div className="col-span-full mt-4 p-4 rounded-xl bg-indigo-50 border border-indigo-100">
                      <h5 className="text-sm font-bold text-indigo-900 mb-3 flex items-center gap-2">
                        <Activity size={16} />
                        Resultados Calculados NAP
                      </h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(() => {
                          const tIn = parseFloat(testes.napTempInicio);
                          const tOut = parseFloat(testes.napTempFim);
                          const pAtmIn = parseFloat(testes.napPressaoAtmInicio);
                          const pAtmOut = parseFloat(testes.napPressaoAtmFim);
                          
                          const supIn = parseFloat(testes.napCamaraSupInicio);
                          const supOut = parseFloat(testes.napCamaraSupFim);
                          const infIn = parseFloat(testes.napCamaraInfInicio);
                          const infOut = parseFloat(testes.napCamaraInfFim);

                          const unit = testes.napUnidadePressao || 'hpa';

                          const toMbar = (val: number) => {
                            if (isNaN(val)) return NaN;
                            if (unit === 'inhg') return val * 33.8638866667;
                            if (unit === 'inh2o') return val * 2.490889;
                            return val;
                          };

                          const fromMbar = (val: number) => {
                            if (isNaN(val)) return NaN;
                            if (unit === 'inhg') return val / 33.8638866667;
                            if (unit === 'inh2o') return val / 2.490889;
                            return val;
                          };

                          if (isNaN(tIn) || isNaN(tOut) || isNaN(pAtmIn) || isNaN(pAtmOut)) {
                            return <div className="text-xs text-indigo-700 col-span-2">Preencha a temperatura e pressão atmosférica para ver as correções.</div>;
                          }

                          const tempDelta = tOut - tIn;
                          const baroDelta = pAtmOut - pAtmIn;
                          const correctionTempMb = -(tempDelta * 4);
                          const correctionBaroMb = baroDelta;
                          const totalCorrectionMb = correctionTempMb + correctionBaroMb;
                          const tempValid = Math.abs(tempDelta) <= 3.5;

                          const analyzeChamber = (startRaw: number, endRaw: number) => {
                            if (isNaN(startRaw) || isNaN(endRaw)) return null;
                            const startMb = toMbar(startRaw);
                            const endMb = toMbar(endRaw);

                            const correctedEndMb = endMb + totalCorrectionMb;
                            const dropMbRaw = startMb - correctedEndMb;
                            const dropMb = Math.max(0, dropMbRaw);
                            const percent = startMb > 0 ? (dropMb / startMb) * 100 : 0;
                            const passes = percent <= 5 && tempValid;
                            
                            return { 
                              correctedEndDisplay: fromMbar(correctedEndMb), 
                              dropDisplay: fromMbar(dropMb), 
                              percent, 
                              passes 
                            };
                          };

                          const sup = analyzeChamber(supIn, supOut);
                          const inf = analyzeChamber(infIn, infOut);

                          return (
                            <>
                              <div className="bg-white p-3 rounded-lg border border-indigo-50 shadow-sm">
                                <p className="text-xs font-bold text-slate-500 uppercase">Câmara Superior</p>
                                {sup ? (
                                  <div className="mt-2 space-y-1">
                                    <p className="text-sm">P. Corrigida: <span className="font-semibold text-slate-800">{sup.correctedEndDisplay.toFixed(2)} {unit}</span></p>
                                    <p className="text-sm">Queda: <span className="font-semibold text-red-500">{sup.dropDisplay.toFixed(2)} {unit} ({sup.percent.toFixed(2)}%)</span></p>
                                    <p className={`text-sm font-bold mt-1.5 flex items-center gap-1 ${sup.passes ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {sup.passes ? '✓ APROVADO' : '✗ REPROVADO'}
                                    </p>
                                    {sup.percent > 5 && (
                                      <p className="text-[10px] text-red-650 font-bold bg-rose-50 p-1.5 rounded-lg border border-rose-100 mt-1.5 flex items-center gap-1">
                                        ⚠️ Queda de pressão excedeu o limite regulamentar de 5%!
                                      </p>
                                    )}
                                  </div>
                                ) : <p className="text-xs text-slate-400 mt-1">A aguardar pressões...</p>}
                              </div>

                              <div className="bg-white p-3 rounded-lg border border-indigo-50 shadow-sm">
                                <p className="text-xs font-bold text-slate-500 uppercase">Câmara Inferior</p>
                                {inf ? (
                                  <div className="mt-2 space-y-1">
                                    <p className="text-sm">P. Corrigida: <span className="font-semibold text-slate-800">{inf.correctedEndDisplay.toFixed(2)} {unit}</span></p>
                                    <p className="text-sm">Queda: <span className="font-semibold text-red-500">{inf.dropDisplay.toFixed(2)} {unit} ({inf.percent.toFixed(2)}%)</span></p>
                                    <p className={`text-sm font-bold mt-1.5 flex items-center gap-1 ${inf.passes ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {inf.passes ? '✓ APROVADO' : '✗ REPROVADO'}
                                    </p>
                                    {inf.percent > 5 && (
                                      <p className="text-[10px] text-red-650 font-bold bg-rose-50 p-1.5 rounded-lg border border-rose-100 mt-1.5 flex items-center gap-1">
                                        ⚠️ Queda de pressão excedeu o limite regulamentar de 5%!
                                      </p>
                                    )}
                                  </div>
                                ) : <p className="text-xs text-slate-400 mt-1">A aguardar pressões...</p>}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
