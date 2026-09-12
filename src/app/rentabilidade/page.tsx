"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

type GrupoRent = {
  key: string;
  label?: string | null;
  n: number;
  receita: number;
  maoObra: number;
  pecas: number;
  desconto: number;
  custoPecas: number;
  margem: number;
  margemPct: number;
};

type RentPayload = {
  agrupar: "tecnico" | "obra";
  de: string;
  ate: string;
  custoPecasPct: number;
  total: GrupoRent;
  grupos: GrupoRent[];
};

function defaultRange(): { de: string; ate: string } {
  const hoje = new Date();
  const ant = new Date();
  ant.setMonth(ant.getMonth() - 12);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { de: iso(ant), ate: iso(hoje) };
}

const fmtEUR = (v: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);

export default function RentabilidadePage() {
  const initial = useMemo(defaultRange, []);
  const [de, setDe] = useState(initial.de);
  const [ate, setAte] = useState(initial.ate);
  const [agrupar, setAgrupar] = useState<"tecnico" | "obra">("tecnico");
  const [data, setData] = useState<RentPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const fetchData = useCallback(async (d = de, a = ate, g: "tecnico" | "obra" = agrupar) => {
    setLoading(true);
    setErro(null);
    try {
      const params = new URLSearchParams({ de: d, ate: a, agrupar: g });
      const res = await fetch(`/api/stats/rentabilidade?${params.toString()}`);
      if (!res.ok) throw new Error("Falha ao carregar rentabilidade");
      setData((await res.json()) as RentPayload);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [de, ate, agrupar]);

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxReceita = data ? Math.max(...data.grupos.map((g) => g.receita), 0) : 0;

  const card = (label: string, value: number, cls: string, sub?: string) => (
    <div className={`rounded-2xl border p-4 shadow-sm ${cls}`}>
      <p className="text-xs font-black uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-black">{fmtEUR(value)}</p>
      {sub && <p className="mt-0.5 text-[11px] font-semibold opacity-80">{sub}</p>}
    </div>
  );

  return (
    <div className="p-6">
      <div className="max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h1 className="text-2xl font-bold">Rentabilidade</h1>
            <p className="text-sm text-slate-500">
              Receita e margem bruta estimada (custo de peças assumido a {Math.round((data?.custoPecasPct || 0.6) * 100)}%).
            </p>
          </div>
          <button
            className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-800"
            onClick={() => fetchData()}
          >
            Atualizar
          </button>
        </div>

        <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">De</label>
            <input
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="w-full rounded border px-3 py-1.5 bg-white text-sm outline-none focus:border-slate-400"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Até</label>
            <input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="w-full rounded border px-3 py-1.5 bg-white text-sm outline-none focus:border-slate-400"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Agrupar por</label>
            <select
              value={agrupar}
              onChange={(e) => setAgrupar(e.target.value as "tecnico" | "obra")}
              className="w-full rounded border px-3 py-1.5 bg-white text-sm outline-none focus:border-slate-400"
            >
              <option value="tecnico">Técnico responsável</option>
              <option value="obra">Ordem de serviço / obra</option>
            </select>
          </div>
        </div>

        {erro && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{erro}</div>
        )}

        {loading && !data ? (
          <div className="text-sm text-gray-500 animate-pulse">A calcular rentabilidade...</div>
        ) : data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {card("Receita total", data.total.receita, "border-slate-200 bg-white text-slate-900", `${data.total.n} ordens`)}
              {card("Mão de obra", data.total.maoObra, "border-sky-200 bg-sky-50 text-sky-900", `peças: ${fmtEUR(data.total.pecas)} · desconto: ${fmtEUR(data.total.desconto)}`)}
              {card("Custo de peças (est.)", data.total.custoPecas, "border-slate-200 bg-slate-50 text-slate-700", "60% do valor de peças")}
              {card("Margem bruta est.", data.total.margem, data.total.margemPct >= 0 ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900", `${data.total.margemPct.toFixed(1)}%`)}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">
                {agrupar === "tecnico" ? "Por técnico responsável" : "Por ordem de serviço"}
              </h2>
              {data.grupos.length === 0 && <p className="text-xs text-slate-400">Sem dados no período.</p>}
              <div className="space-y-2">
                {data.grupos.map((g) => {
                  const pct = maxReceita ? Math.max(Math.round((g.receita / maxReceita) * 100), 3) : 0;
                  return (
                    <div key={g.key} className="flex items-center gap-3">
                      <div className="w-56 shrink-0">
                        <p className="truncate text-xs font-bold text-slate-800">{g.key}</p>
                        {g.label && <p className="truncate text-[10px] font-medium text-slate-400">{g.label}</p>}
                      </div>
                      <div className="h-3 flex-1 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full rounded-full ${g.margemPct >= 0 ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-32 shrink-0 text-right">
                        <p className="text-xs font-black text-slate-800">{fmtEUR(g.receita)}</p>
                        <p className="text-[10px] font-semibold text-slate-400">
                          {g.n} · margem {g.margemPct.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}