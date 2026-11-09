"use client";

import { useEffect, useRef, useState } from "react";
import { testPercentages, type BrandRaftStatistics } from "@/lib/estatisticas";
import {
  BarChart3,
  LifeBuoy,
  Ship,
  TrendingUp,
  Wrench,
  Building2,
  AlertCircle,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

type EstatisticasPayload = {
  kpis: {
    totalInspecoes: number;
    concluidas: number;
    rascunhos: number;
    condenadas: number;
    outros: number;
    totalJangadas: number;
    totalNavios: number;
    totalStock: number;
    totalOrdens: number;
  };
  tests: {
    wp: { pass: number; fail: number; na: number };
    nap: { pass: number; fail: number; na: number };
    fs: { pass: number; fail: number; na: number };
    gi: { pass: number; fail: number; na: number };
    dl: { pass: number; fail: number; na: number };
  };
  brandBreakdown: BrandRaftStatistics[];
  monthlyTrend: { month: string; count: number }[];
  stations: { id: number; nome: string; codigo: string | null }[];
  selectedStationId: number | null;
};

export default function EstatisticasPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<EstatisticasPayload | null>(null);
  const [selectedStation, setSelectedStation] = useState<string>("");
  const activeRequest = useRef<AbortController | null>(null);

  const loadStats = async (stationId?: string) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const url = stationId !== undefined ? `/api/estatisticas?stationId=${encodeURIComponent(stationId)}` : "/api/estatisticas";
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      const json = await res.json();
      if (controller.signal.aborted) return;
      if (!res.ok) throw new Error("Falha ao carregar estatísticas.");
      setData(json);
      setSelectedStation(json.selectedStationId == null ? "" : String(json.selectedStationId));
    } catch {
      if (!controller.signal.aborted) setError("Falha ao carregar estatísticas. Tente novamente.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    void loadStats();
    return () => activeRequest.current?.abort();
  }, []);

  const handleStationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedStation(val);
    void loadStats(val);
  };

  if (loading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
          <span className="font-medium">A carregar estatísticas e indicadores...</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-red-600" />
            <h2 className="text-lg font-bold">Erro ao carregar dashboard</h2>
          </div>
          <p className="mt-2 text-sm">{error}</p>
          <button
            type="button"
            onClick={() => void loadStats(selectedStation)}
            className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const kpis = data?.kpis || {
    totalInspecoes: 0,
    concluidas: 0,
    rascunhos: 0,
    condenadas: 0,
    outros: 0,
    totalJangadas: 0,
    totalNavios: 0,
    totalStock: 0,
    totalOrdens: 0,
  };

  const tests = data?.tests || {
    wp: { pass: 0, fail: 0, na: 0 },
    nap: { pass: 0, fail: 0, na: 0 },
    fs: { pass: 0, fail: 0, na: 0 },
    gi: { pass: 0, fail: 0, na: 0 },
    dl: { pass: 0, fail: 0, na: 0 },
  };

  const maxMonthly = Math.max(...(data?.monthlyTrend?.map((m) => m.count) || [1]), 1);

  return (
    <div className="space-y-8 p-6 lg:p-10 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
              <BarChart3 className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Dashboard de Estatísticas & Indicadores</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">Métricas de vistorias, testes técnicos, parque de jangadas e stock em tempo real.</p>
        </div>
        <div className="flex items-center gap-3">
          {data?.stations && data.stations.length > 0 && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-400" />
              <select
                aria-label="Filtrar por estação de serviço"
                value={selectedStation}
                onChange={handleStationChange}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Todas as Estações Permitidas</option>
                {data.stations.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.codigo ? `[${s.codigo}] ` : ""}{s.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={() => void loadStats(selectedStation)}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total de Vistorias</p>
              <h3 className="text-3xl font-black text-slate-900 mt-1">{kpis.totalInspecoes}</h3>
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <LifeBuoy className="h-6 w-6" />
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium">
            <span className="text-emerald-700 font-bold">{kpis.concluidas} concluídas</span>
            <span>•</span>
            <span className="text-amber-700 font-bold">{kpis.rascunhos} rascunhos</span>
            <span>{kpis.condenadas} condenadas / {kpis.outros} outros estados</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-sky-500" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Jangadas no Parque</p>
              <h3 className="text-3xl font-black text-slate-900 mt-1">{kpis.totalJangadas}</h3>
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <ShieldCheck className="h-6 w-6" />
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-500 font-medium">
            Ativas e registadas nas estações de serviço
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Embarcações (Navios)</p>
              <h3 className="text-3xl font-black text-slate-900 mt-1">{kpis.totalNavios}</h3>
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Ship className="h-6 w-6" />
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-500 font-medium">
            Frota associada à operação
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Ordens de Serviço</p>
              <h3 className="text-3xl font-black text-slate-900 mt-1">{kpis.totalOrdens}</h3>
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Wrench className="h-6 w-6" />
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-500 font-medium">
            {kpis.totalStock} artigos em stock registados
          </div>
        </div>
      </div>

      {/* Monthly Trend Chart */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-bold text-slate-900">Evolução Mensal de Vistorias</h2>
            <p className="text-xs text-slate-500">Volume de vistorias registadas nos últimos 12 meses</p>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl">
            <TrendingUp className="h-3.5 w-3.5" />
            Atividade Recente
          </span>
        </div>

        {data?.monthlyTrend && data.monthlyTrend.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-end gap-3 h-56 pt-6 pb-2 px-2 border-b border-slate-100">
              {data.monthlyTrend.map((m) => {
                const heightPercent = m.count === 0 ? 0 : Math.max(Math.round((m.count / maxMonthly) * 100), 8);
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group relative">
                    {/* Tooltip */}
                    <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] font-bold py-1 px-2 rounded-lg pointer-events-none whitespace-nowrap shadow-md z-10">
                      {m.month}: {m.count} vistorias
                    </div>
                    <span className="text-[10px] font-bold text-slate-600">{m.count}</span>
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className="w-full max-w-[44px] rounded-t-xl bg-indigo-600 transition-all duration-300 group-hover:bg-indigo-700 shadow-sm"
                    />
                    <span className="text-[10px] font-semibold text-slate-500 truncate w-full text-center mt-1">
                      {m.month}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-slate-500">Sem dados mensais disponíveis no período.</div>
        )}
      </div>

      {/* Grid: Test Results & Top Brands/Models */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Test Results Summary */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-1">Resultados de Testes Técnicos</h2>
          <p className="text-xs text-slate-500 mb-6">Taxa de aprovação nos testes de pressão e segurança</p>

          <div className="space-y-4">
            {(
              [
                { label: "Teste de Pressão (WP)", key: "wp" },
                { label: "Teste de Pressão de Ar (NAP)", key: "nap" },
                { label: "Teste de Piso/Chão (FS)", key: "fs" },
                { label: "Teste de Gás Inerte (GI)", key: "gi" },
                { label: "Teste de Lançamento (DL)", key: "dl" },
              ] as const
            ).map((t) => {
              const stats = tests[t.key];
              const { total, passPct, failPct } = testPercentages(stats);

              return (
                <div key={t.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span>{t.label}</span>
                    <span className="text-slate-500">
                      {stats.pass} aprovados / {stats.fail} reprovados ({total} avaliados; {stats.na} N/A ou sem resultado)
                    </span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex shadow-inner">
                    <div
                      style={{ width: `${passPct}%` }}
                      className="bg-emerald-500 transition-all duration-300"
                      title={`${passPct}% Aprovados`}
                    />
                    <div
                      style={{ width: `${failPct}%` }}
                      className="bg-red-500 transition-all duration-300"
                      title={`${failPct}% Reprovados`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Brands & Models */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 mb-1">Marcas e Modelos Principais</h2>
          <p className="text-xs text-slate-500 mb-6">Todas as marcas nas estações selecionadas. Abra uma marca para consultar modelos e lotações registados.</p>

          {data?.brandBreakdown && data.brandBreakdown.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500">{data.brandBreakdown.length} marcas / {kpis.totalJangadas} jangadas</p>
              {data.brandBreakdown.map((b) => (
                <details key={b.brand} className="rounded-xl border border-slate-100 bg-slate-50">
                  <summary className="cursor-pointer rounded-xl p-3 text-xs font-bold text-slate-800 focus-visible:outline-indigo-600">
                    <span className="inline-flex w-[calc(100%-1.5rem)] items-center justify-between gap-2 align-middle">
                      <span className="break-words min-w-0">{b.brand}</span>
                      <span className="shrink-0 text-xs font-extrabold text-indigo-700 bg-indigo-100 px-2.5 py-1 rounded-lg">{b.count} jangadas</span>
                    </span>
                  </summary>
                  <div className="overflow-x-auto px-3 pb-3">
                    <table className="w-full text-left text-xs">
                      <caption className="sr-only">Modelos e lotações de {b.brand}</caption>
                      <thead className="text-slate-500"><tr>
                        <th scope="col" className="py-2 pr-3">Modelo</th>
                        <th scope="col" className="py-2 pr-3">Lotação</th>
                        <th scope="col" className="py-2 text-right">Jangadas</th>
                      </tr></thead>
                      <tbody className="text-slate-700">
                        {b.models.map(row => (
                          <tr key={JSON.stringify([row.model, row.capacity])} className="border-t border-slate-200">
                            <th scope="row" className="py-2 pr-3 font-semibold break-words">{row.model}</th>
                            <td className="py-2 pr-3">{row.capacity === null ? "Lotação desconhecida" : `${row.capacity} pessoas`}</td>
                            <td className="py-2 text-right font-bold tabular-nums">{row.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-slate-500">Sem dados de marcas registadas.</div>
          )}
        </div>
      </div>
    </div>
  );
}
