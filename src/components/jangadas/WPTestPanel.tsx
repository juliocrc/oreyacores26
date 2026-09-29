"use client";
import React, { useMemo } from "react";
import {
  Gauge,
  Thermometer,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Activity,
} from "lucide-react";
import { getTestRecommendations, type TestRecommendation } from "@/modules/rafts/testRules";
import type { JangadaFormData } from "@/app/jangadas/[id]/JangadaDetailPageClient";

type WPTestPanelProps = {
  jangada: JangadaFormData;
  compact?: boolean;
};

type WPCalculation = {
  tempDelta: number;
  baroDelta: number;
  correctionTempMb: number;
  correctionBaroMb: number;
  totalCorrectionMb: number;
  tempValid: boolean;
  supAnalysis: ChamberAnalysis | null;
  infAnalysis: ChamberAnalysis | null;
};

type ChamberAnalysis = {
  startRaw: number;
  endRaw: number;
  startMb: number;
  endMb: number;
  correctedEndMb: number;
  dropMb: number;
  percent: number;
  passes: boolean;
};

function fmt(v: unknown, suffix = "") {
  const s = String(v ?? "").trim();
  return s && s !== "undefined" && s !== "null" ? `${s}${suffix}` : "—";
}

function parseNumber(v: unknown): number {
  const val = parseFloat(String(v || "").replace(",", "."));
  return isNaN(val) ? NaN : val;
}

function toMbar(val: number, unit: string): number {
  if (isNaN(val)) return NaN;
  if (unit === "inhg") return val * 33.8638866667;
  if (unit === "inh2o") return val * 2.490889;
  return val;
}

function fromMbar(val: number, unit: string): number {
  if (isNaN(val)) return NaN;
  if (unit === "inhg") return val / 33.8638866667;
  if (unit === "inh2o") return val / 2.490889;
  return val;
}

