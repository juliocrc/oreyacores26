"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Anchor,
  BarChart3,
  Boxes,
  CalendarClock,
  Download,
  Euro,
  FileCheck2,
  LifeBuoy,
  Loader2,
  Package,
  RefreshCcw,
  ShieldCheck,
  Ship,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import { Bar, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartOptions,
} from "chart.js";

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  PointElement,
  Tooltip,
);

const PALETTE = [
  "#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
  "#22c55e", "#e11d48",
];

type NamedTotal = { label: string; total: number };
type IlhaTotal = { ilha: string; total: number };
type DayTotal = { date: string; label: string; total: number };
type MonthBreakdown = {
  key: string;
  label: string;
  total: number;
  porMarca: NamedTotal[];
  porModelo: NamedTotal[];
  porTipoNavio: NamedTotal[];
};
type InspectionBreakdown = {
  total: number;
  porMes: NamedTotal[];
  porMarca: NamedTotal[];
  porModelo: NamedTotal[];
  porDia?: DayTotal[];
  porTipoNavio?: NamedTotal[];
  porMarcaModelo?: NamedTotal[];
  porMesDetalhe?: MonthBreakdown[];
};

type Estatisticas = {
  geradoEm: string;
  periodo?: { from: string | null; to: string | null };
  geral: {
    jangadas: number; navios: number; clientes: number; inspecoes: number;
    coletes: number; epirbs: number; fatos: number; extintores: number;
    stockItens: number; ordensServico: number; faturaTotal: number; servicos: number;
  };
  jangadas: {
    total: number;
    porMarca: NamedTotal[];
    porModelo: NamedTotal[];
    porMarcaModelo: NamedTotal[];
    porLotacao: { lotacao: number; total: number }[];
    porPackType: NamedTotal[];
    porIlha: IlhaTotal[];
    semNavio: number;
    conformidade: { conformes: number; expirarBreve: number; naoConformes: number; semArtigos: number };
    inspecionadas: InspectionBreakdown;
  };
  navios: { total: number; porIlha: IlhaTotal[] };
  inspecoes: {
    total: number; anoAtual: number; mesAtual: number;
    tipo: { jangadas: number; coletes: number; outros: number };
    hoje: { total: number; jangadas: number; coletes: number };
    porMes: NamedTotal[]; porAno: { ano: string; total: number }[]; porStatus: NamedTotal[];
    porDia: DayTotal[]; diasMais: DayTotal[]; diasMenos: DayTotal[];
  };
  ordens: {
    total: number;
    porStatus: NamedTotal[];
    porTipo: NamedTotal[];
    porPrioridade: NamedTotal[];
    porMes: NamedTotal[];
    porEstacao: { nome: string; total: number; valor: number }[];
    tecnicos: { nome: string; total: number; concluidas: number; faturado: number }[];
  };
  faturacao: {
    total: number; totalIva: number; isenta: number; anoAtual: number; mesAtual: number;
    porMes: NamedTotal[]; porAno: { ano: string; total: number }[];
    porPagamento: { status: string; total: number; valor: number }[];
    topClientes: { nome: string; total: number; valor: number }[];
  };
  stock: {
    total: number; valorCompra: number; valorVenda: number; emRutura: number;
    abaixoMinimo: number; vencido: number;
    porCategoria: { categoria: string; total: number; valorVenda: number }[];
    movimentos: { label: string; entradas: number; saidas: number }[];
  };
  clientes: { total: number; semContacto: number };
  coletesInspecionados: InspectionBreakdown;
  artigos: {
    substituidosTotal: number;
    substituidosPorMes: NamedTotal[];
    substituidosPorReferencia: NamedTotal[];
  };
  validadesEquipamentos: Record<string, { total: number; a30: number; a60: number; a90: number }>;
  certificados: { total: number; a30: number; a60: number; a90: number };
};

