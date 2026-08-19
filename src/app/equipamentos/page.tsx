"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { lifejacketModelData } from "@/modules/lifejackets/lifejacketModelData";
import { sortNaviosAlphabetically } from "@/lib/navios-sort";
import { QrCode, X } from "lucide-react";
import { Html5QrcodeScanner } from "html5-qrcode";
import {
  type Colete, type Navio, type ViewMode, type ColeteListColumnKey,
  type ColeteForm, type ColeteCatalogOption,
  EMPTY_FORM, COLETE_LIST_COLUMNS_KEY, COLETE_LIST_COLUMNS, buildDefaultColeteColumns,
} from "@/types/equipamentos-page";
import {
  formatMonthYear, formatInspectionDate, isInspectionOverdue,
  isInspectionDueWithin30Days,
  getInspectionUrgencyRank, normalizeCatalogKey, getUniqueNormalizedLabels,
  getManualData,
} from "@/lib/equipamentos-page-helpers";

function renderInspectionUrgencyBadge(value: string | null | undefined) {
  if (isInspectionOverdue(value)) {
    return (
      <span className="inline-flex rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
        GI vencida
      </span>
    );
  }

  if (isInspectionDueWithin30Days(value)) {
    return (
      <span className="inline-flex rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
        GI ≤ 30 dias
      </span>
    );
  }

  return null;
}

