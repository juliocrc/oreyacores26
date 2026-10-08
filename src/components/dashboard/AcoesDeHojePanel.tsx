"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  Wrench,
  AlertTriangle,
  ClipboardCheck,
  LifeBuoy,
  Loader2,
  CheckCircle2,
} from "lucide-react";

type AcoesData = {
  inspecoesHoje: number;
  expiring: number;
  certificados30: number;
  delayed: number;
  pedidosAssistencia: number;
};

type CardDef = {
  key: keyof AcoesData;
  label: string;
  value: string;
  icon: React.ReactNode;
  href: string;
  tone: "red" | "orange" | "indigo" | "green";
};

export default function AcoesDeHojePanel() {
  const [data, setData] = useState<AcoesData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([fetch("/api/stats"), fetch("/api/ordens-servico/kpis"), fetch("/api/alertas")])
      .then(async ([statsRes, kpisRes, alertasRes]) => {
        if (!alive) return;
        const stats = statsRes.ok ? await statsRes.json() : {};
        const kpis = kpisRes.ok ? await kpisRes.json() : {};
        const alertas = alertasRes.ok ? await alertasRes.json() : {};
        setData({
          inspecoesHoje: stats.inspecoesHoje ?? 0,
          expiring: stats.expiring ?? 0,
          certificados30: stats.certificadosAte30d ?? 0,
          delayed: kpis.delayed ?? 0,
          pedidosAssistencia: alertas.pedidosAssistencia ?? 0,
        });
      })
      .catch(() => {
        if (alive) setData(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const totalAcoes = data
    ? data.inspecoesHoje + data.expiring + data.certificados30 + data.delayed + data.pedidosAssistencia
    : 0;

  const cards: CardDef[] = [
    {
      key: "inspecoesHoje",
      label: "Inspeções hoje",
      value: String(data?.inspecoesHoje ?? 0),
      icon: <ClipboardCheck className="h-5 w-5" />,
      href: "/agenda",
      tone: "indigo",
    },
    {
      key: "expiring",
      label: "GI a expirar (≤90d)",
      value: String(data?.expiring ?? 0),
      icon: <CalendarClock className="h-5 w-5" />,
      href: "/jangadas?filtro=proximas",
      tone: "orange",
    },
    {
      key: "certificados30",
      label: "Certificados ≤30d",
      value: String(data?.certificados30 ?? 0),
      icon: <CalendarClock className="h-5 w-5" />,
      href: "/alertas",
      tone: "orange",
    },
    {
      key: "delayed",
      label: "Ordens em atraso",
      value: String(data?.delayed ?? 0),
      icon: <Wrench className="h-5 w-5" />,
      href: "/ordens-servico",
      tone: "red",
    },
    {
      key: "pedidosAssistencia",
      label: "Pedidos de assistência",
      value: String(data?.pedidosAssistencia ?? 0),
      icon: <LifeBuoy className="h-5 w-5" />,
      href: "/alertas",
      tone: "red",
    },
  ];

  const toneClasses: Record<CardDef["tone"], { chip: string; text: string }> = {
    indigo: { chip: "bg-indigo-50 text-indigo-700 border-indigo-100", text: "text-indigo-600" },
    orange: { chip: "bg-orange-50 text-orange-700 border-orange-100", text: "text-orange-600" },
    red: { chip: "bg-red-50 text-red-700 border-red-100", text: "text-red-600" },
    green: { chip: "bg-emerald-50 text-emerald-700 border-emerald-100", text: "text-emerald-600" },
  };

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-md">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            {loading ? (
              <Loader2 className="h-5 w-5 text-indigo-600 animate-spin" />
            ) : totalAcoes > 0 ? (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            )}
            Ações de hoje
          </h3>
          <p className="text-sm text-slate-500">
            Tudo o que precisa de atenção neste momento.
          </p>
        </div>
        {!loading && data && (
          <span className="rounded-xl bg-slate-100 border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">
            {totalAcoes} ação{totalAcoes === 1 ? "" : "ões"} por tratar
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-24 flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 animate-pulse">
          <p className="text-sm text-slate-500 font-semibold">A carregar ações...</p>
        </div>
      ) : !data ? (
        <div className="h-24 flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
          <p className="text-sm text-slate-500 font-semibold">Não foi possível carregar os dados.</p>
        </div>
      ) : totalAcoes === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4">
          <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-extrabold text-emerald-800">Nada de urgente para hoje.</p>
            <p className="text-xs text-emerald-700 font-medium">
              Sem inspeções agendadas, certificados a expirar ou ordens em atraso.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {cards.map((card) => {
            const value = data[card.key];
            if (!value) return null;
            const tone = toneClasses[card.tone];
            return (
              <Link
                key={card.key}
                href={card.href}
                className="group rounded-2xl border border-slate-200 bg-slate-50/50 p-4 hover:border-indigo-200 hover:bg-indigo-50/40 transition-all"
              >
                <div className={`w-fit rounded-xl border p-2 ${tone.chip}`}>{card.icon}</div>
                <p className={`mt-3 text-2xl font-black ${tone.text}`}>{card.value}</p>
                <p className="text-xs font-bold text-slate-500 group-hover:text-slate-700">{card.label}</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
