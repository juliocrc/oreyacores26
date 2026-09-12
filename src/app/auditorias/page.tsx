"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AuditoriasList, { AuditoriaItem } from "@/modules/Auditorias";

type AuditoriaFilters = {
  tabela: string;
  tipoOperacao: string;
  startDate: string;
  endDate: string;
};

export default function AuditoriasPage() {
  const [items, setItems] = useState<AuditoriaItem[]>([]);
  const [query, setQuery] = useState("");
  const [tabela, setTabela] = useState("TODOS");
  const [tipoOperacao, setTipoOperacao] = useState("TODOS");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);

  const queryRef = useRef(query);
  React.useEffect(() => {
    queryRef.current = query;
  });

  const fetchAuditorias = useCallback(async (nextQuery?: string, filters: AuditoriaFilters = { tabela, tipoOperacao, startDate, endDate }) => {
    const effectiveQuery = nextQuery ?? queryRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "300" });
      if (effectiveQuery.trim()) params.set("q", effectiveQuery.trim());
      if (filters.tabela !== "TODOS") params.set("tabela", filters.tabela);
      if (filters.tipoOperacao !== "TODOS") params.set("tipoOperacao", filters.tipoOperacao);
      if (filters.startDate) params.set("startDate", filters.startDate);
      if (filters.endDate) params.set("endDate", filters.endDate);

      const res = await fetch(`/api/auditorias?${params.toString()}`);
      if (!res.ok) throw new Error("Falha ao carregar auditorias");
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tabela, tipoOperacao, startDate, endDate]);

  useEffect(() => {
    void (async () => {
      await fetchAuditorias("", { tabela: "Navio", tipoOperacao: "TODOS", startDate: "", endDate: "" });
    })();
  }, [fetchAuditorias]);

  const title = useMemo(() => (query ? `Auditorias (filtro: ${query})` : "Auditorias"), [query]);

  const resumo = useMemo(() => {
    const porUtilizador = new Map<string, number>();
    const porOperacao: Record<string, number> = { CREATE: 0, UPDATE: 0, DELETE: 0 };
    let maisRecente: AuditoriaItem | null = null;
    for (const it of items) {
      const u = (it.usuario || "—").trim();
      porUtilizador.set(u, (porUtilizador.get(u) || 0) + 1);
      if (porOperacao[it.tipoOperacao] !== undefined) porOperacao[it.tipoOperacao] += 1;
      if (!maisRecente || new Date(it.createdAt) > new Date(maisRecente.createdAt)) maisRecente = it;
    }
    const topUsers = Array.from(porUtilizador.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return { porUtilizador: topUsers, porOperacao, maisRecente, total: items.length };
  }, [items]);

  return (
    <div className="p-6">
      <div className="max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h1 className="text-2xl font-bold">{title}</h1>
          <button
            className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-800"
            onClick={() => fetchAuditorias()}
          >
            Atualizar
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar por tabela, operação, descrição ou utilizador"
            className="flex-1 rounded border px-3 py-2"
            onKeyDown={(e) => {
              if (e.key === "Enter") fetchAuditorias();
            }}
          />
          <button className="rounded bg-gray-200 px-3 py-2 font-medium hover:bg-gray-300 transition-colors" onClick={() => fetchAuditorias()}>
            Procurar
          </button>
          <button
            className="rounded bg-gray-100 px-3 py-2 font-medium hover:bg-gray-200 transition-colors"
            onClick={() => {
              setQuery("");
              setTabela("TODOS");
              setTipoOperacao("TODOS");
              setStartDate("");
              setEndDate("");
              fetchAuditorias("", { tabela: "TODOS", tipoOperacao: "TODOS", startDate: "", endDate: "" });
            }}
          >
            Limpar Filtros
          </button>
        </div>

        {/* Painel de Filtros Avançados */}
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tabela</label>
            <select
              value={tabela}
              onChange={(e) => setTabela(e.target.value)}
              className="w-full rounded border px-3 py-1.5 bg-white text-sm outline-none focus:border-slate-400"
            >
              <option value="TODOS">Todas</option>
              <option value="Jangada">Jangadas</option>
              <option value="ArtigoJangada">Artigos de Jangadas</option>
              <option value="Stock">Stock</option>
              <option value="MovimentacaoStock">Movimentações de Stock</option>
              <option value="Cliente">Clientes</option>
              <option value="Navio">Navios</option>
              <option value="OrdemServico">Ordens de Serviço</option>
              <option value="User">Utilizadores</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Operação</label>
            <select
              value={tipoOperacao}
              onChange={(e) => setTipoOperacao(e.target.value)}
              className="w-full rounded border px-3 py-1.5 bg-white text-sm outline-none focus:border-slate-400"
            >
              <option value="TODOS">Todas</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">De (Data)</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded border px-3 py-1 bg-white text-sm outline-none focus:border-slate-400 h-[34px]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Até (Data)</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded border px-3 py-1 bg-white text-sm outline-none focus:border-slate-400 h-[34px]"
            />
          </div>
        </div>

        {/* Resumo — quem alterou o quê e quando */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Utilizadores mais ativos</h2>
            <div className="space-y-1.5">
              {resumo.porUtilizador.length === 0 && <p className="text-xs text-slate-400">Sem dados.</p>}
              {resumo.porUtilizador.map(([user, count]) => {
                const pct = resumo.total ? Math.round((count / resumo.total) * 100) : 0;
                return (
                  <div key={user} className="flex items-center gap-2">
                    <span className="w-28 truncate text-xs font-bold text-slate-700">{user}</span>
                    <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 40 ? "bg-indigo-600" : pct >= 15 ? "bg-sky-500" : "bg-slate-300"}`} style={{ width: `${Math.max(pct, 4)}%` }} />
                    </div>
                    <span className="text-xs font-black text-slate-600">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Operações no período</h2>
            <div className="space-y-1.5">
              {(["CREATE", "UPDATE", "DELETE"] as const).map((op) =>
                resumo.porOperacao[op] > 0 ? (
                  <div key={op} className="flex items-center justify-between rounded-xl border px-3 py-2 text-xs font-bold">
                    <span
                      className={
                        op === "CREATE" ? "text-emerald-700" : op === "UPDATE" ? "text-sky-700" : "text-red-700"
                      }
                    >
                      {op === "CREATE" ? "Criados" : op === "UPDATE" ? "Atualizações" : "Eliminações"}
                    </span>
                    <span className="text-slate-700">{resumo.porOperacao[op]}</span>
                  </div>
                ) : null
              )}
              {Object.values(resumo.porOperacao).every((v) => v === 0) && (
                <p className="text-xs text-slate-400">Sem dados.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Último registo</h2>
            {resumo.maisRecente ? (
              <div className="space-y-1 text-xs">
                <p className="font-extrabold text-slate-800">{resumo.maisRecente.tabela} · {resumo.maisRecente.tipoOperacao}</p>
                <p className="text-slate-500">{resumo.maisRecente.descricao || "Sem descrição"}</p>
                <p className="text-slate-400">
                  {resumo.maisRecente.usuario || "—"} · {new Date(resumo.maisRecente.createdAt).toLocaleString("pt-PT")}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Sem registos.</p>
            )}
          </div>
        </div>

        {loading ? <div className="text-sm text-gray-500 animate-pulse">A carregar auditorias...</div> : <AuditoriasList items={items} />}
      </div>
    </div>
  );
}