const fmtEur = (v: number) => `${Number(v || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fmtNum = (v: number) => Number(v || 0).toLocaleString("pt-PT");

const TABS = [
  { key: "visao", label: "Visão Geral", icon: BarChart3 },
  { key: "frota", label: "Frota & Jangadas", icon: Ship },
  { key: "inspecoes", label: "Inspeções", icon: FileCheck2 },
  { key: "operacoes", label: "Operações & Técnicos", icon: Wrench },
  { key: "faturacao", label: "Faturação", icon: Euro },
  { key: "stock", label: "Stock", icon: Boxes },
  { key: "validades", label: "Validades", icon: CalendarClock },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const PERIOD_PRESETS = [
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
  { key: "12m", label: "12 meses" },
  { key: "ano", label: "Ano atual" },
  { key: "tudo", label: "Tudo" },
] as const;

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function EstatisticasPage() {
  const [data, setData] = useState<Estatisticas | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("visao");
  const [period, setPeriod] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [draft, setDraft] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [preset, setPreset] = useState<string>("tudo");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (period.from) params.set("from", period.from);
      if (period.to) params.set("to", period.to);
      const qs = params.toString();
      const res = await fetch(`/api/estatisticas${qs ? `?${qs}` : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Falha ao carregar estatísticas");
      setData((await res.json()) as Estatisticas);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyPreset = useCallback((key: string) => {
    setPreset(key);
    const now = new Date();
    let from = "";
    let to = "";
    if (key === "30d") {
      const s = new Date();
      s.setDate(s.getDate() - 29);
      from = isoDay(s);
      to = isoDay(now);
    } else if (key === "90d") {
      const s = new Date();
      s.setDate(s.getDate() - 89);
      from = isoDay(s);
      to = isoDay(now);
    } else if (key === "12m") {
      from = isoDay(new Date(now.getFullYear(), now.getMonth() - 11, 1));
      to = isoDay(now);
    } else if (key === "ano") {
      from = isoDay(new Date(now.getFullYear(), 0, 1));
      to = isoDay(now);
    }
    setDraft({ from, to });
    setPeriod({ from, to });
  }, []);

  const applyCustom = useCallback(() => {
    setPreset("custom");
    setPeriod({ from: draft.from, to: draft.to });
  }, [draft]);

  const periodLabel = useMemo(() => {
    if (!period.from && !period.to) return "todo o histórico";
    return `${period.from || "início"} até ${period.to || "hoje"}`;
  }, [period]);

  const exportCsv = useCallback(() => {
    if (!data) return;
    const rows: string[][] = [["Secção", "Métrica", "Valor"]];
    const push = (sec: string, k: string, v: string | number) => rows.push([sec, k, String(v)]);
    const g = data.geral;
    push("Geral", "Período", periodLabel);
    push("Geral", "Jangadas", g.jangadas);
    push("Geral", "Navios", g.navios);
    push("Geral", "Clientes", g.clientes);
    push("Geral", "Inspeções", g.inspecoes);
    push("Geral", "Ordens de Serviço", g.ordensServico);
    push("Geral", "Faturação Total", g.faturaTotal);
    push("Jangadas", "Conformes", data.jangadas.conformidade.conformes);
    push("Jangadas", "Expirar Breve", data.jangadas.conformidade.expirarBreve);
    push("Jangadas", "Não Conformes", data.jangadas.conformidade.naoConformes);
    push("Jangadas", "Sem Artigos", data.jangadas.conformidade.semArtigos);
    data.jangadas.porMarca.forEach((m) => push("Jangadas por Marca", m.label, m.total));
    data.jangadas.porMarcaModelo.forEach((m) => push("Jangadas por Marca + Modelo", m.label, m.total));
    data.jangadas.inspecionadas.porMes.forEach((m) => push("Jangadas Inspecionadas por Mês", m.label, m.total));
    data.jangadas.inspecionadas.porMarca.forEach((m) => push("Jangadas Inspecionadas por Marca", m.label, m.total));
    data.jangadas.inspecionadas.porModelo.forEach((m) => push("Jangadas Inspecionadas por Modelo", m.label, m.total));
    data.coletesInspecionados.porMes.forEach((m) => push("Coletes Inspecionados por Mês", m.label, m.total));
    data.coletesInspecionados.porMarca.forEach((m) => push("Coletes Inspecionados por Marca", m.label, m.total));
    data.coletesInspecionados.porModelo.forEach((m) => push("Coletes Inspecionados por Modelo", m.label, m.total));
    data.artigos.substituidosPorReferencia.forEach((m) => push("Artigos Substituídos por Referência", m.label, m.total));
    push("Artigos Substituídos", "Total", data.artigos.substituidosTotal);
    data.inspecoes.porMes.forEach((m) => push("Inspeções por Mês", m.label, m.total));
    data.faturacao.porMes.forEach((m) => push("Faturação por Mês", m.label, m.total));
    data.stock.porCategoria.forEach((c) => push("Stock por Categoria", c.categoria, c.total));
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `estatisticas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, periodLabel]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-2.5 text-indigo-600">
              <Activity size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-800">Estatísticas & Business Intelligence</h1>
              <p className="text-xs text-slate-500">
                Indicadores operacionais, financeiros e de conformidade · período: {periodLabel}
                {data ? ` · atualizado ${new Date(data.geradoEm).toLocaleString("pt-PT")}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              disabled={!data}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
            >
              <Download size={14} /> Exportar CSV
            </button>
            <button
              onClick={() => void load()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />} Atualizar
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                  active
                    ? "bg-indigo-600 text-white shadow"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Período</span>
          {PERIOD_PRESETS.map((p) => {
            const active = preset === p.key;
            return (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                {p.label}
              </button>
            );
          })}
          <span className="hidden sm:inline mx-1 text-slate-200">|</span>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            De
            <input
              type="date"
              value={draft.from}
              max={draft.to || undefined}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            Até
            <input
              type="date"
              value={draft.to}
              min={draft.from || undefined}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
            />
          </label>
          <button
            onClick={applyCustom}
            className="rounded-lg border border-indigo-200 bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 transition"
          >
            Aplicar
          </button>
        </div>
      </header>

      <main className="p-6">
        {loading && !data ? (
          <div className="flex h-64 items-center justify-center text-slate-500">
            <Loader2 className="mr-2 animate-spin" size={20} /> A compilar estatísticas...
          </div>
        ) : error ? (
          <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700">
            <AlertTriangle className="mx-auto mb-2" />
            {error}
            <div className="mt-3">
              <button onClick={() => void load()} className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white">
                Tentar novamente
              </button>
            </div>
          </div>
        ) : data ? (
          <div className="space-y-6">
            {tab === "visao" && <VisaoGeral data={data} />}
            {tab === "frota" && <Frota data={data} />}
            {tab === "inspecoes" && <Inspecoes data={data} />}
            {tab === "operacoes" && <Operacoes data={data} />}
            {tab === "faturacao" && <Faturacao data={data} />}
            {tab === "stock" && <Stock data={data} />}
            {tab === "validades" && <Validades data={data} />}
          </div>
        ) : null}
      </main>
    </div>
  );
}

// ── Reusable UI ───────────────────────────────────────────────

function StatCard({
  title, value, subtitle, icon: Icon, tone = "indigo",
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ComponentType<{ size?: number }>;
  tone?: "indigo" | "emerald" | "amber" | "rose" | "sky" | "violet";
}) {
  const tones: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    rose: "bg-rose-50 text-rose-600 border-rose-100",
    sky: "bg-sky-50 text-sky-600 border-sky-100",
    violet: "bg-violet-50 text-violet-600 border-violet-100",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-black text-slate-800 font-mono">{value}</p>
          {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        <div className={`rounded-xl border p-2.5 ${tones[tone]}`}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children, height = 300 }: { title: string; subtitle?: string; children: ReactNode; height?: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

function Panel({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {actions}
      </div>
      {children}
    </div>
  );
}

const barOptions: ChartOptions<"bar"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { display: false }, ticks: { color: "#94a3b8", font: { size: 10 } } },
    y: { grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#94a3b8", font: { size: 10 } }, beginAtZero: true },
  },
};

const doughnutOptions: ChartOptions<"doughnut"> = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: "62%",
  plugins: { legend: { position: "bottom", labels: { color: "#64748b", font: { size: 11 }, boxWidth: 12 } } },
};

