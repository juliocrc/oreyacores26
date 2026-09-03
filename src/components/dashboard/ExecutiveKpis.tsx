"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Banknote,
  TrendingUp,
  Wallet,
  ClipboardList,
  CheckCircle2,
  CalendarClock,
  AlertTriangle,
  Package,
  Users,
  Anchor,
  Loader2,
} from "lucide-react";

type ExecutiveKpis = {
  faturacaoMes: number;
  faturacaoAno: number;
  aReceber: number;
  faturasPorCobrar: number;
  osAbertas: number;
  osConcluidasMes: number;
  osValorMes: number;
  osMaoObraMes: number;
  osPecasMes: number;
  margemBrutaMes: number;
  jangadasExpirar30: number;
  jangadasExpirar60: number;
  stockCriticoCount: number;
  totalClientes: number;
  totalJangadas: number;
};

const currency = (v: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v || 0);

export default function ExecutiveKpis() {
  const [data, setData] = useState<ExecutiveKpis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/dashboard/executive")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active && d) setData(d); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm flex items-center justify-center gap-2 text-slate-500 font-semibold">
        <Loader2 className="animate-spin text-blue-600" size={20} /> A carregar KPIs executivos...
      </div>
    );
  }
  if (!data) return null;

  const cards: Array<{
    label: string;
    value: string;
    sub?: string;
    icon: any;
    color: string;
    href?: string;
  }> = [
    {
      label: "Faturação Este Mês",
      value: currency(data.faturacaoMes),
      icon: Banknote,
      color: "from-blue-600 to-indigo-600",
      href: "/faturacao",
    },
    {
      label: "Faturação no Ano",
      value: currency(data.faturacaoAno),
      icon: TrendingUp,
      color: "from-emerald-600 to-teal-600",
      href: "/faturacao",
    },
    {
      label: "Por Cobrar (em aberto)",
      value: currency(data.aReceber),
      sub: `${data.faturasPorCobrar} fatura(s) pendente(s)`,
      icon: Wallet,
      color: "from-amber-500 to-orange-500",
      href: "/contas-receber",
    },
    {
      label: "Ordens de Serviço Abertas",
      value: String(data.osAbertas),
      icon: ClipboardList,
      color: "from-purple-600 to-fuchsia-600",
      href: "/ordens-servico",
    },
    {
      label: "OS Concluídas no Mês",
      value: String(data.osConcluidasMes),
      sub: currency(data.osValorMes),
      icon: CheckCircle2,
      color: "from-cyan-600 to-sky-600",
      href: "/ordens-servico",
    },
    {
      label: "Jangadas a Expirar (30d)",
      value: String(data.jangadasExpirar30),
      sub: `+${data.jangadasExpirar60} em 60d`,
      icon: CalendarClock,
      color: "from-rose-500 to-red-500",
      href: "/relatorio-validades",
    },
    {
      label: "Stock Crítico",
      value: String(data.stockCriticoCount),
      icon: Package,
      color: "from-orange-500 to-amber-500",
      href: "/stock",
    },
    {
      label: "Clientes",
      value: String(data.totalClientes),
      sub: `${data.totalJangadas} jangadas`,
      icon: Users,
      color: "from-slate-600 to-slate-800",
      href: "/clientes",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <TrendingUp className="text-blue-600" size={20} /> KPIs Executivos
        </h2>
        <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 font-bold rounded-full border border-blue-200">ADMIN</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, idx) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
          >
            <Link href={c.href || "#"} className="block group h-full">
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all h-full">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br ${c.color}`}>
                    <c.icon size={20} className="text-white" />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-800 truncate" title={c.value}>
                  {c.value}
                </div>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">{c.label}</p>
                {c.sub && (
                  <p className="text-[11px] text-slate-400 font-medium mt-1 truncate">{c.sub}</p>
                )}
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {data.stockCriticoCount > 0 && (
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <AlertTriangle size={16} />
          {data.stockCriticoCount} artigos em stock crítico — verifique as necessidades de reposição.
        </div>
      )}
    </div>
  );
}