export default function ColetesPage() {
  const router = useRouter();
  const [coletes, setColetes] = useState<Colete[]>([]);
  const [navios, setNavios] = useState<Navio[]>([]);
  const [search, setSearch] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [filterMarca, setFilterMarca] = useState("");
  const [filterModelo, setFilterModelo] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
  const [filterNavio, setFilterNavio] = useState("");
  const [onlyExpiring30Days, setOnlyExpiring30Days] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("lista");
  const filterUrlSynced = useRef(false);
  const firstRender = useRef(true);
  const [showWizard, setShowWizard] = useState(false);
  const [form, setForm] = useState<ColeteForm>(EMPTY_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [viewItem, setViewItem] = useState<Colete | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedColetes, setSelectedColetes] = useState<number[]>([]);
  const [deletingBatch, setDeletingBatch] = useState(false);
  const [batchApplying, setBatchApplying] = useState(false);
  const [batchShipId, setBatchShipId] = useState("");
  const [batchEstado, setBatchEstado] = useState("");
  const [catalogOptions, setCatalogOptions] = useState<ColeteCatalogOption[]>([]);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<ColeteListColumnKey, boolean>>(
    buildDefaultColeteColumns()
  );

  const navioById = useMemo(() => {
    const map = new Map<number, Navio>();
    navios.forEach((navio) => map.set(navio.id, navio));
    return map;
  }, [navios]);

  const getShipId = (colete: Colete) => {
    const byShipId = typeof colete.shipId === "number" ? colete.shipId : Number(colete.shipId);
    if (Number.isFinite(byShipId)) return byShipId;
    const byNavioId = typeof colete.navioId === "number" ? colete.navioId : Number(colete.navioId);
    if (Number.isFinite(byNavioId)) return byNavioId;
    return null;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [coletesRes, naviosRes, catalogRes] = await Promise.all([
        fetch("/api/coletes", { cache: "no-store" }),
        fetch("/api/navios?scope=all", { cache: "no-store" }),
        fetch("/api/coletes/catalog-options", { cache: "no-store" }),
      ]);

      if (!coletesRes.ok) {
        const errText = await coletesRes.text().catch(() => "");
        console.error(`[Equipamentos] /api/coletes failed: ${coletesRes.status} ${errText}`);
      }
      if (!naviosRes.ok) {
        const errText = await naviosRes.text().catch(() => "");
        console.error(`[Equipamentos] /api/navios failed: ${naviosRes.status} ${errText}`);
      }
      if (!catalogRes.ok) {
        const errText = await catalogRes.text().catch(() => "");
        console.error(`[Equipamentos] /api/coletes/catalog-options failed: ${catalogRes.status} ${errText}`);
      }

      const coletesData = coletesRes.ok ? await coletesRes.json() : [];
      const naviosRaw = naviosRes.ok ? await naviosRes.json() : [];
      const catalogRaw = catalogRes.ok ? await catalogRes.json() : {};
      const naviosData = Array.isArray(naviosRaw?.data) ? naviosRaw.data : naviosRaw;
      const optionsData = Array.isArray(catalogRaw?.options) ? catalogRaw.options : [];

      setColetes(Array.isArray(coletesData) ? coletesData : []);
      setNavios(Array.isArray(naviosData) ? sortNaviosAlphabetically(naviosData) : []);
      setCatalogOptions(optionsData);
    } catch (e: any) {
      console.error("[Equipamentos] loadData error:", e);
      setColetes([]);
      setNavios([]);
      setCatalogOptions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Sync filters from URL on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (filterUrlSynced.current) return;
    filterUrlSynced.current = true;
    try {
      const params = new URLSearchParams(window.location.search);
      const s = params.get("pesquisa"); if (s) setSearch(s);
      const b = params.get("marca"); if (b) setFilterMarca(b);
      const m = params.get("modelo"); if (m) setFilterModelo(m);
      const e = params.get("estado"); if (e) setFilterEstado(e);
      const n = params.get("navio"); if (n) setFilterNavio(n);
      if (params.get("exp30") === "1") setOnlyExpiring30Days(true);
      const vm = params.get("vista");
      if (vm === "lista" || vm === "detalhes" || vm === "quadros") setViewMode(vm);
    } catch {}
  }, []);

  // Sync filter changes to URL
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams();
      if (search) params.set("pesquisa", search);
      if (filterMarca) params.set("marca", filterMarca);
      if (filterModelo) params.set("modelo", filterModelo);
      if (filterEstado) params.set("estado", filterEstado);
      if (filterNavio) params.set("navio", filterNavio);
      if (onlyExpiring30Days) params.set("exp30", "1");
      if (viewMode !== "lista") params.set("vista", viewMode);
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    } catch {}
  }, [search, filterMarca, filterModelo, filterEstado, filterNavio, onlyExpiring30Days, viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(COLETE_LIST_COLUMNS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Record<ColeteListColumnKey, boolean>>;
      const defaults = buildDefaultColeteColumns();
      const merged = { ...defaults };
      for (const col of COLETE_LIST_COLUMNS) {
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
      window.localStorage.setItem(COLETE_LIST_COLUMNS_KEY, JSON.stringify(visibleColumns));
    } catch {}
  }, [visibleColumns]);

  useEffect(() => {
    if (!showScanner) return;
    const scanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
    
    scanner.render((decodedText) => {
      try {
        scanner.clear().then(() => {
          setShowScanner(false);
          const cleanText = decodedText.trim();
          if (cleanText.includes('/equipamentos/')) {
            const pathIndex = cleanText.indexOf('/equipamentos/');
            const subPath = cleanText.substring(pathIndex);
            if (/^\/equipamentos\/[\w\-\/]+$/.test(subPath)) {
              router.push(subPath);
            }
          } else {
            // Procurar localmente por número de série
            const found = coletes.find(c => String(c.serial || "").trim().toLowerCase() === cleanText.toLowerCase());
            if (found && found.id) {
              router.push(`/equipamentos/${found.id}`);
            } else {
              setSearch(cleanText);
            }
          }
        }).catch(err => {
          console.error("Error clearing scanner:", err);
        });
      } catch (e) {
        console.error("Error processing QR code:", e);
      }
    }, () => {});

    return () => {
      scanner.clear().catch(err => console.warn("Clean scan error:", err));
    };
  }, [showScanner, coletes, router]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return coletes.filter((colete) => {
      const shipId = getShipId(colete);
      const navio = shipId ? navioById.get(shipId) : null;
      const matchesSearch = !term || [
        colete.serial,
        colete.marca,
        colete.modelo,
        colete.tamanho,
        colete.estado,
        colete.observacoes,
        navio?.nome,
        navio?.matricula,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));

      const matchesMarca = !filterMarca || normalizeCatalogKey(colete.marca || "") === normalizeCatalogKey(filterMarca);
      const matchesModelo = !filterModelo || normalizeCatalogKey(colete.modelo || "") === normalizeCatalogKey(filterModelo);
      const matchesEstado = !filterEstado || String(colete.estado || "") === filterEstado;
      const matchesNavio = !filterNavio || String(shipId || "") === filterNavio;
      const matchesExpiring = !onlyExpiring30Days || isInspectionDueWithin30Days(colete.dataProxInspecao);

      return matchesSearch && matchesMarca && matchesModelo && matchesEstado && matchesNavio && matchesExpiring;
    });
  }, [coletes, search, navioById, filterMarca, filterModelo, filterEstado, filterNavio, onlyExpiring30Days]);

  const sortedQuadros = useMemo(() => (
    [...filtered].sort((a, b) => {
      const urgencyDiff = getInspectionUrgencyRank(a.dataProxInspecao) - getInspectionUrgencyRank(b.dataProxInspecao);
      if (urgencyDiff !== 0) return urgencyDiff;
      return String(a.serial || "").localeCompare(String(b.serial || ""), "pt", { sensitivity: "base" });
    })
  ), [filtered]);

  const uniqueMarcas = useMemo(
    () => getUniqueNormalizedLabels(coletes.map((item) => item.marca)),
    [coletes]
  );
  const uniqueModelos = useMemo(
    () => getUniqueNormalizedLabels(
      coletes
        .filter((item) => !filterMarca || normalizeCatalogKey(item.marca || "") === normalizeCatalogKey(filterMarca))
        .map((item) => item.modelo)
    ),
    [coletes, filterMarca]
  );
  const uniqueEstados = useMemo(() => Array.from(new Set(coletes.map((item) => String(item.estado || "").trim()).filter(Boolean))).sort(), [coletes]);

  const catalogBrandManufacturerMap = useMemo(() => {
    const map = new Map<string, string>();

    for (const option of catalogOptions) {
      const key = normalizeCatalogKey(option.marca);
      const manufacturer = String(option.fabricante || "").trim();
      if (!key || !manufacturer || map.has(key)) continue;
      map.set(key, manufacturer);
    }

    return map;
  }, [catalogOptions]);

  const catalogBrandCountryMap = useMemo(() => {
    const map = new Map<string, string>();

    for (const option of catalogOptions) {
      const key = normalizeCatalogKey(option.marca);
      const origin = String(option.origem || "").trim();
      if (!key || !origin || /^xls\./i.test(origin) || map.has(key)) continue;
      map.set(key, origin);
    }

    for (const brand of lifejacketModelData) {
      const key = normalizeCatalogKey(brand.brand);
      if (!key) continue;
      const country = String(brand.manufacturingCountry || "").trim();
      if (country) map.set(key, country);
    }
    return map;
  }, [catalogOptions]);

  const catalogModelCountryMap = useMemo(() => {
    const map = new Map<string, string>();

    for (const option of catalogOptions) {
      const normalizedBrand = normalizeCatalogKey(option.marca);
      const normalizedModel = normalizeCatalogKey(option.modelo);
      const origin = String(option.origem || "").trim();
      if (!normalizedBrand || !normalizedModel || !origin || /^xls\./i.test(origin)) continue;
      const key = `${normalizedBrand}::${normalizedModel}`;
      if (!map.has(key)) map.set(key, origin);
    }

    for (const brand of lifejacketModelData) {
      const normalizedBrand = normalizeCatalogKey(brand.brand);
      const defaultCountry = String(brand.manufacturingCountry || "").trim();
      for (const model of brand.models || []) {
        const normalizedModel = normalizeCatalogKey(model.model);
        if (!normalizedBrand || !normalizedModel) continue;
        const country = String(model.manufacturingCountry || defaultCountry || "").trim();
        if (!country) continue;
        map.set(`${normalizedBrand}::${normalizedModel}`, country);
      }
    }
    return map;
  }, [catalogOptions]);

  const catalogModelOnlyCountryMap = useMemo(() => {
    const map = new Map<string, string>();

    for (const option of catalogOptions) {
      const modelKey = normalizeCatalogKey(option.modelo);
      const origin = String(option.origem || "").trim();
      if (!modelKey || !origin || /^xls\./i.test(origin) || map.has(modelKey)) continue;
      map.set(modelKey, origin);
    }

    for (const brand of lifejacketModelData) {
      const fallbackCountry = String(brand.manufacturingCountry || "").trim();
      for (const model of brand.models || []) {
        const modelKey = normalizeCatalogKey(model.model);
        if (!modelKey || map.has(modelKey)) continue;
        const country = String(model.manufacturingCountry || fallbackCountry || "").trim();
        if (country) map.set(modelKey, country);
      }
    }
    return map;
  }, [catalogOptions]);

  const resolveManufacturingCountry = (marca?: string | null, modelo?: string | null) => {
    const brandKey = normalizeCatalogKey(marca || "");
    const modelKey = normalizeCatalogKey(modelo || "");

    if (brandKey && modelKey) {
      const exact = catalogModelCountryMap.get(`${brandKey}::${modelKey}`);
      if (exact) return exact;
    }

    if (brandKey) {
      const byBrand = catalogBrandCountryMap.get(brandKey);
      if (byBrand) return byBrand;
    }

    if (modelKey) {
      const byModel = catalogModelOnlyCountryMap.get(modelKey);
      if (byModel) return byModel;
    }

    return "â€”";
  };

  const formBrandOptions = useMemo(() => {
    return getUniqueNormalizedLabels([
      ...catalogOptions.map((option) => option.marca),
      ...lifejacketModelData.map((catalog) => catalog.brand),
      ...uniqueMarcas,
      form.marca,
    ]);
  }, [catalogOptions, uniqueMarcas, form.marca]);

  const formModelOptions = useMemo(() => {
    const selectedBrandKey = normalizeCatalogKey(form.marca);
    const all: string[] = [];

    for (const model of coletes
      .filter((item) => !form.marca || normalizeCatalogKey(item.marca || "") === selectedBrandKey)
      .map((item) => String(item.modelo || "").trim())
      .filter(Boolean)) {
      all.push(model);
    }

    for (const catalogBrand of lifejacketModelData) {
      if (selectedBrandKey && normalizeCatalogKey(catalogBrand.brand) !== selectedBrandKey) continue;
      for (const model of catalogBrand.models || []) {
        all.push(model.model);
      }
    }

    for (const option of catalogOptions) {
      if (selectedBrandKey && normalizeCatalogKey(option.marca) !== selectedBrandKey) continue;
      all.push(option.modelo);
    }

    if (form.modelo.trim()) all.push(form.modelo.trim());

    return getUniqueNormalizedLabels(all);
  }, [coletes, catalogOptions, form.marca, form.modelo]);

  const filterBrandOptions = useMemo(() => {
    return getUniqueNormalizedLabels([
      ...catalogOptions.map((option) => option.marca),
      ...lifejacketModelData.map((catalog) => catalog.brand),
      ...uniqueMarcas,
    ]);
  }, [catalogOptions, uniqueMarcas]);

  const filterModelOptions = useMemo(() => {
    const selectedBrandKey = normalizeCatalogKey(filterMarca);
    const all: string[] = [];

    for (const modelo of uniqueModelos) all.push(modelo);

    for (const catalogBrand of lifejacketModelData) {
      if (selectedBrandKey && normalizeCatalogKey(catalogBrand.brand) !== selectedBrandKey) continue;
      for (const model of catalogBrand.models || []) {
        all.push(model.model);
      }
    }

    for (const option of catalogOptions) {
      if (selectedBrandKey && normalizeCatalogKey(option.marca) !== selectedBrandKey) continue;
      all.push(option.modelo);
    }

    return getUniqueNormalizedLabels(all);
  }, [uniqueModelos, filterMarca, catalogOptions]);

  const coleteStats = useMemo(() => ({
    total: coletes.length,
    visiveis: filtered.length,
    inspeccao30d: coletes.filter((item) => isInspectionDueWithin30Days(item.dataProxInspecao)).length,
    vencidos: coletes.filter((item) => isInspectionOverdue(item.dataProxInspecao)).length,
    associados: coletes.filter((item) => Number.isFinite(getShipId(item) || NaN)).length,
  }), [coletes, filtered]);


  const isColumnVisible = (key: ColeteListColumnKey) => Boolean(visibleColumns[key]);

  const toggleColumn = (key: ColeteListColumnKey) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const anyEnabled = Object.values(next).some(Boolean);
      if (!anyEnabled) return { ...next, [key]: true };
      return next;
    });
  };

  const showAllColumns = () => setVisibleColumns(buildDefaultColeteColumns());

  const hideAlmostAllColumns = () => {
    const first = COLETE_LIST_COLUMNS[0]?.key;
    if (!first) return;
    const next = COLETE_LIST_COLUMNS.reduce((acc, col) => {
      acc[col.key] = false;
      return acc;
    }, {} as Record<ColeteListColumnKey, boolean>);
    next[first] = true;
    setVisibleColumns(next);
  };

  function handleSelectColete(id: number, checked: boolean) {
    setSelectedColetes((prev) => checked ? [...prev, id] : prev.filter((itemId) => itemId !== id));
  }

  function handleSelectAllColetes(checked: boolean) {
    if (checked) {
      setSelectedColetes(filtered.map((item) => item.id));
    } else {
      setSelectedColetes([]);
    }
  }

  async function handleDeleteBatch() {
    if (selectedColetes.length === 0) return;
    if (!window.confirm(`Tem certeza que deseja excluir ${selectedColetes.length} coletes?`)) return;
    setDeletingBatch(true);
    try {
      const response = await fetch("/api/coletes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedColetes }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Erro ao excluir coletes.");
      }

      setSelectedColetes([]);
      await loadData();
      alert("Coletes excluídos com sucesso.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao excluir coletes.");
    } finally {
      setDeletingBatch(false);
    }
  }

  async function handleBatchAction(action: "assign-ship" | "clear-ship" | "set-status") {
    if (selectedColetes.length === 0) return;
    if (action === "assign-ship" && !batchShipId) {
      alert("Selecione primeiro o navio para a associação em lote.");
      return;
    }
    if (action === "set-status" && !batchEstado) {
      alert("Selecione primeiro o estado para a atualização em lote.");
      return;
    }

    setBatchApplying(true);
    try {
      const response = await fetch("/api/coletes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedColetes,
          action,
          shipId: action === "assign-ship" ? Number(batchShipId) : undefined,
          estado: action === "set-status" ? batchEstado : undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Erro ao aplicar ação em lote nos coletes.");
      }

      setSelectedColetes([]);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao aplicar ação em lote nos coletes.");
    } finally {
      setBatchApplying(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setFilterMarca("");
    setFilterModelo("");
    setFilterEstado("");
    setFilterNavio("");
    setOnlyExpiring30Days(false);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }

  function openNew() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setShowWizard(true);
  }

  function openEdit(item: Colete) {
    setForm({
      shipId: String(getShipId(item) || ""),
      serial: item.serial || "",
      marca: item.marca || "",
      modelo: item.modelo || "",
      tamanho: item.tamanho || "",
      estado: item.estado || "Ativo",
      dataFabrico: item.dataFabrico || "",
      dataInspecao: item.dataInspecao || "",
      dataProxInspecao: item.dataProxInspecao || "",
      observacoes: item.observacoes || "",
    });
    setEditId(item.id);
    setShowWizard(true);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.serial.trim()) {
      alert("Nº de série do colete é obrigatório.");
      return;
    }

    const payload = {
      shipId: form.shipId ? Number(form.shipId) : null,
      serial: form.serial.trim(),
      marca: form.marca.trim() || null,
      modelo: form.modelo.trim() || null,
      tamanho: form.tamanho.trim() || null,
      estado: form.estado || "Ativo",
      dataFabrico: form.dataFabrico || null,
      dataInspecao: form.dataInspecao || null,
      dataProxInspecao: form.dataProxInspecao || null,
      observacoes: form.observacoes.trim() || null,
    };

    const response = await fetch(editId ? `/api/coletes/${editId}` : "/api/coletes", {
      method: editId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      alert(error?.error || "Não foi possível guardar o colete.");
      return;
    }

    const savedItem = await response.json();
    setShowWizard(false);
    setEditId(null);
    setForm(EMPTY_FORM);
    
    // Se for um novo colete, redirecionar logo para o Wizard de inspecção
    if (!editId && savedItem && savedItem.id) {
      router.push(`/equipamentos/${savedItem.id}`);
    } else {
      await loadData();
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Tem certeza que deseja excluir este colete?")) return;
    const response = await fetch(`/api/coletes/${id}`, { method: "DELETE" });
    if (!response.ok) {
      alert("Não foi possível excluir o colete.");
      return;
    }
    if (viewItem?.id === id) setViewItem(null);
    await loadData();
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="app-hero-panel mb-6 flex flex-col gap-4 rounded-2xl p-6 text-white">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-base font-semibold uppercase tracking-[0.2em] text-sky-100">Orey Técnica</p>
              <h1 className="mt-2 text-4xl font-bold">Coletes</h1>
              <p className="mt-2 max-w-4xl text-base text-sky-100">
                Gestão de coletes com o mesmo padrão visual de navios, clientes e jangadas, incluindo prioridades de inspeção e associação rápida a navios.
              </p>
              <button onClick={openNew} className="rounded-lg bg-blue-600 px-4 py-2 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700">
                + Cadastrar Novo Colete
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
             {[
               { label: "Total", value: coleteStats.total },
               { label: "Em vista", value: coleteStats.visiveis },
               { label: "Ligados a navios", value: coleteStats.associados },
               { label: "Próx. inspeção ≤ 30 dias", value: coleteStats.inspeccao30d },
               { label: "Inspeção vencida", value: coleteStats.vencidos },
             ].map((item) => (
               <div key={item.label} className="app-hero-card rounded-xl p-4">
                 <p className="text-xs uppercase tracking-[0.2em] text-sky-100">{item.label}</p>
                 <p className="mt-2 text-2xl font-bold">{item.value}</p>
               </div>
             ))}
            </div>
          </div>
          </div>

        {showWizard && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md border border-gray-200">
              <h3 className="text-lg font-bold mb-4">{editId ? "Editar Colete" : "Novo Colete"}</h3>
              <form onSubmit={handleSubmit} className="space-y-3">
                <select name="shipId" value={form.shipId} onChange={handleChange} className="border rounded-lg px-3 py-2 w-full">
                  <option value="">Sem navio associado</option>
                  {navios.map((navio) => (
                    <option key={navio.id} value={navio.id}>{navio.nome}{navio.matricula ? ` (${navio.matricula})` : ""}</option>
                  ))}
                </select>
                <input name="serial" value={form.serial} onChange={handleChange} placeholder="Nº Série (obrigatório)" className="border rounded-lg px-3 py-2 w-full" required />
                <select name="marca" value={form.marca} onChange={handleChange} className="border rounded-lg px-3 py-2 w-full">
                  <option value="">Selecionar marca...</option>
                  {formBrandOptions.map((marca) => {
                    const country = catalogBrandCountryMap.get(normalizeCatalogKey(marca));
                    const manufacturer = catalogBrandManufacturerMap.get(normalizeCatalogKey(marca));
                    const meta = [manufacturer && manufacturer !== marca ? `Fab: ${manufacturer}` : "", country ? `País: ${country}` : ""].filter(Boolean).join(" · ");
                    const label = meta ? `${marca} (${meta})` : marca;
                    return (
                      <option key={marca} value={marca}>{label}</option>
                    );
                  })}
                </select>
                <select name="modelo" value={form.modelo} onChange={handleChange} className="border rounded-lg px-3 py-2 w-full">
                  <option value="">Selecionar modelo...</option>
                  {formModelOptions.map((modelo) => {
                    const country = catalogModelCountryMap.get(`${normalizeCatalogKey(form.marca)}::${normalizeCatalogKey(modelo)}`);
                    const label = country ? `${modelo} (${country})` : modelo;
                    return (
                      <option key={modelo} value={modelo}>{label}</option>
                    );
                  })}
                </select>
                <input
                  value={resolveManufacturingCountry(form.marca, form.modelo)}
                  readOnly
                  placeholder="País de fabrico"
                  className="border rounded-lg px-3 py-2 w-full bg-gray-50 text-gray-700"
                  title="País de fabrico (calculado automaticamente pelo catálogo técnico)"
                />
                <input name="tamanho" value={form.tamanho} onChange={handleChange} placeholder="Tamanho" className="border rounded-lg px-3 py-2 w-full" />
                <select name="estado" value={form.estado} onChange={handleChange} className="border rounded-lg px-3 py-2 w-full">
                  <option value="Ativo">Ativo</option>
                  <option value="Em manutenção">Em manutenção</option>
                  <option value="Inativo">Inativo</option>
                </select>
                <div className="flex gap-2">
                  <div className="w-1/3">
                    <label className="text-xs text-gray-500 mb-1 block">Data Fabrico</label>
                    <input name="dataFabrico" type="month" value={form.dataFabrico} onChange={handleChange} className="border rounded-lg px-3 py-2 w-full text-sm" />
                  </div>
                  <div className="w-1/3">
                    <label className="text-xs text-gray-500 mb-1 block">Data Inspeção</label>
                    <input name="dataInspecao" type="date" value={form.dataInspecao} onChange={handleChange} className="border rounded-lg px-3 py-2 w-full text-sm" />
                  </div>
                  <div className="w-1/3">
                    <label className="text-xs text-gray-500 mb-1 block">Próx. Inspeção</label>
                    <input name="dataProxInspecao" type="date" value={form.dataProxInspecao} onChange={handleChange} className="border rounded-lg px-3 py-2 w-full text-sm" />
                  </div>
                </div>
                <textarea name="observacoes" value={form.observacoes} onChange={handleChange} placeholder="Observações" className="border rounded-lg px-3 py-2 w-full" rows={3} />
                <div className="flex gap-2 justify-end">
                  <button type="button" className="px-4 py-2 bg-gray-200 rounded-lg" onClick={() => { setShowWizard(false); setEditId(null); }}>
                    Cancelar
                  </button>
                  <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Salvar</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {viewItem && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md border border-gray-200">
              <h3 className="text-lg font-bold mb-4">Ficha do Colete</h3>
              {(() => {
                 const manualData = getManualData(viewItem);
                return manualData.manuals.length > 0 ? (
                  <div className="mb-4 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900">
                    <p className="font-semibold">Manual técnico disponível</p>
                    <p className="mt-1 text-xs text-cyan-700">
                      {manualData.matchedModel ? `Correspondência automática: ${manualData.displayLabel}` : "Correspondência automática por marca."}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {manualData.manuals.map((manual) => (
                        <a
                          key={manual.href}
                          href={manual.href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700"
                        >
                          Abrir manual
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
              <ul className="mb-4 text-sm space-y-1">
                <li><b>Navio:</b> {(() => {
                  const shipId = getShipId(viewItem);
                  return shipId ? navioById.get(shipId)?.nome || "-" : "Sem navio associado";
                })()}</li>
                <li><b>Nº Série:</b> {viewItem.serial || "-"}</li>
                <li><b>Marca:</b> {viewItem.marca || "-"}</li>
                <li><b>País de fabrico:</b> {resolveManufacturingCountry(viewItem.marca, viewItem.modelo)}</li>
                <li><b>Modelo:</b> {viewItem.modelo || "-"}</li>
                <li><b>Tamanho:</b> {viewItem.tamanho || "-"}</li>
                <li><b>Estado:</b> {viewItem.estado || "-"}</li>
                <li><b>Data de inspeção:</b> {formatInspectionDate(viewItem.dataInspecao)}</li>
                <li><b>Próxima inspeção:</b> {formatInspectionDate(viewItem.dataProxInspecao)}</li>
                <li><b>Observações:</b> {viewItem.observacoes || "-"}</li>
              </ul>
              <div className="flex gap-2 justify-end">
                <button className="px-4 py-2 bg-indigo-600 text-white rounded" onClick={() => { openEdit(viewItem); setViewItem(null); }}>
                  Editar ficha
                </button>
                <button className="px-4 py-2 bg-gray-300 rounded" onClick={() => setViewItem(null)}>Fechar</button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          {showScanner && (
            <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-2xl relative animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <QrCode size={16} className="text-indigo-600 animate-pulse" /> Leitor de Código de Equipamento
                </h4>
                <button
                  onClick={() => setShowScanner(false)}
                  className="text-slate-400 hover:text-rose-500 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div id="qr-reader" className="w-full max-w-md mx-auto bg-black rounded-xl overflow-hidden border border-slate-700 shadow-md animate-in zoom-in-95 duration-200" />
              <p className="text-[10px] text-center text-slate-400 mt-2">
                Aponte a câmara para o código QR do colete ou para o código de barras do número de série.
              </p>
            </div>
          )}

          <div className="mb-4 grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
            <label className="block text-xs font-semibold text-gray-700 md:col-span-2">
              Pesquisa
              <div className="relative mt-1">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Navio, série, marca, modelo, estado..."
                  className="border rounded-lg pl-3 pr-10 py-2 w-full bg-white text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowScanner(!showScanner)}
                  title="Ler QR Code ou Código de Barras"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors"
                >
                  <QrCode size={16} />
                </button>
              </div>
            </label>
            <label className="block text-xs font-semibold text-gray-700">
              Marca
              <select className="mt-1 border rounded-lg px-2 py-2 text-sm w-full" value={filterMarca} onChange={(e) => setFilterMarca(e.target.value)}>
                <option value="">Todas as marcas</option>
                {filterBrandOptions.map((marca) => (
                  <option key={marca} value={marca}>
                    {catalogBrandCountryMap.get(normalizeCatalogKey(marca))
                      ? `${marca} (${catalogBrandCountryMap.get(normalizeCatalogKey(marca))})`
                      : marca}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-gray-700">
              Modelo
              <select className="mt-1 border rounded-lg px-2 py-2 text-sm w-full" value={filterModelo} onChange={(e) => setFilterModelo(e.target.value)}>
                <option value="">Todos os modelos</option>
                {filterModelOptions.map((modelo) => (
                  <option key={modelo} value={modelo}>
                    {catalogModelCountryMap.get(`${normalizeCatalogKey(filterMarca)}::${normalizeCatalogKey(modelo)}`)
                      ? `${modelo} (${catalogModelCountryMap.get(`${normalizeCatalogKey(filterMarca)}::${normalizeCatalogKey(modelo)}`)})`
                      : modelo}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-gray-700">
              Estado
              <select className="mt-1 border rounded-lg px-2 py-2 text-sm w-full" value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)}>
                <option value="">Todos os estados</option>
                {uniqueEstados.map((estado) => (
                  <option key={estado} value={estado}>{estado}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-gray-700">
              Navio
              <select className="mt-1 border rounded-lg px-2 py-2 text-sm w-full" value={filterNavio} onChange={(e) => setFilterNavio(e.target.value)}>
                <option value="">Todos os navios</option>
                {navios.map((navio) => (
                  <option key={navio.id} value={navio.id}>{navio.nome}{navio.matricula ? ` (${navio.matricula})` : ""}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-700 md:col-span-5">
              <input type="checkbox" checked={onlyExpiring30Days} onChange={(e) => setOnlyExpiring30Days(e.target.checked)} />
              Mostrar apenas coletes com próxima inspeção nos próximos 30 dias
            </label>
            <div className="md:col-span-1 flex justify-end">
              <button type="button" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50" onClick={clearFilters}>
                Limpar filtros
              </button>
            </div>
          </div>

          <div className="flex gap-2 mb-3">
            {([
              { key: "quadros", label: "Quadros" },
              { key: "lista", label: "Lista" },
              { key: "detalhes", label: "Detalhes" },
            ] as const).map((mode) => (
              <button
                key={mode.key}
                type="button"
                onClick={() => setViewMode(mode.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${viewMode === mode.key ? "bg-blue-700 text-white border-blue-700" : "bg-white text-gray-700 border-gray-300"}`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {viewMode === "lista" && (
            <div className="overflow-auto">
              <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className="rounded border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-medium"
                    onClick={() => setShowColumnSelector((prev) => !prev)}
                  >
                    {showColumnSelector ? "Ocultar seletor de colunas" : "Mostrar seletor de colunas"}
                  </button>
                  <div className="flex gap-2">
                    <button type="button" className="rounded border border-gray-300 bg-white px-2 py-1 text-xs" onClick={showAllColumns}>
                      Mostrar todas
                    </button>
                    <button type="button" className="rounded border border-gray-300 bg-white px-2 py-1 text-xs" onClick={hideAlmostAllColumns}>
                      Ocultar quase todas
                    </button>
                  </div>
                </div>
                {showColumnSelector && (
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    {COLETE_LIST_COLUMNS.map((col) => (
                      <label key={col.key} className="inline-flex items-center gap-2 rounded border border-gray-200 px-2 py-1">
                        <input type="checkbox" checked={isColumnVisible(col.key)} onChange={() => toggleColumn(col.key)} />
                        {col.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mb-2">
                <button
                  className="px-3 py-1.5 rounded bg-red-600 text-white text-xs font-semibold disabled:opacity-50"
                  disabled={selectedColetes.length === 0 || deletingBatch || batchApplying}
                  onClick={handleDeleteBatch}
                >
                  {deletingBatch ? "A eliminar..." : `Excluir selecionados (${selectedColetes.length})`}
                </button>
                <select
                  className="rounded border border-gray-300 bg-white px-2 py-1.5 text-xs"
                  value={batchShipId}
                  onChange={(e) => setBatchShipId(e.target.value)}
                  disabled={batchApplying}
                >
                  <option value="">Associar a navio...</option>
                  {navios.map((navio) => (
                    <option key={navio.id} value={navio.id}>{navio.nome}{navio.matricula ? ` (${navio.matricula})` : ""}</option>
                  ))}
                </select>
                <button
                  className="px-3 py-1.5 rounded bg-sky-600 text-white text-xs font-semibold disabled:opacity-50"
                  disabled={selectedColetes.length === 0 || batchApplying || !batchShipId}
                  onClick={() => void handleBatchAction("assign-ship")}
                >
                  {batchApplying ? "A aplicar..." : "Associar navio"}
                </button>
                <button
                  className="px-3 py-1.5 rounded bg-slate-600 text-white text-xs font-semibold disabled:opacity-50"
                  disabled={selectedColetes.length === 0 || batchApplying}
                  onClick={() => void handleBatchAction("clear-ship")}
                >
                  Remover navio
                </button>
                <select
                  className="rounded border border-gray-300 bg-white px-2 py-1.5 text-xs"
                  value={batchEstado}
                  onChange={(e) => setBatchEstado(e.target.value)}
                  disabled={batchApplying}
                >
                  <option value="">Atualizar estado...</option>
                  <option value="Ativo">Ativo</option>
                  <option value="Em manutenção">Em manutenção</option>
                  <option value="Inativo">Inativo</option>
                </select>
                <button
                  className="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
                  disabled={selectedColetes.length === 0 || batchApplying || !batchEstado}
                  onClick={() => void handleBatchAction("set-status")}
                >
                  Aplicar estado
                </button>
                <span className="text-xs text-gray-500">Selecionados: {selectedColetes.length}</span>
              </div>
              <table className="min-w-full text-xs sm:text-sm">
                <thead>
                  <tr className="bg-blue-100">
                    <th className="p-2"><input type="checkbox" onChange={(e) => handleSelectAllColetes(e.target.checked)} checked={selectedColetes.length > 0 && selectedColetes.length === filtered.length} /></th>
                    {isColumnVisible("navio") && <th className="p-2">Navio</th>}
                    {isColumnVisible("serial") && <th className="p-2">Nº Série</th>}
                    {isColumnVisible("marca") && <th className="p-2">Marca</th>}
                    {isColumnVisible("paisFabrico") && <th className="p-2">País fabrico</th>}
                    {isColumnVisible("modelo") && <th className="p-2">Modelo</th>}
                    {isColumnVisible("tamanho") && <th className="p-2">Tamanho</th>}
                    {isColumnVisible("estado") && <th className="p-2">Estado</th>}
                    {isColumnVisible("dataFabrico") && <th className="p-2">Data fabrico</th>}
                    {isColumnVisible("dataInspecao") && <th className="p-2">Data inspeção</th>}
                    {isColumnVisible("dataProxInspecao") && <th className="p-2">Próxima inspeção</th>}
                    {isColumnVisible("observacoes") && <th className="p-2">Observações</th>}
                    <th className="p-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && filtered.map((item) => {
                    const shipId = getShipId(item);
                    const navio = shipId ? navioById.get(shipId) : null;
                    return (
                      <tr key={item.id} className="border-t align-top">
                        <td className="p-2"><input type="checkbox" checked={selectedColetes.includes(item.id)} onChange={(e) => handleSelectColete(item.id, e.target.checked)} /></td>
                        {isColumnVisible("navio") && <td className="p-2">{navio?.nome || "Sem navio"}</td>}
                        {isColumnVisible("serial") && <td className="p-2">
                          <Link href={`/equipamentos/${item.id}`} className="text-blue-700 underline hover:text-blue-900 font-medium">
                            {item.serial || "-"}
                          </Link>
                        </td>}
                        {isColumnVisible("marca") && <td className="p-2">{item.marca || "-"}</td>}
                        {isColumnVisible("paisFabrico") && <td className="p-2">{resolveManufacturingCountry(item.marca, item.modelo)}</td>}
                        {isColumnVisible("modelo") && <td className="p-2">{item.modelo || "-"}</td>}
                        {isColumnVisible("tamanho") && <td className="p-2">{item.tamanho || "-"}</td>}
                        {isColumnVisible("estado") && <td className="p-2">{item.estado || "-"}</td>}
                        {isColumnVisible("dataFabrico") && <td className="p-2">{formatMonthYear(item.dataFabrico)}</td>}
                        {isColumnVisible("dataInspecao") && <td className="p-2">{formatInspectionDate(item.dataInspecao)}</td>}
                        {isColumnVisible("dataProxInspecao") && <td className="p-2"><div className="flex flex-col gap-1"><span className={isInspectionDueWithin30Days(item.dataProxInspecao) ? 'font-medium text-red-600' : 'text-gray-700'}>{formatInspectionDate(item.dataProxInspecao)}</span>{renderInspectionUrgencyBadge(item.dataProxInspecao)}</div></td>}
                        {isColumnVisible("observacoes") && <td className="p-2 max-w-xs truncate">{item.observacoes || "-"}</td>}
                        <td className="p-2 flex gap-2">
                          <Link href={`/equipamentos/${item.id}`} className="bg-indigo-600 hover:bg-indigo-700 px-2 py-1 rounded text-xs text-white font-medium flex items-center justify-center">Dossier</Link>
                          <button className="bg-yellow-400 px-2 py-1 rounded text-xs" onClick={() => openEdit(item)}>Editar ficha</button>
                          <button className="bg-red-500 px-2 py-1 rounded text-xs text-white" onClick={() => handleDelete(item.id)}>Excluir</button>
                        </td>
                      </tr>
                    );
                  })}

                  {!loading && filtered.length === 0 && (
                    <tr>
                      <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 2} className="p-6 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-3">
                          <span>Nenhum colete encontrado.</span>
                          <button type="button" onClick={openNew} className="bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium">
                            + Cadastrar novo colete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {loading && (
                    <tr>
                      <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 2} className="p-6 text-center text-gray-500">A carregar coletes...</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {viewMode === "quadros" && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {sortedQuadros.map((item) => {
                const shipId = getShipId(item);
                const navio = shipId ? navioById.get(shipId) : null;
                return (
                  <div key={item.id} className="border border-gray-200 rounded-lg bg-gray-50 p-4">
                    {(() => {
                      const manualData = getManualData(item);
                      return manualData.manuals.length > 0 ? (
                        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">Manual técnico</p>
                            <p className="text-xs text-cyan-900">{manualData.matchedModel ? `${manualData.displayLabel}` : `${item.marca || "Marca"}`}</p>
                          </div>
                          <a href={manualData.manuals[0].href} target="_blank" rel="noreferrer" className="rounded-lg bg-cyan-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700">
                            Abrir
                          </a>
                        </div>
                      ) : null;
                    })()}
                    <h3 className="font-semibold text-gray-900">{item.serial || "Colete"}</h3>
                    <p className="text-xs text-gray-600 mt-1">Navio: {navio?.nome || "Sem navio"}</p>
                    <p className="text-xs text-gray-600">Marca/Modelo: {[item.marca, item.modelo].filter(Boolean).join(" ") || "-"}</p>
                    <p className="text-xs text-gray-600">País fabrico: {resolveManufacturingCountry(item.marca, item.modelo)}</p>
                    <p className="text-xs text-gray-600">Estado: {item.estado || "-"}</p>
                    <p className="text-xs text-gray-600">Fabrico: {formatMonthYear(item.dataFabrico)}</p>
                    <p className="text-xs text-gray-600">Inspeção: {formatInspectionDate(item.dataInspecao)}</p>
                    <p className="text-xs text-gray-600">Próxima: {formatInspectionDate(item.dataProxInspecao)}</p>
                    <div className="mt-1 mb-2">{renderInspectionUrgencyBadge(item.dataProxInspecao)}</div>
                    <div className="mt-3 flex gap-2">
                      <Link href={`/equipamentos/${item.id}`} className="bg-indigo-600 hover:bg-indigo-700 px-2 py-1 rounded text-xs text-white font-medium flex items-center justify-center">Dossier</Link>
                      <button className="bg-yellow-400 px-2 py-1 rounded text-xs" onClick={() => openEdit(item)}>Editar ficha</button>
                      <button className="bg-red-500 px-2 py-1 rounded text-xs text-white" onClick={() => handleDelete(item.id)}>Excluir</button>
                    </div>
                  </div>
                );
              })}

              {filtered.length === 0 && !loading && (
                <div className="md:col-span-2 xl:col-span-3 border border-dashed border-gray-300 rounded-lg bg-gray-50 p-6 text-center">
                  <p className="text-sm text-gray-500 mb-3">Nenhum colete encontrado.</p>
                  <button type="button" onClick={openNew} className="bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium">
                    + Cadastrar novo colete
                  </button>
                </div>
              )}
            </div>
          )}

          {viewMode === "detalhes" && (
            <div className="space-y-3">
              {filtered.map((item) => {
                const shipId = getShipId(item);
                const navio = shipId ? navioById.get(shipId) : null;
                return (
                  <div key={item.id} className="border border-gray-200 rounded-lg bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-gray-900">{item.serial || "Colete"}</h3>
                      <div className="flex gap-2">
                        <Link href={`/equipamentos/${item.id}`} className="bg-indigo-600 hover:bg-indigo-700 px-2 py-1 rounded text-xs text-white font-medium flex items-center justify-center">Dossier</Link>
                        <button className="bg-yellow-400 px-2 py-1 rounded text-xs" onClick={() => openEdit(item)}>Editar ficha</button>
                        <button className="bg-red-500 px-2 py-1 rounded text-xs text-white" onClick={() => handleDelete(item.id)}>Excluir</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 text-xs">
                      <p><b>Navio:</b> {navio?.nome || "Sem navio"}</p>
                      <p><b>Marca:</b> {item.marca || "-"}</p>
                      <p><b>País fabrico:</b> {resolveManufacturingCountry(item.marca, item.modelo)}</p>
                      <p><b>Modelo:</b> {item.modelo || "-"}</p>
                      <p><b>Tamanho:</b> {item.tamanho || "-"}</p>
                      <p><b>Estado:</b> {item.estado || "-"}</p>
                      <p><b>Data fabrico:</b> {formatMonthYear(item.dataFabrico)}</p>
                      <p><b>Data inspeção:</b> {formatInspectionDate(item.dataInspecao)}</p>
                      <p><b>Próxima inspeção:</b> {formatInspectionDate(item.dataProxInspecao)}</p>
                      <p><b>Observações:</b> {item.observacoes || "-"}</p>
                    </div>
                    {(() => {
                      const manualData = getManualData(item);
                      return manualData.manuals.length > 0 ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs">
                          <span className="font-semibold text-cyan-900">Manual técnico:</span>
                          <span className="text-cyan-800">{manualData.matchedModel ? manualData.displayLabel : item.marca || "Marca"}</span>
                          <a href={manualData.manuals[0].href} target="_blank" rel="noreferrer" className="rounded bg-cyan-600 px-2 py-1 font-semibold text-white hover:bg-cyan-700">
                            Abrir manual
                          </a>
                        </div>
                      ) : null;
                    })()}
                    <div className="mt-2">{renderInspectionUrgencyBadge(item.dataProxInspecao)}</div>
                  </div>
                );
              })}

              {filtered.length === 0 && !loading && (
                <div className="border border-dashed border-gray-300 rounded-lg bg-gray-50 p-6 text-center">
                  <p className="text-sm text-gray-500 mb-3">Nenhum colete encontrado.</p>
                  <button type="button" onClick={openNew} className="bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium">
                    + Cadastrar novo colete
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 px-2 sm:px-0">
            <p className="text-xs text-gray-500">Coletes carregados: {coletes.length}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
