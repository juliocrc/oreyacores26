"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Anchor, Ship, Calendar, Plus, Search, MapPin, Clock, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { formatDateTime } from "@/lib/date-utils";

type Escala = {
  id: number;
  navioNome: string;
  matricula: string | null;
  tipoCarga: string | null;
  armador: string | null;
  cais: string | null;
  dataChegada: string | null;
  dataPartida: string | null;
  origemDestino: string | null;
  estado: string;
  observacoes: string | null;
};

type ArrivalBucket =
  | "hoje"
  | "amanha"
  | "2-3"
  | "semana"
  | "mais-tarde"
  | "atracado"
  | "atrasado"
  | "partido"
  | "cancelado"
  | "sem-data";

const DAY_MS = 86_400_000;
const AZORES_TZ = "Atlantic/Azores";

const ARRIVAL_STYLES: Record<ArrivalBucket, {
  label: string;
  dot: string;
  border: string;
  bg: string;
  text: string;
}> = {
  hoje: { label: "Chega hoje", dot: "bg-rose-600", border: "#e11d48", bg: "bg-rose-50", text: "text-rose-700" },
  amanha: { label: "Chega amanhã", dot: "bg-amber-500", border: "#f59e0b", bg: "bg-amber-50", text: "text-amber-700" },
  "2-3": { label: "Em 2–3 dias", dot: "bg-sky-600", border: "#0284c7", bg: "bg-sky-50", text: "text-sky-700" },
  semana: { label: "Esta semana", dot: "bg-emerald-600", border: "#059669", bg: "bg-emerald-50", text: "text-emerald-700" },
  "mais-tarde": { label: "Mais tarde", dot: "bg-slate-500", border: "#94a3b8", bg: "bg-slate-50", text: "text-slate-600" },
  atracado: { label: "Atracado", dot: "bg-emerald-500", border: "#10b981", bg: "bg-emerald-50", text: "text-emerald-700" },
  atrasado: { label: "ETA ultrapassada", dot: "bg-orange-600", border: "#ea580c", bg: "bg-orange-50", text: "text-orange-700" },
  partido: { label: "Partido", dot: "bg-slate-400", border: "#cbd5e1", bg: "bg-slate-50", text: "text-slate-500" },
  cancelado: { label: "Cancelado", dot: "bg-red-400", border: "#f87171", bg: "bg-red-50", text: "text-red-600" },
  "sem-data": { label: "Sem data", dot: "bg-slate-300", border: "#cbd5e1", bg: "bg-slate-50", text: "text-slate-500" },
};

