"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Package,
  RefreshCw,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { STOCK_LIST_DENSITY_KEY } from "@/types/stock-page";

type MonthlyNeed = {
  month: string;
  quantidade?: number;
  qty?: number;
  jangadas?: Array<{
    id: number;
    serial: string;
    brand?: string | null;
    model?: string | null;
    owner?: string | null;
  }>;
};

type NeedRow = {
  referencia: string;
  nome: string;
  categoria: string;
  seccao: string;
  fornecedor: string;
  stockAtual: number;
  stockMinimo?: number;
  necessidade30d: number;
  necessidade60d: number;
  necessidade90d: number;
  necessidade12m: number;
  saldoProjetado30d: number;
  saldoProjetado90d: number;
  saldoProjetado12m: number;
  suficiente: boolean;
  reorderQty: number;
  safetyBuffer: number;
  orderLimitDate: string;
  avgPrice: number;
  consumoHistorico90d?: number;
  consumoMedioMensal?: number;
  demandaAjustada90d?: number;
  mensal: MonthlyNeed[];
  jangadasCount: number;
  jangadasAfetadas: string[];
  stockMatched: Array<{ id: number; ref: string; desc: string; qty: number }>;
  stockId?: number | null;
  hasValidity?: boolean;
};

type Summary = {
  totalRaftsAnalyzed: number;
  expiringRafts30d: number;
  expiringRafts60d: number;
  expiringRafts90d: number;
  expiringRafts12m?: number;
  artigosComValidadeAte12Meses: number;
  artigosVencidos: number;
  quantidadeTotalNecessaria12m?: number;
  jangadasAfetadas?: number;
  totalItemsTracked: number;
  itemsInAlert: number;
  totalReorderCost: number;
  coveragePercent?: number;
  cilindrosNecessarios30d: number;
  cilindrosCheiosDisponiveis30d: number;
  necessidadesMensaisTotais: MonthlyNeed[];
};

type ApiPayload = {
  generatedAt?: string;
  summary?: Summary | null;
  needs?: NeedRow[];
  suggestions?: Array<{
    reference: string;
    label: string;
    supplier: string;
    projectedDemand90d: number;
    demandByWindow: Record<string, number>;
    stockAvailable: number;
    reorderQty: number;
    orderLimitDate: string;
    avgPrice: number;
    raftCount: number;
    consumoHistorico90d?: number;
    demandaAjustada90d?: number;
    stockMatched?: Array<{ id: number; ref: string; desc: string; qty: number }>;
  }>;
  upcomingRafts30d?: Array<{
    id: number;
    serial: string;
    brand?: string;
    model?: string;
    owner?: string;
    daysUntil?: number;
    dataProxInspecao?: string;
  }>;
};

type Horizon = "30d" | "90d" | "12m" | "month";
type TabId = "comprar" | "planeamento" | "consumo" | "pedidos";

function monthQty(m: MonthlyNeed) {
  return Number(m.quantidade ?? m.qty ?? 0);
}

function formatMonth(month: string) {
  const [year, mon] = String(month || "").split("-");
  if (!year || !mon) return month;
  const date = new Date(Number(year), Number(mon) - 1, 1);
  return date.toLocaleDateString("pt-PT", { month: "short", year: "numeric" });
}

function formatEur(value: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(value || 0);
}

function buildRolling12Months() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  now.setDate(1);
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now);
    date.setMonth(now.getMonth() + index);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

function getMonthNeed(mensal: MonthlyNeed[], month?: string | null) {
  if (!month) return 0;
  const hit = mensal.find((item) => item.month === month);
  return hit ? monthQty(hit) : 0;
}

function urgencyTone(reorder: number, saldo: number, orderLimitDate?: string) {
  if (reorder <= 0 && saldo >= 0) return "ok";
  if (orderLimitDate) {
    const days = Math.ceil((new Date(orderLimitDate).getTime() - Date.now()) / 86400000);
    if (days <= 7) return "critical";
    if (days <= 21) return "warn";
  }
  if (saldo < 0 || reorder > 0) return "warn";
  return "ok";
}

function StockReposicoesPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<TabId>(
    tabParam === "planeamento" || tabParam === "previsao"
      ? "planeamento"
      : tabParam === "consumo"
        ? "consumo"
        : tabParam === "pedidos"
          ? "pedidos"
          : "comprar"
  );

  const selectedMonth = String(searchParams.get("month") || "").trim() || null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [search, setSearch] = useState("");
  const [onlyToBuy, setOnlyToBuy] = useState(true);
  const [supplier, setSupplier] = useState("");
  const [horizon, setHorizon] = useState<Horizon>(selectedMonth ? "month" : "90d");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [creatingPedido, setCreatingPedido] = useState(false);
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [pedidosLoading, setPedidosLoading] = useState(false);
  const [onlyValidityMonthly, setOnlyValidityMonthly] = useState(true);
  const [listDensity, setListDensity] = useState<"default" | "compact">(() => {
    if (typeof window === "undefined") return "default";
    try {
      return window.localStorage.getItem(STOCK_LIST_DENSITY_KEY) === "compact" ? "compact" : "default";
    } catch {
      return "default";
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STOCK_LIST_DENSITY_KEY, listDensity);
    } catch {
      /* ignore */
    }
  }, [listDensity]);
  const tableDensityClass =
    listDensity === "compact" ? "[&_td]:!p-1.5 [&_th]:!px-2 [&_th]:!py-1.5 [&_td]:!text-xs" : "";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/stock/necessidades?stockScope=jangadas-ocean", { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível carregar o planeamento de stock.");
      const data = (await response.json()) as ApiPayload;
      setPayload(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selectedMonth) setHorizon("month");
  }, [selectedMonth]);

  const availableMonths = useMemo(() => buildRolling12Months(), []);
  const needs = payload?.needs || [];
  const summary = payload?.summary;

  const suppliers = useMemo(
    () => Array.from(new Set(needs.map((n) => n.fornecedor).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt")),
    [needs]
  );

  const rows = useMemo(() => {
    return needs.map((row, idx) => {
      const key = `need-${row.referencia || row.nome}-${idx}`;
      let necessidade = 0;
      if (horizon === "month" && selectedMonth) necessidade = getMonthNeed(row.mensal || [], selectedMonth);
      else if (horizon === "30d") necessidade = Number(row.necessidade30d || 0);
      else if (horizon === "12m") necessidade = Number(row.necessidade12m || row.necessidade90d || 0);
      else necessidade = Number(row.demandaAjustada90d || row.necessidade90d || 0);

      const stockAtual = Number(row.stockAtual || 0);
      const comprar = Math.max(0, Number(row.reorderQty || 0) > 0 && horizon !== "month"
        ? (horizon === "30d"
          ? Math.max(0, Number(row.necessidade30d || 0) - stockAtual + Number(row.safetyBuffer || 0))
          : Number(row.reorderQty || 0))
        : Math.max(0, necessidade - stockAtual));
      const saldo = stockAtual - necessidade;
      const custo = comprar * Number(row.avgPrice || 0);

      return {
        key,
        ...row,
        necessidade,
        comprar,
        saldo,
        custo,
      };
    });
  }, [needs, horizon, selectedMonth]);

  const filteredRows = useMemo(() => {
    const text = search.trim().toLowerCase();
    return rows
      .filter((row) => row.necessidade > 0 || row.comprar > 0 || row.consumoHistorico90d)
      .filter((row) => {
        if (!(horizon === "month" || selectedMonth) || !onlyValidityMonthly) return true;
        return Boolean(row.hasValidity) || (row.mensal || []).some((m) => Number(m.quantidade ?? m.qty ?? 0) > 0);
      })
      .filter((row) => !text || [row.nome, row.referencia || "", row.fornecedor || "", row.categoria || ""].join(" ").toLowerCase().includes(text))
      .filter((row) => !supplier || row.fornecedor === supplier)
      .filter((row) => (onlyToBuy ? row.comprar > 0 : true))
      .sort((a, b) => {
        if (b.comprar !== a.comprar) return b.comprar - a.comprar;
        if (a.saldo !== b.saldo) return a.saldo - b.saldo;
        return a.nome.localeCompare(b.nome, "pt", { sensitivity: "base" });
      });
  }, [rows, search, onlyToBuy, supplier, horizon, selectedMonth, onlyValidityMonthly]);

  const loadPedidos = useCallback(async () => {
    setPedidosLoading(true);
    try {
      const res = await fetch("/api/stock/pedidos-reposicao", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setPedidos(Array.isArray(data.pedidos) ? data.pedidos : []);
    } finally {
      setPedidosLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "pedidos") void loadPedidos();
  }, [activeTab, loadPedidos]);

  const createPedidoFromSelection = async () => {
    const list = filteredRows.filter((r) => selectedKeys.has(r.key) && r.comprar > 0);
    const source = list.length ? list : filteredRows.filter((r) => r.comprar > 0).slice(0, 40);
    if (!source.length) {
      alert("Não há linhas a comprar para criar pedido.");
      return;
    }
    setCreatingPedido(true);
    try {
      const bySupplier = new Map<string, typeof source>();
      for (const row of source) {
        const key = row.fornecedor || "Geral";
        if (!bySupplier.has(key)) bySupplier.set(key, []);
        bySupplier.get(key)!.push(row);
      }
      const created: string[] = [];
      for (const [fornecedor, lines] of bySupplier) {
        const res = await fetch("/api/stock/pedidos-reposicao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fornecedor,
            notas: `Gerado a partir de /stock/reposicoes${selectedMonth ? ` · mês ${selectedMonth}` : ""}`,
            linhas: lines.map((r) => ({
              stockId: r.stockMatched?.[0]?.id || r.stockId || undefined,
              referencia: r.referencia,
              descricao: r.nome,
              fornecedor: r.fornecedor,
              quantidadePedida: r.comprar,
              precoUnitario: r.avgPrice || 0,
            })),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Falha ao criar pedido");
        created.push(data.numero || String(data.id));
      }
      alert(`Pedido(s) criado(s): ${created.join(", ")}`);
      setSelectedKeys(new Set());
      setActiveTab("pedidos");
      void loadPedidos();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao criar pedido");
    } finally {
      setCreatingPedido(false);
    }
  };

  const totals = useMemo(
    () =>
      filteredRows.reduce(
        (acc, row) => {
          acc.necessidade += row.necessidade;
          acc.stock += row.stockAtual;
          acc.comprar += row.comprar;
          acc.custo += row.custo;
          return acc;
        },
        { necessidade: 0, stock: 0, comprar: 0, custo: 0 }
      ),
    [filteredRows]
  );

  const consumoTop = useMemo(() => {
    return [...needs]
      .filter((n) => Number(n.consumoHistorico90d || 0) > 0)
      .sort((a, b) => Number(b.consumoHistorico90d || 0) - Number(a.consumoHistorico90d || 0))
      .slice(0, 40);
  }, [needs]);

  const updateQuery = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    const q = params.toString();
    router.replace(q ? `/stock/reposicoes?${q}` : "/stock/reposicoes");
  };

  const switchTab = (tab: TabId) => {
    setActiveTab(tab);
    updateQuery({ tab, month: tab === "comprar" ? selectedMonth : selectedMonth });
  };

  const updateMonth = (month: string | null) => {
    if (month) {
      setHorizon("month");
      updateQuery({ month, tab: activeTab });
    } else {
      if (horizon === "month") setHorizon("90d");
      updateQuery({ month: null, tab: activeTab });
    }
  };

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllBuy = () => {
    setSelectedKeys(new Set(filteredRows.filter((r) => r.comprar > 0).map((r) => r.key)));
  };

  const exportCsv = (source: "filtered" | "selected" = "filtered") => {
    const list = source === "selected"
      ? filteredRows.filter((r) => selectedKeys.has(r.key))
      : filteredRows.filter((r) => r.comprar > 0);
    if (!list.length) return;

    const header = [
      "Artigo",
      "Referência",
      "Fornecedor",
      "Categoria",
      "Necessidade",
      "Stock",
      "Comprar",
      "Consumo 90d",
      "Demanda ajustada 90d",
      "Preço médio",
      "Custo estimado",
      "Data limite",
      "Jangadas",
    ];
    const lines = list.map((r) =>
      [
        `"${(r.nome || "").replace(/"/g, '""')}"`,
        `"${r.referencia || ""}"`,
        `"${r.fornecedor || ""}"`,
        `"${r.categoria || ""}"`,
        r.necessidade,
        r.stockAtual,
        r.comprar,
        r.consumoHistorico90d || 0,
        r.demandaAjustada90d || r.necessidade90d || 0,
        r.avgPrice || 0,
        (r.custo || 0).toFixed(2),
        r.orderLimitDate || "",
        r.jangadasCount || 0,
      ].join(",")
    );
    const csv = "data:text/csv;charset=utf-8," + [header.join(","), ...lines].join("\n");
    const link = document.createElement("a");
    link.href = encodeURI(csv);
    link.download = `reposicao_stock_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectedMonthRafts = (row: (typeof filteredRows)[number]) => {
    if (!selectedMonth) return [];
    return row.mensal.find((item) => item.month === selectedMonth)?.jangadas || [];
  };

  return (
    <div className="min-h-screen bg-slate-50 py-6">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="app-hero-panel px-6 py-6 text-white">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">Stock · MRP leve</p>
                <h1 className="mt-1 text-3xl font-bold tracking-tight">Necessidades e reposição</h1>
                <p className="mt-2 max-w-3xl text-sm text-sky-100/95">
                  Planeamento unificado: pack regulamentar + inspeções + consumo real (90d). Uma fonte de verdade para
                  comprar, planear e exportar.
                </p>
                {payload?.generatedAt && (
                  <p className="mt-2 text-xs text-sky-100/80">
                    Atualizado {new Date(payload.generatedAt).toLocaleString("pt-PT")}
                    {summary ? ` · cobertura ${summary.coveragePercent ?? "—"}%` : ""}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/stock"
                  className="rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/25 hover:bg-white/20"
                >
                  Catálogo stock
                </Link>
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm hover:bg-sky-50 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  Atualizar
                </button>
                <button
                  type="button"
                  onClick={() => setListDensity((prev) => (prev === "compact" ? "default" : "compact"))}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-white/25 ${listDensity === "compact" ? "bg-white text-blue-700" : "bg-white/15 text-white hover:bg-white/20"}`}
                >
                  {listDensity === "compact" ? "Densidade: Compacta" : "Densidade: Normal"}
                </button>
                <button
                  type="button"
                  onClick={() => exportCsv(selectedKeys.size ? "selected" : "filtered")}
                  disabled={!filteredRows.some((r) => r.comprar > 0)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Exportar CSV
                </button>
                <button
                  type="button"
                  onClick={() => void createPedidoFromSelection()}
                  disabled={creatingPedido || !filteredRows.some((r) => r.comprar > 0)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50"
                >
                  <ShoppingCart className="h-4 w-4" />
                  {creatingPedido ? "A criar..." : "Criar pedido reposição"}
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Kpi
                icon={<Package className="h-4 w-4" />}
                label="Jangadas 90d"
                value={summary?.expiringRafts90d ?? "—"}
                tone="sky"
              />
              <Kpi
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Em alerta"
                value={summary?.itemsInAlert ?? "—"}
                tone="rose"
              />
              <Kpi
                icon={<ShoppingCart className="h-4 w-4" />}
                label="A comprar (filtro)"
                value={totals.comprar}
                tone="amber"
              />
              <Kpi
                icon={<TrendingUp className="h-4 w-4" />}
                label="Custo estimado"
                value={formatEur(totals.custo || summary?.totalReorderCost || 0)}
                tone="emerald"
              />
              <Kpi
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="Cilindros cheios / 30d"
                value={`${summary?.cilindrosCheiosDisponiveis30d ?? 0}/${summary?.cilindrosNecessarios30d ?? 0}`}
                tone="indigo"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1 border-t border-slate-100 bg-slate-50/80 p-2">
            {(
              [
                ["comprar", "Lista de compra"],
                ["planeamento", "Planeamento 30/90/12m"],
                ["consumo", "Consumo real"],
                ["pedidos", "Pedidos reposição"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => switchTab(id)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  activeTab === id
                    ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200"
                    : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        {(activeTab === "comprar" || activeTab === "planeamento") && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Horizonte</span>
                {(
                  [
                    ["30d", "30 dias"],
                    ["90d", "90 dias (ajustado)"],
                    ["12m", "12 meses"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setHorizon(id);
                      if (selectedMonth) updateMonth(null);
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      horizon === id && !selectedMonth
                        ? "bg-blue-700 text-white"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => updateMonth(null)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    !selectedMonth ? "bg-slate-800 text-white" : "border border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  Sem mês
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {availableMonths.map((month) => {
                  const total = summary?.necessidadesMensaisTotais?.find((m) => m.month === month);
                  const q = total ? monthQty(total) : 0;
                  return (
                    <button
                      key={month}
                      type="button"
                      onClick={() => updateMonth(month)}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                        selectedMonth === month
                          ? "bg-blue-700 text-white"
                          : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {formatMonth(month)}
                      {q > 0 && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${selectedMonth === month ? "bg-white/20" : "bg-white text-slate-600"}`}>
                          {q}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_1fr_auto_auto]">
                <label className="block text-sm font-medium text-slate-700">
                  Pesquisar
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nome, referência, categoria..."
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Fornecedor
                  <select
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Todos</option>
                    {suppliers.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                  <label className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <input type="checkbox" checked={onlyToBuy} onChange={(e) => setOnlyToBuy(e.target.checked)} />
                  Só faltas a comprar
                </label>
                {(horizon === "month" || selectedMonth) && (
                  <label className="flex items-end gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
                    <input type="checkbox" checked={onlyValidityMonthly} onChange={(e) => setOnlyValidityMonthly(e.target.checked)} />
                    Só artigos com validade
                  </label>
                )}
                <button
                  type="button"
                  onClick={selectAllBuy}
                  className="self-end rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Selecionar faltas
                </button>
                <div className="self-end rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-semibold text-slate-700">
                  {filteredRows.length} linha(s)
                  {selectedKeys.size > 0 ? ` · ${selectedKeys.size} sel.` : ""}
                </div>
              </div>
            </div>
          </section>
        )}

        {loading ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-600">
            <RefreshCw className="mx-auto h-8 w-8 animate-spin text-blue-600" />
            <p className="mt-3 text-sm">A calcular necessidades e consumo...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
        ) : activeTab === "consumo" ? (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Consumo real (saídas 90 dias)</h2>
              <p className="text-sm text-slate-600">
                Cruza movimentos de stock com a procura prevista — base do ajuste de encomenda.
              </p>
            </div>
            {consumoTop.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">Sem saídas registadas nos últimos 90 dias.</div>
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className={`min-w-full text-sm ${tableDensityClass}`}>
                  <thead>
                    <tr className="border-b border-slate-200 bg-white text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="sticky top-0 z-30 bg-white left-0 border-r border-slate-200 px-4 py-3">Artigo</th>
                      <th className="sticky top-0 z-30 bg-white px-4 py-3">Ref</th>
                      <th className="sticky top-0 z-20 bg-white px-4 py-3 text-right">Consumo 90d</th>
                      <th className="sticky top-0 z-20 bg-white px-4 py-3 text-right">Média / mês</th>
                      <th className="sticky top-0 z-20 bg-white px-4 py-3 text-right">Procura pack 90d</th>
                      <th className="sticky top-0 z-20 bg-white px-4 py-3 text-right">Demanda ajustada</th>
                      <th className="sticky top-0 z-20 bg-white px-4 py-3 text-right">Stock</th>
                      <th className="sticky top-0 z-20 bg-white px-4 py-3 text-right">Comprar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consumoTop.map((row) => (
                      <tr key={`${row.referencia}-${row.nome}`} className="border-b border-slate-100 bg-white hover:bg-slate-50/80">
                        <td className="sticky left-0 z-10 bg-inherit border-r border-slate-200 px-4 py-3 font-semibold text-slate-900">{row.nome}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.referencia || "—"}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800">{row.consumoHistorico90d || 0}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{row.consumoMedioMensal ?? "—"}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{row.necessidade90d}</td>
                        <td className="px-4 py-3 text-right font-semibold text-indigo-700">{row.demandaAjustada90d ?? row.necessidade90d}</td>
                        <td className="px-4 py-3 text-right">{row.stockAtual}</td>
                        <td className="px-4 py-3 text-right">
                          {row.reorderQty > 0 ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">+{row.reorderQty}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : activeTab === "pedidos" ? (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Pedidos de reposição</h2>
                <p className="text-sm text-slate-600">Rascunho → encomendado → recebido (entrada automática no stock).</p>
              </div>
              <button
                type="button"
                onClick={() => void loadPedidos()}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Atualizar
              </button>
            </div>
            {pedidosLoading ? (
              <div className="p-8 text-center text-sm text-slate-500">A carregar pedidos...</div>
            ) : pedidos.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Ainda não há pedidos. Selecione linhas na lista de compra e use &quot;Criar pedido reposição&quot;.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {pedidos.map((p) => (
                  <div key={p.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-900">{p.numero}</p>
                        <p className="text-xs text-slate-500">
                          {p.fornecedor || "Sem fornecedor"} · {p.status} · {new Date(p.createdAt).toLocaleString("pt-PT")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {formatEur(Number(p.totalEstimado) || 0)}
                        </span>
                        {p.status === "rascunho" && (
                          <button
                            type="button"
                            className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white"
                            onClick={async () => {
                              await fetch(`/api/stock/pedidos-reposicao/${p.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "encomendar" }),
                              });
                              void loadPedidos();
                            }}
                          >
                            Marcar encomendado
                          </button>
                        )}
                        {(p.status === "encomendado" || p.status === "parcial" || p.status === "rascunho") && (
                          <button
                            type="button"
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white"
                            onClick={async () => {
                              if (!window.confirm(`Receber pedido ${p.numero} e criar entradas de stock?`)) return;
                              await fetch(`/api/stock/pedidos-reposicao/${p.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "receber" }),
                              });
                              void loadPedidos();
                            }}
                          >
                            Receber tudo
                          </button>
                        )}
                        {p.status !== "cancelado" && p.status !== "recebido" && (
                          <button
                            type="button"
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"
                            onClick={async () => {
                              await fetch(`/api/stock/pedidos-reposicao/${p.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "cancelar" }),
                              });
                              void loadPedidos();
                            }}
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      {(p.linhas || []).map((l: any) => (
                        <li key={l.id}>
                          {l.descricao} · pedida {l.quantidadePedida} · recebida {l.quantidadeRecebida} · {l.status}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex flex-col gap-1 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {activeTab === "planeamento" ? "Planeamento por horizonte" : "Lista de compra / reposição"}
                </h2>
                <p className="text-sm text-slate-600">
                  Necessidade {horizon === "month" && selectedMonth ? formatMonth(selectedMonth) : horizon === "30d" ? "30 dias" : horizon === "12m" ? "12 meses" : "90 dias (pack + consumo)"}
                  {" · "}
                  stock vs comprar
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-800">Nec. {totals.necessidade}</span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">Stock {totals.stock}</span>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">Comprar {totals.comprar}</span>
                <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-indigo-800">{formatEur(totals.custo)}</span>
              </div>
            </div>

            {filteredRows.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">Nenhuma linha com os filtros atuais.</div>
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className={`min-w-full text-sm ${tableDensityClass}`}>
                  <thead>
                    <tr className="border-b border-slate-200 bg-white text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="sticky top-0 z-30 bg-white left-0 w-8 px-3 py-3 border-r border-slate-200" />
                      <th className="sticky top-0 z-30 bg-white left-8 px-3 py-3 border-r border-slate-200">Artigo</th>
                      {activeTab === "planeamento" && (
                        <>
                          <th className="sticky top-0 z-20 bg-white px-3 py-3 text-right">30d</th>
                          <th className="sticky top-0 z-20 bg-white px-3 py-3 text-right">90d</th>
                          <th className="sticky top-0 z-20 bg-white px-3 py-3 text-right">12m</th>
                        </>
                      )}
                      <th className="sticky top-0 z-20 bg-white px-3 py-3 text-right">Necessidade</th>
                      <th className="sticky top-0 z-20 bg-white px-3 py-3 text-right">Stock</th>
                      <th className="sticky top-0 z-20 bg-white px-3 py-3 text-right">Comprar</th>
                      <th className="sticky top-0 z-20 bg-white px-3 py-3 text-right">Saldo</th>
                      <th className="sticky top-0 z-20 bg-white px-3 py-3 text-right">Consumo 90d</th>
                      <th className="sticky top-0 z-20 bg-white px-3 py-3">Limite / planeamento</th>
                      <th className="sticky top-0 z-30 bg-white right-0 px-3 py-3 border-l border-slate-200">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => {
                      const tone = urgencyTone(row.comprar, row.saldo, row.orderLimitDate);
                      return (
                        <React.Fragment key={row.key}>
                          <tr
                            className={`border-b border-slate-100 bg-white align-top hover:bg-slate-50/80 ${
                              tone === "critical" ? "!bg-rose-50/40" : tone === "warn" ? "!bg-amber-50/30" : ""
                            }`}
                          >
                            <td className="sticky left-0 z-10 bg-inherit border-r border-slate-200 px-3 py-3">
                              <input
                                type="checkbox"
                                checked={selectedKeys.has(row.key)}
                                onChange={() => toggleSelect(row.key)}
                                className="rounded border-slate-300"
                              />
                            </td>
                            <td className="sticky left-8 z-10 bg-inherit border-r border-slate-200 px-3 py-3">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-semibold text-slate-900">{row.nome}</span>
                                <span className="font-mono text-[11px] text-slate-500">{row.referencia || "sem ref"}</span>
                                <span className="text-[11px] text-slate-400">
                                  {[row.fornecedor, row.categoria].filter(Boolean).join(" · ")}
                                </span>
                              </div>
                            </td>
                            {activeTab === "planeamento" && (
                              <>
                                <td className="px-3 py-3 text-right tabular-nums">{row.necessidade30d}</td>
                                <td className="px-3 py-3 text-right tabular-nums font-semibold">{row.necessidade90d}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{row.necessidade12m}</td>
                              </>
                            )}
                            <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{row.necessidade}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-slate-700">{row.stockAtual}</td>
                            <td className="px-3 py-3 text-right">
                              {row.comprar > 0 ? (
                                <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                                  +{row.comprar}
                                </span>
                              ) : (
                                <span className="text-emerald-600 font-semibold">0</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <span className={`inline-flex items-center gap-1 font-semibold tabular-nums ${row.saldo < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                                {row.saldo < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                                {row.saldo}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums text-slate-600">{row.consumoHistorico90d || 0}</td>
                            <td className="px-3 py-3">
                              <div className="flex max-w-[280px] flex-col gap-1.5">
                                {row.orderLimitDate && row.comprar > 0 && (
                                  <span className={`text-xs font-semibold ${tone === "critical" ? "text-rose-700" : "text-amber-800"}`}>
                                    Limite {new Date(row.orderLimitDate).toLocaleDateString("pt-PT")}
                                  </span>
                                )}
                                <div className="flex flex-wrap gap-1">
                                  {(row.mensal || []).slice(0, 6).map((item) => (
                                    <button
                                      key={`${row.key}-${item.month}`}
                                      type="button"
                                      onClick={() => {
                                        updateMonth(item.month);
                                        setExpandedKey(row.key);
                                      }}
                                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                        selectedMonth === item.month
                                          ? "border-blue-600 bg-blue-600 text-white"
                                          : "border-sky-200 bg-sky-50 text-sky-800"
                                      }`}
                                    >
                                      {formatMonth(item.month)} · {monthQty(item)}
                                    </button>
                                  ))}
                                </div>
                                {row.jangadasCount > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedKey((k) => (k === row.key ? null : row.key))}
                                    className="text-left text-[11px] font-medium text-blue-700 hover:underline"
                                  >
                                    {row.jangadasCount} jangada(s)
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="sticky right-0 z-10 bg-inherit border-l border-slate-200 px-3 py-3">
                              {row.stockMatched?.[0]?.id ? (
                                <Link
                                  href={`/stock/${row.stockMatched[0].id}`}
                                  className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                                >
                                  Ver stock
                                </Link>
                              ) : (
                                <Link
                                  href="/stock"
                                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  Catálogo
                                </Link>
                              )}
                            </td>
                          </tr>
                          {expandedKey === row.key && (
                            <tr className="border-b border-slate-100 bg-sky-50/50">
                              <td colSpan={activeTab === "planeamento" ? 12 : 9} className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  {(selectedMonth ? selectedMonthRafts(row) : []).length > 0
                                    ? selectedMonthRafts(row).map((j) => (
                                        <Link
                                          key={j.id}
                                          href={`/jangadas/${j.id}`}
                                          className="rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100"
                                        >
                                          <span className="font-bold">{j.serial}</span>
                                          {(j.brand || j.model) ? ` · ${[j.brand, j.model].filter(Boolean).join(" ")}` : ""}
                                        </Link>
                                      ))
                                    : (row.jangadasAfetadas || []).slice(0, 24).map((serial) => (
                                        <span
                                          key={serial}
                                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                                        >
                                          {serial}
                                        </span>
                                      ))}
                                </div>
                                {row.custo > 0 && (
                                  <p className="mt-2 text-xs text-slate-600">
                                    Custo estimado desta linha: <strong>{formatEur(row.custo)}</strong>
                                    {row.demandaAjustada90d != null && (
                                      <> · demanda ajustada 90d: <strong>{row.demandaAjustada90d}</strong></>
                                    )}
                                  </p>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {summary && (summary.artigosVencidos > 0 || (summary.cilindrosNecessarios30d || 0) > (summary.cilindrosCheiosDisponiveis30d || 0)) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>Atenção:</strong>{" "}
            {summary.artigosVencidos > 0 && `${summary.artigosVencidos} validade(s) de certificado vencida(s). `}
            {(summary.cilindrosNecessarios30d || 0) > (summary.cilindrosCheiosDisponiveis30d || 0) &&
              `Cilindros cheios insuficientes para as ${summary.cilindrosNecessarios30d} jangadas a 30 dias.`}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone: "sky" | "rose" | "amber" | "emerald" | "indigo";
}) {
  const tones: Record<string, string> = {
    sky: "border-sky-200/40 bg-white/10",
    rose: "border-rose-200/40 bg-white/10",
    amber: "border-amber-200/40 bg-white/10",
    emerald: "border-emerald-200/40 bg-white/10",
    indigo: "border-indigo-200/40 bg-white/10",
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/80">
        {icon}
        {label}
      </div>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-white">{value}</p>
    </div>
  );
}

export default function StockReposicoesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="text-center">
            <RefreshCw className="mx-auto h-8 w-8 animate-spin text-blue-600" />
            <p className="mt-4 text-sm text-slate-500">A carregar reposições...</p>
          </div>
        </div>
      }
    >
      <StockReposicoesPageInner />
    </Suspense>
  );
}