function doughnutData(items: NamedTotal[]) {
  return {
    labels: items.map((i) => i.label),
    datasets: [
      {
        data: items.map((i) => i.total),
        backgroundColor: items.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 2,
        borderColor: "#fff",
      },
    ],
  };
}

function JangadasInspecionadasPanel({ breakdown }: { breakdown: InspectionBreakdown }) {
  const months = (breakdown.porMesDetalhe ?? []).filter((m) => m.total > 0);
  const [selected, setSelected] = useState("");
  const detail = months.find((m) => m.key === selected) ?? null;
  return (
    <>
      <ChartCard title="Jangadas inspecionadas por mês" subtitle="Período selecionado" height={300}>
        <Bar
          options={barOptions}
          data={{
            labels: breakdown.porMes.map((m) => m.label),
            datasets: [{ data: breakdown.porMes.map((m) => m.total), backgroundColor: "#0ea5e9", borderRadius: 4 }],
          }}
        />
      </ChartCard>

      <Panel
        title="Jangadas inspecionadas — detalhe por mês"
        actions={
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-indigo-400"
          >
            <option value="">Escolher mês…</option>
            {months.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label} ({m.total})
              </option>
            ))}
          </select>
        }
      >
        {detail ? (
          <div className="space-y-4 p-5">
            <p className="text-sm text-slate-600">
              <b>{fmtNum(detail.total)}</b> jangadas inspecionadas em <b>{detail.label}</b>.
            </p>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Marca</h4>
                <TableCount rows={detail.porMarca} labelHeader="Marca" />
              </div>
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Modelo</h4>
                <TableCount rows={detail.porModelo} labelHeader="Modelo" />
              </div>
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Tipo de navio</h4>
                <TableCount rows={detail.porTipoNavio} labelHeader="Tipo" />
              </div>
            </div>
          </div>
        ) : (
          <p className="p-5 text-sm text-slate-500">Escolhe um mês para ver marcas, modelos e tipos de navio.</p>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Jangadas inspecionadas por marca">
          <TableCount rows={breakdown.porMarca} labelHeader="Marca" />
        </Panel>
        <Panel title="Jangadas inspecionadas por modelo">
          <TableCount rows={breakdown.porModelo} labelHeader="Modelo" />
        </Panel>
        <Panel title="Jangadas inspecionadas por tipo de navio">
          <TableCount rows={breakdown.porTipoNavio ?? []} labelHeader="Tipo" />
        </Panel>
      </div>
    </>
  );
}

