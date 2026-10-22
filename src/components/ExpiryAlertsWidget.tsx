"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, ShieldCheck, Calendar, ArrowRight } from "lucide-react";

export default function ExpiryAlertsWidget() {
  const [dgrmExpiry, setDgrmExpiry] = useState("2027-02-12");
  const [survitecExpiry, setSurvitecExpiry] = useState("2028-11-15");

  useEffect(() => {
    try {
      const dgrmSaved = localStorage.getItem("orey_dgrm_audit_v2");
      if (dgrmSaved) {
        const parsed = JSON.parse(dgrmSaved);
        if (parsed.expiryDate) setDgrmExpiry(parsed.expiryDate);
      }
      const survSaved = localStorage.getItem("orey_survitec_audit_v1");
      if (survSaved) {
        const parsed = JSON.parse(survSaved);
        if (parsed.expiryDate) setSurvitecExpiry(parsed.expiryDate);
      }
    } catch {
      // ignore
    }
  }, []);

  const calculateDaysLeft = (dateStr: string) => {
    const target = new Date(dateStr);
    const today = new Date();
    const diffTime = target.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const dgrmDays = calculateDaysLeft(dgrmExpiry);
  const survitecDays = calculateDaysLeft(survitecExpiry);

  const getAlertBadge = (days: number) => {
    if (days <= 0) return { bg: "bg-red-500/20 text-red-700 border-red-500/30 dark:text-red-300", label: "EXPIRADO" };
    if (days <= 30) return { bg: "bg-red-500/20 text-red-700 border-red-500/30 dark:text-red-300", label: `Expira em ${days} dias (<30d)` };
    if (days <= 60) return { bg: "bg-orange-500/20 text-orange-700 border-orange-500/30 dark:text-orange-300", label: `Expira em ${days} dias (<60d)` };
    if (days <= 90) return { bg: "bg-yellow-500/20 text-yellow-800 border-yellow-500/30 dark:text-yellow-300", label: `Expira em ${days} dias (<90d)` };
    return { bg: "bg-emerald-500/20 text-emerald-700 border-emerald-500/30 dark:text-emerald-300", label: `Válido (${days} dias)` };
  };

  const dgrmBadge = getAlertBadge(dgrmDays);
  const survBadge = getAlertBadge(survitecDays);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-600 dark:text-cyan-400">
            <Calendar className="h-5 w-5" />
          </span>
          <h2 className="text-base font-black text-slate-900 dark:text-slate-50">
            Alertas de Caducidade de Certificados (DGRM & Survitec)
          </h2>
        </div>
        <span className="text-xs font-bold text-slate-500">Monitorização em Tempo Real</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* DGRM Alert Card */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-cyan-500/40 dark:border-slate-800 dark:bg-slate-800/50">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Vistoria DGRM (Estação 50937)
              </span>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-black ${dgrmBadge.bg}`}>
                {dgrmBadge.label}
              </span>
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Validade: {dgrmExpiry}</p>
            <p className="mt-1 text-xs text-slate-500">Próxima vistoria oficial obrigatória pela Direção de Serviços de Pesca.</p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-end">
            <Link
              href="/dgrm"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-600 hover:text-cyan-500 dark:text-cyan-400"
            >
              Gerir Vistoria DGRM <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Survitec Alert Card */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-cyan-500/40 dark:border-slate-800 dark:bg-slate-800/50">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Auditoria Trianual Survitec
              </span>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-black ${survBadge.bg}`}>
                {survBadge.label}
              </span>
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Validade: {survitecExpiry}</p>
            <p className="mt-1 text-xs text-slate-500">Ciclo trienal de homologação de representação de marcas oficiais.</p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-end">
            <Link
              href="/survitec-auditoria"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-600 hover:text-cyan-500 dark:text-cyan-400"
            >
              Gerir Auditoria Survitec <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
