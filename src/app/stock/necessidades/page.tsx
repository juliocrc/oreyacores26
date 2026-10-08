"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { hasEditablePathPermission, hasVisiblePathPermission } from "@/lib/permission-access";
import type { NeedRow, StockNeedsResult, StockMatched } from "@/lib/stock-needs-engine";

type ViewMode = "mensal" | "artigos";

const TODAY = new Date();

/** "2026-11" -> "11/26" */
function formatMonth(month: string) {
  const [y, m] = String(month || "").split("-");
  if (!y || !m) return month || "—";
  return `${m}/${y.slice(-2)}`;
}

/** Aceita ISO (2026-11-30), dd/mm/aaaa, dd-mm-aa e Date serializável. */
function parseValidade(value: string | null | undefined): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const pt = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(raw);
  if (pt) {
    const ano = Number(pt[3]) < 100 ? 2000 + Number(pt[3]) : Number(pt[3]);
    return new Date(ano, Number(pt[2]) - 1, Number(pt[1]));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatValidade(value: string | null | undefined) {
  const date = parseValidade(value);
  if (!date) return "—";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function daysUntil(date: Date) {
  const start = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  return Math.round((date.getTime() - start.getTime()) / 86_400_000);
}

function validadeBadge(value: string | null | undefined) {
  const date = parseValidade(value);
  if (!date) return { label: "sem validade", className: "bg-slate-100 text-slate-600", vencido: false };
  const dias = daysUntil(date);
  if (dias < 0) {
    return {
      label: `vencido há ${Math.abs(dias)}d`,
      className: "bg-rose-100 text-rose-800 font-semibold",
      vencido: true,
    };
  }
  if (dias <= 30) return { label: `${dias}d`, className: "bg-amber-100 text-amber-800 font-semibold", vencido: false };
  if (dias <= 90) return { label: `${dias}d`, className: "bg-sky-100 text-sky-800", vencido: false };
  return { label: `${dias}d`, className: "bg-emerald-50 text-emerald-800", vencido: false };
}

/** Validade mais próxima entre os lotes com stock — é a que governa o consumo. */
function earliestStockValidade(matched: StockMatched[] | undefined): string | null {
  if (!matched || matched.length === 0) return null;
  let best: { raw: string; date: Date } | null = null;
  for (const item of matched) {
    const date = parseValidade(item.validade);
    if (!date) continue;
    if (!best || date.getTime() < best.date.getTime()) best = { raw: String(item.validade), date };
  }
  return best ? best.raw : null;
}

function saldoClass(saldo: number) {
  if (saldo < 0) return "bg-rose-100 text-rose-800";
  if (saldo === 0) return "bg-amber-100 text-amber-800";
  return "bg-emerald-50 text-emerald-800";
}

function Kpi({
  label,
  value,
  tone = "slate",
  hint,
}: {
  label: string;
  value: string | number;
  tone?: "slate" | "blue" | "amber" | "red" | "emerald";
  hint?: string;
}) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-900",
    blue: "border-blue-100 bg-blue-50 text-blue-900",
    amber: "border-amber-100 bg-amber-50 text-amber-900",
    red: "border-red-100 bg-red-50 text-red-900",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-900",
  } as const;
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="text-[11px] font-semibold opacity-80">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {hint ? <div className="text-[10px] opacity-70">{hint}</div> : null}
    </div>
  );
}

function StockNecesidadesPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<StockNeedsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<ViewMode>("mensal");
  const [search, setSearch] = useState("");
  const [onlyWithNeed, setOnlyWithNeed] = useState(false);
  const [onlyWithValidity, setOnlyWithValidity] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const userRole = session?.user?.role === "ADMIN" ? "ADMIN" : "USER";
  const userPermissions = session?.user?.permissions;
  const canViewStock =
    userRole === "ADMIN" ||
    hasVisiblePathPermission(userPermissions, "/stock") ||
    hasEditablePathPermission(userPermissions, "/stock");

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      try {
        const res = await fetch("/api/stock/necessidades?stockScope=jangadas-ocean", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Não foi possível carregar as necessidades (HTTP ${res.status}).`);
        setData((await res.json()) as StockNeedsResult);
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erro ao carregar necessidades.");
      } finally {
        if (isRefresh) setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!canViewStock) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/stock/necessidades?stockScope=jangadas-ocean", {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) throw new Error(`Não foi possível carregar as necessidades (HTTP ${res.status}).`);
        setData((await res.json()) as StockNeedsResult);
        setError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar necessidades.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canViewStock]);

  // loading derivado: sem setState dentro do efeito
  const loading = canViewStock && data === null && error === null;
  const summary = data?.summary;
  const generatedAt = data?.generatedAt ? new Date(data.generatedAt) : null;

  const months = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const row of data?.needs || []) {
      for (const m of row.mensal || []) {
        const month = String(m.month || "").trim();
        if (month) set.add(month);
      }
    }
    return Array.from(set).sort();
  }, [data]);

  const rows: NeedRow[] = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.needs || []).filter((row) => {
      if (onlyWithValidity && !row.hasValidity) return false;
      if (onlyWithNeed && Number(row.necessidade12m || 0) <= 0) return false;
      if (!term) return true;
      return (
        String(row.nome || "").toLowerCase().includes(term) ||
        String(row.referencia || "").toLowerCase().includes(term) ||
        String(row.categoria || "").toLowerCase().includes(term) ||
        String(row.seccao || "").toLowerCase().includes(term) ||
        String(row.fornecedor || "").toLowerCase().includes(term)
      );
    });
  }, [data, search, onlyWithNeed, onlyWithValidity]);

  const totalsByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of data?.summary?.necessidadesMensaisTotais || []) {
      map.set(String(item.month), Number(item.quantidade || 0));
    }
    return map;
  }, [data]);

  const kpis = useMemo(() => {
    const totalFalta = rows.reduce((acc, row) => {
      let running = Number(row.stockAtual || 0);
      const byMonth = new Map<string, number>();
      for (const m of row.mensal || []) {
        const key = String(m.month || "").trim();
        if (key) byMonth.set(key, (byMonth.get(key) || 0) + Number(m.quantidade || 0));
      }
      let maxFalta = 0;
      for (const month of months) {
        running -= byMonth.get(month) || 0;
        if (-running > maxFalta) maxFalta = -running;
      }
      return acc + maxFalta;
    }, 0);
    const emRuptura = rows.filter((row) => !row.suficiente).length;
    const custoReposicao = rows.reduce((acc, row) => acc + Number(row.reorderQty || 0) * Number(row.avgPrice || 0), 0);
    return { totalFalta, emRuptura, custoReposicao };
  }, [rows, months]);

  const maxTotal = Math.max(1, ...Array.from(totalsByMonth.values()));

  if (!canViewStock) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Sem permissão para consultar stock.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ---------------- Cabeçalho ---------------- */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Necessidades de stock</h1>
          <p className="max-w-3xl text-xs text-slate-600">
            Artigos com validade calculados a partir das inspeções futuras das jangadas. As quantidades mensais
            são o consumo previsto para o mês de cada inspeção, e o saldo é a projecção após esse consumo.
          </p>
          {generatedAt ? (
            <p className="mt-0.5 text-[10px] text-slate-500">
              Calculado em {generatedAt.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {refreshing ? "A recalcular…" : "Recalcular"}
          </button>
          <Link
            href="/stock/reposicoes?tab=planeamento"
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Controlo de reposições
          </Link>
          <Link
            href="/stock"
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Voltar ao stock
          </Link>
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <span>{error}</span>
          <button type="button" onClick={() => void load(true)} className="font-semibold underline">
            Tentar novamente
          </button>
        </div>
      )}

      {/* ---------------- Resumo ---------------- */}
      {summary ? (
        <section className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Jangadas analisadas" value={summary.totalRaftsAnalyzed} tone="blue" />
          <Kpi label="Inspecções ≤ 30d" value={summary.expiringRafts30d} tone="amber" />
          <Kpi label="Inspecções ≤ 90d" value={summary.expiringRafts90d} tone="amber" />
          <Kpi
            label="Unidades com validade (12m)"
            value={summary.artigosComValidadeAte12Meses}
            tone="blue"
            hint={`${summary.artigosVencidos} vencidas · ${summary.totalItemsTracked} referências`}
          />
          <Kpi label="Artigos para repor" value={kpis.emRuptura} tone={kpis.emRuptura > 0 ? "red" : "emerald"} />
          <Kpi label="Cobertura" value={`${summary.coveragePercent}%`} tone="emerald" />
        </section>
      ) : null}

      {/* ---------------- Filtros ---------------- */}
      <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          {(["mensal", "artigos"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                view === mode ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {mode === "mensal" ? "Reposições mensais" : "Por artigo"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar artigo, referência, categoria ou fornecedor"
            className="w-72 rounded-md border border-slate-300 px-2.5 py-1 text-xs outline-none focus:border-slate-500"
          />
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={onlyWithValidity}
              onChange={(e) => setOnlyWithValidity(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Só artigos com validade
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={onlyWithNeed}
              onChange={(e) => setOnlyWithNeed(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Só com necessidade
          </label>
          <span className="text-[11px] tabular-nums text-slate-500">{rows.length} artigos</span>
        </div>
      </section>

      {loading && <p className="text-xs text-slate-500">A calcular necessidades…</p>}

      {!loading && months.length === 0 && (
        <p className="text-xs text-slate-500">Sem necessidades calculadas para as próximas inspeções.</p>
      )}

      {/* ---------------- Vista mensal ---------------- */}
      {!loading && view === "mensal" && months.length > 0 && (
        <div className="space-y-3">
          <section className="rounded-xl border border-sky-100 bg-sky-50/60 p-3">
            <p className="mb-2 text-xs font-semibold text-sky-800">Total previsto por mês</p>
            <div className="flex flex-wrap items-end gap-1.5">
              {months.map((month) => {
                const total = totalsByMonth.get(month) ?? 0;
                const height = Math.max(6, Math.round((total / maxTotal) * 48));
                return (
                  <Link
                    key={`total-${month}`}
                    href={`/stock/reposicoes?tab=planeamento&month=${encodeURIComponent(month)}`}
                    title={`${formatMonth(month)} — ${total} unidades. Abrir no controlo de reposições`}
                    className="flex flex-col items-center gap-1 rounded-md px-1.5 py-1 transition hover:bg-sky-100"
                  >
                    <span className="text-[10px] font-semibold tabular-nums text-sky-900">{total}</span>
                    <span className="w-6 rounded-t bg-sky-400" style={{ height }} />
                    <span className="text-[10px] font-medium text-sky-800">{formatMonth(month)}</span>
                  </Link>
                );
              })}
            </div>
          </section>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-semibold text-slate-700">Artigo</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-700">Stock</th>
                  {months.map((month) => (
                    <th key={month} className="px-2 py-2 text-center font-semibold text-slate-700">
                      {formatMonth(month)}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center font-semibold text-slate-700">Total 12m</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-700">Em falta</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-700">Encomendar até</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const byMonth = new Map<string, number>();
                  for (const m of row.mensal || []) {
                    const key = String(m.month || "").trim();
                    if (!key) continue;
                    byMonth.set(key, (byMonth.get(key) || 0) + Number(m.quantidade || 0));
                  }

                  let running = Number(row.stockAtual || 0);
                  const total12m = months.reduce((acc, month) => acc + (byMonth.get(month) || 0), 0);
                  let maxFalta = 0;
                  const saldos = months.map((month) => {
                    running -= byMonth.get(month) || 0;
                    if (-running > maxFalta) maxFalta = -running;
                    return running;
                  });

                  const key = `row-${row.referencia || row.nome}`;
                  const isOpen = expandedKey === key;
                  const validade = earliestStockValidade(row.stockMatched);
                  const badge = validadeBadge(validade);

                  return (
                    <Fragment key={key}>
                      <tr className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="sticky left-0 z-10 bg-white px-3 py-2">
                          <button
                            type="button"
                            onClick={() => setExpandedKey(isOpen ? null : key)}
                            className="text-left font-medium text-slate-900 hover:underline"
                          >
                            {row.nome}
                          </button>
                          <div className="text-[10px] text-slate-500">
                            {row.referencia ? `${row.referencia} · ` : ""}
                            {row.categoria || "—"}
                            {validade ? (
                              <span className={`ml-1 rounded px-1 ${badge.className}`} title={`Validade ${formatValidade(validade)}`}>
                                {badge.vencido ? "stock vencido" : `val. ${formatValidade(validade)}`}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums text-slate-700">{row.stockAtual}</td>
                        {months.map((month, i) => {
                          const need = byMonth.get(month) || 0;
                          return (
                            <td key={month} className="px-2 py-1 text-center">
                              {need > 0 ? (
                                <div
                                  title={`${formatMonth(month)}: necessário ${need} · saldo ${saldos[i]}`}
                                  className={`rounded px-1.5 py-0.5 tabular-nums ${saldoClass(saldos[i])}`}
                                >
                                  <div className="font-semibold">{need}</div>
                                  <div className="text-[10px] opacity-80">s:{saldos[i]}</div>
                                </div>
                              ) : (
                                <span className="text-slate-300">·</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-center tabular-nums font-semibold text-slate-800">{total12m}</td>
                        <td className="px-3 py-2 text-center tabular-nums">
                          {maxFalta > 0 ? (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-800">
                              {maxFalta}
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-[10px] text-slate-600">
                          {row.orderLimitDate ? formatValidade(row.orderLimitDate) : "—"}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-slate-100 bg-slate-50">
                          <td colSpan={months.length + 5} className="px-3 py-2 text-[11px] text-slate-700">
                            <RowDetails row={row} months={months} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- Vista por artigo ---------------- */}
      {!loading && view === "artigos" && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2 font-semibold text-slate-700">Artigo</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-700">Validade</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-700">Stock</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-700">30d</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-700">90d</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-700">12m</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-700">Saldo 12m</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-700">Cobertura</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-700">Reposição</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-700">Jangadas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = `art-${row.referencia || row.nome}`;
                const isOpen = expandedKey === key;
                const validade = earliestStockValidade(row.stockMatched);
                const badge = validadeBadge(validade);
                const rotura = row.dataPrevistaRutura ? parseValidade(row.dataPrevistaRutura) : null;

                return (
                  <Fragment key={key}>
                    <tr className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-900">
                        <button
                          type="button"
                          onClick={() => setExpandedKey(isOpen ? null : key)}
                          className="text-left font-medium text-slate-900 hover:underline"
                        >
                          {row.nome}
                        </button>
                        <div className="text-[10px] text-slate-500">
                          {row.referencia ? `${row.referencia} · ` : ""}
                          {row.categoria || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {validade ? (
                          <div>
                            <div className="tabular-nums text-slate-700">{formatValidade(validade)}</div>
                            <span className={`mt-0.5 inline-block rounded px-1 text-[10px] ${badge.className}`}>
                              {badge.label}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">{row.stockAtual}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{row.necessidade30d}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{row.necessidade90d}</td>
                      <td className="px-3 py-2 text-center tabular-nums font-semibold">{row.necessidade12m}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`rounded px-1.5 py-0.5 tabular-nums ${saldoClass(Number(row.saldoProjetado12m || 0))}`}>
                          {row.saldoProjetado12m}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-[10px] text-slate-600">
                        {row.coberturaDias !== null && row.coberturaDias !== undefined ? `${row.coberturaDias}d` : "—"}
                        {rotura ? (
                          <div className="text-rose-700">rutura {formatValidade(row.dataPrevistaRutura)}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {Number(row.reorderQty || 0) > 0 ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">
                            {row.reorderQty}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">{row.jangadasCount}</td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-slate-100 bg-slate-50">
                        <td colSpan={10} className="px-3 py-2 text-[11px] text-slate-700">
                          <RowDetails row={row} months={months} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {summary ? (
        <footer className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
          <span>
            Filtro atual: {onlyWithValidity ? "artigos com validade" : "todos os artigos"}
            {onlyWithNeed ? " · só com necessidade" : ""}
          </span>
          <span className="tabular-nums">
            Falta máxima acumulada no filtro: <strong className="text-rose-700">{kpis.totalFalta}</strong> un. ·{" "}
            <strong className="text-rose-700">{kpis.emRuptura}</strong> artigos abaixo do mínimo
            {Number(summary.totalReorderCost || 0) > 0 ? (
              <> · custo estimado de reposição <strong>{summary.totalReorderCost.toFixed(2)} €</strong></>
            ) : null}
          </span>
        </footer>
      ) : null}
    </div>
  );
}

function RowDetails({ row, months }: { row: NeedRow; months: string[] }) {
  const matched = row.stockMatched || [];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span>Fornecedor: <strong>{row.fornecedor || "—"}</strong></span>
        <span>Secção: <strong>{row.seccao || "—"}</strong></span>
        <span>Stock mínimo: <strong>{row.stockMinimo}</strong></span>
        <span>Consumo médio/dia: <strong>{Number(row.consumoMedioDiario || 0).toFixed(2)}</strong></span>
        <span>Consumo 90d: <strong>{row.consumoHistorico90d}</strong></span>
        <span>Lead time: <strong>{row.leadTimeDias} dias</strong></span>
        <span>Encomendar até: <strong>{row.orderLimitDate ? formatValidade(row.orderLimitDate) : "—"}</strong></span>
        <span>Margem de segurança: <strong>{row.safetyBuffer}</strong></span>
        <span>Fator sazonal: <strong>{Number(row.fatorSazonal || 0).toFixed(2)}</strong></span>
      </div>

      {months.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {months.map((month) => {
            const qty = (row.mensal || [])
              .filter((m) => String(m.month || "").trim() === month)
              .reduce((acc, m) => acc + Number(m.quantidade || 0), 0);
            const jangadas = (row.mensal || []).filter((m) => String(m.month || "").trim() === month).flatMap((m) =>
              (m.jangadas || []).map((j) => j.serial),
            );
            return (
              <span
                key={`det-${month}`}
                title={jangadas.length > 0 ? `Jangadas: ${[...new Set(jangadas)].join(", ")}` : "Sem jangadas registadas"}
                className="rounded border border-slate-200 bg-white px-1.5 py-0.5 tabular-nums text-[10px] text-slate-700"
              >
                {formatMonth(month)}: <strong>{qty}</strong>
              </span>
            );
          })}
        </div>
      ) : null}

      {matched.length > 0 ? (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Lotes de stock</p>
          <div className="flex flex-wrap gap-1.5">
            {matched.map((lot) => {
              const badge = validadeBadge(lot.validade);
              return (
                <span
                  key={lot.id}
                  title={[lot.ref, lot.localizacao, lot.lote && `lote ${lot.lote}`].filter(Boolean).join(" · ")}
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-700"
                >
                  <strong className="tabular-nums">{lot.qty}</strong>
                  <span className={`rounded px-1 ${badge.className}`}>
                    {lot.validade ? formatValidade(lot.validade) : "s/ validade"}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-amber-700">Sem registo de stock associado a este artigo.</p>
      )}

      {(row.jangadasAfetadas || []).length > 0 ? (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Jangadas afetadas ({row.jangadasAfetadas.length})
          </p>
          <div className="max-h-24 overflow-y-auto text-[10px] leading-relaxed text-slate-600">
            {row.jangadasAfetadas.join(", ")}
          </div>
        </div>
      ) : null}

      <div>
        <Link
          href={`/stock/reposicoes?tab=planeamento&month=${encodeURIComponent(months[0] || "")}`}
          className="font-semibold text-sky-700 hover:underline"
        >
          Abrir no controlo de reposições →
        </Link>
      </div>
    </div>
  );
}

export default function StockNecessidadesPage() {
  return <StockNecesidadesPage />;
}