function ColetesInspecionadosPanel({ breakdown }: { breakdown: InspectionBreakdown }) {
  return (
    <>
      <ChartCard title="Coletes inspecionados por mês" subtitle="Período selecionado" height={300}>
        <Bar
          options={barOptions}
          data={{
            labels: breakdown.porMes.map((m) => m.label),
            datasets: [{ data: breakdown.porMes.map((m) => m.total), backgroundColor: "#10b981", borderRadius: 4 }],
          }}
        />
      </ChartCard>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Coletes inspecionados por marca">
          <TableCount rows={breakdown.porMarca} labelHeader="Marca" />
        </Panel>
        <Panel title="Coletes inspecionados por modelo">
          <TableCount rows={breakdown.porModelo} labelHeader="Modelo" />
        </Panel>
        <Panel title="Coletes inspecionados por marca + modelo">
          <TableCount rows={breakdown.porMarcaModelo ?? []} labelHeader="Marca · Modelo" />
        </Panel>
      </div>
    </>
  );
}

// ── Tabs ──────────────────────────────────────────────────────

function VisaoGeral({ data }: { data: Estatisticas }) {
  const g = data.geral;
  const conformidade = data.jangadas.conformidade;
  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Jangadas" value={fmtNum(g.jangadas)} subtitle={`${fmtNum(data.jangadas.semNavio)} sem navio`} icon={LifeBuoy} tone="indigo" />
        <StatCard title="Navios / Clientes" value={`${fmtNum(g.navios)} / ${fmtNum(g.clientes)}`} subtitle={`${fmtNum(data.clientes.semContacto)} clientes sem contacto`} icon={Ship} tone="sky" />
        <StatCard title="Inspeções" value={fmtNum(g.inspecoes)} subtitle={`${fmtNum(data.inspecoes.anoAtual)} no ano · ${fmtNum(data.inspecoes.mesAtual)} no mês`} icon={FileCheck2} tone="emerald" />
        <StatCard title="Faturação Total" value={fmtEur(g.faturaTotal)} subtitle={`${fmtEur(data.faturacao.anoAtual)} no ano`} icon={Euro} tone="violet" />
        <StatCard title="Ordens de Serviço" value={fmtNum(g.ordensServico)} subtitle={`${data.ordens.tecnicos.length} técnicos`} icon={Wrench} tone="amber" />
        <StatCard title="Stock" value={fmtNum(g.stockItens)} subtitle={`Valor venda ${fmtEur(data.stock.valorVenda)}`} icon={Package} tone="indigo" />
        <StatCard title="Conformidade Jangadas" value={`${conformidade.conformes}/${data.jangadas.total}`} subtitle={`${conformidade.naoConformes} não conformes · ${conformidade.expirarBreve} a expirar`} icon={ShieldCheck} tone={conformidade.naoConformes > 0 ? "rose" : "emerald"} />
        <StatCard title="Alertas Validade (90d)" value={fmtNum(data.certificados.a90)} subtitle="Certificados a vencer" icon={AlertTriangle} tone="rose" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Inspeções por mês" subtitle="Período selecionado" height={300}>
            <Bar
              options={barOptions}
              data={{
                labels: data.inspecoes.porMes.map((m) => m.label),
                datasets: [
                  {
                    data: data.inspecoes.porMes.map((m) => m.total),
                    backgroundColor: "#4f46e5",
                    borderRadius: 4,
                  },
                ],
              }}
            />
          </ChartCard>
        </div>
        <ChartCard title="Conformidade das jangadas" subtitle="Estado dos artigos" height={300}>
          <Doughnut
            options={doughnutOptions}
            data={doughnutData([
              { label: "Conformes", total: conformidade.conformes },
              { label: "A expirar", total: conformidade.expirarBreve },
              { label: "Não conformes", total: conformidade.naoConformes },
              { label: "Sem artigos", total: conformidade.semArtigos },
            ])}
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Faturação por mês" subtitle="Período selecionado (€)" height={300}>
          <Bar
            options={barOptions}
            data={{
              labels: data.faturacao.porMes.map((m) => m.label),
              datasets: [{ data: data.faturacao.porMes.map((m) => m.total), backgroundColor: "#10b981", borderRadius: 4 }],
            }}
          />
        </ChartCard>
        <ChartCard title="Jangadas por ilha" subtitle="Distribuição geográfica" height={300}>
          <Bar
            options={barOptions}
            data={{
              labels: data.jangadas.porIlha.map((i) => i.ilha),
              datasets: [{ data: data.jangadas.porIlha.map((i) => i.total), backgroundColor: "#0ea5e9", borderRadius: 4 }],
            }}
          />
        </ChartCard>
      </div>
    </>
  );
}