function azoresDayKey(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AZORES_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = azoresDayKey(new Date());
  const target = azoresDayKey(date);
  return Math.round((Date.parse(`${target}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY_MS);
}

function arrivalBucket(escala: Escala): ArrivalBucket {
  if (escala.estado === "Cancelado") return "cancelado";
  if (escala.estado === "Partido") return "partido";
  if (escala.estado === "Atracado") return "atracado";
  const days = daysUntil(escala.dataChegada);
  if (days === null) return "sem-data";
  if (days < 0) return "atrasado";
  if (days === 0) return "hoje";
  if (days === 1) return "amanha";
  if (days <= 3) return "2-3";
  if (days <= 7) return "semana";
  return "mais-tarde";
}

function isContainer(escala: Escala): boolean {
  return String(escala.tipoCarga || "").toLowerCase().includes("contentor");
}

export default function PortoPontaDelgadaPage() {
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<string>("todos");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    navioNome: "",
    matricula: "",
    tipoCarga: "Contentores",
    armador: "",
    cais: "Cais Comercial - Ponta Delgada",
    dataChegada: new Date().toISOString().slice(0, 10),
    dataPartida: new Date().toISOString().slice(0, 10),
    origemDestino: "Lisboa - Ponta Delgada",
    estado: "Previsto",
    observacoes: "",
  });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [scope, setScope] = useState<"operacional" | "todos">("operacional");

  const fetchEscalas = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const res = await fetch("/api/porto-ponta-delgada", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setEscalas(data.escalas || []);
        setLastSync(data.lastSync || null);
      }
    } catch {
      // fallback
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEscalas();
    const interval = window.setInterval(() => {
      void fetchEscalas({ silent: true });
    }, 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [fetchEscalas]);

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/porto-ponta-delgada/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao sincronizar.");
      setEscalas(data.escalas || []);
      setLastSync(data.fetchedAt || new Date().toISOString());
      setMessage(
        `Sincronização concluída: ${data.created} novas, ${data.updated} atualizadas, ${data.cancelled} canceladas (${data.totalFeed} escalas oficiais).`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro na sincronização.");
    } finally {
      setSyncing(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.navioNome.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/porto-ponta-delgada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar escala.");
      setEscalas((curr) => [data.escala, ...curr]);
      setShowModal(false);
      setForm({
        navioNome: "",
        matricula: "",
        tipoCarga: "Contentores",
        armador: "",
        cais: "Cais Comercial - Ponta Delgada",
        dataChegada: new Date().toISOString().slice(0, 10),
        dataPartida: new Date().toISOString().slice(0, 10),
        origemDestino: "Lisboa - Ponta Delgada",
        estado: "Previsto",
        observacoes: "",
      });
      setMessage("Escala registada com sucesso!");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro ao guardar escala.");
    } finally {
      setSaving(false);
    }
  };

  const atracadosCount = escalas.filter((e) => e.estado === "Atracado").length;
  const previstosCount = escalas.filter((e) => e.estado === "Previsto").length;
  const partidosCount = escalas.filter((e) => e.estado === "Partido").length;
  const cruzeirosCount = escalas.filter((e) => e.tipoCarga === "Cruzeiro").length;

  const containerUpcoming = useMemo(() => {
    return escalas
      .filter(isContainer)
      .filter((e) => e.estado !== "Partido" && e.estado !== "Cancelado")
      .filter((e) => Boolean(e.dataChegada))
      .sort((a, b) => new Date(a.dataChegada!).getTime() - new Date(b.dataChegada!).getTime())
      .slice(0, 10);
  }, [escalas]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const now = Date.now();
    const min = now - 2 * DAY_MS;
    const max = now + 30 * DAY_MS;

    return escalas
      .filter((e) => {
        if (tipoFiltro === "contentores" && e.tipoCarga !== "Contentores") return false;
        if (tipoFiltro === "cruzeiros" && e.tipoCarga !== "Cruzeiro") return false;
        if (tipoFiltro === "outros" && (e.tipoCarga === "Contentores" || e.tipoCarga === "Cruzeiro")) return false;

        if (scope === "operacional") {
          if (e.estado === "Cancelado") return false;
          if (e.estado !== "Atracado") {
            if (!e.dataChegada) {
              if (e.estado === "Partido") return false;
            } else {
              const arrival = new Date(e.dataChegada).getTime();
              if (Number.isFinite(arrival) && (arrival < min || arrival > max)) return false;
            }
          }
        }

        if (!query) return true;
        return [e.navioNome, e.armador, e.cais, e.origemDestino, e.tipoCarga]
          .some((v) => String(v || "").toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const aTime = a.dataChegada ? new Date(a.dataChegada).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.dataChegada ? new Date(b.dataChegada).getTime() : Number.POSITIVE_INFINITY;
        return scope === "todos" ? bTime - aTime : aTime - bTime;
      });
  }, [escalas, tipoFiltro, search, scope]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-slate-50 to-indigo-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-3xl border border-slate-200/60 bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-sky-600 text-white rounded-2xl p-3 shadow-md shadow-sky-600/20">
              <Anchor size={28} />
            </div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-widest text-sky-600">Orey Açores · Portuário</p>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-800">Porto de Ponta Delgada</h1>
              <p className="text-sm text-slate-500 mt-0.5">Gestão de entradas, partidas e navios em porto na Ilha de São Miguel.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
            >
              <RefreshCw size={16} className={syncing ? "animate-spin" : ""} /> {syncing ? "A sincronizar..." : "Sincronizar agora"}
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-sky-600/20 transition hover:bg-sky-700"
            >
              <Plus size={18} /> Nova Escala
            </button>
          </div>
        </header>

        {message && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
            <span>{message}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-100 bg-white/80 px-4 py-3 text-xs text-slate-600 shadow-sm">
          <p>
            Fonte oficial <b>Portos dos Açores</b> · atualização automática de hora a hora.
          </p>
          <p className="font-semibold text-slate-500">
            {lastSync ? `Última sincronização: ${formatDateTime(lastSync)}` : "Ainda sem sincronização oficial."}
          </p>
        </div>

        {containerUpcoming.length > 0 && (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-extrabold text-slate-800 flex items-center gap-2">
                <Ship size={18} className="text-sky-600" /> Navios de contentores previstos
              </h2>
              <Link href="/contentores/mapa" className="text-xs font-bold text-sky-700 hover:underline">
                Ver mapa de contentores →
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {containerUpcoming.map((e) => {
                const bucket = arrivalBucket(e);
                const style = ARRIVAL_STYLES[bucket];
                return (
                  <Link
                    key={e.id}
                    href={`/contentores/mapa?ship=${encodeURIComponent(e.navioNome)}`}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${style.bg} ${style.text}`}
                    style={{ borderColor: style.border }}
                    title={`${e.navioNome} · ${e.origemDestino || ""}`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                    <span className="font-bold">{e.navioNome}</span>
                    <span className="font-semibold opacity-80">{style.label}</span>
                    {e.dataChegada && (
                      <span className="font-mono text-[10px] opacity-70">{formatDateTime(e.dataChegada)}</span>
                    )}
                  </Link>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] font-semibold text-slate-500">
              {(["hoje", "amanha", "2-3", "semana", "mais-tarde", "atracado"] as ArrivalBucket[]).map((key) => (
                <span key={key} className="inline-flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${ARRIVAL_STYLES[key].dot}`} /> {ARRIVAL_STYLES[key].label}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Navios em Porto (Atracados)</p>
            <p className="mt-2 text-3xl font-black text-emerald-950">{atracadosCount}</p>
            <p className="mt-1 text-xs font-semibold text-emerald-600">embarcações no cais</p>
          </div>
          <div className="rounded-2xl border border-sky-100 bg-sky-50 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Entradas Previstas</p>
            <p className="mt-2 text-3xl font-black text-sky-950">{previstosCount}</p>
            <p className="mt-1 text-xs font-semibold text-sky-600">escalas agendadas</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Partidas Realizadas</p>
            <p className="mt-2 text-3xl font-black text-slate-800">{partidosCount}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">concluídas</p>
          </div>
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Navios de Cruzeiro</p>
            <p className="mt-2 text-3xl font-black text-indigo-950">{cruzeirosCount}</p>
            <p className="mt-1 text-xs font-semibold text-indigo-600">escalas registadas</p>
          </div>
        </section>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Pesquisar navio, armador, cais..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </div>
          <div className="text-sm font-semibold text-slate-600">
            Escalas: <span className="font-black text-slate-800">{filtered.length}</span>
            <span className="text-slate-400"> / {escalas.length}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: "todos", label: "Todos" },
            { key: "contentores", label: "Contentores" },
            { key: "cruzeiros", label: "Cruzeiros" },
            { key: "outros", label: "Outros" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTipoFiltro(t.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${tipoFiltro === t.key ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {t.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-slate-200" />
          {[
            { key: "operacional" as const, label: "Próximos 30 dias" },
            { key: "todos" as const, label: "Todas as datas" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setScope(t.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${scope === t.key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-sky-600" size={36} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            <Ship size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="font-bold text-slate-700">Nenhuma escala registada</p>
            <p className="text-xs text-slate-400 mt-1">Adicione uma nova escala ou clique em &quot;Sincronizar agora&quot;.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((e) => {
              const bucket = arrivalBucket(e);
              const arrival = ARRIVAL_STYLES[bucket];
              const container = isContainer(e);
              return (
                <div
                  key={e.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 transition hover:border-sky-300"
                  style={container ? { borderLeft: `4px solid ${arrival.border}` } : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-extrabold text-slate-800 text-base">{e.navioNome}</h3>
                      {e.matricula && <p className="text-xs font-mono text-slate-500">{e.matricula}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        e.estado === "Atracado" ? "bg-emerald-100 text-emerald-800" :
                        e.estado === "Previsto" ? "bg-sky-100 text-sky-800" :
                        e.estado === "Partido" ? "bg-slate-100 text-slate-700" : "bg-amber-100 text-amber-800"
                      }`}>
                        {e.estado}
                      </span>
                      {container && (
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${arrival.bg} ${arrival.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${arrival.dot}`} /> {arrival.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
                    <p className="flex items-center gap-1.5"><Ship size={14} className="text-sky-500 shrink-0" /> Armador: <b>{e.armador || "—"}</b></p>
                    <p className="flex items-center gap-1.5"><MapPin size={14} className="text-sky-500 shrink-0" /> Cais: <b>{e.cais || "—"}</b></p>
                    <p className="flex items-center gap-1.5"><Anchor size={14} className="text-sky-500 shrink-0" /> Carga: <b>{e.tipoCarga || "—"}</b></p>
                    <p className="flex items-center gap-1.5"><Calendar size={14} className="text-sky-500 shrink-0" /> Chegada: <b>{e.dataChegada ? formatDateTime(e.dataChegada) : "—"}</b></p>
                    <p className="flex items-center gap-1.5"><Clock size={14} className="text-sky-500 shrink-0" /> Partida: <b>{e.dataPartida ? formatDateTime(e.dataPartida) : "—"}</b></p>
                  </div>
                  {e.origemDestino && (
                    <p className="text-[11px] font-semibold text-sky-700 bg-sky-50 rounded-lg px-2.5 py-1.5">
                      Rota: {e.origemDestino}
                    </p>
                  )}
                  {container && (
                    <Link
                      href={`/contentores/mapa?ship=${encodeURIComponent(e.navioNome)}`}
                      className="inline-flex text-[11px] font-bold text-sky-700 hover:underline"
                    >
                      Abrir no mapa de contentores →
                    </Link>
                  )}
                  {e.observacoes && (
                    <p className="text-[11px] text-slate-500 italic">
                      {e.observacoes}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <form onSubmit={handleCreate} className="w-full max-w-lg rounded-3xl bg-white p-6 sm:p-8 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-slate-800">Registar Escala no Porto</h2>
                <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
                  Nome do Navio *
                  <input type="text" required value={form.navioNome} onChange={(e) => setForm({ ...form, navioNome: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ex: PONTA DELGADA" />
                </label>
                <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
                  Matrícula / IMO
                  <input type="text" value={form.matricula} onChange={(e) => setForm({ ...form, matricula: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ex: PT-1234" />
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
                  Armador / Operador
                  <input type="text" value={form.armador} onChange={(e) => setForm({ ...form, armador: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ex: Transinsular" />
                </label>
                <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
                  Tipo de Carga
                  <select value={form.tipoCarga} onChange={(e) => setForm({ ...form, tipoCarga: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <option>Contentores</option><option>Carga Geral</option><option>Gás / Combustível</option><option>Pesca / Recreio</option><option>Cruzeiro</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
                  Cais de Atracação
                  <input type="text" value={form.cais} onChange={(e) => setForm({ ...form, cais: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ex: Cais Comercial" />
                </label>
                <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
                  Estado da Escala
                  <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <option>Previsto</option><option>Atracado</option><option>Partido</option><option>Cancelado</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
                  Data de Chegada
                  <input type="date" value={form.dataChegada} onChange={(e) => setForm({ ...form, dataChegada: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
                  Data de Partida
                  <input type="date" value={form.dataPartida} onChange={(e) => setForm({ ...form, dataPartida: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </label>
              </div>
              <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
                Origem / Destino (Rota)
                <input type="text" value={form.origemDestino} onChange={(e) => setForm({ ...form, origemDestino: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ex: Lisboa - Ponta Delgada - Leixões" />
              </label>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancelar</button>
                <button type="submit" disabled={saving} className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50">{saving ? "A guardar..." : "Guardar Escala"}</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
