"use client";

import React, { useEffect, useState } from "react";
import { Anchor, Ship, Calendar, Plus, Search, MapPin, Clock, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { formatDate } from "@/lib/date-utils";

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

export default function PortoPontaDelgadaPage() {
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
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

  const fetchEscalas = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/porto-ponta-delgada");
      if (res.ok) {
        const data = await res.json();
        setEscalas(data.escalas || []);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEscalas();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/porto-ponta-delgada/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao sincronizar.");
      setEscalas(data.escalas || []);
      setMessage(`Sincronização concluída! ${data.sincronizados} novas escalas de contentores adicionadas.`);
    } catch (err: any) {
      setMessage(err.message || "Erro na sincronização.");
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
    } catch (err: any) {
      setMessage(err.message || "Erro ao guardar escala.");
    } finally {
      setSaving(false);
    }
  };

  const atracadosCount = escalas.filter((e) => e.estado === "Atracado").length;
  const previstosCount = escalas.filter((e) => e.estado === "Previsto").length;
  const partidosCount = escalas.filter((e) => e.estado === "Partido").length;

  const filtered = escalas.filter((e) =>
    [e.navioNome, e.armador, e.cais, e.origemDestino, e.tipoCarga]
      .some((v) => String(v || "").toLowerCase().includes(search.toLowerCase()))
  );

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
              <RefreshCw size={16} className={syncing ? "animate-spin" : ""} /> {syncing ? "A sincronizar..." : "Sincronizar Contentores"}
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

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            Total de escalas: <span className="font-black text-slate-800">{filtered.length}</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-sky-600" size={36} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            <Ship size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="font-bold text-slate-700">Nenhuma escala registada</p>
            <p className="text-xs text-slate-400 mt-1">Adicione uma nova escala ou clique em "Sincronizar Contentores".</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((e) => (
              <div key={e.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 transition hover:border-sky-300">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-base">{e.navioNome}</h3>
                    {e.matricula && <p className="text-xs font-mono text-slate-500">{e.matricula}</p>}
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    e.estado === "Atracado" ? "bg-emerald-100 text-emerald-800" :
                    e.estado === "Previsto" ? "bg-sky-100 text-sky-800" :
                    e.estado === "Partido" ? "bg-slate-100 text-slate-700" : "bg-amber-100 text-amber-800"
                  }`}>
                    {e.estado}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
                  <p className="flex items-center gap-1.5"><Ship size={14} className="text-sky-500 shrink-0" /> Armador: <b>{e.armador || "—"}</b></p>
                  <p className="flex items-center gap-1.5"><MapPin size={14} className="text-sky-500 shrink-0" /> Cais: <b>{e.cais || "—"}</b></p>
                  <p className="flex items-center gap-1.5"><Anchor size={14} className="text-sky-500 shrink-0" /> Carga: <b>{e.tipoCarga || "—"}</b></p>
                  <p className="flex items-center gap-1.5"><Calendar size={14} className="text-sky-500 shrink-0" /> Chegada: <b>{e.dataChegada ? formatDate(e.dataChegada) : "—"}</b></p>
                  <p className="flex items-center gap-1.5"><Clock size={14} className="text-sky-500 shrink-0" /> Partida: <b>{e.dataPartida ? formatDate(e.dataPartida) : "—"}</b></p>
                </div>
                {e.origemDestino && (
                  <p className="text-[11px] font-semibold text-sky-700 bg-sky-50 rounded-lg px-2.5 py-1.5">
                    Rota: {e.origemDestino}
                  </p>
                )}
                {e.observacoes && (
                  <p className="text-[11px] text-slate-500 italic">
                    {e.observacoes}
                  </p>
                )}
              </div>
            ))}
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