function Frota({ data }: { data: Estatisticas }) {
  const top = (n: number) => data.jangadas.porMarca.slice(0, n);
  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Jangadas" value={fmtNum(data.jangadas.total)} icon={LifeBuoy} tone="indigo" />
        <StatCard title="Marcas" value={fmtNum(data.jangadas.porMarca.length)} icon={Boxes} tone="sky" />
        <StatCard title="Modelos" value={fmtNum(data.jangadas.porModelo.length)} icon={Boxes} tone="violet" />
        <StatCard title="Sem Navio" value={fmtNum(data.jangadas.semNavio)} icon={AlertTriangle} tone="amber" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Jangadas por marca" subtitle="Top 12" height={340}>
          <Bar
            options={{ ...barOptions, indexAxis: "y" as const }}
            data={{
              labels: top(12).map((m) => m.label),
              datasets: [{ data: top(12).map((m) => m.total), backgroundColor: "#6366f1", borderRadius: 4 }],
            }}
          />
        </ChartCard>
        <ChartCard title="Jangadas por lotação" subtitle="Nº de pessoas" height={340}>
          <Bar
            options={barOptions}
            data={{
              labels: data.jangadas.porLotacao.map((l) => String(l.lotacao)),
              datasets: [{ data: data.jangadas.porLotacao.map((l) => l.total), backgroundColor: "#f59e0b", borderRadius: 4 }],
            }}
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Top marcas">
          <TableCount rows={data.jangadas.porMarca.slice(0, 15)} labelHeader="Marca" />
        </Panel>
        <Panel title="Top tipo de pack">
          <TableCount rows={data.jangadas.porPackType.slice(0, 15)} labelHeader="Pack" />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Jangadas por marca + modelo" subtitle="Top 12" height={380}>
          <Bar
            options={{ ...barOptions, indexAxis: "y" as const }}
            data={{
              labels: data.jangadas.porMarcaModelo.slice(0, 12).map((m) => m.label),
              datasets: [{ data: data.jangadas.porMarcaModelo.slice(0, 12).map((m) => m.total), backgroundColor: "#8b5cf6", borderRadius: 4 }],
            }}
          />
        </ChartCard>
        <Panel title="Top marca + modelo">
          <TableCount rows={data.jangadas.porMarcaModelo.slice(0, 15)} labelHeader="Marca · Modelo" />
        </Panel>
      </div>
    </>
  );
}

