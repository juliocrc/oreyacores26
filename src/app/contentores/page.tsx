"use client";

import React, { useEffect, useState } from "react";
import { Ship, Anchor, Route, Plus, Search, Calendar, Loader2, CheckCircle2 } from "lucide-react";

type ContentorRoute = {
  id: number;
  navioNome: string;
  operador: string;
  rota: string;
  frequencia: string | null;
  capacidadeTeus: number | null;
  diasEscala: string | null;
  observacoes: string | null;
};

export default function ContentoresPage() {
  const [routes, setRoutes] = useState<ContentorRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    navioNome: "",
    operador: "Transinsular",
    rota: "Lisboa / Leixões - Ponta Delgada - Caniçal",
    frequencia: "Semanal",
    capacidadeTeus: 850,
    diasEscala: "Terça-feira",
    observacoes: "Itinerário Outubro Açores",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchRoutes = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/contentores");
      if (res.ok) {
        const data = await res.json();
        setRoutes(data.routes || []);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.navioNome.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/contentores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar rota.");
      setRoutes((curr) => [data.route, ...curr]);
      setShowModal(false);
      setMessage("Rota de navio de contentores registada com sucesso!");
    } catch (err: any) {
      setMessage(err.message || "Erro ao guardar rota.");
    } finally {
      setSaving(false);
    }
  };

  const filtered = routes.filter((r) =>
    [r.navioNome, r.operador, r.rota, r.frequencia]
      .some((v) => String(v || "").toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-slate-50 to-sky-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-slate-200/60 bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white rounded-2xl p-3 shadow-md shadow-indigo-600/20">
              <Route size={28} />
            </div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-widest text-indigo-600">Orey Açores · Logística Marítima</p>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-800">Navios de Contentores</h1>
              <p className="text-sm text-slate-500 mt-0.5">Itinerários, rotas, frequência e capacidade dos navios porta-contentores (Transinsular, GS Lines, etc.).</p>
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-700"
          >
            <Plus size={18} /> Nova Rota / Navio
          </button>
        </header>

        {message && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
            <span>{message}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Pesquisar navio, operador, rota..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="text-sm font-semibold text-slate-600">
            Total de rotas: <span className="font-black text-slate-800">{filtered.length}</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-indigo-600" size={36} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            <Route size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="font-bold text-slate-700">Nenhum navio de contentores registado</p>
            <p className="text-xs text-slate-400 mt-1">Adicione rotas para consultar os itinerários de Outubro.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 transition hover:border-indigo-300">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-base">{r.navioNome}</h3>
                    <p className="text-xs font-bold text-indigo-600">{r.operador}</p>
                  </div>
                  {r.capacidadeTeus && (
                    <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 border border-indigo-100">
                      {r.capacidadeTeus} TEUs
                    </span>
                  )}
                </div>
                <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
                  <p className="flex items-center gap-1.5"><Route size={14} className="text-indigo-500 shrink-0" /> Rota: <b>{r.rota}</b></p>
                  <p className="flex items-center gap-1.5"><Calendar size={14} className="text-indigo-500 shrink-0" /> Frequência: <b>{r.frequencia || "—"}</b></p>
                  <p className="flex items-center gap-1.5"><Anchor size={14} className="text-indigo-500 shrink-0" /> Dias de Escala: <b>{r.diasEscala || "—"}</b></p>
                </div>
                {r.observacoes && (
                  <p className="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-2.5 py-1.5">
                    {r.observacoes}
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
                <h2 className="text-lg font-extrabold text-slate-800">Registar Navio de Contentores</h2>
                <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
                  Nome do Navio *
                  <input type="text" required value={form.navioNome} onChange={(e) => setForm({ ...form, navioNome: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ex: PONTA DELGADA" />
                </label>
                <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
                  Operador / Armador
                  <input type="text" value={form.operador} onChange={(e) => setForm({ ...form, operador: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ex: Transinsular" />
                </label>
              </div>
              <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
                Rota / Itinerário
                <input type="text" value={form.rota} onChange={(e) => setForm({ ...form, rota: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ex: Lisboa - Ponta Delgada - Caniçal" />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
                  Frequência
                  <input type="text" value={form.frequencia} onChange={(e) => setForm({ ...form, frequencia: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ex: Semanal" />
                </label>
                <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
                  Capacidade (TEUs)
                  <input type="number" value={form.capacidadeTeus} onChange={(e) => setForm({ ...form, capacidadeTeus: Number(e.target.value) })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
                  Dias de Escala
                  <input type="text" value={form.diasEscala} onChange={(e) => setForm({ ...form, diasEscala: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ex: Terça-feira" />
                </label>
              </div>
              <label className="text-xs font-semibold text-slate-600 flex flex-col gap-1">
                Observações / Itinerário
                <input type="text" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ex: Itinerário Açores Outubro" />
              </label>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancelar</button>
                <button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? "A guardar..." : "Guardar Rota"}</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
