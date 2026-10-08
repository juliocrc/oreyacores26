"use client";

import React, { useEffect, useRef, useState } from "react";
import { appToast } from "@/lib/app-toast";
import { Plus, Search, X, Edit, Trash2, Battery, Radio } from "lucide-react";
import { formatValidityDisplay } from "@/lib/date-display";

type Epirb = {
  id: number;
  serial: string;
  shipId: number | null;
  marca: string | null;
  modelo: string | null;
  tipo: string | null;
  hexId: string | null;
  estado: string;
  dataInspecao: string | null;
  dataProxInspecao: string | null;
  dataValidadeBateria: string | null;
  ownerName: string | null;
  observacoes: string | null;
};

const INITIAL_FORM: Omit<Epirb, "id"> = {
  serial: "",
  shipId: null,
  marca: "",
  modelo: "",
  tipo: "",
  hexId: "",
  estado: "Ativo",
  dataInspecao: "",
  dataProxInspecao: "",
  dataValidadeBateria: "",
  ownerName: "",
  observacoes: "",
};

type NavioOption = {
  id: number;
  nome: string;
};

type Movimento = {
  id: number;
  data: string;
  origemShipNome?: string | null;
  destinoShipNome?: string | null;
};

export default function EpirbsPage() {
  const [epirbs, setEpirbs] = useState<Epirb[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Omit<Epirb, "id">>(INITIAL_FORM);
  const [editId, setEditId] = useState<number | null>(null);

  const [navios, setNavios] = useState<NavioOption[]>([]);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const firstRender = useRef(true);

  useEffect(() => {
    fetchEpirbs();
    fetch("/api/navios?lite=1")
      .then(res => res.json())
      .then(data => setNavios(data))
      .catch(err => console.error(err));

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const serialParam = params.get("pesquisa");
      if (serialParam) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restauro da pesquisa a partir da URL no arranque.
        setSearch(serialParam);
      }
    }
  }, []);

  // Sync filter changes to URL
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams();
      if (search) params.set("pesquisa", search);
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    } catch {}
  }, [search]);

  useEffect(() => {
    if (editId && form.serial) {
      fetch(`/api/equipamento/movimentos?serial=${form.serial}`)
        .then(res => res.json())
        .then(data => setMovimentos(data))
        .catch(err => console.error(err));
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpeza do histórico quando não há serial selecionado.
      setMovimentos([]);
    }
  }, [editId, form.serial]);

  const printEpirbLabel = (e: Epirb) => {
    const win = window.open("", "_blank");
    if (!win) return;
    const itemUrl = `${window.location.origin}/epirbs?serial=${encodeURIComponent(e.serial)}`;
    win.document.write(`
      <html>
        <head>
          <title>Etiqueta ${e.serial}</title>
          <style>
            body { font-family: sans-serif; text-align: center; padding: 20px; display: flex; justify-content: center; align-items: center; height: 90vh; }
            .label { border: 2px solid #0f172a; padding: 20px; border-radius: 12px; display: inline-block; background: #fff; width: 220px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
            .title { font-size: 14px; font-weight: 800; color: #1e3a8a; letter-spacing: 0.1em; margin-bottom: 12px; }
            .serial { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 12px; font-family: monospace; }
            .model { font-size: 12px; color: #475569; margin-top: 4px; font-weight: 500; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="label">
            <div class="title">OREY AZORES (EPIRB)</div>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(itemUrl)}" width="150" height="150" />
            <div class="serial">${e.serial}</div>
            <div class="model">${e.marca || ''} ${e.modelo || ''}</div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
  };

  async function fetchEpirbs() {
    setLoading(true);
    try {
      const res = await fetch("/api/epirbs");
      if (!res.ok) throw new Error("Erro ao carregar EPIRBs");
      const data = await res.json();
      setEpirbs(data);
    } catch (err: unknown) {
      appToast.error(err instanceof Error ? err.message : "Erro ao carregar EPIRBs");
    } finally {
      setLoading(false);
    }
  }

  const filteredEpirbs = epirbs.filter((e) => {
    const s = search.toLowerCase();
    return (
      e.serial?.toLowerCase().includes(s) ||
      (e.marca && e.marca.toLowerCase().includes(s)) ||
      (e.modelo && e.modelo.toLowerCase().includes(s)) ||
      (e.hexId && e.hexId.toLowerCase().includes(s)) ||
      (e.ownerName && e.ownerName.toLowerCase().includes(s))
    );
  });

  function handleOpenCreate() {
    setForm(INITIAL_FORM);
    setEditId(null);
    setShowModal(true);
  }

  function handleOpenEdit(e: Epirb) {
    setForm({
      serial: e.serial || "",
      shipId: e.shipId,
      marca: e.marca || "",
      modelo: e.modelo || "",
      tipo: e.tipo || "",
      hexId: e.hexId || "",
      estado: e.estado || "Ativo",
      dataInspecao: e.dataInspecao || "",
      dataProxInspecao: e.dataProxInspecao || "",
      dataValidadeBateria: e.dataValidadeBateria || "",
      ownerName: e.ownerName || "",
      observacoes: e.observacoes || "",
    });
    setEditId(e.id);
    setShowModal(true);
  }

  async function handleDelete(id: number) {
    if (!confirm("Tem certeza que deseja apagar este EPIRB?")) return;
    try {
      const res = await fetch(`/api/epirbs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao apagar");
        appToast.success("EPIRB apagado com sucesso");
        fetchEpirbs();
      } catch (err: unknown) {
        appToast.error(err instanceof Error ? err.message : "Erro ao apagar");
      }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.serial) {
      appToast.warning("O Nº de Série é obrigatório");
      return;
    }

    try {
      const url = editId ? `/api/epirbs/${editId}` : "/api/epirbs";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Erro ao salvar");
      }

        appToast.success(editId ? "EPIRB atualizado" : "EPIRB criado com sucesso");
        setShowModal(false);
        fetchEpirbs();
      } catch (err: unknown) {
        appToast.error(err instanceof Error ? err.message : "Erro ao guardar EPIRB");
      }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Radio className="w-6 h-6 text-blue-600" />
            EPIRBs
          </h1>
          <p className="text-sm text-gray-500 mt-1">Gestão e controlo de radiobalizas EPIRB</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center gap-2 font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo EPIRB
        </button>
      </header>

      <div className="p-6 flex-1 overflow-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-full">
          <div className="p-4 border-b border-gray-100">
            <div className="relative max-w-md">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Pesquisar por série, marca, modelo, Hex ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 font-medium sticky top-0 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3">Nº Série</th>
                  <th className="px-4 py-3">Marca / Modelo</th>
                  <th className="px-4 py-3">Hex ID</th>
                  <th className="px-4 py-3">Validade Bateria</th>
                  <th className="px-4 py-3">Próx. Inspeção</th>
                  <th className="px-4 py-3">Proprietário</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-500">A carregar...</td>
                  </tr>
                ) : filteredEpirbs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-500">Nenhum EPIRB encontrado.</td>
                  </tr>
                ) : (
                  filteredEpirbs.map((e) => (
                    <tr key={e.id} className="hover:bg-blue-50/50 transition-colors group">
                      <td className="px-4 py-3 font-medium text-gray-900">{e.serial}</td>
                      <td className="px-4 py-3">
                        {e.marca || "-"} <span className="text-gray-400">/</span> {e.modelo || "-"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{e.hexId || "-"}</td>
                      <td className="px-4 py-3">
                        {e.dataValidadeBateria ? (
                          <span className="flex items-center gap-1.5">
                            <Battery className="w-4 h-4 text-emerald-500" />
                            {formatValidityDisplay(e.dataValidadeBateria)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3">{formatValidityDisplay(e.dataProxInspecao)}</td>
                      <td className="px-4 py-3">{e.ownerName || "-"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => printEpirbLabel(e)}
                            className="p-1.5 text-gray-500 hover:text-slate-900 hover:bg-slate-50 rounded-md flex items-center gap-1 border border-transparent hover:border-slate-200"
                            title="Etiqueta QR"
                          >
                            <Radio className="w-4 h-4 text-sky-500 animate-pulse" />
                            <span className="text-xs font-semibold pr-1">Etiqueta</span>
                          </button>
                          <button
                            onClick={() => handleOpenEdit(e)}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md flex items-center gap-1 border border-transparent hover:border-blue-200"
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                            <span className="text-xs font-medium pr-1">Editar</span>
                          </button>
                          <button
                            onClick={() => handleDelete(e.id)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md"
                            title="Apagar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm transition-all">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right-full duration-300">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-xl font-semibold text-gray-900">
                {editId ? "Editar EPIRB" : "Novo EPIRB"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nº Série *</label>
                <input
                  type="text"
                  required
                  value={form.serial}
                  onChange={(e) => setForm({ ...form, serial: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
                  <input
                    type="text"
                    value={form.marca || ""}
                    onChange={(e) => setForm({ ...form, marca: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Modelo</label>
                  <input
                    type="text"
                    value={form.modelo || ""}
                    onChange={(e) => setForm({ ...form, modelo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hex ID</label>
                <input
                  type="text"
                  value={form.hexId || ""}
                  onChange={(e) => setForm({ ...form, hexId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                  placeholder="Ex: 1D0E..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Validade Bateria</label>
                  <input
                    type="month"
                    value={form.dataValidadeBateria || ""}
                    onChange={(e) => setForm({ ...form, dataValidadeBateria: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Próx. Inspeção</label>
                  <input
                    type="date"
                    value={form.dataProxInspecao || ""}
                    onChange={(e) => setForm({ ...form, dataProxInspecao: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Navio Associado</label>
                <select
                  value={form.shipId || ""}
                  onChange={(e) => setForm({ ...form, shipId: e.target.value ? Number(e.target.value) : null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Nenhum (Armazém / Sem Navio)</option>
                  {navios.map((n) => (
                    <option key={n.id} value={n.id}>{n.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proprietário (Manual / Outro)</label>
                <input
                  type="text"
                  value={form.ownerName || ""}
                  onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea
                  rows={3}
                  value={form.observacoes || ""}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                ></textarea>
              </div>

              {editId && (
                <div className="pt-4 border-t border-gray-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Histórico de Rastreabilidade</h3>
                  <div className="max-h-[140px] overflow-y-auto border border-slate-100 rounded-lg text-[11px] bg-slate-50">
                    {movimentos.length > 0 ? (
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200 text-slate-500 font-semibold">
                            <th className="p-2">Data</th>
                            <th className="p-2">Origem</th>
                            <th className="p-2">Destino</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150">
                          {movimentos.map((mov) => (
                            <tr key={mov.id}>
                              <td className="p-2 text-slate-500">{new Date(mov.data).toLocaleDateString('pt-PT')}</td>
                              <td className="p-2 font-medium text-slate-700">{mov.origemShipNome || 'Sem Navio'}</td>
                              <td className="p-2 font-medium text-slate-700">{mov.destinoShipNome || 'Sem Navio'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-slate-400 italic text-center py-6">Ainda sem histórico de transferências.</p>
                    )}
                  </div>
                </div>
              )}

              <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-md transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-md transition-colors shadow-sm"
                >
                  Guardar EPIRB
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
