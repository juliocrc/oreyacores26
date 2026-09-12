"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { getTestRecommendations, type TestRecommendation } from '@/modules/rafts/testRules';
import { getDlLoadReference } from '@/modules/rafts/dlLoadReference';
import { Activity, Gauge, ArrowDownToLine, Droplet, Clock, Timer, Play, Pause, RotateCcw, AlertTriangle, Info, CheckCircle2, XCircle, HelpCircle, ShieldAlert } from 'lucide-react';

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
  const { inspectionData, setInspectionData } = useJangadaWizardStore();
  const testes = inspectionData.testes || {};
  const [equipments, setEquipments] = useState<any[]>([]);

  const [timerSec, setTimerSec] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => setTimerSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

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
    setTimerRunning(true);
    if (!testes.wpHoraInicio) handleTestChange('wpHoraInicio', nowHHMM());
  };

  const handleStopTimer = () => {
    setTimerRunning(false);
    if (timerSec > 0) handleTestChange('wpHoraFim', nowHHMM());
  };

  const handleResetTimer = () => {
    setTimerRunning(false);
    setTimerSec(0);
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
    if (!sensor) return null;
    const expDate = new Date(sensor.dataProxCalibracao);
    const insDate = inspectionData.date ? new Date(inspectionData.date) : new Date();
    if (isNaN(expDate.getTime())) return null;
    if (insDate > expDate) {
      return `O equipamento "${sensor.nome}" [Ref: ${sensor.referencia}] está com calibração expirada desde ${expDate.toLocaleDateString('pt-PT')}.`;
    }
    return null;
  };

  const handleTestChange = (testId: string, result: string) => {
    setInspectionData({
      testes: {
        ...testes,
        [testId]: result
      }
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">6. Testes Operacionais e de Pressão</h2>
        <p className="text-slate-600 mt-1">Registe os resultados dos testes estruturais realizados na jangada.</p>
      </div>

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
                          value={testes.wpUnidadePressao === 'mbar' ? 'hpa' : (testes.wpUnidadePressao || 'hpa')}
                          onChange={(e) => handleTestChange('wpUnidadePressao', e.target.value)}
                          className="border-slate-200 rounded-xl px-2 py-1 text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-100"
                        >
                          <option value="hpa">hPa</option>
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

<div className="col-span-full bg-sky-50 rounded-xl p-4 border border-sky-300 flex flex-wrap items-center gap-x-4 gap-y-3 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-indigo-100 shrink-0">
                          <Timer size={20} className="text-indigo-700" />
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-600 font-bold">Cronómetro de Teste WP</p>
                          <p className="text-3xl font-black tabular-nums font-mono text-slate-900 leading-none mt-0.5">{formatTimer(timerSec)}</p>
                          {timerRunning && (
                            <p className="text-[10px] text-emerald-700 font-bold mt-1 flex items-center gap-1">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Teste em curso...
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-auto flex-wrap">
                        <button
                          type="button"
                          onClick={handleStartTimer}
                          disabled={timerRunning}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 transition"
                        >
                          <Play size={14} />
                          {testes.wpHoraInicio ? 'Retomar t.' : 'Iniciar Teste (Agora)'}
                        </button>
                        <button
                          type="button"
                          onClick={handleStopTimer}
                          disabled={!timerRunning && timerSec === 0}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 transition"
                        >
                          <Pause size={14} />
                          Terminar (Agora)
                        </button>
                        <button
                          type="button"
                          onClick={handleResetTimer}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition"
                        >
                          <RotateCcw size={14} />
                          Repor
                        </button>
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
                        onChange={(e) => {
                          const val = e.target.value;
                          handleTestChange('wpHoraInicio', val);
                          if (val) {
                            const [h, m] = val.split(':').map(Number);
                            if (!isNaN(h) && !isNaN(m)) {
                              const endH = (h + 1) % 24;
                              handleTestChange('wpHoraFim', `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                            }
                          }
                        }}
                        className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    <div className="space-y-1.5">
<label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between gap-2">
                        Hora Fim (Automático +60m)
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
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Temp. Inicial (ºC)</label>
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

                          const unit = testes.wpUnidadePressao === 'mbar' ? 'hpa' : (testes.wpUnidadePressao || 'hpa');

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

                {/* Bloco idêntico para NAP */}
                {rec.testId === 'testeNAP' && currentResult === 'PASSOU' && (
                  <div className="mt-6 ml-[3.25rem] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <div className="col-span-full mb-2 flex justify-between items-center">
                      <h5 className="text-sm font-bold text-slate-700">Parâmetros do Teste NAP</h5>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Unidade:</label>
                        <select 
                          value={testes.napUnidadePressao === 'mbar' ? 'hpa' : (testes.napUnidadePressao || 'hpa')}
                          onChange={(e) => handleTestChange('napUnidadePressao', e.target.value)}
                          className="border-slate-200 rounded-xl px-2 py-1 text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-100"
                        >
                          <option value="hpa">hPa</option>
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
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Hora Início</label>
                      <input 
                        type="time" 
                        value={testes.napHoraInicio || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          handleTestChange('napHoraInicio', val);
                          if (val) {
                            const [h, m] = val.split(':').map(Number);
                            if (!isNaN(h) && !isNaN(m)) {
                              const endH = (h + 1) % 24;
                              handleTestChange('napHoraFim', `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                            }
                          }
                        }}
                        className="w-full border-slate-200 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Hora Fim (Automático +60m)</label>
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
