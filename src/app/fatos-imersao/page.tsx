"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { appToast } from "@/lib/app-toast";
import {
  Plus,
  Search,
  X,
  Edit,
  Trash2,
  Shirt,
  LayoutGrid,
  List,
  Rows3,
  SlidersHorizontal,
  Link,
  Unlink,
  Tag,
  Award,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  EMPTY_FATO_IMERSAO_FORM,
  FATO_IMERSAO_LIST_COLUMNS,
  FATO_IMERSAO_LIST_COLUMNS_KEY,
  buildDefaultFatoImersaoColumns,
  type FatoImersao,
  type FatoImersaoForm,
  type FatoImersaoListColumnKey,
} from "@/types/fatos-imersao-page";
import { FATO_IMERSAO_STATUS } from "@/lib/status-constants";
import { toDisplayDate, toDisplayMonth, toMonthInput, normalizeDateInput, normalizeMonthInput } from "@/lib/fato-date-utils";
import {
  formatInspectionDate,
  getInspectionUrgencyRank,
  isInspectionDueWithin30Days,
  isInspectionOverdue,
} from "@/lib/equipamentos-page-helpers";

type Navio = { id: number; nome: string; matricula?: string | null };
type ViewMode = "lista" | "quadros" | "detalhes";

function renderInspectionUrgencyBadge(value: string | null | undefined) {
  if (isInspectionOverdue(value)) {
    return (
      <span className="inline-flex rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
        Inspeção vencida
      </span>
    );
  }

  if (isInspectionDueWithin30Days(value)) {
    return (
      <span className="inline-flex rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
        Inspeção ≤ 30 dias
      </span>
    );
  }

  return null;
}

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
  const [viewMode, setViewMode] = useState<ViewMode>("lista");
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<FatoImersaoListColumnKey, boolean>>(
    buildDefaultFatoImersaoColumns()
  );
  const [batchShipId, setBatchShipId] = useState("");
  const [batchEstado, setBatchEstado] = useState("");
  const [batchApplying, setBatchApplying] = useState(false);
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
      const vm = params.get("vista");
      if (vm === "lista" || vm === "quadros" || vm === "detalhes") setViewMode(vm);
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
      if (viewMode !== "lista") params.set("vista", viewMode);
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    } catch {}
  }, [search, filterEstado, filterMarca, filterModelo, viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(FATO_IMERSAO_LIST_COLUMNS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Record<FatoImersaoListColumnKey, boolean>>;
      const merged = { ...buildDefaultFatoImersaoColumns() };
      for (const col of FATO_IMERSAO_LIST_COLUMNS) {
        if (typeof parsed[col.key] === "boolean") {
          merged[col.key] = Boolean(parsed[col.key]);
        }
      }
      setVisibleColumns(merged);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(FATO_IMERSAO_LIST_COLUMNS_KEY, JSON.stringify(visibleColumns));
    } catch {}
  }, [visibleColumns]);

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

  const filtered = useMemo(() => items.filter((item) => {
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
  }), [items, search, filterEstado, filterMarca, filterModelo, navioMap]);

  const sortedQuadros = useMemo(() => (
    [...filtered].sort((a, b) => {
      const urgencyDiff = getInspectionUrgencyRank(a.dataProxInspecao) - getInspectionUrgencyRank(b.dataProxInspecao);
      if (urgencyDiff !== 0) return urgencyDiff;
      return String(a.serial || "").localeCompare(String(b.serial || ""), "pt", { sensitivity: "base" });
    })
  ), [filtered]);

  const stats = useMemo(() => ({
    total: items.length,
    visiveis: filtered.length,
    associados: items.filter((item) => Number.isFinite(Number(item.shipId))).length,
    inspeccao30d: items.filter((item) => isInspectionDueWithin30Days(item.dataProxInspecao)).length,
    vencidos: items.filter((item) => isInspectionOverdue(item.dataProxInspecao)).length,
  }), [items, filtered]);

  const isColumnVisible = (key: FatoImersaoListColumnKey) => Boolean(visibleColumns[key]);

  const toggleColumn = (key: FatoImersaoListColumnKey) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const anyEnabled = Object.values(next).some(Boolean);
      if (!anyEnabled) return { ...next, [key]: true };
      return next;
    });
  };

  const showAllColumns = () => setVisibleColumns(buildDefaultFatoImersaoColumns());

  const hideAlmostAllColumns = () => {
    const first = FATO_IMERSAO_LIST_COLUMNS[0]?.key;
    if (!first) return;
    const next = FATO_IMERSAO_LIST_COLUMNS.reduce((acc, col) => {
      acc[col.key] = false;
      return acc;
    }, {} as Record<FatoImersaoListColumnKey, boolean>);
    next[first] = true;
    setVisibleColumns(next);
  };

  function handleSelect(id: number, checked: boolean) {
    setSelected((prev) => checked ? [...prev, id] : prev.filter((itemId) => itemId !== id));
  }

  function handleSelectAll(checked: boolean) {
    setSelected(checked ? filtered.map((item) => item.id) : []);
  }

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
        dataFabrico: toMonthInput(item.dataFabrico),
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
        dataFabrico: normalizeMonthInput(form.dataFabrico),
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

  async function handleDeleteOne(id: number) {
    if (!window.confirm("Eliminar este fato de imersão?")) return;
    try {
      const res = await fetch("/api/fatos-imersao", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!res.ok) throw new Error("Erro ao eliminar");
      setSelected((prev) => prev.filter((itemId) => itemId !== id));
      appToast.success("Eliminado");
      fetchItems();
    } catch (err: any) {
      appToast.error(err.message);
    }
  }

  async function handleBatchAction(action: "assign-ship" | "clear-ship" | "set-status") {
    if (!selected.length) return;
    if (action === "assign-ship" && !batchShipId) {
      appToast.error("Selecione primeiro o navio.");
      return;
    }
    if (action === "set-status" && !batchEstado) {
      appToast.error("Selecione primeiro o estado.");
      return;
    }
    setBatchApplying(true);
    try {
      const res = await fetch("/api/fatos-imersao", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selected,
          action,
          shipId: action === "assign-ship" ? Number(batchShipId) : undefined,
          estado: action === "set-status" ? batchEstado : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro na operação em lote");
      appToast.success(
        action === "assign-ship"
          ? "Associados ao navio"
          : action === "clear-ship"
          ? "Associação removida"
          : "Estado atualizado"
      );
      setSelected([]);
      fetchItems();
    } catch (err: any) {
      appToast.error(err.message || "Erro na operação em lote");
    } finally {
      setBatchApplying(false);
    }
  }

  async function handleShipCertificate() {
    if (!batchShipId) {
      appToast.error("Selecione primeiro o navio.");
      return;
    }
    try {
      const res = await fetch(`/api/fatos-imersao/certificado-navio?shipId=${batchShipId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao gerar o certificado");
      }
      const blob = await res.blob();
      const navio = navios.find((n) => String(n.id) === batchShipId);
      const safeName = (navio?.nome || batchShipId).replace(/[^a-zA-Z0-9._-]+/g, "_");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `certificado-fatos-imersao-${safeName}.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      appToast.success("Certificado do navio gerado");
    } catch (err: any) {
      appToast.error(err.message || "Erro ao gerar o certificado");
    }
  }

  const activeBodyColSpan =
    Object.values(visibleColumns).filter(Boolean).length + 2;

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-4">
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {[
          { label: "Total", value: stats.total },
          { label: "Em vista", value: stats.visiveis },
          { label: "Ligados a navios", value: stats.associados },
          { label: "Inspeção ≤ 30 dias", value: stats.inspeccao30d },
          { label: "Inspeção vencida", value: stats.vencidos },
        ].map((item) => (
          <div key={item.label} className="bg-white border border-slate-200 rounded-xl px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{item.label}</p>
            <p className="text-xl font-bold text-slate-800">{item.value}</p>
          </div>
        ))}
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
        {(search || filterMarca || filterModelo || filterEstado) && (
          <button
            type="button"
            onClick={() => { setSearch(""); setFilterMarca(""); setFilterModelo(""); setFilterEstado(""); }}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            Limpar filtros
          </button>
        )}
      </div>

      <div className="flex gap-2">
        {([
          { key: "quadros", label: "Quadros", icon: LayoutGrid },
          { key: "lista", label: "Lista", icon: List },
          { key: "detalhes", label: "Detalhes", icon: Rows3 },
        ] as const).map((mode) => {
          const Icon = mode.icon;
          const active = viewMode === mode.key;
          return (
            <button
              key={mode.key}
              type="button"
              onClick={() => setViewMode(mode.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                active ? "bg-cyan-700 text-white border-cyan-700" : "bg-white text-slate-700 border-slate-300"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {mode.label}
            </button>
          );
        })}
      </div>

      {viewMode === "lista" && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="border-b border-slate-100 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium"
                onClick={() => setShowColumnSelector((prev) => !prev)}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {showColumnSelector ? "Ocultar seletor de colunas" : "Mostrar seletor de colunas"}
              </button>
              <div className="flex gap-2">
                <button type="button" className="rounded border border-slate-300 bg-white px-2 py-1 text-xs" onClick={showAllColumns}>
                  Mostrar todas
                </button>
                <button type="button" className="rounded border border-slate-300 bg-white px-2 py-1 text-xs" onClick={hideAlmostAllColumns}>
                  Ocultar quase todas
                </button>
              </div>
            </div>
            {showColumnSelector && (
              <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                {FATO_IMERSAO_LIST_COLUMNS.map((col) => (
                  <label key={col.key} className="inline-flex items-center gap-2 rounded border border-slate-200 px-2 py-1">
                    <input type="checkbox" checked={isColumnVisible(col.key)} onChange={() => toggleColumn(col.key)} />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
            <button
              className="inline-flex items-center gap-1 rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              disabled={selected.length === 0 || batchApplying}
              onClick={handleDeleteSelected}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir selecionados ({selected.length})
            </button>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
              value={batchShipId}
              onChange={(e) => setBatchShipId(e.target.value)}
              disabled={batchApplying}
            >
              <option value="">Associar a navio...</option>
              {navios.map((n) => (
                <option key={n.id} value={n.id}>{n.nome}</option>
              ))}
            </select>
            <button
              className="inline-flex items-center gap-1 rounded bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              disabled={selected.length === 0 || batchApplying || !batchShipId}
              onClick={() => void handleBatchAction("assign-ship")}
            >
              <Link className="w-3.5 h-3.5" /> Associar navio
            </button>
            <button
              className="inline-flex items-center gap-1 rounded bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              disabled={!batchShipId || batchApplying}
              onClick={() => void handleShipCertificate()}
              title="Gerar certificado DOCX com todos os fatos do navio selecionado"
            >
              <Award className="w-3.5 h-3.5" /> Certificado do navio
            </button>
            <button
              className="inline-flex items-center gap-1 rounded bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              disabled={selected.length === 0 || batchApplying}
              onClick={() => void handleBatchAction("clear-ship")}
            >
              <Unlink className="w-3.5 h-3.5" /> Remover navio
            </button>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
              value={batchEstado}
              onChange={(e) => setBatchEstado(e.target.value)}
              disabled={batchApplying}
            >
              <option value="">Atualizar estado...</option>
              {Object.values(FATO_IMERSAO_STATUS).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              disabled={selected.length === 0 || batchApplying || !batchEstado}
              onClick={() => void handleBatchAction("set-status")}
            >
              <Tag className="w-3.5 h-3.5" /> Aplicar estado
            </button>
            <span className="text-xs text-slate-500">Selecionados: {selected.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selected.length === filtered.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                    />
                  </th>
                  {isColumnVisible("navio") && <th className="px-3 py-2 text-left">Navio</th>}
                  {isColumnVisible("serial") && <th className="px-3 py-2 text-left">Série</th>}
                  {isColumnVisible("marca") && <th className="px-3 py-2 text-left">Marca</th>}
                  {isColumnVisible("modelo") && <th className="px-3 py-2 text-left">Modelo</th>}
                  {isColumnVisible("tamanho") && <th className="px-3 py-2 text-left">Tamanho</th>}
                  {isColumnVisible("tipo") && <th className="px-3 py-2 text-left">Tipo</th>}
                  {isColumnVisible("estado") && <th className="px-3 py-2 text-left">Estado</th>}
                  {isColumnVisible("dataFabrico") && <th className="px-3 py-2 text-left">Fabrico</th>}
                  {isColumnVisible("dataInspecao") && <th className="px-3 py-2 text-left">Inspeção</th>}
                  {isColumnVisible("dataProxInspecao") && <th className="px-3 py-2 text-left">Próx. inspeção</th>}
                  {isColumnVisible("observacoes") && <th className="px-3 py-2 text-left">Observações</th>}
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={activeBodyColSpan} className="px-3 py-8 text-center text-slate-400">
                      A carregar...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={activeBodyColSpan} className="px-3 py-8 text-center text-slate-400">
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
                          onChange={(e) => handleSelect(item.id, e.target.checked)}
                        />
                      </td>
                      {isColumnVisible("navio") && (
                        <td className="px-3 py-2 text-slate-600">
                          {item.shipId ? navioMap.get(item.shipId) || `Navio #${item.shipId}` : "—"}
                        </td>
                      )}
                      {isColumnVisible("serial") && (
                        <td className="px-3 py-2 font-mono font-semibold text-slate-800">
                          <button
                            className="text-cyan-800 hover:underline"
                            onClick={() => router.push(`/fatos-imersao/${item.id}`)}
                          >
                            {item.serial}
                          </button>
                        </td>
                      )}
                      {isColumnVisible("marca") && <td className="px-3 py-2">{item.marca || "—"}</td>}
                      {isColumnVisible("modelo") && <td className="px-3 py-2">{item.modelo || "—"}</td>}
                      {isColumnVisible("tamanho") && <td className="px-3 py-2">{item.tamanho || "—"}</td>}
                      {isColumnVisible("tipo") && <td className="px-3 py-2">{item.tipo || "—"}</td>}
                      {isColumnVisible("estado") && (
                        <td className="px-3 py-2">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">
                            {item.estado || "—"}
                          </span>
                        </td>
                      )}
                      {isColumnVisible("dataFabrico") && (
                        <td className="px-3 py-2">{toDisplayMonth(item.dataFabrico) || "—"}</td>
                      )}
                      {isColumnVisible("dataInspecao") && (
                        <td className="px-3 py-2">{formatInspectionDate(item.dataInspecao)}</td>
                      )}
                      {isColumnVisible("dataProxInspecao") && (
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <span className={isInspectionOverdue(item.dataProxInspecao) ? "font-medium text-red-600" : "text-slate-700"}>
                              {formatInspectionDate(item.dataProxInspecao)}
                            </span>
                            {renderInspectionUrgencyBadge(item.dataProxInspecao)}
                          </div>
                        </td>
                      )}
                      {isColumnVisible("observacoes") && (
                        <td className="px-3 py-2 max-w-xs truncate">{item.observacoes || "—"}</td>
                      )}
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
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
                          {item.certificado?.numeroCertificado && (
                            <button
                              onClick={() => router.push(`/fatos-imersao/${item.id}/certificado`)}
                              className="inline-flex p-1.5 rounded-md hover:bg-amber-50 text-amber-700"
                              title={`Certificado ${item.certificado.numeroCertificado}`}
                            >
                              <Award className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="inline-flex p-1.5 rounded-md hover:bg-slate-100 text-slate-600"
                            title="Editar ficha"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteOne(item.id)}
                            className="inline-flex p-1.5 rounded-md hover:bg-red-50 text-red-600"
                            title="Eliminar"
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
      )}

      {viewMode === "quadros" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedQuadros.map((item) => (
            <div key={item.id} className="border border-slate-200 rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{item.serial || "Fato de imersão"}</h3>
                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700">
                  {item.estado || "—"}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">Navio: {item.shipId ? navioMap.get(item.shipId) || `Navio #${item.shipId}` : "Sem navio"}</p>
              <p className="text-xs text-slate-600">Marca/Modelo: {[item.marca, item.modelo].filter(Boolean).join(" ") || "—"}</p>
              <p className="text-xs text-slate-600">Tamanho: {item.tamanho || "—"}</p>
              <p className="text-xs text-slate-600">Tipo: {item.tipo || "—"}</p>
              <p className="text-xs text-slate-600">Fabrico: {toDisplayMonth(item.dataFabrico) || "—"}</p>
              <p className="text-xs text-slate-600">Inspeção: {formatInspectionDate(item.dataInspecao)}</p>
              <p className="text-xs text-slate-600">Próxima: {formatInspectionDate(item.dataProxInspecao)}</p>
              <div className="mt-1">{renderInspectionUrgencyBadge(item.dataProxInspecao)}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => router.push(`/fatos-imersao/${item.id}`)}
                  className="inline-flex items-center gap-1 bg-cyan-700 hover:bg-cyan-800 px-2 py-1 rounded text-xs text-white font-medium"
                >
                  <Shirt className="w-3.5 h-3.5" /> Ficha
                </button>
                <button
                  onClick={() => handleOpenEdit(item)}
                  className="inline-flex items-center gap-1 bg-yellow-400 px-2 py-1 rounded text-xs text-slate-900"
                >
                  <Edit className="w-3.5 h-3.5" /> Editar
                </button>
                <button
                  onClick={() => handleDeleteOne(item.id)}
                  className="inline-flex items-center gap-1 bg-red-500 px-2 py-1 rounded text-xs text-white"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </button>
              </div>
            </div>
          ))}

          {filtered.length === 0 && !loading && (
            <div className="md:col-span-2 xl:col-span-3 border border-dashed border-slate-300 rounded-xl bg-slate-50 p-6 text-center">
              <p className="text-sm text-slate-500 mb-3">Nenhum fato de imersão encontrado.</p>
              <button type="button" onClick={handleOpenCreate} className="bg-cyan-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium">
                + Novo fato
              </button>
            </div>
          )}
        </div>
      )}

      {viewMode === "detalhes" && (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div key={item.id} className="border border-slate-200 rounded-xl bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{item.serial || "Fato de imersão"}</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => router.push(`/fatos-imersao/${item.id}`)}
                    className="inline-flex items-center gap-1 bg-cyan-700 hover:bg-cyan-800 px-2 py-1 rounded text-xs text-white font-medium"
                  >
                    <Shirt className="w-3.5 h-3.5" /> Ficha
                  </button>
                  <button
                    onClick={() => router.push(`/fatos-imersao/${item.id}/wizard`)}
                    className="inline-flex px-2 py-1 rounded text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                  >
                    Wizard
                  </button>
                  <button
                    onClick={() => handleOpenEdit(item)}
                    className="inline-flex items-center gap-1 bg-yellow-400 px-2 py-1 rounded text-xs text-slate-900"
                  >
                    <Edit className="w-3.5 h-3.5" /> Editar
                  </button>
                  <button
                    onClick={() => handleDeleteOne(item.id)}
                    className="inline-flex items-center gap-1 bg-red-500 px-2 py-1 rounded text-xs text-white"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Excluir
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 text-xs text-slate-700">
                <p><b>Navio:</b> {item.shipId ? navioMap.get(item.shipId) || `Navio #${item.shipId}` : "Sem navio"}</p>
                <p><b>Marca:</b> {item.marca || "—"}</p>
                <p><b>Modelo:</b> {item.modelo || "—"}</p>
                <p><b>Tamanho:</b> {item.tamanho || "—"}</p>
                <p><b>Tipo:</b> {item.tipo || "—"}</p>
                <p><b>Material:</b> {item.material || "—"}</p>
                <p><b>Estado:</b> {item.estado || "—"}</p>
                <p><b>Data fabrico:</b> {toDisplayMonth(item.dataFabrico) || "—"}</p>
                <p><b>Data inspeção:</b> {formatInspectionDate(item.dataInspecao)}</p>
                <p><b>Próxima inspeção:</b> {formatInspectionDate(item.dataProxInspecao)}</p>
                <p className="md:col-span-3"><b>Observações:</b> {item.observacoes || "—"}</p>
              </div>
              <div className="mt-2">{renderInspectionUrgencyBadge(item.dataProxInspecao)}</div>
            </div>
          ))}

          {filtered.length === 0 && !loading && (
            <div className="border border-dashed border-slate-300 rounded-xl bg-slate-50 p-6 text-center">
              <p className="text-sm text-slate-500 mb-3">Nenhum fato de imersão encontrado.</p>
              <button type="button" onClick={handleOpenCreate} className="bg-cyan-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium">
                + Novo fato
              </button>
            </div>
          )}
        </div>
      )}

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
                  type="month"
                  value={form.dataFabrico}
                  onChange={(e) => setForm({ ...form, dataFabrico: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2"
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