export default function WPTestPanel({ jangada, compact = false }: WPTestPanelProps) {
  const recommendations = useMemo(() => getTestRecommendations({
    brand: jangada.brand,
    model: jangada.model,
    launchType: jangada.launchType,
    dataFabrico: jangada.dataFabrico,
    inspectionDate: jangada.dataInspecao || new Date().toISOString(),
  }), [jangada.brand, jangada.model, jangada.launchType, jangada.dataFabrico, jangada.dataInspecao]);

  const wpRec = recommendations.find(r => r.testId === "testeWP");
  const napRec = recommendations.find(r => r.testId === "testeNAP");
  const giRec = recommendations.find(r => r.testId === "testeGI");
  const fsRec = recommendations.find(r => r.testId === "testeFS");
  const dlRec = recommendations.find(r => r.testId === "testeDL");

  const wpStatus = jangada.testeWP || "N/D";
  const napStatus = jangada.testeNAP || "N/D";
  const giStatus = jangada.testeGI || "N/D";
  const fsStatus = jangada.testeFS || "N/D";
  const dlStatus = jangada.testeDL || "N/D";

  const unit = jangada.testeWPUnidadePressao || "hpa";

  const wpCalc = useMemo<WPCalculation | null>(() => {
    const tIn = parseNumber(jangada.testeWPTemperaturaInicial);
    const tOut = parseNumber(jangada.testeWPTemperaturaFinal);
    const pAtmIn = parseNumber(jangada.testeWPPressaoAtmosfericaInicial);
    const pAtmOut = parseNumber(jangada.testeWPPressaoAtmosfericaFinal);
    
    const supIn = parseNumber(jangada.testeWPCamaraSuperiorInicio);
    const supOut = parseNumber(jangada.testeWPCamaraSuperiorFim);
    const infIn = parseNumber(jangada.testeWPCamaraInferiorInicio);
    const infOut = parseNumber(jangada.testeWPCamaraInferiorFim);

    if (isNaN(tIn) || isNaN(tOut) || isNaN(pAtmIn) || isNaN(pAtmOut)) {
      return null;
    }

    const tempDelta = tOut - tIn;
    const baroDelta = pAtmOut - pAtmIn;
    const correctionTempMb = -(tempDelta * 4);
    const correctionBaroMb = baroDelta;
    const totalCorrectionMb = correctionTempMb + correctionBaroMb;
    const tempValid = Math.abs(tempDelta) <= 3.5;

    const analyzeChamber = (startRaw: number, endRaw: number): ChamberAnalysis | null => {
      if (isNaN(startRaw) || isNaN(endRaw)) return null;
      const startMb = toMbar(startRaw, unit);
      const endMb = toMbar(endRaw, unit);

      const correctedEndMb = endMb + totalCorrectionMb;
      const dropMbRaw = startMb - correctedEndMb;
      const dropMb = Math.max(0, dropMbRaw);
      const percent = startMb > 0 ? (dropMb / startMb) * 100 : 0;
      const passes = percent <= 5 && tempValid;
      
      return { 
        startRaw, endRaw, startMb, endMb,
        correctedEndMb: fromMbar(correctedEndMb, unit), 
        dropMb: fromMbar(dropMb, unit), 
        percent, 
        passes 
      };
    };

    return {
      tempDelta, baroDelta,
      correctionTempMb: fromMbar(correctionTempMb, unit),
      correctionBaroMb: fromMbar(correctionBaroMb, unit),
      totalCorrectionMb: fromMbar(totalCorrectionMb, unit),
      tempValid,
      supAnalysis: analyzeChamber(supIn, supOut),
      infAnalysis: analyzeChamber(infIn, infOut),
    };
  }, [jangada, unit]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PASSOU": return "text-emerald-600 bg-emerald-50 border-emerald-200";
      case "REPROVOU": return "text-rose-600 bg-rose-50 border-rose-200";
      default: return "text-slate-500 bg-slate-50 border-slate-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "PASSOU": return <CheckCircle2 size={14} className="text-emerald-500" />;
      case "REPROVOU": return <XCircle size={14} className="text-rose-500" />;
      default: return <Info size={14} className="text-slate-400" />;
    }
  };

  const getTestBadge = (rec: TestRecommendation | undefined, status: string) => {
    if (!rec) return null;
    const isRequired = rec.status === "required";
    const isOverdue = rec.status === "overdue";
    
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
        isOverdue ? "bg-red-50 border-red-200" :
        isRequired ? "bg-amber-50 border-amber-200" :
        "bg-slate-50 border-slate-200"
      }`}>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          status === "PASSOU" ? "bg-emerald-100" :
          status === "REPROVOU" ? "bg-rose-100" :
          "bg-slate-100"
        }`}>
          {getStatusIcon(status)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-700">{rec.shortLabel}</span>
            {isRequired && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                OBRIGATÓRIO
              </span>
            )}
            {isOverdue && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                ATRASADO
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 truncate">{rec.label}</p>
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${getStatusColor(status)}`}>
          {status}
        </span>
      </div>
    );
  };

  if (compact) {
    return (
      <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 bg-blue-100 rounded-lg">
            <Gauge size={14} className="text-blue-600" />
          </div>
          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Testes WP</h4>
          {wpRec?.ageYears !== null && wpRec?.ageYears !== undefined && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
              {wpRec.ageYears} anos
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {getTestBadge(wpRec, wpStatus)}
          {getTestBadge(napRec, napStatus)}
          {getTestBadge(giRec, giStatus)}
          {getTestBadge(fsRec, fsStatus)}
          {dlRec && dlRec.status !== "not-required" && getTestBadge(dlRec, dlStatus)}
        </div>

        {wpCalc && (
          <div className="mt-3 p-3 bg-white rounded-xl border border-slate-100">
            <div className="flex items-center gap-1.5 mb-2">
              <Activity size={12} className="text-indigo-500" />
              <span className="text-[10px] font-bold text-slate-600 uppercase">Cálculos WP</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Corr. Térmica:</span>
                <span className="font-bold text-slate-700">{wpCalc.correctionTempMb.toFixed(2)} {unit}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Corr. Barométrica:</span>
                <span className="font-bold text-slate-700">{wpCalc.correctionBaroMb.toFixed(2)} {unit}</span>
              </div>
              {wpCalc.supAnalysis && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Queda Sup.:</span>
                  <span className={`font-bold ${wpCalc.supAnalysis.passes ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {wpCalc.supAnalysis.percent.toFixed(2)}%
                  </span>
                </div>
              )}
              {wpCalc.infAnalysis && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Queda Inf.:</span>
                  <span className={`font-bold ${wpCalc.infAnalysis.passes ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {wpCalc.infAnalysis.percent.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 border border-slate-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-100 rounded-xl">
            <Gauge size={18} className="text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Testes Operacionais</h3>
            <p className="text-[11px] text-slate-500">
              {wpRec?.ageYears !== null && wpRec?.ageYears !== undefined
                ? `Jangada com ${wpRec.ageYears} ano(s) — regras SOLAS/ISO`
                : "Idade desconhecida"}
            </p>
          </div>
        </div>
        {wpRec?.nextGiYear && (
          <div className="text-right">
            <p className="text-[10px] text-slate-500">Próx. GI</p>
            <p className="text-sm font-black text-indigo-600">{wpRec.nextGiYear}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {getTestBadge(wpRec, wpStatus)}
        {getTestBadge(napRec, napStatus)}
        {getTestBadge(giRec, giStatus)}
        {getTestBadge(fsRec, fsStatus)}
        {dlRec && dlRec.status !== "not-required" && getTestBadge(dlRec, dlStatus)}
      </div>

      {wpCalc && (
        <div className="mt-4 p-4 bg-white rounded-xl border border-slate-200 space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={14} className="text-indigo-500" />
            <h4 className="text-xs font-bold text-slate-700 uppercase">Parâmetros do Teste WP</h4>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-2 bg-slate-50 rounded-lg">
              <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Temp. Delta</p>
              <p className={`text-sm font-bold ${Math.abs(wpCalc.tempDelta) <= 3.5 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {wpCalc.tempDelta >= 0 ? '+' : ''}{wpCalc.tempDelta.toFixed(1)} °C
              </p>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Baro. Delta</p>
              <p className="text-sm font-bold text-slate-700">
                {wpCalc.baroDelta >= 0 ? '+' : ''}{wpCalc.baroDelta.toFixed(1)} hPa
              </p>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Corr. Total</p>
              <p className="text-sm font-bold text-indigo-600">
                {wpCalc.totalCorrectionMb >= 0 ? '+' : ''}{wpCalc.totalCorrectionMb.toFixed(2)} {unit}
              </p>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Validade Temp.</p>
              <p className={`text-sm font-bold ${wpCalc.tempValid ? 'text-emerald-600' : 'text-rose-600'}`}>
                {wpCalc.tempValid ? 'VÁLIDA' : 'INVÁLIDA'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {wpCalc.supAnalysis && (
              <div className={`p-3 rounded-xl border ${
                wpCalc.supAnalysis.passes ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700">Câmara Superior</span>
                  {wpCalc.supAnalysis.passes ? (
                    <CheckCircle2 size={16} className="text-emerald-500" />
                  ) : (
                    <XCircle size={16} className="text-rose-500" />
                  )}
                </div>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Início:</span>
                    <span className="font-bold text-slate-700">{wpCalc.supAnalysis.startMb.toFixed(2)} {unit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Fim Corrigido:</span>
                    <span className="font-bold text-slate-700">{wpCalc.supAnalysis.correctedEndMb.toFixed(2)} {unit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Queda:</span>
                    <span className={`font-bold ${wpCalc.supAnalysis.passes ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {wpCalc.supAnalysis.dropMb.toFixed(2)} {unit} ({wpCalc.supAnalysis.percent.toFixed(2)}%)
                    </span>
                  </div>
                </div>
                {wpCalc.supAnalysis.percent > 5 && (
                  <div className="mt-2 p-2 bg-rose-100 rounded-lg border border-rose-200">
                    <p className="text-[10px] font-bold text-rose-700 flex items-center gap-1">
                      <AlertTriangle size={12} />
                      Queda excede 5% (limite regulamentar)
                    </p>
                  </div>
                )}
              </div>
            )}

            {wpCalc.infAnalysis && (
              <div className={`p-3 rounded-xl border ${
                wpCalc.infAnalysis.passes ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700">Câmara Inferior</span>
                  {wpCalc.infAnalysis.passes ? (
                    <CheckCircle2 size={16} className="text-emerald-500" />
                  ) : (
                    <XCircle size={16} className="text-rose-500" />
                  )}
                </div>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Início:</span>
                    <span className="font-bold text-slate-700">{wpCalc.infAnalysis.startMb.toFixed(2)} {unit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Fim Corrigido:</span>
                    <span className="font-bold text-slate-700">{wpCalc.infAnalysis.correctedEndMb.toFixed(2)} {unit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Queda:</span>
                    <span className={`font-bold ${wpCalc.infAnalysis.passes ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {wpCalc.infAnalysis.dropMb.toFixed(2)} {unit} ({wpCalc.infAnalysis.percent.toFixed(2)}%)
                    </span>
                  </div>
                </div>
                {wpCalc.infAnalysis.percent > 5 && (
                  <div className="mt-2 p-2 bg-rose-100 rounded-lg border border-rose-200">
                    <p className="text-[10px] font-bold text-rose-700 flex items-center gap-1">
                      <AlertTriangle size={12} />
                      Queda excede 5% (limite regulamentar)
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
            <div className="flex items-center gap-1.5 mb-2">
              <Thermometer size={12} className="text-indigo-500" />
              <span className="text-[10px] font-bold text-indigo-700 uppercase">Parâmetros de Medição</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Hora Início:</span>
                <span className="font-bold text-slate-700">{fmt(jangada.testeWPHoraInicio)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Hora Fim:</span>
                <span className="font-bold text-slate-700">{fmt(jangada.testeWPHoraFim)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Temp. Ambiente:</span>
                <span className="font-bold text-slate-700">
                  {fmt(jangada.testeWPTemperaturaInicial)} → {fmt(jangada.testeWPTemperaturaFinal)} °C
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pressão Atm.:</span>
                <span className="font-bold text-slate-700">
                  {fmt(jangada.testeWPPressaoAtmosfericaInicial)} → {fmt(jangada.testeWPPressaoAtmosfericaFinal)} hPa
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
