"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { appToast } from "@/lib/app-toast";
import { Plus, Search, X, Edit, Trash2, Shirt } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  EMPTY_FATO_IMERSAO_FORM,
  type FatoImersao,
  type FatoImersaoForm,
} from "@/types/fatos-imersao-page";
import { FATO_IMERSAO_STATUS } from "@/lib/status-constants";
import { toDisplayDate, normalizeDateInput } from "@/lib/fato-date-utils";

type Navio = { id: number; nome: string; matricula?: string | null };

export default function FatosImersaoPage() {
  const router = useRouter();
  const [items, setItems] = useState<FatoImersao[]>([]);
  const [navios, setNavios] = useState<Navio[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FatoImersaoForm>(EMPTY_FATO_IMERSAO_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [filterEstado, setFilterEstado] = useState("");
  const [filterMarca, setFilterMarca] = useState("");
  const [filterModelo, setFilterModelo] = useState("");
  const filterUrlSynced = useRef(false);
  const firstRender = useRef(true);

  useEffect(() => {
    fetchItems();
    fetch("/api/navios?lite=1")
      .then((res) => res.json())
      .then((data) => setNavios(Array.isArray(data) ? data : []))
      .catch(() => setNavios([]));
  }, []);

  // Sync filters from URL on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (filterUrlSynced.current) return;
    filterUrlSynced.current = true;
    try {
      const params = new URLSearchParams(window.location.search);
      const s = params.get("pesquisa"); if (s) setSearch(s);
      const e = params.get("estado"); if (e) setFilterEstado(e);
      const b = params.get("marca"); if (b) setFilterMarca(b);
      const m = params.get("modelo"); if (m) setFilterModelo(m);
    } catch {}
  }, []);

  // Sync filter changes to URL
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams();
      if (search) params.set("pesquisa", search);
      if (filterEstado) params.set("estado", filterEstado);
      if (filterMarca) params.set("marca", filterMarca);
      if (filterModelo) params.set("modelo", filterModelo);
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    } catch {}
  }, [search, filterEstado, filterMarca, filterModelo]);

  async function fetchItems() {
    setLoading(true);
    try {
      const res = await fetch("/api/fatos-imersao");
      if (!res.ok) throw new Error("Erro ao carregar fatos de imersão");
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (err: any) {
      appToast.error(err.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  const navioMap = useMemo(() => {
    const m = new Map<number, string>();
    navios.forEach((n) => m.set(n.id, n.nome));
    return m;
  }, [navios]);

  const uniqueMarcas = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => { if (i.marca) set.add(i.marca); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-PT"));
  }, [items]);

  const uniqueModelos = useMemo(() => {
    const set = new Set<string>();
    items
      .filter((i) => !filterMarca || i.marca === filterMarca)
      .forEach((i) => { if (i.modelo) set.add(i.modelo); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-PT"));
  }, [items, filterMarca]);

  const filtered = items.filter((item) => {
    const s = search.toLowerCase();
    const matchSearch =
      !s ||
      item.serial?.toLowerCase().includes(s) ||
      item.marca?.toLowerCase().includes(s) ||
      item.modelo?.toLowerCase().includes(s) ||
      item.tipo?.toLowerCase().includes(s) ||
      (item.shipId ? navioMap.get(item.shipId)?.toLowerCase().includes(s) : false);
    const matchEstado = !filterEstado || item.estado === filterEstado;
    const matchMarca = !filterMarca || item.marca === filterMarca;
    const matchModelo = !filterModelo || item.modelo === filterModelo;
    return matchSearch && matchEstado && matchMarca && matchModelo;
  });

  function handleOpenCreate() {
    setForm(EMPTY_FATO_IMERSAO_FORM);
    setEditId(null);
    setShowModal(true);
  }

  function handleOpenEdit(item: FatoImersao) {
    setForm({
      shipId: item.shipId ? String(item.shipId) : "",
      serial: item.serial || "",
      marca: item.marca || "",
      modelo: item.modelo || "",
      tamanho: item.tamanho || "",
      tipo: item.tipo || "",
      material: item.material || "",
      estado: item.estado || "Ativo",
      dataFabrico: toDisplayDate(item.dataFabrico),
      dataInspecao: toDisplayDate(item.dataInspecao),
      dataProxInspecao: toDisplayDate(item.dataProxInspecao),
      observacoes: item.observacoes || "",
    });
    setEditId(item.id);
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.serial.trim()) {
      appToast.error("Nº de série é obrigatório");
      return;
    }
    try {
      const payload = {
        ...form,
        shipId: form.shipId ? Number(form.shipId) : null,
        dataFabrico: normalizeDateInput(form.dataFabrico),
        dataInspecao: normalizeDateInput(form.dataInspecao),
        dataProxInspecao: normalizeDateInput(form.dataProxInspecao),
      };
      const url = editId ? `/api/fatos-imersao/${editId}` : "/api/fatos-imersao";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao guardar");
      appToast.success(editId ? "Atualizado" : "Criado com sucesso");
      setShowModal(false);
      fetchItems();
    } catch (err: any) {
      appToast.error(err.message || "Erro ao guardar");
    }
  }

  async function handleDeleteSelected() {
    if (!selected.length) return;
    if (!window.confirm(`Eliminar ${selected.length} fato(s) de imersão?`)) return;
    try {
      const res = await fetch("/api/fatos-imersao", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected }),
      });
      if (!res.ok) throw new Error("Erro ao eliminar");
      setSelected([]);
      appToast.success("Eliminado");
      fetchItems();
    } catch (err: any) {
      appToast.error(err.message);
    }
  }

  async function handleBatchAssignShip(shipId: string) {
    if (!selected.length || !shipId) return;
    try {
      const res = await fetch("/api/fatos-imersao", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected, action: "assign-ship", shipId: Number(shipId) }),
      });
      if (!res.ok) throw new Error("Erro na associação");
      appToast.success("Associados ao navio");
      setSelected([]);
      fetchItems();
    } catch (err: any) {
      appToast.error(err.message);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shirt className="w-7 h-7 text-cyan-700" />
            Fatos de Imersão
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestão de fatos de imersão — mesmo padrão dos coletes (associação a navios, verificações e certificados).
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 bg-cyan-700 hover:bg-cyan-800 text-white px-4 py-2 rounded-lg font-medium shadow-sm"
        >
          <Plus className="w-4 h-4" /> Novo fato
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar série, marca, modelo, navio..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
        <select
          value={filterMarca}
          onChange={(e) => { setFilterMarca(e.target.value); setFilterModelo(""); }}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todas as marcas</option>
          {uniqueMarcas.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          value={filterModelo}
          onChange={(e) => setFilterModelo(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todos os modelos</option>
          {uniqueModelos.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todos os estados</option>
          {Object.values(FATO_IMERSAO_STATUS).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-slate-500">{selected.length} selecionado(s)</span>
            <select
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) handleBatchAssignShip(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="">Associar a navio...</option>
              {navios.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nome}
                </option>
              ))}
            </select>
            <button
              onClick={handleDeleteSelected}
              className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-1.5 rounded-lg"
            >
              <Trash2 className="w-3.5 h-3.5" /> Eliminar
            </button>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selected.length === filtered.length}
                    onChange={(e) =>
                      setSelected(e.target.checked ? filtered.map((i) => i.id) : [])
                    }
                  />
                </th>
                <th className="px-3 py-2 text-left">Série</th>
                <th className="px-3 py-2 text-left">Navio</th>
                <th className="px-3 py-2 text-left">Marca / Modelo</th>
                <th className="px-3 py-2 text-left">Tamanho</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Próx. inspeção</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                    A carregar...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                    Sem fatos de imersão registados.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(item.id)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id)
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-800">
                      <button
                        className="text-cyan-800 hover:underline"
                        onClick={() => router.push(`/fatos-imersao/${item.id}`)}
                      >
                        {item.serial}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {item.shipId ? navioMap.get(item.shipId) || `Navio #${item.shipId}` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {[item.marca, item.modelo].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-3 py-2">{item.tamanho || "—"}</td>
                    <td className="px-3 py-2">{item.tipo || "—"}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">
                        {item.estado || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2">{toDisplayDate(item.dataProxInspecao) || "—"}</td>
                    <td className="px-3 py-2 text-right space-x-1">
                      <button
                        onClick={() => router.push(`/fatos-imersao/${item.id}`)}
                        className="inline-flex p-1.5 rounded-md hover:bg-cyan-50 text-cyan-800"
                        title="Abrir ficha"
                      >
                        <Shirt className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => router.push(`/fatos-imersao/${item.id}/wizard`)}
                        className="inline-flex px-2 py-1 rounded-md hover:bg-indigo-50 text-indigo-700 text-xs font-bold"
                        title="Wizard inspeção"
                      >
                        Wizard
                      </button>
                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="inline-flex p-1.5 rounded-md hover:bg-slate-100 text-slate-600"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="font-semibold text-slate-900">
                {editId ? "Editar fato de imersão" : "Novo fato de imersão"}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm md:col-span-2">
                <span className="text-slate-600">Nº Série *</span>
                <input
                  required
                  value={form.serial}
                  onChange={(e) => setForm({ ...form, serial: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Navio</span>
                <select
                  value={form.shipId}
                  onChange={(e) => setForm({ ...form, shipId: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                >
                  <option value="">Sem navio</option>
                  {navios.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Estado</span>
                <select
                  value={form.estado}
                  onChange={(e) => setForm({ ...form, estado: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                >
                  {Object.values(FATO_IMERSAO_STATUS).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Marca</span>
                <input
                  list="fi-marcas-form"
                  value={form.marca}
                  onChange={(e) => setForm({ ...form, marca: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                />
                <datalist id="fi-marcas-form">
                  {uniqueMarcas.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Modelo</span>
                <input
                  list="fi-modelos-form"
                  value={form.modelo}
                  onChange={(e) => setForm({ ...form, modelo: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                />
                <datalist id="fi-modelos-form">
                  {uniqueModelos.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Tamanho</span>
                <input
                  value={form.tamanho}
                  onChange={(e) => setForm({ ...form, tamanho: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  placeholder="S / M / L / XL / Universal"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Tipo</span>
                <input
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  placeholder="SOLAS / Insulado / ..."
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Material</span>
                <input
                  value={form.material}
                  onChange={(e) => setForm({ ...form, material: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Data fabrico</span>
                <input
                  value={form.dataFabrico}
                  onChange={(e) => setForm({ ...form, dataFabrico: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  placeholder="dd/mm/aaaa"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Data inspeção</span>
                <input
                  value={form.dataInspecao}
                  onChange={(e) => setForm({ ...form, dataInspecao: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  placeholder="dd/mm/aaaa"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Próxima inspeção</span>
                <input
                  value={form.dataProxInspecao}
                  onChange={(e) => setForm({ ...form, dataProxInspecao: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  placeholder="dd/mm/aaaa"
                />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="text-slate-600">Observações</span>
                <textarea
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2 min-h-[80px]"
                />
              </label>
              <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyan-700 text-white hover:bg-cyan-800"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