function Inspecoes({ data }: { data: Estatisticas }) {
  const ins = data.inspecoes;
  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Inspeções" value={fmtNum(ins.total)} subtitle={`${fmtNum(ins.tipo.jangadas)} jangadas · ${fmtNum(ins.tipo.coletes)} coletes`} icon={FileCheck2} tone="indigo" />
        <StatCard title="Jangadas Inspecionadas" value={fmtNum(data.jangadas.inspecionadas.total)} icon={LifeBuoy} tone="sky" />
        <StatCard title="Coletes Inspecionados" value={fmtNum(data.coletesInspecionados.total)} icon={ShieldCheck} tone="emerald" />
        <StatCard title="Hoje" value={fmtNum(ins.hoje.total)} subtitle={`${fmtNum(ins.hoje.jangadas)} jangadas · ${fmtNum(ins.hoje.coletes)} coletes`} icon={CalendarClock} tone="violet" />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Ano Atual" value={fmtNum(ins.anoAtual)} icon={TrendingUp} tone="emerald" />
        <StatCard title="Mês Atual" value={fmtNum(ins.mesAtual)} icon={CalendarClock} tone="sky" />
        <StatCard title="Inspeções a Jangadas" value={fmtNum(ins.tipo.jangadas)} icon={LifeBuoy} tone="indigo" />
        <StatCard title="Inspeções a Coletes" value={fmtNum(ins.tipo.coletes)} icon={ShieldCheck} tone="amber" />
      </div>

      <ChartCard title="Evolução de inspeções" subtitle="Período selecionado" height={320}>
        <Bar
          options={barOptions}
          data={{
            labels: ins.porMes.map((m) => m.label),
            datasets: [{ data: ins.porMes.map((m) => m.total), backgroundColor: "#0ea5e9", borderRadius: 4 }],
          }}
        />
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Inspeções por ano" height={300}>
          <Bar
            options={barOptions}
            data={{
              labels: ins.porAno.map((a) => a.ano),
              datasets: [{ data: ins.porAno.map((a) => a.total), backgroundColor: "#4f46e5", borderRadius: 4 }],
            }}
          />
        </ChartCard>
        <ChartCard title="Inspeções por estado" height={300}>
          <Doughnut options={doughnutOptions} data={doughnutData(ins.porStatus)} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Inspeções por dia" subtitle="Período selecionado" height={320}>
          <Bar
            options={barOptions}
            data={{
              labels: ins.porDia.map((d) => d.label),
              datasets: [{ data: ins.porDia.map((d) => d.total), backgroundColor: "#6366f1", borderRadius: 3 }],
            }}
          />
        </ChartCard>
        <div className="grid grid-cols-1 gap-6">
          <Panel title="Dias com mais inspeções">
            <TableCount rows={ins.diasMais} labelHeader="Dia" />
          </Panel>
          <Panel title="Dias com menos inspeções">
            <TableCount rows={ins.diasMenos} labelHeader="Dia" />
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Artigos Substituídos" value={fmtNum(data.artigos.substituidosTotal)} icon={Package} tone="amber" />
      </div>

      <div className="pt-2">
        <h3 className="text-sm font-bold text-slate-700">Jangadas inspecionadas</h3>
        <p className="text-xs text-slate-500">Número de jangadas inspecionadas por mês, marca, modelo e tipo de navio.</p>
      </div>
      <JangadasInspecionadasPanel breakdown={data.jangadas.inspecionadas} />

      <div className="pt-2">
        <h3 className="text-sm font-bold text-slate-700">Coletes inspecionados</h3>
        <p className="text-xs text-slate-500">Número de coletes inspecionados por mês, marca e modelo.</p>
      </div>
      <ColetesInspecionadosPanel breakdown={data.coletesInspecionados} />

      <div className="pt-2">
        <h3 className="text-sm font-bold text-slate-700">Artigos substituídos</h3>
        <p className="text-xs text-slate-500">Artigos trocados nas inspeções, por mês e por referência.</p>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Artigos substituídos por mês" subtitle="Período selecionado" height={300}>
          <Bar
            options={barOptions}
            data={{
              labels: data.artigos.substituidosPorMes.map((m) => m.label),
              datasets: [{ data: data.artigos.substituidosPorMes.map((m) => m.total), backgroundColor: "#f59e0b", borderRadius: 4 }],
            }}
          />
        </ChartCard>
        <Panel title="Top artigos substituídos">
          <TableCount rows={data.artigos.substituidosPorReferencia.slice(0, 15)} labelHeader="Referência" />
        </Panel>
      </div>
    </>
  );
}

