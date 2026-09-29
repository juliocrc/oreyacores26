"use client";

import React from "react";
import { Activity, Clock, Award, Users, TrendingUp, CheckCircle } from "lucide-react";

export function OficinaAnalyticsPanel() {
  // Dados analíticos simulados baseados no volume de testes e bancada da estação de serviço
  const metrics = {
    avgWpMinutes: 24.5,
    avgNapMinutes: 18.2,
    avgFsMinutes: 12.0,
    avgGiMinutes: 15.6,
    totalCompletedThisMonth: 38,
    productivityScore: "94.2%",
    topTechnician: "Equipa Açores (T1)",
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Activity className="text-indigo-600" size={22} />
            Analytics de Oficina & Tempos de Bancada
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Métricas em tempo real de duração de testes e produtividade técnica</p>
        </div>
        <span className="px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-xs font-bold">
          Tempo Real
        </span>
      </div>

      {/* Grid de Métricas de Tempo por Fase */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Ensaio WP (Trabalho)</span>
            <Clock className="text-indigo-500" size={18} />
          </div>
          <div className="text-2xl font-black text-slate-800">{metrics.avgWpMinutes} min</div>
          <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <TrendingUp size={12} /> -4.2% vs mês ant.
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Ensaio NAP (Alívio)</span>
            <Clock className="text-sky-500" size={18} />
          </div>
          <div className="text-2xl font-black text-slate-800">{metrics.avgNapMinutes} min</div>
          <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <TrendingUp size={12} /> -2.1% vs mês ant.
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Ensaio FS (Chão)</span>
            <Clock className="text-amber-500" size={18} />
          </div>
          <div className="text-2xl font-black text-slate-800">{metrics.avgFsMinutes} min</div>
          <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <TrendingUp size={12} /> -5.0% vs mês ant.
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Ensaio GI (Gás/Inflar)</span>
            <Clock className="text-emerald-500" size={18} />
          </div>
          <div className="text-2xl font-black text-slate-800">{metrics.avgGiMinutes} min</div>
          <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <TrendingUp size={12} /> -3.5% vs mês ant.
          </p>
        </div>
      </div>

      {/* Produtividade & Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-sm space-y-1">
          <span className="text-xs text-indigo-200 font-semibold uppercase">Inspeções Concluídas (Mês)</span>
          <div className="text-3xl font-black">{metrics.totalCompletedThisMonth}</div>
          <p className="text-xs text-emerald-400 flex items-center gap-1 pt-1">
            <CheckCircle size={14} /> 100% conformidade DGRM
          </p>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-indigo-950 text-white rounded-2xl p-5 shadow-sm space-y-1">
          <span className="text-xs text-slate-300 font-semibold uppercase">Índice de Produtividade</span>
          <div className="text-3xl font-black text-sky-400">{metrics.productivityScore}</div>
          <p className="text-xs text-slate-300 pt-1">Eficiência operacional da bancada</p>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-sm space-y-1">
          <span className="text-xs text-slate-300 font-semibold uppercase">Equipa de Destaque</span>
          <div className="text-xl font-bold pt-1 flex items-center gap-2">
            <Award className="text-amber-400" size={20} />
            {metrics.topTechnician}
          </div>
          <p className="text-xs text-slate-400 pt-1">Maior volume de testes sem retalho</p>
        </div>
      </div>
    </div>
  );
}
