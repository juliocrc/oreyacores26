"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { appToast } from "@/lib/app-toast";
import { Plus, Search, X, Edit, Trash2, Flame, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  EMPTY_EXTINTOR_FORM,
  EXTINTOR_ESTADOS,
  EXTINTOR_TIPOS_AGENTE,
  type Extintor,
  type ExtintorForm,
} from "@/types/extintores-page";
import { toDisplayDate, normalizeDateInput } from "@/lib/fato-date-utils";

type Navio = { id: number; nome: string; matricula?: string | null };

export default function ExtintoresPage() {
  const router = useRouter();
  const [items, setItems] = useState<Extintor[]>([]);
  const [navios, setNavios] = useState<Navio[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ExtintorForm>(EMPTY_EXTINTOR_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [filterEstado, setFilterEstado] = useState("");
  const [filterMarca, setFilterMarca] = useState("");
  const filterUrlSynced = useRef(false);
  const firstRender = useRef(true);

  useEffect(() => {
    fetchItems();
    fetch("/api/navios")
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
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    } catch {}
  }, [search, filterEstado, filterMarca]);

  async function fetchItems() {
    setLoading(true);
    try {
      const res = await fetch("/api/extintores");
      if (!res.ok) throw new Error("Erro ao carregar extintores");
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

  const filtered = items.filter((item) => {
    const s = search.toLowerCase();
    const matchSearch =
      !s ||
      item.serial?.toLowerCase().includes(s) ||
      item.marca?.toLowerCase().includes(s) ||
      item.modelo?.toLowerCase().includes(s) ||
      item.tipoAgente?.toLowerCase().includes(s) ||
      item.localizacao?.toLowerCase().includes(s) ||
      (item.shipId ? navioMap.get(item.shipId)?.toLowerCase().includes(s) : false);
    const matchEstado = !filterEstado || item.estado === filterEstado;
    const matchMarca = !filterMarca || item.marca === filterMarca;
    return matchSearch && matchEstado && matchMarca;
  });

  function handleOpenCreate() {
    setForm(EMPTY_EXTINTOR_FORM);
    setEditId(null);
    setShowModal(true);
  }

  function handleOpenEdit(item: Extintor) {
    setForm({
      shipId: item.shipId ? String(item.shipId) : "",
      serial: item.serial || "",
      marca: item.marca || "",
      modelo: item.modelo || "",
      capacidadeKg: item.capacidadeKg ? String(item.capacidadeKg) : "",
      tipoAgente: item.tipoAgente || "",
      estado: item.estado || "Ativo",
      localizacao: item.localizacao || "",
      dataFabrico: toDisplayDate(item.dataFabrico),
      dataUltimaRecarga: toDisplayDate(item.dataUltimaRecarga),
      dataProxRecarga: toDisplayDate(item.dataProxRecarga),
      dataTesteHidraulico: toDisplayDate(item.dataTesteHidraulico),
      dataProxTesteHidraulico: toDisplayDate(item.dataProxTesteHidraulico),
      observacoes: item.observacoes || "",
    });
    setEditId(item.id);
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        shipId: form.shipId ? Number(form.shipId) : null,
        capacidadeKg: form.capacidadeKg ? Number(form.capacidadeKg) : null,
        dataFabrico: normalizeDateInput(form.dataFabrico),
        dataUltimaRecarga: normalizeDateInput(form.dataUltimaRecarga),
        dataProxRecarga: normalizeDateInput(form.dataProxRecarga),
        dataTesteHidraulico: normalizeDateInput(form.dataTesteHidraulico),
        dataProxTesteHidraulico: normalizeDateInput(form.dataProxTesteHidraulico),
      };
      const url = editId ? `/api/extintores/${editId}` : "/api/extintores";
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
    if (!window.confirm(`Eliminar ${selected.length} extintor(es)?`)) return;
    try {
      const res = await fetch("/api/extintores", {
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
      const res = await fetch("/api/extintores", {
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

  function handlePrintLabel(item: Extintor) {
    const win = window.open("", "_blank", "width=500,height=700");
    if (!win) return;
    const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const navio = item.shipId ? navioMap.get(item.shipId) : null;
    const rows: Array<[string, string]> = [
      ["Navio", navio || "Sem navio"],
      ["Localização", item.localizacao || "—"],
      ["Marca / Modelo", [item.marca, item.modelo].filter(Boolean).join(" ") || "—"],
      ["Nº Série", item.serial || "—"],
      ["Capacidade", item.capacidadeKg ? `${item.capacidadeKg} kg` : "—"],
      ["Agente extintor", item.tipoAgente || "—"],
      ["Data de fabrico", toDisplayDate(item.dataFabrico) || "—"],
      ["Última recarga", toDisplayDate(item.dataUltimaRecarga) || "—"],
      ["Próxima recarga", toDisplayDate(item.dataProxRecarga) || "—"],
      ["Último teste hidráulico", toDisplayDate(item.dataTesteHidraulico) || "—"],
      ["Próximo teste hidráulico", toDisplayDate(item.dataProxTesteHidraulico) || "—"],
    ];
    const rowsHtml = rows.map(([label, value]) => `<tr><td class="lbl">${esc(label)}</td><td class="val">${esc(value)}</td></tr>`).join("");
    const obsHtml = item.observacoes
      ? `<div class="obs"><b>Observações:</b><br />${esc(item.observacoes).replace(/\n/g, "<br />")}</div>`
      : "";

    win.document.write(`<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<title>Etiqueta Extintor ${esc(item.serial || item.id)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Calibri, Arial, sans-serif; color: #1e293b; margin: 0; padding: 16px; }
  .card { border: 3px solid #c2410c; border-radius: 12px; padding: 20px; page-break-after: always; }
  .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #c2410c; padding-bottom: 8px; margin-bottom: 10px; }
  .title { font-size: 18px; font-weight: bold; color: #c2410c; }
  .sub { font-size: 10px; color: #64748b; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; }
  .lbl { color: #64748b; font-weight: bold; width: 46%; }
  .val { font-weight: 600; }
  .obs { margin-top: 10px; font-size: 11px; color: #475569; border-top: 1px dashed #e2e8f0; padding-top: 8px; }
  .foot { margin-top: 12px; font-size: 8px; color: #94a3b8; text-align: center; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="card">
    <div class="head">
      <div class="title">EXTINTOR</div>
      <div class="sub">Orey Técnica Açores, Lda.</div>
    </div>
    <table>${rowsHtml}</table>
    ${obsHtml}
    <div class="foot">Documento gerado pelo Sistema de Gestão Orey · ${new Date().toLocaleDateString("pt-PT")}</div>
  </div>
   ${['<scr', 'ipt>window.onload = function () { window.print(); };</scr', 'ipt>'].join('')}
</body>
</html>`);
    win.document.close();
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Flame className="w-7 h-7 text-orange-700" />
            Extintores
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestão de extintores das embarcações — recargas, testes hidráulicos e validades.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 bg-orange-700 hover:bg-orange-800 text-white px-4 py-2 rounded-lg font-medium shadow-sm"
        >
          <Plus className="w-4 h-4" /> Novo extintor
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar série, marca, modelo, navio, localização..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
        <select
          value={filterMarca}
          onChange={(e) => setFilterMarca(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todas as marcas</option>
          {uniqueMarcas.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todos os estados</option>
          {EXTINTOR_ESTADOS.map((s) => (
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
                <th className="px-3 py-2 text-left">Capacidade</th>
                <th className="px-3 py-2 text-left">Agente</th>
                <th className="px-3 py-2 text-left">Localização</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Próx. recarga</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                    A carregar...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                    Sem extintores registados.
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
                      {item.serial || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {item.shipId ? (
                        <button
                          className="text-orange-800 hover:underline"
                          onClick={() => router.push(`/navios/${item.shipId}`)}
                        >
                          {navioMap.get(item.shipId) || `Navio #${item.shipId}`}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {[item.marca, item.modelo].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {item.capacidadeKg ? `${item.capacidadeKg} kg` : "—"}
                    </td>
                    <td className="px-3 py-2">{item.tipoAgente || "—"}</td>
                    <td className="px-3 py-2">{item.localizacao || "—"}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">
                        {item.estado || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2">{toDisplayDate(item.dataProxRecarga) || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handlePrintLabel(item)}
                        className="inline-flex p-1.5 rounded-md hover:bg-orange-50 text-orange-700"
                        title="Etiqueta / imprimir"
                      >
                        <Printer className="w-4 h-4" />
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
                {editId ? "Editar extintor" : "Novo extintor"}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="text-slate-600">Nº Série</span>
                <input
                  value={form.serial}
                  onChange={(e) => setForm({ ...form, serial: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  placeholder="Opcional"
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
                <span className="text-slate-600">Marca</span>
                <input
                  list="ext-marcas-form"
                  value={form.marca}
                  onChange={(e) => setForm({ ...form, marca: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                />
                <datalist id="ext-marcas-form">
                  {uniqueMarcas.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Modelo</span>
                <input
                  value={form.modelo}
                  onChange={(e) => setForm({ ...form, modelo: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Capacidade (kg)</span>
                <input
                  type="number"
                  min="0"
                  value={form.capacidadeKg}
                  onChange={(e) => setForm({ ...form, capacidadeKg: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  placeholder="2, 5, 6, 12..."
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Agente extintor</span>
                <select
                  value={form.tipoAgente}
                  onChange={(e) => setForm({ ...form, tipoAgente: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                >
                  <option value="">—</option>
                  {EXTINTOR_TIPOS_AGENTE.map((a) => (
                    <option key={a} value={a}>{a}</option>
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
                  {EXTINTOR_ESTADOS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Localização</span>
                <input
                  value={form.localizacao}
                  onChange={(e) => setForm({ ...form, localizacao: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  placeholder="Camarote, Casa das máquinas..."
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
                <span className="text-slate-600">Última recarga</span>
                <input
                  value={form.dataUltimaRecarga}
                  onChange={(e) => setForm({ ...form, dataUltimaRecarga: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  placeholder="dd/mm/aaaa"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Próxima recarga</span>
                <input
                  value={form.dataProxRecarga}
                  onChange={(e) => setForm({ ...form, dataProxRecarga: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  placeholder="dd/mm/aaaa"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Último teste hidráulico</span>
                <input
                  value={form.dataTesteHidraulico}
                  onChange={(e) => setForm({ ...form, dataTesteHidraulico: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  placeholder="dd/mm/aaaa"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Próximo teste hidráulico</span>
                <input
                  value={form.dataProxTesteHidraulico}
                  onChange={(e) => setForm({ ...form, dataProxTesteHidraulico: e.target.value })}
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
                  className="px-4 py-2 rounded-lg bg-orange-700 text-white hover:bg-orange-800"
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
