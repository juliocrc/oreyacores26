"use client";

import React from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, XCircle } from "lucide-react";
import { contarPorEstado } from "@/lib/calibracoes";
import type { CalibracaoRegisto } from "@/lib/calibracoes";

type Props = {
  registos: CalibracaoRegisto[];
  rotuloTotal: string;
};

export function CalibracaoResumo({ registos, rotuloTotal }: Props) {
  const { validos, aVencer, vencidos } = contarPorEstado(registos);

  const linhas = [
    {
      key: "validos",
      label: "Válidos",
      valor: validos.length,
      icon: CheckCircle2,
      corIcone: "text-emerald-600",
      corValor: "text-emerald-700",
    },
    {
      key: "avencer",
      label: "A Vencer (30d)",
      valor: aVencer.length,
      icon: AlertTriangle,
      corIcone: "text-orange-500",
      corValor: "text-orange-600",
    },
    {
      key: "vencidos",
      label: "Vencidos",
      valor: vencidos.length,
      icon: XCircle,
      corIcone: "text-red-600",
      corValor: "text-red-600",
    },
    {
      key: "total",
      label: rotuloTotal,
      valor: registos.length,
      icon: CalendarClock,
      corIcone: "text-sky-600",
      corValor: "text-sky-700",
    },
  ];

  return (
    <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 shadow-sm">
      {linhas.map(({ key, label, valor, icon: Icon, corIcone, corValor }) => (
        <div key={key} className="flex items-center gap-3">
          <Icon className={`w-8 h-8 shrink-0 ${corIcone}`} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{label}</p>
            <p className={`text-xl font-black ${corValor}`}>{valor}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
