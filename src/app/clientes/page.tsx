"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { CLIENTE_PAYMENT_MODE_OPTIONS } from "@/lib/cliente-payment-options";
import { NAVIO_TIPO_NAVIO_OPTIONS, NAVIO_TIPO_PESCA_OPTIONS } from "@/lib/navio-legal-types";
import { sortNaviosAlphabetically } from "@/lib/navios-sort";
import DataTable, { type ColumnDef } from "@/components/shared/DataTable";

import { type Cliente, type Navio, type ClienteListColumnKey, type ViewMode, CLIENTE_LIST_COLUMNS_KEY, CLIENTE_LIST_COLUMNS } from "@/types/clientes-page";
import { buildDefaultClienteListColumns, normalizeNaviosResponse, normalizePhoneSearch, getMissingProfileFields } from "@/lib/clientes-page-helpers";
import { getCanonicalNavioLocationLabel } from "@/lib/navios-page-helpers";

export default function ClientesPage() {
  const [groupedClientes, setGroupedClientes] = useState<{ [key: string]: Cliente[] }>({});
  const [allNavios, setAllNavios] = useState<Navio[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedClienteId, setSelectedClienteId] = useState("");
  const [selectedIlha, setSelectedIlha] = useState("");
  const [expandedClienteId, setExpandedClienteId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("quadros");
  const [selectedNavioByCliente, setSelectedNavioByCliente] = useState<Record<number, string>>({});
  const [navioSearchByCliente, setNavioSearchByCliente] = useState<Record<number, string>>({});
  const [savingAssociation, setSavingAssociation] = useState(false);
  const [creatingNavioByCliente, setCreatingNavioByCliente] = useState<Record<number, boolean>>({});
  const [editingClienteId, setEditingClienteId] = useState<number | null>(null);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [creatingCliente, setCreatingCliente] = useState(false);
  const [newCliente, setNewCliente] = useState({
    nome: "",
    numeroCliente: "",
    modoPagamento: "",
    ilha: "",
    morada: "",
    moradaNumero: "",
    codigoPostal: "",
    localidade: "",
    nif: "",
    email: "",
    telefone: "",
    telmovel: "",
    observacoes: ""
  });
  const [profileErrorsByCliente, setProfileErrorsByCliente] = useState<Record<number, {
    nif?: string;
    email?: string;
    telefone?: string;
    telmovel?: string;
  }>>({});
  const [profileDraftByCliente, setProfileDraftByCliente] = useState<Record<number, {
    nome: string;
    numeroCliente: string;
    modoPagamento: string;
    morada: string;
    moradaNumero: string;
    codigoPostal: string;
    localidade: string;
    ilha: string;
    nif: string;
    email: string;
    telefone: string;
    telmovel: string;
  }>>({});
  const [newNavioByCliente, setNewNavioByCliente] = useState<Record<number, {
    nome: string;
    matricula: string;
    ilha: string;
    tipoPesca: string;
    tipoNavio: string;
  }>>({});
  const [selectedClientes, setSelectedClientes] = useState<number[]>([]);
  const [deletingBatch, setDeletingBatch] = useState(false);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<ClienteListColumnKey, boolean>>(
    buildDefaultClienteListColumns()
  );

  const groupClientesByIlha = (clientes: Cliente[]) => {
    const grouped: { [key: string]: Cliente[] } = {};
    for (const cliente of clientes) {
        const ilha = (getCanonicalNavioLocationLabel(cliente.ilha) || cliente.ilha) || "Sem ilha";
        if (!grouped[ilha]) grouped[ilha] = [];
        grouped[ilha].push(cliente);
      }
    return grouped;
  };

  const mergeGroupedClientes = (
    current: { [key: string]: Cliente[] },
    incoming: { [key: string]: Cliente[] }
  ) => {
    const all = [...Object.values(current).flat(), ...Object.values(incoming).flat()];
    const byId = new Map<number, Cliente>();
    all.forEach((cliente) => byId.set(cliente.id, cliente));
    return groupClientesByIlha(Array.from(byId.values()));
  };

  const handleSelectCliente = (id: number, checked: boolean) => {
    setSelectedClientes(prev => checked ? [...prev, id] : prev.filter(cid => cid !== id));
  };
  const handleSelectAllClientes = (checked: boolean) => {
    if (checked) {
      setSelectedClientes(filteredFlatClientes.map(c => c.id));
    } else {
      setSelectedClientes([]);
    }
  };
  const handleDeleteBatch = async () => {
    if (selectedClientes.length === 0) return;
    if (!window.confirm(`Tem certeza que deseja excluir ${selectedClientes.length} clientes?`)) return;
    setDeletingBatch(true);
    try {
      const response = await fetch("/api/clientes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedClientes })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Erro ao excluir clientes.");
      }
      setSelectedClientes([]);
      await loadData();
      alert("Clientes excluídos com sucesso.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao excluir clientes.");
    } finally {
      setDeletingBatch(false);
    }
  };

  const loadData = async () => {
    try {
      const [clientesRes, naviosRes] = await Promise.all([
        fetch("/api/clientes"),
        fetch("/api/navios")
      ]);

      if (!clientesRes.ok || !naviosRes.ok) {
        throw new Error("Erro ao carregar dados de clientes/navios");
      }

      const clientesData = await clientesRes.json();
      const naviosData = await naviosRes.json();

      const clientesList: Cliente[] = Array.isArray(clientesData)
        ? clientesData
        : (typeof clientesData === "object" && clientesData !== null && Array.isArray((clientesData as any).data)
            ? ((clientesData as any).data as Cliente[])
            : []);

      const grouped = groupClientesByIlha(clientesList);
      setGroupedClientes(grouped);
      setAllNavios(sortNaviosAlphabetically(normalizeNaviosResponse(naviosData)));
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  const formatNumeroCliente = (cliente: Cliente) => {
    const numero = (cliente.numeroCliente || "").trim();
    if (numero) return numero;
    return `CLI-${String(cliente.id).padStart(5, "0")}`;
  };

  useEffect(() => {
    loadData()
      .then(() => setLoading(false))
      .catch(err => {
        console.error("Erro ao carregar clientes:", err);
        setLoadError("Erro ao carregar dados. Tente novamente.");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(CLIENTE_LIST_COLUMNS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Record<ClienteListColumnKey, boolean>>;
      const defaults = buildDefaultClienteListColumns();
      const merged = { ...defaults };
      for (const col of CLIENTE_LIST_COLUMNS) {
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
      window.localStorage.setItem(CLIENTE_LIST_COLUMNS_KEY, JSON.stringify(visibleColumns));
    } catch {}
  }, [visibleColumns]);

  const isColumnVisible = (key: ClienteListColumnKey) => Boolean(visibleColumns[key]);

  const toggleColumn = (key: ClienteListColumnKey) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const anyEnabled = Object.values(next).some(Boolean);
      if (!anyEnabled) return { ...next, [key]: true };
      return next;
    });
  };

  const showAllColumns = () => setVisibleColumns(buildDefaultClienteListColumns());

  const hideAlmostAllColumns = () => {
    const first = CLIENTE_LIST_COLUMNS[0]?.key;
    if (!first) return;
    const next = CLIENTE_LIST_COLUMNS.reduce((acc, col) => {
      acc[col.key] = false;
      return acc;
    }, {} as Record<ClienteListColumnKey, boolean>);
    next[first] = true;
    setVisibleColumns(next);
  };

  const handleCreateCliente = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newCliente.nome.trim()) {
      alert("Nome do cliente é obrigatório.");
      return;
    }

    try {
      setCreatingCliente(true);

      const response = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCliente)
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Não foi possível criar cliente.");
      }

      setNewCliente({
        nome: "",
        numeroCliente: "",
        modoPagamento: "",
        ilha: "",
        morada: "",
        moradaNumero: "",
        codigoPostal: "",
        localidade: "",
        nif: "",
        email: "",
        telefone: "",
        telmovel: "",
        observacoes: ""
      });

      await loadData();
      setShowClienteModal(false);
      alert("Cliente criado com sucesso.");
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Erro ao criar cliente.");
    } finally {
      setCreatingCliente(false);
    }
  };

  const handleAssociateNavio = async (clienteId: number) => {
    const navioId = Number(selectedNavioByCliente[clienteId]);
    if (!navioId) return;

    const navio = allNavios.find((item) => item.id === navioId);
    if (!navio) {
      alert("Navio não encontrado.");
      return;
    }

    if (navio.cliente?.id === clienteId) {
      alert("Este navio já está associado a este cliente.");
      return;
    }

    if (navio.cliente?.id && navio.cliente.id !== clienteId) {
      const shouldReassign = window.confirm(
        `O navio ${navio.nome} está associado ao cliente ${navio.cliente.nome}. Deseja desassociar e associar a este cliente?`
      );

      if (!shouldReassign) {
        return;
      }
    }

    try {
      setSavingAssociation(true);
      const response = await fetch(`/api/navios/${navioId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId })
      });

      if (!response.ok) {
        throw new Error("Falha ao associar navio");
      }

      await loadData();
      setSelectedNavioByCliente(prev => ({ ...prev, [clienteId]: "" }));
      setNavioSearchByCliente(prev => ({ ...prev, [clienteId]: "" }));
    } catch (error) {
      console.error(error);
      alert("Não foi possível associar o navio.");
    } finally {
      setSavingAssociation(false);
    }
  };

  const handleDisassociateNavio = async (navioId: number) => {
    try {
      setSavingAssociation(true);
      const response = await fetch(`/api/navios/${navioId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId: null })
      });

      if (!response.ok) {
        throw new Error("Falha ao desassociar navio");
      }

      await loadData();
    } catch (error) {
      console.error(error);
      alert("Não foi possível desassociar o navio.");
    } finally {
      setSavingAssociation(false);
    }
  };

  const handleCreateAndAssociateNavio = async (cliente: Cliente) => {
    const draft = newNavioByCliente[cliente.id] || {
      nome: "",
      matricula: "",
      ilha: (getCanonicalNavioLocationLabel(cliente.ilha) || cliente.ilha) || "",
      tipoPesca: "",
      tipoNavio: ""
    };

    const nome = draft.nome.trim();
    if (!nome) {
      alert("Nome do navio é obrigatório.");
      return;
    }

    try {
      setCreatingNavioByCliente(prev => ({ ...prev, [cliente.id]: true }));
      const response = await fetch("/api/navios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          matricula: draft.matricula.trim() || "N/D",
          ilha: draft.ilha.trim() || undefined,
          tipoPesca: draft.tipoPesca.trim() || "N/D",
          tipoNavio: draft.tipoNavio.trim() || "N/D",
          clienteId: cliente.id
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Não foi possível criar e associar o navio.");
      }

      await loadData();
      setNewNavioByCliente(prev => ({
        ...prev,
        [cliente.id]: {
          nome: "",
          matricula: "",
          ilha: (getCanonicalNavioLocationLabel(cliente.ilha) || cliente.ilha) || "",
          tipoPesca: "",
          tipoNavio: ""
        }
      }));
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Erro ao criar navio.");
    } finally {
      setCreatingNavioByCliente(prev => ({ ...prev, [cliente.id]: false }));
    }
  };

  const handleDeleteCliente = async (clienteId: number) => {
    const shouldDelete = window.confirm("Tem certeza que deseja excluir este cliente?");
    if (!shouldDelete) return;

    try {
      const response = await fetch(`/api/clientes?id=${clienteId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Não foi possível excluir o cliente.");
      }

      if (expandedClienteId === clienteId) {
        setExpandedClienteId(null);
      }
      if (editingClienteId === clienteId) {
        setEditingClienteId(null);
      }

      await loadData();
      alert("Cliente excluído com sucesso.");
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Erro ao excluir cliente.");
    }
  };

  const startEditCliente = (cliente: Cliente) => {
    setEditingClienteId(cliente.id);
    setProfileDraftByCliente(prev => ({
      ...prev,
      [cliente.id]: {
        nome: cliente.nome || "",
        numeroCliente: cliente.numeroCliente || formatNumeroCliente(cliente),
        modoPagamento: cliente.modoPagamento || "",
        morada: cliente.morada || "",
        moradaNumero: cliente.moradaNumero || "",
        codigoPostal: cliente.codigoPostal || "",
        localidade: cliente.localidade || "",
        ilha: (getCanonicalNavioLocationLabel(cliente.ilha) || cliente.ilha) || "",
        nif: cliente.nif || "",
        email: cliente.email || "",
        telefone: cliente.telefone || "",
        telmovel: cliente.telmovel || ""
      }
    }));
  };

  const cancelEditCliente = () => {
    setEditingClienteId(null);
  };

  const updateProfileDraftField = (
    clienteId: number,
    field: "nome" | "numeroCliente" | "modoPagamento" | "morada" | "moradaNumero" | "codigoPostal" | "localidade" | "ilha" | "nif" | "email" | "telefone" | "telmovel",
    value: string
  ) => {
    setProfileDraftByCliente(prev => ({
      ...prev,
      [clienteId]: {
        ...(prev[clienteId] || {
          nome: "",
          numeroCliente: "",
          modoPagamento: "",
          morada: "",
          moradaNumero: "",
          codigoPostal: "",
          localidade: "",
          ilha: "",
          nif: "",
          email: "",
          telefone: "",
          telmovel: ""
        }),
        [field]: value
      }
    }));

    const trimmed = value.trim();
    let errorMessage = "";

    if (field === "nif" && trimmed && !/^\d{9}$/.test(trimmed)) {
      errorMessage = "NIF deve conter 9 dígitos.";
    }

    if (field === "email" && trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      errorMessage = "Email inválido.";
    }

    if ((field === "telefone" || field === "telmovel") && trimmed && !/^[0-9+\s()-]{6,20}$/.test(trimmed)) {
      errorMessage = `${field === "telefone" ? "Telefone" : "Telemóvel"} inválido.`;
    }

    if (field === "nif" || field === "email" || field === "telefone" || field === "telmovel") {
      setProfileErrorsByCliente(prev => ({
        ...prev,
        [clienteId]: {
          ...(prev[clienteId] || {}),
          [field]: errorMessage || undefined
        }
      }));
    }
  };

  const saveClienteProfile = async (clienteId: number) => {
    const draft = profileDraftByCliente[clienteId];
    if (!draft) return;

    const errors = profileErrorsByCliente[clienteId];
    if (errors && Object.values(errors).some(Boolean)) {
      alert("Corrija os campos inválidos antes de guardar.");
      return;
    }

    try {
      setSavingProfile(true);
      const response = await fetch(`/api/clientes?id=${clienteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft)
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || "Erro ao guardar ficha.");
      }

      await loadData();
      setEditingClienteId(null);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Não foi possível guardar a ficha.");
    } finally {
      setSavingProfile(false);
    }
  };

  const allClientes = Object.values(groupedClientes).flat();
  const allIlhas = Object.keys(groupedClientes).sort((a, b) => a.localeCompare(b));
  const normalizedSearch = search.trim().toLowerCase();
  const normalizedPhoneSearch = normalizePhoneSearch(search);
  const getNavioOptionLabel = (navio: Navio) => {
    const base = `${navio.nome} (${navio.matricula})`;
    if (navio.cliente?.nome) {
      return `${base} — Associado a: ${navio.cliente.nome}`;
    }
    return `${base} — Disponível`;
  };

  const filteredGroupedClientes: { [key: string]: Cliente[] } = {};
  Object.keys(groupedClientes).forEach(ilha => {
    if (selectedIlha && ilha !== selectedIlha) {
      return;
    }

    const clientesArr = Array.isArray(groupedClientes[ilha]) ? groupedClientes[ilha] : [];
    const filtered = clientesArr.filter((cliente) => {
      const matchesSearch = !normalizedSearch || [
        cliente.nome,
        formatNumeroCliente(cliente),
        cliente.email,
        cliente.telefone,
        cliente.telmovel,
      ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch)) || (
        !!normalizedPhoneSearch && [cliente.telefone, cliente.telmovel].some(
          (value) => normalizePhoneSearch(value).includes(normalizedPhoneSearch)
        )
      );

      return matchesSearch && (!selectedClienteId || cliente.id === Number(selectedClienteId));
    });
    if (filtered.length > 0) {
      filteredGroupedClientes[ilha] = filtered
        .slice()
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-PT", { sensitivity: "base" }));
    }
  });
  const filteredFlatClientes = Object.values(filteredGroupedClientes)
    .flat()
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-PT", { sensitivity: "base" }));

  const stats = useMemo(() => {
    const total = allClientes.length;
    const ilhas = allIlhas.length;
    const comNavios = allClientes.filter((cliente) => cliente.navios.length > 0).length;
    const semContacto = allClientes.filter(
      (cliente) => !String(cliente.email || "").trim() && !String(cliente.telefone || cliente.telmovel || "").trim()
    ).length;

    return { total, ilhas, comNavios, semContacto };
  }, [allClientes, allIlhas]);

  const openCreateClienteForm = () => {
    setShowClienteModal(true);
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-50 py-8">
        <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-lg font-medium text-red-700">{loadError}</p>
            <button onClick={() => window.location.reload()} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Tentar novamente</button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 py-8">
        <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8 text-base text-slate-700">A carregar clientes...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <div className="app-hero-panel flex flex-col gap-4 rounded-2xl p-6 text-white">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-base font-semibold uppercase tracking-[0.2em] text-sky-100">Orey Técnica</p>
              <h1 className="mt-2 text-4xl font-bold">Registo de clientes</h1>
              <p className="mt-2 max-w-4xl text-base text-sky-100">
                Diretório comercial com ficha resumida, associação de navios e ações rápidas para manter a carteira de clientes organizada.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openCreateClienteForm}
                className="rounded-lg bg-white/15 px-4 py-2 text-base font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/20"
              >
                + Novo cliente
              </button>
              <Link
                href="/navios"
                className="rounded-lg bg-white/15 px-4 py-2 text-base font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/20"
              >
                + Adicionar novo navio
              </Link>
              <button
                type="button"
                onClick={loadData}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Atualizar lista
              </button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Total em vista", value: filteredFlatClientes.length },
              { label: "Clientes totais", value: stats.total },
              { label: "Com navios", value: stats.comNavios },
              { label: "Sem contacto", value: stats.semContacto },
            ].map((item) => (
              <div key={item.label} className="app-hero-card rounded-xl p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-sky-100">{item.label}</p>
                <p className="mt-2 text-2xl font-bold">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Diretório</h2>
                <p className="text-base text-slate-600">Pesquisa, filtros por ilha e vista rápida das fichas e navios associados.</p>
              </div>
              <div className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                {stats.ilhas} ilha(s) ativa(s)
              </div>
            </div>

        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente, email, telefone ou telemóvel..."
              className="w-full rounded-lg border border-slate-300 py-3 pl-10 pr-4 shadow-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          <select
            value={selectedIlha}
            onChange={e => setSelectedIlha(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 shadow-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas as ilhas</option>
            {allIlhas.map(ilha => (
              <option key={ilha} value={ilha}>
                {ilha}
              </option>
            ))}
          </select>
          <select
            value={selectedClienteId}
            onChange={e => setSelectedClienteId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 shadow-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos os clientes</option>
            {allClientes
              .slice()
              .sort((a, b) => a.nome.localeCompare(b.nome))
              .map(cliente => (
                <option key={cliente.id} value={cliente.id}>
                  {formatNumeroCliente(cliente)} - {cliente.nome}
                </option>
              ))}
          </select>
        </div>

        <div className="mb-4 flex gap-2">
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

        {Object.keys(filteredGroupedClientes).length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhum cliente encontrado</h3>
            <p className="mt-1 text-sm text-gray-500">Tente ajustar sua busca ou verifique se há dados carregados.</p>
            <button
              type="button"
              onClick={() => {
                openCreateClienteForm();
              }}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              + Adicionar novo cliente
            </button>
          </div>
        ) : viewMode === "lista" ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <DataTable<Cliente>
              data={filteredFlatClientes}
              columns={[
                { key: "cliente", header: "Cliente", sortable: true, render: (row) => <Link href={`/clientes/${row.id}`} className="text-blue-700 hover:underline font-semibold">{row.nome}</Link> },
                { key: "numeroCliente", header: "Nº Cliente", sortable: true, render: (_row, val) => String(val || "—") },
                { key: "ilha", header: "Ilha", sortable: true, filterType: "select", filterOptions: allIlhas.map(i => ({ label: i, value: i })) },
                { key: "email", header: "Email", sortable: true },
                { key: "telefone", header: "Telefone", sortable: true, render: (_row, val) => String(val || "—") },
                { key: "navios", header: "Navio(s)", sortable: false, render: (row) => (
                  row.navios.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {row.navios.slice(0, 3).map((navio) => (
                        <span key={navio.id} className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-100 text-[11px]" title={`${navio.nome} (${navio.matricula})`}>{navio.nome}</span>
                      ))}
                      {row.navios.length > 3 && <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200 text-[11px]">+{row.navios.length - 3}</span>}
                    </div>
                  ) : "—"
                )},
              ]}
              keyExtractor={(r) => r.id}
              onRowClick={(r) => window.location.href = `/clientes/${r.id}`}
              searchPlaceholder="Pesquisar clientes..."
              searchKeys={["nome", "email", "telefone", "telmovel"]}
              pageSize={25}
              emptyMessage="Nenhum cliente encontrado"
              exportFileName="clientes"
              compact
              headerActions={
                selectedClientes.length > 0 ? (
                  <button
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-all"
                    disabled={deletingBatch}
                    onClick={handleDeleteBatch}
                  >
                    {deletingBatch ? "A eliminar..." : `Excluir (${selectedClientes.length})`}
                  </button>
                ) : undefined
              }
              rowActions={(row) => (
                <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button className="bg-blue-500 px-2 py-1 rounded text-xs text-white hover:bg-blue-600" onClick={() => setExpandedClienteId(row.id)}>Ver ficha</button>
                  <Link href={`/clientes/${row.id}`} className="bg-indigo-600 px-2 py-1 rounded text-xs text-white hover:bg-indigo-700">Abrir</Link>
                  <button className="bg-yellow-400 px-2 py-1 rounded text-xs hover:bg-yellow-500" onClick={() => startEditCliente(row)}>Editar</button>
                  <button className="bg-red-500 px-2 py-1 rounded text-xs text-white hover:bg-red-600" onClick={() => handleDeleteCliente(row.id)}>Excluir</button>
                </div>
              )}
            />
          </div>
        ) : (
          <div className="space-y-8">
            {Object.keys(filteredGroupedClientes).map(ilha => (
              <div key={ilha} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="app-soft-blue-strip px-6 py-4">
                  <h2 className="text-xl font-semibold text-white flex items-center">
                    <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {ilha}
                  </h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredGroupedClientes[ilha].map(cliente => {
                      const missingFields = getMissingProfileFields(cliente);
                      return (
                      <div key={cliente.id} className="bg-gray-50 rounded-lg p-4 hover:shadow-md transition-shadow duration-200">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="text-lg font-medium leading-tight"><Link href={`/clientes/${cliente.id}`} className="text-blue-700 hover:underline">{cliente.nome}</Link></h3>
                            <p className="text-xs text-gray-500 mt-0.5">Nº Cliente: {formatNumeroCliente(cliente)}</p>
                          </div>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Cliente
                          </span>
                        </div>
                        {cliente.morada && (
                          <p className="text-sm text-gray-600 mb-3 flex items-start">
                            <svg className="w-4 h-4 mr-1 mt-0.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {cliente.morada}
                          </p>
                        )}
                        <div className="border-t border-gray-200 pt-3">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-sm font-medium text-gray-900 flex items-center">
                              <svg className="w-4 h-4 mr-1 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                              </svg>
                              Navios ({cliente.navios.length})
                            </h4>
                            <button
                              type="button"
                              onClick={() => setExpandedClienteId(prev => (prev === cliente.id ? null : cliente.id))}
                              className="text-xs font-medium px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                            >
                              {viewMode === "detalhes" ? "Detalhes ativos" : (expandedClienteId === cliente.id ? "Fechar ficha" : "Ver ficha")}
                            </button>
                          </div>

                          {(viewMode === "detalhes" || expandedClienteId === cliente.id) ? (
                            <div className="mt-3 bg-white rounded-md border border-gray-200 p-3 space-y-3">
                              {missingFields.length > 0 && editingClienteId !== cliente.id && (
                                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="text-xs font-semibold text-amber-900">Dados em falta na ficha</p>
                                      <div className="mt-2 flex flex-wrap gap-1.5">
                                        {missingFields.map((field) => (
                                          <span
                                            key={`${cliente.id}-${field.key}`}
                                            className="inline-flex items-center px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-xs"
                                          >
                                            {field.label}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        startEditCliente(cliente);
                                        const firstMissing = missingFields[0];
                                        if (!firstMissing) return;
                                        setTimeout(() => {
                                          const input = document.getElementById(`cliente-${cliente.id}-${firstMissing.key}`) as HTMLInputElement | null;
                                          input?.focus();
                                        }, 0);
                                      }}
                                      className="text-xs font-medium px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700"
                                    >
                                      Preencher dados em falta
                                    </button>
                                  </div>
                                </div>
                              )}
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                  <p className="text-gray-500">Cliente</p>
                                  <p className="font-medium text-gray-900">{cliente.nome}</p>
                                </div>
                                <div>
                                  <p className="text-gray-500">Nº Cliente</p>
                                  <p className="font-medium text-gray-900">{formatNumeroCliente(cliente)}</p>
                                </div>
                                <div>
                                  <p className="text-gray-500">Ilha</p>
                                  <p className="font-medium text-gray-900">{(getCanonicalNavioLocationLabel(cliente.ilha) || cliente.ilha) || "Sem ilha"}</p>
                                </div>
                                <div>
                                  <p className="text-gray-500">Modo de Pagamento</p>
                                  <p className="font-medium text-gray-900">{cliente.modoPagamento || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-gray-500">Nº Porta</p>
                                  <p className="font-medium text-gray-900">{cliente.moradaNumero || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-gray-500">Código Postal</p>
                                  <p className="font-medium text-gray-900">{cliente.codigoPostal || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-gray-500">Localidade</p>
                                  <p className="font-medium text-gray-900">{cliente.localidade || "—"}</p>
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <p className="text-gray-500 text-sm">Ficha do cliente</p>
                                  {editingClienteId !== cliente.id ? (
                                    <div className="flex items-center flex-wrap gap-2">
                                      <Link
                                        href={`/clientes/${cliente.id}`}
                                        className="text-xs font-medium px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                                      >
                                        Abrir ficha completa
                                      </Link>
                                      <Link
                                        href="/navios"
                                        className="text-xs font-medium px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                                      >
                                        Adicionar novo navio
                                      </Link>
                                      <button
                                        type="button"
                                        onClick={() => startEditCliente(cliente)}
                                        className="text-xs font-medium px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
                                      >
                                        Editar ficha
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteCliente(cliente.id)}
                                        className="text-xs font-medium px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700"
                                      >
                                        Excluir
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={cancelEditCliente}
                                        className="text-xs font-medium px-3 py-1.5 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300"
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => saveClienteProfile(cliente.id)}
                                        disabled={savingProfile || !!(profileErrorsByCliente[cliente.id] && Object.values(profileErrorsByCliente[cliente.id]).some(Boolean))}
                                        className="text-xs font-medium px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                      >
                                        Guardar alterações
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {editingClienteId === cliente.id ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <label className="text-xs text-gray-600">
                                      Cliente
                                      <input
                                        id={`cliente-${cliente.id}-nome`}
                                        type="text"
                                        value={profileDraftByCliente[cliente.id]?.nome ?? ""}
                                        onChange={e => updateProfileDraftField(cliente.id, "nome", e.target.value)}
                                        placeholder="Nome do cliente"
                                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                      />
                                    </label>
                                    <label className="text-xs text-gray-600">
                                      Nº Cliente
                                      <input
                                        id={`cliente-${cliente.id}-numeroCliente`}
                                        type="text"
                                        value={profileDraftByCliente[cliente.id]?.numeroCliente ?? ""}
                                        onChange={e => updateProfileDraftField(cliente.id, "numeroCliente", e.target.value)}
                                        placeholder="Ex: CLI-00021"
                                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                      />
                                    </label>
                                    <label className="text-xs text-gray-600">
                                      Modo de Pagamento
                                      <input
                                        id={`cliente-${cliente.id}-modoPagamento`}
                                        type="text"
                                        value={profileDraftByCliente[cliente.id]?.modoPagamento ?? ""}
                                        onChange={e => updateProfileDraftField(cliente.id, "modoPagamento", e.target.value)}
                                        placeholder="Ex: Crédito 30 dias"
                                        list="cliente-payment-mode-options"
                                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                      />
                                    </label>
                                    <label className="text-xs text-gray-600">
                                      Ilha
                                      <input
                                        id={`cliente-${cliente.id}-ilha`}
                                        type="text"
                                        value={profileDraftByCliente[cliente.id]?.ilha ?? ""}
                                        onChange={e => updateProfileDraftField(cliente.id, "ilha", e.target.value)}
                                        placeholder="Ilha"
                                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                      />
                                    </label>
                                    <label className="text-xs text-gray-600 sm:col-span-2">
                                      Morada
                                      <input
                                        id={`cliente-${cliente.id}-morada`}
                                        type="text"
                                        value={profileDraftByCliente[cliente.id]?.morada ?? ""}
                                        onChange={e => updateProfileDraftField(cliente.id, "morada", e.target.value)}
                                        placeholder="Morada"
                                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                      />
                                    </label>
                                    <label className="text-xs text-gray-600">
                                      Nº Porta
                                      <input
                                        id={`cliente-${cliente.id}-moradaNumero`}
                                        type="text"
                                        value={profileDraftByCliente[cliente.id]?.moradaNumero ?? ""}
                                        onChange={e => updateProfileDraftField(cliente.id, "moradaNumero", e.target.value)}
                                        placeholder="Ex: 12A"
                                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                      />
                                    </label>
                                    <label className="text-xs text-gray-600">
                                      Código Postal
                                      <input
                                        id={`cliente-${cliente.id}-codigoPostal`}
                                        type="text"
                                        value={profileDraftByCliente[cliente.id]?.codigoPostal ?? ""}
                                        onChange={e => updateProfileDraftField(cliente.id, "codigoPostal", e.target.value)}
                                        placeholder="0000-000"
                                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                      />
                                    </label>
                                    <label className="text-xs text-gray-600 sm:col-span-2">
                                      Localidade
                                      <input
                                        id={`cliente-${cliente.id}-localidade`}
                                        type="text"
                                        value={profileDraftByCliente[cliente.id]?.localidade ?? ""}
                                        onChange={e => updateProfileDraftField(cliente.id, "localidade", e.target.value)}
                                        placeholder="Localidade"
                                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                      />
                                    </label>
                                    <label className="text-xs text-gray-600">
                                      NIF
                                      <input
                                        id={`cliente-${cliente.id}-nif`}
                                        type="text"
                                        value={profileDraftByCliente[cliente.id]?.nif ?? ""}
                                        onChange={e => updateProfileDraftField(cliente.id, "nif", e.target.value)}
                                        placeholder="NIF"
                                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                      />
                                      {profileErrorsByCliente[cliente.id]?.nif && (
                                        <p className="mt-1 text-xs text-red-600">{profileErrorsByCliente[cliente.id]?.nif}</p>
                                      )}
                                    </label>
                                    <label className="text-xs text-gray-600">
                                      Email
                                      <input
                                        id={`cliente-${cliente.id}-email`}
                                        type="email"
                                        value={profileDraftByCliente[cliente.id]?.email ?? ""}
                                        onChange={e => updateProfileDraftField(cliente.id, "email", e.target.value)}
                                        placeholder="Email"
                                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                      />
                                      {profileErrorsByCliente[cliente.id]?.email && (
                                        <p className="mt-1 text-xs text-red-600">{profileErrorsByCliente[cliente.id]?.email}</p>
                                      )}
                                    </label>
                                    <label className="text-xs text-gray-600">
                                      Telefone
                                      <input
                                        id={`cliente-${cliente.id}-telefone`}
                                        type="text"
                                        value={profileDraftByCliente[cliente.id]?.telefone ?? ""}
                                        onChange={e => updateProfileDraftField(cliente.id, "telefone", e.target.value)}
                                        placeholder="Telefone"
                                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                      />
                                      {profileErrorsByCliente[cliente.id]?.telefone && (
                                        <p className="mt-1 text-xs text-red-600">{profileErrorsByCliente[cliente.id]?.telefone}</p>
                                      )}
                                    </label>
                                    <label className="text-xs text-gray-600">
                                      Telemóvel
                                      <input
                                        id={`cliente-${cliente.id}-telmovel`}
                                        type="text"
                                        value={profileDraftByCliente[cliente.id]?.telmovel ?? ""}
                                        onChange={e => updateProfileDraftField(cliente.id, "telmovel", e.target.value)}
                                        placeholder="Telemóvel"
                                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                      />
                                      {profileErrorsByCliente[cliente.id]?.telmovel && (
                                        <p className="mt-1 text-xs text-red-600">{profileErrorsByCliente[cliente.id]?.telmovel}</p>
                                      )}
                                    </label>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                    <div className="sm:col-span-2">
                                      <p className="text-gray-500">Morada</p>
                                      <p className="text-gray-900">{cliente.morada || "Sem morada"}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-500">Nº Porta</p>
                                      <p className="text-gray-900">{cliente.moradaNumero || "—"}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-500">Código Postal</p>
                                      <p className="text-gray-900">{cliente.codigoPostal || "—"}</p>
                                    </div>
                                    <div className="sm:col-span-2">
                                      <p className="text-gray-500">Localidade</p>
                                      <p className="text-gray-900">{cliente.localidade || "—"}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-500">NIF</p>
                                      <p className="text-gray-900">{cliente.nif || "—"}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-500">Email</p>
                                      <p className="text-gray-900 break-all">{cliente.email || "—"}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-500">Telefone</p>
                                      <p className="text-gray-900">{cliente.telefone || "—"}</p>
                                    </div>
                                    <div>
                                      <p className="text-gray-500">Telemóvel</p>
                                      <p className="text-gray-900">{cliente.telmovel || "—"}</p>
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div>
                                <p className="text-gray-500 text-sm mb-1">Lista completa de navios</p>
                                {cliente.navios.length > 0 ? (
                                  <ul className="space-y-1">
                                    {cliente.navios.map(navio => (
                                      <li key={navio.id} className="text-sm text-gray-700 flex items-center justify-between gap-2 border-b border-gray-100 pb-1">
                                        <div className="flex flex-col">
                                          <span>{navio.nome}</span>
                                          <span className="text-xs text-gray-500">{navio.matricula}</span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handleDisassociateNavio(navio.id)}
                                          disabled={savingAssociation}
                                          className="text-xs font-medium px-2 py-1 rounded-md bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                                        >
                                          Desassociar
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-sm text-gray-500 italic">Nenhum navio associado</p>
                                )}
                              </div>

                              <div>
                                <p className="text-gray-500 text-sm mb-1">Associar navio (lista completa)</p>
                                <input
                                  type="text"
                                  value={navioSearchByCliente[cliente.id] || ""}
                                  onChange={e => setNavioSearchByCliente(prev => ({ ...prev, [cliente.id]: e.target.value }))}
                                  placeholder="Procurar navio por nome, matrícula ou cliente"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-2"
                                />
                                <div className="flex items-center gap-2">
                                  <select
                                    value={selectedNavioByCliente[cliente.id] || ""}
                                    onChange={e => setSelectedNavioByCliente(prev => ({ ...prev, [cliente.id]: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                                  >
                                    <option value="">Selecionar navio...</option>
                                    {allNavios
                                      .filter(navio => {
                                        const query = (navioSearchByCliente[cliente.id] || "").trim().toLowerCase();
                                        if (!query) return true;
                                        const nome = (navio.nome || "").toLowerCase();
                                        const matricula = (navio.matricula || "").toLowerCase();
                                        const clienteNome = (navio.cliente?.nome || "").toLowerCase();
                                        return nome.includes(query) || matricula.includes(query) || clienteNome.includes(query);
                                      })
                                      .slice()
                                      .sort((a, b) => a.nome.localeCompare(b.nome))
                                      .map(navio => (
                                        <option key={navio.id} value={navio.id}>
                                          {getNavioOptionLabel(navio)}
                                        </option>
                                      ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => handleAssociateNavio(cliente.id)}
                                    disabled={!selectedNavioByCliente[cliente.id] || savingAssociation}
                                    className="text-xs font-medium px-3 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                  >
                                    Associar
                                  </button>
                                </div>
                              </div>

                              <div>
                                <p className="text-gray-500 text-sm mb-1">Adicionar navio novo à ficha</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <input
                                    type="text"
                                    value={newNavioByCliente[cliente.id]?.nome || ""}
                                    onChange={e => setNewNavioByCliente(prev => ({
                                      ...prev,
                                      [cliente.id]: {
                                        nome: e.target.value,
                                        matricula: prev[cliente.id]?.matricula || "",
                                        ilha: prev[cliente.id]?.ilha || (getCanonicalNavioLocationLabel(cliente.ilha) || cliente.ilha) || "",
                                        tipoPesca: prev[cliente.id]?.tipoPesca || "",
                                        tipoNavio: prev[cliente.id]?.tipoNavio || ""
                                      }
                                    }))}
                                    placeholder="Nome do navio *"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                  />
                                  <input
                                    type="text"
                                    value={newNavioByCliente[cliente.id]?.matricula || ""}
                                    onChange={e => setNewNavioByCliente(prev => ({
                                      ...prev,
                                      [cliente.id]: {
                                        nome: prev[cliente.id]?.nome || "",
                                        matricula: e.target.value,
                                        ilha: prev[cliente.id]?.ilha || (getCanonicalNavioLocationLabel(cliente.ilha) || cliente.ilha) || "",
                                        tipoPesca: prev[cliente.id]?.tipoPesca || "",
                                        tipoNavio: prev[cliente.id]?.tipoNavio || ""
                                      }
                                    }))}
                                    placeholder="Matrícula"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                  />
                                  <input
                                    type="text"
                                    value={newNavioByCliente[cliente.id]?.ilha || (getCanonicalNavioLocationLabel(cliente.ilha) || cliente.ilha) || ""}
                                    onChange={e => setNewNavioByCliente(prev => ({
                                      ...prev,
                                      [cliente.id]: {
                                        nome: prev[cliente.id]?.nome || "",
                                        matricula: prev[cliente.id]?.matricula || "",
                                        ilha: e.target.value,
                                        tipoPesca: prev[cliente.id]?.tipoPesca || "",
                                        tipoNavio: prev[cliente.id]?.tipoNavio || ""
                                      }
                                    }))}
                                    placeholder="Ilha"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                  />
                                  <input
                                    type="text"
                                    value={newNavioByCliente[cliente.id]?.tipoPesca || ""}
                                    onChange={e => setNewNavioByCliente(prev => ({
                                      ...prev,
                                      [cliente.id]: {
                                        nome: prev[cliente.id]?.nome || "",
                                        matricula: prev[cliente.id]?.matricula || "",
                                        ilha: prev[cliente.id]?.ilha || (getCanonicalNavioLocationLabel(cliente.ilha) || cliente.ilha) || "",
                                        tipoPesca: e.target.value,
                                        tipoNavio: prev[cliente.id]?.tipoNavio || ""
                                      }
                                    }))}
                                    placeholder="Enquadramento legal"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                    list="cliente-navio-tipo-pesca-opcoes"
                                  />
                                  <input
                                    type="text"
                                    value={newNavioByCliente[cliente.id]?.tipoNavio || ""}
                                    onChange={e => setNewNavioByCliente(prev => ({
                                      ...prev,
                                      [cliente.id]: {
                                        nome: prev[cliente.id]?.nome || "",
                                        matricula: prev[cliente.id]?.matricula || "",
                                        ilha: prev[cliente.id]?.ilha || (getCanonicalNavioLocationLabel(cliente.ilha) || cliente.ilha) || "",
                                        tipoPesca: prev[cliente.id]?.tipoPesca || "",
                                        tipoNavio: e.target.value
                                      }
                                    }))}
                                    placeholder="Tipo de embarcação"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                    list="cliente-navio-tipo-navio-opcoes"
                                  />
                                </div>
                                <datalist id="cliente-navio-tipo-pesca-opcoes">
                                  {NAVIO_TIPO_PESCA_OPTIONS.map((tipo) => (
                                    <option key={tipo} value={tipo} />
                                  ))}
                                </datalist>
                                <datalist id="cliente-navio-tipo-navio-opcoes">
                                  {NAVIO_TIPO_NAVIO_OPTIONS.map((tipo) => (
                                    <option key={tipo} value={tipo} />
                                  ))}
                                </datalist>
                                <div className="mt-2 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => handleCreateAndAssociateNavio(cliente)}
                                    disabled={creatingNavioByCliente[cliente.id]}
                                    className="text-xs font-medium px-3 py-2 rounded-md bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
                                  >
                                    {creatingNavioByCliente[cliente.id] ? "A criar..." : "Criar e associar navio"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2">
                              {cliente.navios.length > 0 ? (
                                <ul className="space-y-1">
                                  {cliente.navios.slice(0, 3).map(navio => (
                                    <li key={navio.id} className="text-sm text-gray-600 flex items-center">
                                      <span className="w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
                                      {navio.nome} <span className="text-gray-400 ml-1">({navio.matricula})</span>
                                    </li>
                                  ))}
                                  {cliente.navios.length > 3 && (
                                    <li className="text-sm text-gray-500 italic">
                                      +{cliente.navios.length - 3} mais...
                                    </li>
                                  )}
                                </ul>
                              ) : (
                                <p className="text-sm text-gray-500 italic mt-2">Nenhum navio associado</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6">
          <p className="text-xs text-gray-500">Clientes carregados: {allClientes.length}</p>
        </div>
          </section>
        </div>
      </div>

      {showClienteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800">+ Novo cliente</h2>
              <button
                type="button"
                onClick={() => setShowClienteModal(false)}
                className="rounded-lg px-3 py-1 text-2xl font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateCliente} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newCliente.nome}
                  onChange={(e) => setNewCliente((prev) => ({ ...prev, nome: e.target.value }))}
                  placeholder="Ex: Gil Manuel Cabral Vieira"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Nº Cliente</label>
                <input
                  type="text"
                  value={newCliente.numeroCliente}
                  onChange={(e) => setNewCliente((prev) => ({ ...prev, numeroCliente: e.target.value }))}
                  placeholder="Ex: CLI-00021"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Ilha</label>
                <input
                  type="text"
                  list="ilhas-opcoes"
                  value={newCliente.ilha}
                  onChange={(e) => setNewCliente((prev) => ({ ...prev, ilha: e.target.value }))}
                  placeholder="Ex: São Miguel"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                <datalist id="ilhas-opcoes">
                  {["São Miguel", "Santa Maria", "Terceira", "Graciosa", "São Jorge", "Pico", "Faial", "Flores", "Corvo"].map((ilha) => (
                    <option key={ilha} value={ilha} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Morada</label>
                <input
                  type="text"
                  value={newCliente.morada}
                  onChange={(e) => setNewCliente((prev) => ({ ...prev, morada: e.target.value }))}
                  placeholder="Rua, zona..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Nº / Lote</label>
                  <input
                    type="text"
                    value={newCliente.moradaNumero}
                    onChange={(e) => setNewCliente((prev) => ({ ...prev, moradaNumero: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Código Postal</label>
                  <input
                    type="text"
                    value={newCliente.codigoPostal}
                    onChange={(e) => setNewCliente((prev) => ({ ...prev, codigoPostal: e.target.value }))}
                    placeholder="Ex: 9560-350"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Localidade</label>
                <input
                  type="text"
                  value={newCliente.localidade}
                  onChange={(e) => setNewCliente((prev) => ({ ...prev, localidade: e.target.value }))}
                  placeholder="Ex: Cabouco"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">NIF</label>
                <input
                  type="text"
                  value={newCliente.nif}
                  onChange={(e) => setNewCliente((prev) => ({ ...prev, nif: e.target.value }))}
                  placeholder="Ex: 501117334"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={newCliente.email}
                  onChange={(e) => setNewCliente((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="exemplo@mail.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Telefone</label>
                  <input
                    type="text"
                    value={newCliente.telefone}
                    onChange={(e) => setNewCliente((prev) => ({ ...prev, telefone: e.target.value }))}
                    placeholder="Ex: 296 000 000"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Telemóvel</label>
                  <input
                    type="text"
                    value={newCliente.telmovel}
                    onChange={(e) => setNewCliente((prev) => ({ ...prev, telmovel: e.target.value }))}
                    placeholder="Ex: 96 000 0000"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Observações</label>
                <textarea
                  rows={3}
                  value={newCliente.observacoes}
                  onChange={(e) => setNewCliente((prev) => ({ ...prev, observacoes: e.target.value }))}
                  placeholder="RNAAT, website, objeto social, notas, etc."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowClienteModal(false)}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingCliente}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {creatingCliente ? "A criar..." : "Criar cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