function Operacoes({ data }: { data: Estatisticas }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Ordens de Serviço" value={fmtNum(data.ordens.total)} icon={Wrench} tone="indigo" />
        <StatCard title="Tipos" value={fmtNum(data.ordens.porTipo.length)} icon={Boxes} tone="sky" />
        <StatCard title="Técnicos" value={fmtNum(data.ordens.tecnicos.length)} icon={Users} tone="emerald" />
        <StatCard title="Estações" value={fmtNum(data.ordens.porEstacao.length)} icon={Anchor} tone="violet" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Ordens abertas por mês" subtitle="Período selecionado" height={300}>
          <Bar
            options={barOptions}
            data={{
              labels: data.ordens.porMes.map((m) => m.label),
              datasets: [
                {
                  data: data.ordens.porMes.map((m) => m.total),
                  backgroundColor: "#f59e0b",
                  borderRadius: 4,
                },
              ],
            }}
          />
        </ChartCard>
        <ChartCard title="Ordens por estado" height={300}>
          <Doughnut options={doughnutOptions} data={doughnutData(data.ordens.porStatus)} />
        </ChartCard>
      </div>

      <Panel title="Produtividade por técnico">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-bold uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3">Técnico</th>
                <th className="px-5 py-3 text-center">Total OT</th>
                <th className="px-5 py-3 text-center">Concluídas</th>
                <th className="px-5 py-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.ordens.tecnicos.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-400">Sem dados</td></tr>
              ) : (
                data.ordens.tecnicos.map((t) => (
                  <tr key={t.nome} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-semibold text-slate-700">{t.nome}</td>
                    <td className="px-5 py-3 text-center font-mono">{fmtNum(t.total)}</td>
                    <td className="px-5 py-3 text-center font-mono text-emerald-600">{fmtNum(t.concluidas)}</td>
                    <td className="px-5 py-3 text-right font-mono">{fmtEur(t.faturado)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Ordens por estação de serviço">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-bold uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3">Estação</th>
                <th className="px-5 py-3 text-center">Total OT</th>
                <th className="px-5 py-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.ordens.porEstacao.map((e) => (
                <tr key={e.nome} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-semibold text-slate-700">{e.nome}</td>
                  <td className="px-5 py-3 text-center font-mono">{fmtNum(e.total)}</td>
                  <td className="px-5 py-3 text-right font-mono">{fmtEur(e.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function Faturacao({ data }: { data: Estatisticas }) {
  const f = data.faturacao;
  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Faturação Total" value={fmtEur(f.total)} icon={Euro} tone="emerald" />
        <StatCard title="Ano Atual" value={fmtEur(f.anoAtual)} icon={TrendingUp} tone="indigo" />
        <StatCard title="Mês Atual" value={fmtEur(f.mesAtual)} icon={CalendarClock} tone="sky" />
        <StatCard title="IVA Liquidado" value={fmtEur(f.totalIva)} subtitle={`Isento ${fmtEur(f.isenta)}`} icon={FileCheck2} tone="violet" />
      </div>

      <ChartCard title="Faturação por mês" subtitle="Período selecionado (€)" height={320}>
        <Bar
          options={barOptions}
          data={{
            labels: f.porMes.map((m) => m.label),
            datasets: [{ data: f.porMes.map((m) => m.total), backgroundColor: "#10b981", borderRadius: 4 }],
          }}
        />
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Faturação por ano (€)" height={300}>
          <Bar
            options={barOptions}
            data={{
              labels: f.porAno.map((a) => a.ano),
              datasets: [{ data: f.porAno.map((a) => a.total), backgroundColor: "#0ea5e9", borderRadius: 4 }],
            }}
          />
        </ChartCard>
        <ChartCard title="Estado de pagamento" subtitle="Valor por estado" height={300}>
          <Doughnut
            options={doughnutOptions}
            data={{
              labels: f.porPagamento.map((p) => p.status),
              datasets: [
                {
                  data: f.porPagamento.map((p) => p.valor),
                  backgroundColor: f.porPagamento.map((_, i) => PALETTE[i % PALETTE.length]),
                  borderWidth: 2,
                  borderColor: "#fff",
                },
              ],
            }}
          />
        </ChartCard>
      </div>

      <Panel title="Top clientes por faturação">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-bold uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3 text-center">Faturas</th>
                <th className="px-5 py-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {f.topClientes.length === 0 ? (
                <tr><td colSpan={3} className="px-5 py-6 text-center text-slate-400">Sem dados</td></tr>
              ) : (
                f.topClientes.map((c) => (
                  <tr key={c.nome} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-semibold text-slate-700">{c.nome}</td>
                    <td className="px-5 py-3 text-center font-mono">{fmtNum(c.total)}</td>
                    <td className="px-5 py-3 text-right font-mono">{fmtEur(c.valor)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function Stock({ data }: { data: Estatisticas }) {
  const s = data.stock;
  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Itens em Stock" value={fmtNum(s.total)} icon={Package} tone="indigo" />
        <StatCard title="Valor de Venda" value={fmtEur(s.valorVenda)} subtitle={`Compra ${fmtEur(s.valorCompra)}`} icon={Euro} tone="emerald" />
        <StatCard title="Em Rutura" value={fmtNum(s.emRutura)} subtitle={`${fmtNum(s.abaixoMinimo)} abaixo do mínimo`} icon={AlertTriangle} tone="rose" />
        <StatCard title="Vencidos" value={fmtNum(s.vencido)} icon={CalendarClock} tone="amber" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Movimentos de stock" subtitle="Entradas vs saídas no período" height={320}>
          <Bar
            options={{
              ...barOptions,
              plugins: { legend: { display: true, position: "bottom", labels: { color: "#64748b", font: { size: 11 }, boxWidth: 12 } } },
            }}
            data={{
              labels: s.movimentos.map((m) => m.label),
              datasets: [
                { label: "Entradas", data: s.movimentos.map((m) => m.entradas), backgroundColor: "#10b981", borderRadius: 4 },
                { label: "Saídas", data: s.movimentos.map((m) => m.saidas), backgroundColor: "#ef4444", borderRadius: 4 },
              ],
            }}
          />
        </ChartCard>
        <ChartCard title="Valor por categoria (€)" height={320}>
          <Bar
            options={{ ...barOptions, indexAxis: "y" as const }}
            data={{
              labels: s.porCategoria.slice(0, 12).map((c) => c.categoria),
              datasets: [{ data: s.porCategoria.slice(0, 12).map((c) => c.valorVenda), backgroundColor: "#6366f1", borderRadius: 4 }],
            }}
          />
        </ChartCard>
      </div>

      <Panel title="Categorias de stock">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-bold uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3">Categoria</th>
                <th className="px-5 py-3 text-center">Itens</th>
                <th className="px-5 py-3 text-right">Valor Venda</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {s.porCategoria.map((c) => (
                <tr key={c.categoria} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-semibold text-slate-700">{c.categoria}</td>
                  <td className="px-5 py-3 text-center font-mono">{fmtNum(c.total)}</td>
                  <td className="px-5 py-3 text-right font-mono">{fmtEur(c.valorVenda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function Validades({ data }: { data: Estatisticas }) {
  const rows = useMemo(
    () => [
      { key: "coletes", label: "Coletes", ...data.validadesEquipamentos.coletes },
      { key: "epirbs", label: "EPIRBs", ...data.validadesEquipamentos.epirbs },
      { key: "fatos", label: "Fatos de Imersão", ...data.validadesEquipamentos.fatos },
      { key: "extintores", label: "Extintores (Recarga)", ...data.validadesEquipamentos.extintores },
      { key: "extintoresHidraulico", label: "Extintores (Prova Hidráulica)", ...data.validadesEquipamentos.extintoresHidraulico },
    ],
    [data],
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Certificados" value={fmtNum(data.certificados.total)} subtitle={`${fmtNum(data.certificados.a90)} a vencer em 90d`} icon={FileCheck2} tone="indigo" />
        <StatCard title="Certificados ≤30d" value={fmtNum(data.certificados.a30)} icon={AlertTriangle} tone="rose" />
        <StatCard title="Certificados ≤60d" value={fmtNum(data.certificados.a60)} icon={CalendarClock} tone="amber" />
        <StatCard title="Certificados ≤90d" value={fmtNum(data.certificados.a90)} icon={CalendarClock} tone="sky" />
      </div>

      <ChartCard title="Equipamentos a vencer" subtitle="Nº de equipamentos com validade nos próximos 30/60/90 dias" height={320}>
        <Bar
          options={{
            ...barOptions,
            plugins: { legend: { display: true, position: "bottom", labels: { color: "#64748b", font: { size: 11 }, boxWidth: 12 } } },
          }}
          data={{
            labels: rows.map((r) => r.label),
            datasets: [
              { label: "≤ 30d", data: rows.map((r) => r.a30), backgroundColor: "#ef4444", borderRadius: 4 },
              { label: "≤ 60d", data: rows.map((r) => r.a60), backgroundColor: "#f59e0b", borderRadius: 4 },
              { label: "≤ 90d", data: rows.map((r) => r.a90), backgroundColor: "#0ea5e9", borderRadius: 4 },
            ],
          }}
        />
      </ChartCard>

      <Panel title="Detalhe por equipamento">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-bold uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3">Equipamento</th>
                <th className="px-5 py-3 text-center">Total</th>
                <th className="px-5 py-3 text-center">≤ 30d</th>
                <th className="px-5 py-3 text-center">≤ 60d</th>
                <th className="px-5 py-3 text-center">≤ 90d</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.key} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-semibold text-slate-700">{r.label}</td>
                  <td className="px-5 py-3 text-center font-mono">{fmtNum(r.total)}</td>
                  <td className="px-5 py-3 text-center font-mono text-rose-600">{fmtNum(r.a30)}</td>
                  <td className="px-5 py-3 text-center font-mono text-amber-600">{fmtNum(r.a60)}</td>
                  <td className="px-5 py-3 text-center font-mono text-sky-600">{fmtNum(r.a90)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function TableCount({ rows, labelHeader }: { rows: NamedTotal[]; labelHeader: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-bold uppercase tracking-wider text-slate-400">
            <th className="px-5 py-3">{labelHeader}</th>
            <th className="px-5 py-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr><td colSpan={2} className="px-5 py-6 text-center text-slate-400">Sem dados</td></tr>
          ) : (
            rows.map((r) => (
              <tr key={r.label} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-semibold text-slate-700">{r.label}</td>
                <td className="px-5 py-3 text-right font-mono">{fmtNum(r.total)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
