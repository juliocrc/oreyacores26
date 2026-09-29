"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { extrairPortoDeMatricula } from '@/utils/portosRegisto';
import { NAVIO_TIPO_NAVIO_OPTIONS, NAVIO_TIPO_PESCA_OPTIONS, normalizeNavioTipoCategoria } from "@/lib/navio-legal-types";
import { sortNaviosAlphabetically } from "@/lib/navios-sort";
import type { Navio, JangadaItem, ColeteItem, EpirbItem, ClienteItem, ViewMode, NavioListColumnKey } from "@/types/navios-page";
import { IS_AZORES_APP, LOCATION_COLUMN_KEY, LOCATION_COLUMN_LABEL, NAVIO_LIST_COLUMNS_KEY, NAVIO_LIST_COLUMNS, BANDEIRAS_OPCOES, AZORES_LOCATION_OPTIONS, INITIAL_NAVIO_FORM, navioEstadoBadge, NAVIO_ESTADO_LABELS } from "@/types/navios-page";
import { buildDefaultNavioColumns, getNavioLocationLabel } from "@/lib/navios-page-helpers";
import { getLocationOptionsForTerritorio, type TerritorioGrupo } from "@/lib/portos-regioes";

export default function NaviosWizard() {
  const [mounted, setMounted] = useState(false);
  const [navios, setNavios] = useState<Navio[]>([]);
  const [totalNavios, setTotalNavios] = useState(0);
  const [portoOptions, setPortoOptions] = useState<string[]>([]);
  const [clienteOptions, setClienteOptions] = useState<string[]>([]);
  const naviosFetchSeq = useRef(0);
  const [fleetStats, setFleetStats] = useState<{
    total: number;
    comCliente: number;
    semCliente: number;
    semMatricula: number;
    comPortoRegisto: number;
    semIlha: number;
    ilhasAtivas: number;
    topIlha: { nome: string; total: number } | null;
    pescaLocal: number;
    pescaCosteira: number;
    maritimoTuristica: number;
    outrasTipologias: number;
  } | null>(null);
  // Seleção em lote
  const [selectedNavios, setSelectedNavios] = useState<number[]>([]);
  const [deletingBatch, setDeletingBatch] = useState(false);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<NavioListColumnKey, boolean>>(
    buildDefaultNavioColumns()
  );
    function handleSelectNavio(id: number, checked: boolean) {
      setSelectedNavios(prev => checked ? [...prev, id] : prev.filter(nid => nid !== id));
    }
    function handleSelectAllNavios(checked: boolean) {
      if (checked) {
        setSelectedNavios(pagedNavios.map(n => n.id));
      } else {
        setSelectedNavios([]);
      }
    }
    async function handleDeleteBatch() {
      if (selectedNavios.length === 0) return;
      if (!window.confirm(`Tem certeza que deseja excluir ${selectedNavios.length} navios?`)) return;
      setDeletingBatch(true);
      try {
        const response = await fetch("/api/navios", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: selectedNavios })
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || "Erro ao excluir navios.");
        }
        setSelectedNavios([]);
        await fetchNavios();
        alert("Navios excluídos com sucesso.");
      } catch (err) {
        alert(err instanceof Error ? err.message : "Erro ao excluir navios.");
      } finally {
        setDeletingBatch(false);
      }
    }
  const [tipoFilter, setTipoFilter] = useState<string>("");
  const [nomeFilter, setNomeFilter] = useState<string>("");
  const [cfrFilter, setCfrFilter] = useState<string>("");
  const [ilhaFilter, setIlhaFilter] = useState<string>("");
  const [clienteFilter, setClienteFilter] = useState<string>("");
  const [portoFilter, setPortoFilter] = useState<string>("");
  const [estadoFilter, setEstadoFilter] = useState<string>("");
  const [territorioFilter, setTerritorioFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const filterUrlSynced = useRef(false);
  const firstRender = useRef(true);
  const [form, setForm] = useState<Navio>(INITIAL_NAVIO_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("lista");
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [jangadasDisponiveis, setJangadasDisponiveis] = useState<JangadaItem[]>([]);
  const [coletesDisponiveis, setColetesDisponiveis] = useState<ColeteItem[]>([]);
  const [epirbsDisponiveis, setEpirbsDisponiveis] = useState<EpirbItem[]>([]);
  const [clientesDisponiveis, setClientesDisponiveis] = useState<ClienteItem[]>([]);
  const [selectedJangadaIds, setSelectedJangadaIds] = useState<number[]>([]);
  const [selectedColeteIds, setSelectedColeteIds] = useState<number[]>([]);
  const [selectedEpirbIds, setSelectedEpirbIds] = useState<number[]>([]);
  const [selectedClienteId, setSelectedClienteId] = useState<string>("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marcação de montagem no cliente.
    setMounted(true);
  }, []);

  // Sync filters from URL on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (filterUrlSynced.current) return;
    filterUrlSynced.current = true;
    try {
      const params = new URLSearchParams(window.location.search);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restauro dos filtros a partir da URL no arranque.
      const t = params.get("tipo"); if (t) setTipoFilter(t);
      const n = params.get("nome"); if (n) setNomeFilter(n);
      const cf = params.get("cfr"); if (cf) setCfrFilter(cf);
      const i = params.get("ilha"); if (i) setIlhaFilter(i);
      const c = params.get("cliente"); if (c) setClienteFilter(c);
      const p = params.get("porto"); if (p) setPortoFilter(p);
      const e = params.get("estado"); if (e) setEstadoFilter(e);
      const te = params.get("territorio"); if (te) setTerritorioFilter(te);
    } catch {}
  }, []);

  // Sync filter changes to URL
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams();
      if (tipoFilter) params.set("tipo", tipoFilter);
      if (nomeFilter) params.set("nome", nomeFilter);
      if (cfrFilter) params.set("cfr", cfrFilter);
      if (ilhaFilter) params.set("ilha", ilhaFilter);
      if (clienteFilter) params.set("cliente", clienteFilter);
      if (portoFilter) params.set("porto", portoFilter);
      if (estadoFilter) params.set("estado", estadoFilter);
      if (territorioFilter) params.set("territorio", territorioFilter);
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    } catch {}
  }, [tipoFilter, nomeFilter, cfrFilter, ilhaFilter, clienteFilter, portoFilter, estadoFilter, territorioFilter]);

  useEffect(() => {
    let active = true;

    async function loadAssociacoes() {
      try {
        const [jangadasRes, coletesRes, epirbsRes, clientesRes] = await Promise.all([
          fetch("/api/jangadas?scope=all"),
          fetch("/api/coletes"),
          fetch("/api/epirbs"),
          fetch("/api/clientes"),
        ]);

        const jangadasData = await jangadasRes.json().catch(() => []);
        const coletesData = await coletesRes.json().catch(() => []);
        const epirbsData = await epirbsRes.json().catch(() => []);
        const clientesData = await clientesRes.json().catch(() => []);

        if (!active) return;

        const allJangadas: JangadaItem[] = Array.isArray(jangadasData) ? jangadasData : [];
        const allColetes: ColeteItem[] = Array.isArray(coletesData) ? coletesData : [];
        const allEpirbs: EpirbItem[] = Array.isArray(epirbsData) ? epirbsData : [];
        const allClientes: ClienteItem[] = Array.isArray(clientesData) ? clientesData : [];
        const navioAtualId = editId;

        setJangadasDisponiveis(
          allJangadas.filter((j) => !j.shipId || (navioAtualId !== null && j.shipId === navioAtualId))
        );
        setColetesDisponiveis(
          allColetes.filter((c) => !c.shipId || (navioAtualId !== null && c.shipId === navioAtualId))
        );
        setEpirbsDisponiveis(
          allEpirbs.filter((e) => !e.shipId || (navioAtualId !== null && e.shipId === navioAtualId))
        );
        setClientesDisponiveis(allClientes);

        if (navioAtualId !== null) {
          setSelectedJangadaIds(allJangadas.filter((j) => j.shipId === navioAtualId).map((j) => j.id));
          setSelectedColeteIds(allColetes.filter((c) => c.shipId === navioAtualId).map((c) => c.id));
          setSelectedEpirbIds(allEpirbs.filter((e) => e.shipId === navioAtualId).map((e) => e.id));
          const navioAtual = navios.find((n) => n.id === navioAtualId);
          setSelectedClienteId(navioAtual?.cliente?.id ? String(navioAtual.cliente.id) : "");
        } else {
          setSelectedJangadaIds([]);
          setSelectedColeteIds([]);
          setSelectedEpirbIds([]);
          setSelectedClienteId("");
        }
      } catch {
        if (!active) return;
        setJangadasDisponiveis([]);
        setColetesDisponiveis([]);
        setEpirbsDisponiveis([]);
        setClientesDisponiveis([]);
      }
    }

    loadAssociacoes();

    return () => {
      active = false;
    };
  }, [editId, navios]);

  useEffect(() => {
    fetchNavios();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarga server-side quando filtros/paginação mudam.
  }, [tipoFilter, nomeFilter, cfrFilter, ilhaFilter, clienteFilter, portoFilter, estadoFilter, territorioFilter, page, pageSize]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(NAVIO_LIST_COLUMNS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Record<NavioListColumnKey, boolean>>;
      const defaults = buildDefaultNavioColumns();
      const merged = { ...defaults };
      for (const col of NAVIO_LIST_COLUMNS) {
        if (typeof parsed[col.key] === "boolean") {
          merged[col.key] = Boolean(parsed[col.key]);
        }
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restauro das colunas visíveis a partir da URL no arranque.
      setVisibleColumns(merged);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(NAVIO_LIST_COLUMNS_KEY, JSON.stringify(visibleColumns));
    } catch {}
  }, [visibleColumns]);

  const isColumnVisible = (key: NavioListColumnKey) => Boolean(visibleColumns[key]);

  const toggleColumn = (key: NavioListColumnKey) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const anyEnabled = Object.values(next).some(Boolean);
      if (!anyEnabled) return { ...next, [key]: true };
      return next;
    });
  };

  const showAllColumns = () => setVisibleColumns(buildDefaultNavioColumns());

  const hideAlmostAllColumns = () => {
    const first = NAVIO_LIST_COLUMNS[0]?.key;
    if (!first) return;
    const next = NAVIO_LIST_COLUMNS.reduce((acc, col) => {
      acc[col.key] = false;
      return acc;
    }, {} as Record<NavioListColumnKey, boolean>);
    next[first] = true;
    setVisibleColumns(next);
  };

  async function fetchNavios() {
    const seq = ++naviosFetchSeq.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope: "all" });
      if (tipoFilter) params.set("tipoPesca", tipoFilter);
      if (nomeFilter) params.set("nome", nomeFilter);
      if (cfrFilter) params.set("matricula", cfrFilter);
      if (ilhaFilter) params.set("ilha", ilhaFilter);
      if (clienteFilter) params.set("cliente", clienteFilter);
      if (portoFilter) params.set("porto", portoFilter);
      if (estadoFilter) params.set("estado", estadoFilter);
      if (territorioFilter) params.set("territorio", territorioFilter);
      params.set("pagina", String(page));
      params.set("limite", String(pageSize));
      const res = await fetch(`/api/navios?${params.toString()}`);
      const response = await res.json();
      const data = response.data ?? response;
      if (seq !== naviosFetchSeq.current) return;

      if (Array.isArray(data)) {
        setNavios(sortNaviosAlphabetically(data));
        setTotalNavios(data.length);
      } else if (data?.items) {
        setNavios(data.items);
        setTotalNavios(Number(data.total) || 0);
        if (data.stats) setFleetStats(data.stats);
        if (Array.isArray(data.portos)) setPortoOptions(data.portos);
        if (Array.isArray(data.clientes)) setClienteOptions(data.clientes);
      } else {
        setNavios([]);
        setTotalNavios(0);
      }
    } catch (err) {
      console.error("Error fetching navios:", err);
      if (seq !== naviosFetchSeq.current) return;
      setNavios([]);
      setTotalNavios(0);
    } finally {
      if (seq === naviosFetchSeq.current) setLoading(false);
    }
  }

  const ilhaOptions = useMemo(
    () => getLocationOptionsForTerritorio(territorioFilter as TerritorioGrupo | ""),
    [territorioFilter]
  );
  const uniqueClientes = clienteOptions;
  const uniquePortos = portoOptions;
  const uniqueTipos = NAVIO_TIPO_PESCA_OPTIONS;

  const filteredNavios = navios;
  const totalPages = Math.max(1, Math.ceil(totalNavios / pageSize));
  const pagedNavios = navios;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset da paginação quando os filtros mudam.
    setPage(1);
  }, [tipoFilter, nomeFilter, cfrFilter, ilhaFilter, clienteFilter, portoFilter, estadoFilter, territorioFilter, pageSize]);

  function handleTerritorioChange(value: string) {
    setTerritorioFilter(value);
    const options = getLocationOptionsForTerritorio(value as TerritorioGrupo | "");
    if (ilhaFilter && !options.includes(ilhaFilter)) {
      setIlhaFilter("");
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    const updates: Partial<Navio> = { [name]: value };
    
    // Se estiver alterando a matrícula, extrai automaticamente o porto de registo
    if (name === 'matricula') {
      const porto = extrairPortoDeMatricula(value);
      if (porto) {
        updates.portoRegisto = porto;
      }
    }
    
    setForm(f => ({ ...f, ...updates }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome) return;
    setLoading(true);
    const payload = {
      nome: form.nome,
      matricula: form.matricula || "",
      ilha: form.ilha || "",
      tipoPesca: form.tipoPesca || "",
      tipoNavio: form.tipoNavio || "",
      comprimentoMetros: String(form.comprimentoMetros ?? "").trim(),
      lotacao: String(form.lotacao ?? "").trim(),
      proprietario: form.proprietario || "",
      bandeira: form.bandeira || "Portugal",
      mmsi: form.mmsi || "",
      imo: form.imo || "",
      callSignal: form.callSignal || "",
      portoRegisto: form.portoRegisto || "",
      cfr: form.cfr || "",
      clienteId: selectedClienteId ? Number(selectedClienteId) : null,
    };

    const navioEmEdicaoId = editId;
    let response: Response;
    if (navioEmEdicaoId) {
      response = await fetch(`/api/navios/${navioEmEdicaoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      response = await fetch("/api/navios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data?.error || "Não foi possível salvar o navio.");
      setLoading(false);
      return;
    }

    const savedNavio = await response.json().catch(() => ({}));
    const savedNavioId = Number(savedNavio?.id ?? navioEmEdicaoId);

    try {
      if (Number.isFinite(savedNavioId) && savedNavioId > 0) {
        const currentJangadasDoNavio = jangadasDisponiveis
          .filter((j) => j.shipId === savedNavioId)
          .map((j) => j.id);

        const nextJangadaIds = selectedJangadaIds.filter((jangadaId) => Number.isFinite(jangadaId));

        const desassociarJangadas = currentJangadasDoNavio.filter((id) => !nextJangadaIds.includes(id));
        await Promise.all(
          desassociarJangadas.map((id) =>
            fetch(`/api/jangadas/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ shipId: null }),
            })
          )
        );

        const jangadasToLink = nextJangadaIds.filter((jangadaId) => !currentJangadasDoNavio.includes(jangadaId));
        await Promise.all(
          jangadasToLink.map((jangadaId) =>
            fetch(`/api/jangadas/${jangadaId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ shipId: savedNavioId }),
            })
          )
        );

        const currentColeteIds = coletesDisponiveis
          .filter((c) => c.shipId === savedNavioId)
          .map((c) => c.id);

        const toUnlink = currentColeteIds.filter((id) => !selectedColeteIds.includes(id));
        const toLink = selectedColeteIds.filter((id) => !currentColeteIds.includes(id));

        await Promise.all([
          ...toUnlink.map((id) =>
            fetch(`/api/coletes/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ shipId: null }),
            })
          ),
          ...toLink.map((id) =>
            fetch(`/api/coletes/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ shipId: savedNavioId }),
            })
          ),
        ]);

        const currentEpirbIds = epirbsDisponiveis
          .filter((e) => e.shipId === savedNavioId)
          .map((e) => e.id);

        const epirbsToUnlink = currentEpirbIds.filter((id) => !selectedEpirbIds.includes(id));
        const epirbsToLink = selectedEpirbIds.filter((id) => !currentEpirbIds.includes(id));

        await Promise.all([
          ...epirbsToUnlink.map((id) =>
            fetch(`/api/epirbs/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ shipId: null }),
            })
          ),
          ...epirbsToLink.map((id) =>
            fetch(`/api/epirbs/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ shipId: savedNavioId }),
            })
          ),
        ]);
      }
    } catch {
      alert("Navio salvo, mas ocorreu um erro ao associar jangadas/coletes/EPIRBs.");
    }

    setEditId(null);
    setForm(INITIAL_NAVIO_FORM);
    setIsFormExpanded(false);
    await fetchNavios();
    setLoading(false);
  }

  async function handleEdit(navio: Navio) {
    setForm({ ...navio, bandeira: navio.bandeira || "Portugal" });
    setEditId(navio.id);
    setIsFormExpanded(true);
    setSelectedClienteId(navio.cliente?.id ? String(navio.cliente.id) : "");
    if (typeof window !== "undefined") {
      document.getElementById("navio-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Tem certeza que deseja excluir este navio?")) return;
    setLoading(true);
    const response = await fetch(`/api/navios/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data?.error || "Não foi possível excluir o navio.");
      setLoading(false);
      return;
    }
    await fetchNavios();
    setLoading(false);
  }

  function openCreateWizard() {
    setForm(INITIAL_NAVIO_FORM);
    setSelectedJangadaIds([]);
    setSelectedColeteIds([]);
    setSelectedEpirbIds([]);
    setSelectedClienteId("");
    setEditId(null);
    setIsFormExpanded(true);
    if (typeof window !== "undefined") {
      document.getElementById("navio-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const stats = fleetStats || {
    total: totalNavios,
    comCliente: 0,
    semCliente: 0,
    semMatricula: 0,
    comPortoRegisto: 0,
    semIlha: 0,
    ilhasAtivas: 0,
    topIlha: null,
    pescaLocal: 0,
    pescaCosteira: 0,
    maritimoTuristica: 0,
    outrasTipologias: 0,
  };

  const dashboardCards = [
    { label: "Total em vista", value: totalNavios },
    { label: "Navios totais", value: stats.total },
    { label: "Com cliente", value: stats.comCliente },
    { label: "Sem cliente", value: stats.semCliente },
    { label: "Sem matrícula", value: stats.semMatricula },
  ];

  const dashboardHighlights = [
    {
      label: "Ilhas ativas",
      value: stats.ilhasAtivas,
      helper: "Número de ilhas/regiões canónicas com navios registados.",
    },
    {
      label: "Ilha com mais navios",
      value: stats.topIlha?.nome || "—",
      helper: stats.topIlha ? `${stats.topIlha.total} navio(s)` : "Sem distribuição por ilha.",
    },
    {
      label: "Com porto de registo",
      value: stats.comPortoRegisto,
      helper: "Navios com porto de registo preenchido.",
    },
    {
      label: "Sem ilha/região válida",
      value: stats.semIlha,
      helper: "Navios sem ilha ou região reconhecida na ficha do navio ou no cliente.",
    },
  ];

  if (!mounted) {
    return <div className="min-h-screen bg-gray-50" suppressHydrationWarning />;
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8" suppressHydrationWarning>
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 sm:px-6 lg:px-8">
        <div className="app-hero-panel flex flex-col gap-3 rounded-2xl p-4 text-white lg:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">Orey Técnica</p>
              <h1 className="mt-1 text-2xl font-bold lg:text-3xl">Registo de navios</h1>
              <p className="mt-1 max-w-3xl text-xs text-sky-100/95 lg:text-sm">
                Diretório operacional das embarcações com associações a cliente, jangada e coletes, seguindo o mesmo padrão visual dos clientes e contactos internos.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/20 sm:px-4 sm:text-sm"
                onClick={() => {
                  if (isFormExpanded) {
                    setIsFormExpanded(false);
                    return;
                  }
                  openCreateWizard();
                }}
              >
                {isFormExpanded ? "Recolher formulário" : "+ Novo navio"}
              </button>
              <button
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:px-4 sm:text-sm"
                onClick={fetchNavios}
              >
                Atualizar lista
              </button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {dashboardCards.map((item) => (
              <div key={item.label} className="app-hero-card rounded-xl p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-sky-100">{item.label}</p>
                <p className="mt-1 text-xl font-bold sm:text-2xl">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {dashboardHighlights.map((item) => (
              <div key={item.label} className="app-hero-card rounded-xl p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-sky-100">{item.label}</p>
                <p className="mt-1 text-lg font-bold text-white sm:text-xl">{item.value}</p>
                <p className="mt-1 text-xs text-sky-100/90">{item.helper}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Pesca local", value: stats.pescaLocal },
              { label: "Pesca costeira", value: stats.pescaCosteira },
              { label: "Marítimo turística", value: stats.maritimoTuristica },
              { label: "Outras tipologias", value: stats.outrasTipologias },
            ].map((item) => (
              <div key={item.label} className="app-hero-card-soft rounded-xl p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-sky-100">{item.label}</p>
                <p className="mt-1 text-lg font-bold text-white sm:text-xl">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <section id="navio-form" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{editId ? "Editar navio" : "Novo navio"}</h2>
              <p className="text-sm text-slate-500">
                {isFormExpanded
                  ? "Ficha rápida para criar ou corrigir a embarcação e respetivas associações."
                  : "Formulário recolhido para dar mais espaço ao diretório."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                {editId ? "Edição" : isFormExpanded ? "Manual" : "Recolhido"}
              </span>
              <button
                type="button"
                onClick={() => setIsFormExpanded((prev) => !prev)}
                className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                {isFormExpanded ? "Recolher formulário" : "Expandir formulário"}
              </button>
            </div>
          </div>

          {isFormExpanded ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs mb-1 text-gray-600">Nome do navio</label>
                <input
                  name="nome"
                  value={form.nome}
                  onChange={handleChange}
                  placeholder="Nome do navio (obrigatório)"
                  className="border rounded-lg px-3 py-2 w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600">Matrícula</label>
                <input
                  name="matricula"
                  value={form.matricula || ""}
                  onChange={handleChange}
                  placeholder="Ex: PTHOR-1234567"
                  className="border rounded-lg px-3 py-2 w-full"
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600">Porto de Registo</label>
                <input
                  name="portoRegisto"
                  value={form.portoRegisto || ""}
                  onChange={handleChange}
                  placeholder="Preenchido automaticamente pela matrícula"
                  className="border rounded-lg px-3 py-2 w-full bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600">Ilha</label>
                <input
                  name="ilha"
                  value={form.ilha || ""}
                  onChange={handleChange}
                  placeholder="Ilha / região"
                  className="border rounded-lg px-3 py-2 w-full"
                  list="navio-ilhas-opcoes"
                />
                <datalist id="navio-ilhas-opcoes">
                  {AZORES_LOCATION_OPTIONS.map((ilha) => (
                    <option key={ilha} value={ilha} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600">Enquadramento legal</label>
                <input
                  name="tipoPesca"
                  value={form.tipoPesca || ""}
                  onChange={handleChange}
                  placeholder="Ex.: Pesca Local"
                  className="border rounded-lg px-3 py-2 w-full"
                  list="navio-tipo-pesca-opcoes"
                />
                <datalist id="navio-tipo-pesca-opcoes">
                  {NAVIO_TIPO_PESCA_OPTIONS.map((tipo) => (
                    <option key={tipo} value={tipo} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600">Tipo de embarcação</label>
                <input
                  name="tipoNavio"
                  value={form.tipoNavio || ""}
                  onChange={handleChange}
                  placeholder="Ex.: Marítimo-Turística"
                  className="border rounded-lg px-3 py-2 w-full"
                  list="navio-tipo-navio-opcoes"
                />
                <datalist id="navio-tipo-navio-opcoes">
                  {NAVIO_TIPO_NAVIO_OPTIONS.map((tipo) => (
                    <option key={tipo} value={tipo} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600">Comprimento (m)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  name="comprimentoMetros"
                  value={String(form.comprimentoMetros ?? "")}
                  onChange={handleChange}
                  placeholder="Opcional · útil para pesca costeira"
                  className="border rounded-lg px-3 py-2 w-full"
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600">Proprietário</label>
                <input
                  name="proprietario"
                  value={form.proprietario || ""}
                  onChange={handleChange}
                  placeholder="Proprietário"
                  className="border rounded-lg px-3 py-2 w-full"
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600">Bandeira</label>
                <input
                  name="bandeira"
                  value={form.bandeira || ""}
                  onChange={handleChange}
                  placeholder="Bandeira"
                  className="border rounded-lg px-3 py-2 w-full"
                  list="bandeiras-opcoes"
                />
                <datalist id="bandeiras-opcoes">
                  {BANDEIRAS_OPCOES.map((flag) => (
                    <option key={flag} value={flag} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600">MMSI</label>
                <input
                  name="mmsi"
                  value={form.mmsi || ""}
                  onChange={handleChange}
                  placeholder="MMSI"
                  className="border rounded-lg px-3 py-2 w-full"
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600">IMO</label>
                <input
                  name="imo"
                  value={form.imo || ""}
                  onChange={handleChange}
                  placeholder="IMO"
                  className="border rounded-lg px-3 py-2 w-full"
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600">CALL SIGNAL</label>
                <input
                  name="callSignal"
                  value={form.callSignal || ""}
                  onChange={handleChange}
                  placeholder="CALL SIGNAL"
                  className="border rounded-lg px-3 py-2 w-full"
                />
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                HRU e refletor de radar são registados na ficha da jangada.
              </div>

              <div>
                <label className="block text-xs mb-1 text-gray-600">Cliente / Armador</label>
                <select
                  value={selectedClienteId}
                  onChange={(e) => setSelectedClienteId(e.target.value)}
                  className="border rounded-lg px-3 py-2 w-full"
                >
                  <option value="">Sem cliente associado</option>
                  {clientesDisponiveis
                    .slice()
                    .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt", { sensitivity: "base" }))
                    .map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {cliente.nome} {cliente.ilha ? `(${cliente.ilha})` : ""} {cliente.numeroCliente ? `[${cliente.numeroCliente}]` : ""}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs mb-1 text-gray-600">Associar jangadas</label>
                <select
                  multiple
                  value={selectedJangadaIds.map(String)}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions)
                      .map((opt) => Number(opt.value))
                      .filter((id) => Number.isFinite(id));
                    setSelectedJangadaIds(selected);
                  }}
                  className="border rounded-lg px-3 py-2 w-full"
                  size={Math.min(6, Math.max(3, jangadasDisponiveis.length || 3))}
                >
                  {jangadasDisponiveis
                    .slice()
                    .sort((a, b) => (a.serial || "").localeCompare(b.serial || ""))
                    .map((jangada) => (
                      <option key={jangada.id} value={jangada.id}>
                        {jangada.serial} {jangada.brand || jangada.model ? `- ${[jangada.brand, jangada.model].filter(Boolean).join(" ")}` : ""}
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-1">Dica: mantenha Ctrl pressionado para selecionar várias jangadas.</p>
              </div>

              <div>
                <label className="block text-xs mb-1 text-gray-600">Associar coletes</label>
                <select
                  multiple
                  value={selectedColeteIds.map(String)}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions)
                      .map((opt) => Number(opt.value))
                      .filter((id) => Number.isFinite(id));
                    setSelectedColeteIds(selected);
                  }}
                  className="border rounded-lg px-3 py-2 w-full"
                  size={Math.min(6, Math.max(3, coletesDisponiveis.length || 3))}
                >
                  {coletesDisponiveis
                    .slice()
                    .sort((a, b) => (a.serial || "").localeCompare(b.serial || ""))
                    .map((colete) => (
                      <option key={colete.id} value={colete.id}>
                        {colete.serial} {colete.marca || colete.modelo ? `- ${[colete.marca, colete.modelo].filter(Boolean).join(" ")}` : ""}
                        {colete.estado ? ` (${colete.estado})` : ""}
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-1">Dica: mantenha Ctrl pressionado para selecionar vários coletes.</p>
              </div>

              <div>
                <label className="block text-xs mb-1 text-gray-600">Associar EPIRBs</label>
                <select
                  multiple
                  value={selectedEpirbIds.map(String)}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions)
                      .map((opt) => Number(opt.value))
                      .filter((id) => Number.isFinite(id));
                    setSelectedEpirbIds(selected);
                  }}
                  className="border rounded-lg px-3 py-2 w-full"
                  size={Math.min(6, Math.max(3, epirbsDisponiveis.length || 3))}
                >
                  {epirbsDisponiveis
                    .slice()
                    .sort((a, b) => (a.serial || "").localeCompare(b.serial || ""))
                    .map((epirb) => (
                      <option key={epirb.id} value={epirb.id}>
                        {epirb.serial} {epirb.marca || epirb.modelo ? `- ${[epirb.marca, epirb.modelo].filter(Boolean).join(" ")}` : ""}
                        {epirb.estado ? ` (${epirb.estado})` : ""}
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-1">Dica: mantenha Ctrl pressionado para selecionar vários EPIRBs.</p>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" className="px-4 py-2 bg-gray-200 rounded-lg" onClick={() => { setEditId(null); setForm(INITIAL_NAVIO_FORM); setSelectedClienteId(""); setSelectedColeteIds([]); setSelectedJangadaIds([]); setSelectedEpirbIds([]); setIsFormExpanded(false); }}>Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Salvar</button>
              </div>
            </form>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
              O formulário está recolhido para libertar espaço ao diretório. Abra-o quando precisar de criar ou editar um navio.
            </div>
          )}
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Navios sem matrícula: <b>{stats.semMatricula}</b>. O porto de registo continua a ser sugerido automaticamente a partir da matrícula.
          </div>
        </section>

        <div className="w-full">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Diretório</h2>
                <p className="text-sm text-slate-500">Pesquisa, filtros e vistas da frota com ações rápidas para abrir ficha, editar ou excluir.</p>
              </div>
                  <div className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                    {stats.ilhasAtivas} {IS_AZORES_APP ? "ilha(s)" : "localização(ões)"}
              </div>
            </div>

          <div className="flex gap-2 mb-3">
            {([
              { key: "quadros", label: "Quadros" },
              { key: "lista", label: "Lista" },
              { key: "detalhes", label: "Detalhes" }
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
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className={`grid grid-cols-1 gap-2 ${IS_AZORES_APP ? "md:grid-cols-8" : "md:grid-cols-7"}`}>
            <div className={IS_AZORES_APP ? "md:col-span-2" : "md:col-span-2"}>
              <label className="block text-xs mb-1 text-gray-600">Nome do Navio</label>
              <input value={nomeFilter} onChange={e => setNomeFilter(e.target.value)} placeholder="Procurar por nome do navio" className="border rounded-lg bg-white px-3 py-2 w-full" />
            </div>
            <div>
              <label className="block text-xs mb-1 text-gray-600">CFR / Matrícula</label>
              <input value={cfrFilter} onChange={e => setCfrFilter(e.target.value)} placeholder="Ex: FN-715-L" className="border rounded-lg bg-white px-3 py-2 w-full" />
            </div>
            {IS_AZORES_APP && (
            <div>
              <label className="block text-xs mb-1 text-gray-600">Ilha / Região</label>
              <select value={ilhaFilter} onChange={e => setIlhaFilter(e.target.value)} className="border rounded-lg bg-white px-3 py-2 w-full">
                <option value="">Todas</option>
                {ilhaOptions.map((ilha) => <option key={ilha} value={ilha}>{ilha}</option>)}
              </select>
            </div>
            )}
            <div>
              <label className="block text-xs mb-1 text-gray-600">Tipo</label>
              <select value={tipoFilter} onChange={e => setTipoFilter(e.target.value)} className="border rounded-lg bg-white px-3 py-2 w-full">
                <option value="">Todos</option>
                {uniqueTipos.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1 text-gray-600">Cliente</label>
              <select value={clienteFilter} onChange={e => setClienteFilter(e.target.value)} className="border rounded-lg bg-white px-3 py-2 w-full">
                <option value="">Todos</option>
                {uniqueClientes.map((cliente) => <option key={cliente} value={cliente}>{cliente}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1 text-gray-600">Porto de registo</label>
              <select value={portoFilter} onChange={e => setPortoFilter(e.target.value)} className="border rounded-lg bg-white px-3 py-2 w-full">
                <option value="">Todos</option>
                {uniquePortos.map((porto) => <option key={porto} value={porto}>{porto}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1 text-gray-600">Estado</label>
              <select value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)} className="border rounded-lg bg-white px-3 py-2 w-full">
                <option value="">Todos</option>
                {Object.entries(NAVIO_ESTADO_LABELS).map(([key, { label }]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1 text-gray-600">Território</label>
              <select value={territorioFilter} onChange={e => handleTerritorioChange(e.target.value)} className="border rounded-lg bg-white px-3 py-2 w-full">
                <option value="">Todos</option>
                <option value="AÇORES">Açores</option>
                <option value="MADEIRA">Madeira</option>
                <option value="CONTINENTE">Continente</option>
              </select>
            </div>
            <div className={`${IS_AZORES_APP ? "md:col-span-6" : "md:col-span-5"} flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between`}>
              <div className="text-xs text-slate-500">
                {totalNavios} navio(s) encontrados com os filtros atuais.
              </div>
              <button className="self-start rounded-lg bg-gray-200 px-3 py-2 text-xs font-medium text-slate-700 sm:self-auto" onClick={() => { setTipoFilter(''); setNomeFilter(''); setIlhaFilter(''); setClienteFilter(''); setPortoFilter(''); setEstadoFilter(''); setPage(1); }}>Limpar filtros</button>
            </div>
          </div>
          </div>
          {loading ? (
            <div className="text-center py-8 text-gray-600">Carregando...</div>
          ) : viewMode === "lista" ? (
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
                    {NAVIO_LIST_COLUMNS.map((col) => (
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
                  disabled={selectedNavios.length === 0 || deletingBatch}
                  onClick={handleDeleteBatch}
                >
                  {deletingBatch ? "A eliminar..." : `Excluir selecionados (${selectedNavios.length})`}
                </button>
                <span className="text-xs text-gray-500">Selecionados: {selectedNavios.length}</span>
              </div>
              <table className="min-w-full text-xs sm:text-sm">
                <thead>
                  <tr className="bg-blue-100">
                    <th className="p-2"><input type="checkbox" onChange={e => handleSelectAllNavios(e.target.checked)} checked={selectedNavios.length > 0 && selectedNavios.length === pagedNavios.length} /></th>
                    {isColumnVisible("nome") && <th className="p-2">Nome</th>}
                    {isColumnVisible("matricula") && <th className="p-2">Matrícula</th>}
                    {isColumnVisible("cliente") && <th className="p-2">Cliente</th>}
                    {isColumnVisible("portoRegisto") && <th className="p-2">Porto de Registo</th>}
                    {isColumnVisible("tipo") && <th className="p-2">Tipo de Navio</th>}
                    {isColumnVisible("estado") && <th className="p-2">Estado</th>}
                    {isColumnVisible(LOCATION_COLUMN_KEY) && <th className="p-2">{LOCATION_COLUMN_LABEL}</th>}
                    <th className="p-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedNavios.map(n => (
                    <tr key={n.id} className="border-t align-top">
                      <td className="p-2"><input type="checkbox" checked={selectedNavios.includes(n.id)} onChange={e => handleSelectNavio(n.id, e.target.checked)} /></td>
                      {isColumnVisible("nome") && <td className="p-2">
                        <a href={`/navios/${n.id}`} className="text-blue-700 hover:underline font-semibold" title="Ver detalhes do navio">{n.nome}</a>
                      </td>}
                      {isColumnVisible("matricula") && <td className="p-2">{n.matricula}</td>}
                      {isColumnVisible("cliente") && <td className="p-2">{n.cliente?.nome ?? '—'}</td>}
                      {isColumnVisible("portoRegisto") && <td className="p-2">{n.portoRegisto || '-'}</td>}
                      {isColumnVisible("tipo") && <td className="p-2">{normalizeNavioTipoCategoria(n.tipoPesca, n.matricula, n.tipoNavio)}</td>}
                      {isColumnVisible("estado") && <td className="p-2"><span className={`inline-block rounded-md border px-2 py-0.5 text-xs ${navioEstadoBadge(n.estadoNavio).cls}`}>{navioEstadoBadge(n.estadoNavio).label}</span></td>}
                      {isColumnVisible(LOCATION_COLUMN_KEY) && <td className="p-2">{getNavioLocationLabel(n)}</td>}
                      <td className="p-2 flex gap-2">
                        <a href={`/navios/${n.id}`} className="bg-blue-500 px-2 py-1 rounded text-xs text-white">Ver ficha</a>
                        <button className="bg-yellow-400 px-2 py-1 rounded text-xs" onClick={() => handleEdit(n)}>Editar</button>
                        <button className="bg-red-500 px-2 py-1 rounded text-xs text-white" onClick={() => handleDelete(n.id)}>Excluir</button>
                      </td>
                    </tr>
                  ))}
                  {filteredNavios.length === 0 && (
                    <tr>
                      <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 2} className="p-6 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-3">
                          <span>Nenhum navio encontrado com os filtros aplicados.</span>
                          <button
                            type="button"
                            className="bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium"
                            onClick={openCreateWizard}
                          >
                            + Novo navio
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : viewMode === "quadros" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {pagedNavios.map((n) => (
                <div key={n.id} className="border border-gray-200 rounded-lg bg-gray-50 p-4">
                  <Link href={`/navios/${n.id}`} className="font-semibold text-gray-900 hover:text-blue-700 hover:underline">
                    {n.nome}
                  </Link>
                  <p className="text-xs text-gray-600 mt-1">Matrícula: {n.matricula || "-"}</p>
                  <p className="text-xs text-gray-600">{LOCATION_COLUMN_LABEL}: {getNavioLocationLabel(n)}</p>
                  <p className="text-xs text-gray-600">Tipo: {normalizeNavioTipoCategoria(n.tipoPesca, n.matricula, n.tipoNavio)}</p>
                  <div className="mt-3 flex gap-2">
                    <a href={`/navios/${n.id}`} className="bg-blue-500 px-2 py-1 rounded text-xs text-white">Ver ficha</a>
                    <button className="bg-yellow-400 px-2 py-1 rounded text-xs" onClick={() => handleEdit(n)}>Editar</button>
                    <button className="bg-red-500 px-2 py-1 rounded text-xs text-white" onClick={() => handleDelete(n.id)}>Excluir</button>
                  </div>
                </div>
              ))}
              {filteredNavios.length === 0 && (
                <div className="md:col-span-2 xl:col-span-3 border border-dashed border-gray-300 rounded-lg bg-gray-50 p-6 text-center">
                  <p className="text-sm text-gray-500 mb-3">Nenhum navio encontrado com os filtros aplicados.</p>
                  <button
                    type="button"
                    className="bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium"
                    onClick={openCreateWizard}
                  >
                    + Novo navio
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {pagedNavios.map((n) => (
                <div key={n.id} className="border border-gray-200 rounded-lg bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/navios/${n.id}`} className="font-semibold text-gray-900 hover:text-blue-700 hover:underline">
                      {n.nome}
                    </Link>
                    <div className="flex gap-2">
                      <a href={`/navios/${n.id}`} className="bg-blue-500 px-2 py-1 rounded text-xs text-white">Ver ficha</a>
                      <button className="bg-yellow-400 px-2 py-1 rounded text-xs" onClick={() => handleEdit(n)}>Editar</button>
                      <button className="bg-red-500 px-2 py-1 rounded text-xs text-white" onClick={() => handleDelete(n.id)}>Excluir</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
                    <p><b>Matrícula:</b> {n.matricula || "-"}</p>
                    <p><b>Cliente:</b> {n.cliente?.nome ?? "—"}</p>
                    <p><b>{LOCATION_COLUMN_LABEL}:</b> {getNavioLocationLabel(n)}</p>
                    <p><b>Tipo de Navio:</b> {normalizeNavioTipoCategoria(n.tipoPesca, n.matricula, n.tipoNavio)}</p>
                  </div>
                </div>
              ))}
              {filteredNavios.length === 0 && (
                <div className="border border-dashed border-gray-300 rounded-lg bg-gray-50 p-6 text-center">
                  <p className="text-sm text-gray-500 mb-3">Nenhum navio encontrado com os filtros aplicados.</p>
                  <button
                    type="button"
                    className="bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium"
                    onClick={openCreateWizard}
                  >
                    + Novo navio
                  </button>
                </div>
              )}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-4">
              <div className="text-xs text-gray-600">
                Página {page} de {totalPages} — {totalNavios} navio(s) encontrados.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-gray-600">Por página</label>
                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="border rounded-lg bg-white px-2 py-1 text-xs">
                  {[50, 100, 250, 500].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <button className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
                <button className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Próxima</button>
              </div>
            </div>
          )}

          <div className="mt-4">
            <p className="text-xs text-gray-500">Navios carregados: {totalNavios}</p>
          </div>
          </section>
        </div>
      </div>
    </div>
  );
}

