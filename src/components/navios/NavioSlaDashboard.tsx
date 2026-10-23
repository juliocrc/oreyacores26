"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ShieldAlert, CheckCircle2, Clock, Ship, AlertTriangle, Activity, BarChart3, ArrowRight } from "lucide-react";

type SlaSummary = {
  totalNavios: number;
  emSla: number;
  alertaSla: number;
  criticos: number;
  vistoriasPorto: number;
};

export default function NavioSlaDashboard() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SlaSummary>({
    totalNavios: 2447,
    emSla: 2190,
    alertaSla: 195,
    criticos: 62,
    vistoriasPorto: 18,
  });
  const [naviosCriticos, setNaviosCriticos] = useState([
    { nome: "Goraz Da Medida", matricula: "XDC7ED52C606", ilha: "São Miguel", prazo: "2026-10-25", estado: "CRÍTICO (SLA 3 dias)" },
    { nome: "Portas do Mar", matricula: "4582000100612", ilha: "São Miguel", prazo: "2026-10-28", estado: "ALERTA (SLA 6 dias)" },
    { nome: "Anjo da Noite", matricula: "5017330300304", ilha: "Terceira", prazo: "2026-11-02", estado: "EM SLA" },
    { nome: "Marinha PR-01", matricula: "ISN-AZ-09", ilha: "Ponta Delgada", prazo: "2026-11-10", estado: "EM SLA" },
  ]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("orey_navios_sla_data");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.summary) setSummary(parsed.summary);
        if (parsed.navios) setNaviosCriticos(parsed.navios);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500/30">
            <Ship className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-50">
              Dashboard de Eficiência dos Navios & Alertas de Contratos (SLA)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Monitorização de prazos contratuais de manutenção, frotas de contentores e Marinha nos portos dos Açores.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-black text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30">
            SLA Global: 89.5% Conforme
          </span>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Frotas</span>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-50">{summary.totalNavios}</p>
          <p className="mt-1 text-xs text-slate-500">Navios e embarcações</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Em SLA Conforme</span>
          <p className="mt-2 text-2xl font-black text-emerald-600">{summary.emSla}</p>
          <p className="mt-1 text-xs text-slate-500">Prazos regulares</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-600">Alerta SLA (&lt;30d)</span>
          <p className="mt-2 text-2xl font-black text-amber-600">{summary.alertaSla}</p>
          <p className="mt-1 text-xs text-slate-500">Atenção requerida</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
          <span className="text-xs font-bold uppercase tracking-wider text-red-600">Críticos / Vencidos</span>
          <p className="mt-2 text-2xl font-black text-red-600">{summary.criticos}</p>
          <p className="mt-1 text-xs text-slate-500">Ação imediata necessária</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Vistorias em Cais</span>
          <p className="mt-2 text-2xl font-black text-indigo-600">{summary.vistoriasPorto}</p>
          <p className="mt-1 text-xs text-slate-500">Agendadas nos portos</p>
        </div>
      </div>

      {/* Critical SLA Table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-black text-slate-900 dark:text-slate-50 mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Frotas Prioritárias com SLA Crítico em Curso
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3">Navio / Embarcação</th>
                <th className="px-4 py-3">Matrícula / Cfr</th>
                <th className="px-4 py-3">Ilha / Porto</th>
                <th className="px-4 py-3">Prazo SLA</th>
                <th className="px-4 py-3 text-right">Estado Contratual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {naviosCriticos.map((n, i) => (
                <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">{n.nome}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{n.matricula}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{n.ilha}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{n.prazo}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                      n.estado.includes("CRÍTICO") ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" :
                      n.estado.includes("ALERTA") ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" :
                      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    }`}>
                      {n.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
