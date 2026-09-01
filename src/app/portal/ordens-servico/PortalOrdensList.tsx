"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { appToast } from "@/lib/app-toast";
import { getLocalDateKey } from "@/lib/date-utils";
import { getIvaRate } from "@/lib/iva";
import { IVA_ISENCAO_CODES } from "@/lib/iva-isencao-codes";
import { 
  Search, 
  Filter, 
  Info,
  Plus,
  X,
  ChevronDown
} from "lucide-react";

type OrdemServico = {
  id: number;
  numeroOrdem: string;
  tipo: string;
  prioridade: string;
  status: string;
  descricao: string | null;
  tecnicoResponsavel: string | null;
  dataAbertura: Date | string;
  dataPrevista: Date | string | null;
  dataConclusao: Date | string | null;
  valorTotal: number;
  valorPecas: number;
  valorMaoObra: number;
  shipId: number | null;
  jangada?: {
    id: number;
    brand?: string | null;
    model?: string | null;
    serial?: string | null;
  } | null;
  metadados?: string | null;
  dataPlaneadaInicio?: Date | string | null;
  isIsentoIva?: boolean;
  codigoIsencaoIva?: string | null;
  updatedAt?: Date | string;
};

type Navio = {
  id: number;
  nome: string;
  ilha?: string;
};

type ClientJangada = {
  id: number;
  brand: string;
  model: string;
  serial: string;
  shipId: number;
};

type BudgetLine = {
  id: string;
  referencia: string;
  descricao: string;
  quantidade: number;
  unitPrice: number;
  total: number;
  source: string;
};

type BudgetEditorState = {
  orcamentoStatus: string;
  linhas: BudgetLine[];
  valorMaoObra: number;
  valorDesconto: number;
  isIsentoIva: boolean;
  codigoIsencaoIva: string | null;
};

type ApoioArtigo = {
  id: number;
  name: string;
  quantidade: number;
  referencia: string | null;
  referenciaExibida: string;
  descricao: string;
  codigoFabricante: string | null;
  validade: string | null;
};

type StockOption = {
  id: number;
  referencia: string;
  descricao: string;
  precoVenda: number;
};

type ApoioOrcamento = {
  artigosJangada: Array<ApoioArtigo & { previstoSubstituir: boolean }>;
  ultimaInspecao: {
    id: number;
    certificadoNumero: string;
    dataInspecao: string | null;
    dataProxInspecao: string | null;
    artigos: ApoioArtigo[];
  } | null;
  dataProxInspecao: string | null;
  stock: StockOption[];
};

type BudgetDropdownItem = {
  id: string;
  referencia: string;
  descricao: string;
  quantidade: number;
  precoVenda: number;
  isRaft: boolean;
};

type BudgetContextInfo = {
  clienteNome: string | null;
  shipName: string | null;
  jangadas: Array<{
    id: number;
    serial: string | null;
    brand: string | null;
    model: string | null;
    shipNameManual: string | null;
    owner: string | null;
  }>;
};

type BudgetTab = "orcamento" | "ultima" | "previsao" | "artigos";

interface PortalOrdensListProps {
  ordens: OrdemServico[];
  navios: Navio[];
  jangadas: ClientJangada[];
  clientes?: Array<{ id: number; nome: string; numeroCliente?: string | null }>;
}

function saveBudgetDraft(ordemId: number, state: BudgetEditorState) {
  try {
    localStorage.setItem(`budget-draft-${ordemId}`, JSON.stringify({
      ...state,
      _savedAt: Date.now(),
    }));
  } catch { /* quota or SSR */ }
}

function loadBudgetDraft(ordemId: number): BudgetEditorState | null {
  try {
    const raw = localStorage.getItem(`budget-draft-${ordemId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { _savedAt, ...state } = parsed;
    return state as BudgetEditorState;
  } catch { return null; }
}

function clearBudgetDraft(ordemId: number) {
  try { localStorage.removeItem(`budget-draft-${ordemId}`); } catch { /* SSR */ }
}

export default function PortalOrdensList({ ordens: ordensProp, navios: naviosProp, jangadas: jangadasProp, clientes = [] }: PortalOrdensListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openRequest = searchParams.get("openRequest");
  const urlShipId = searchParams.get("shipId");
  const urlJangadaId = searchParams.get("jangadaId");

  const [clientId, setClientId] = useState<number | null>(null);
  const [clientLoading, setClientLoading] = useState(false);
  const [items, setItems] = useState<{ ordens: OrdemServico[]; navios: Navio[]; jangadas: ClientJangada[] }>({
    ordens: ordensProp,
    navios: naviosProp,
    jangadas: jangadasProp,
  });
  const { ordens, navios, jangadas } = items;
  const activeClientId = clientId ?? clientes[0]?.id ?? null;

  const [statusFilter, setStatusFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrdem, setSelectedOrdem] = useState<OrdemServico | null>(null);

  // State for request modal
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedShipId, setSelectedShipId] = useState("");
  const [shipSearch, setShipSearch] = useState("");
  const [shipDropdownOpen, setShipDropdownOpen] = useState(false);
  const shipComboboxRef = useRef<HTMLDivElement>(null);
  const [selectedJangadaId, setSelectedJangadaId] = useState("");
  const [porto, setPorto] = useState("Ponta Delgada");
  const [dataPretendida, setDataPretendida] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7); // Default to 7 days from now
    return getLocalDateKey(d);
  });
  const [horaPretendida, setHoraPretendida] = useState("09:00");
  const [necessitaHRU, setNecessitaHRU] = useState("no");
  const [observacoes, setObservacoes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  // Budget editor state
  const [budgetOrdem, setBudgetOrdem] = useState<OrdemServico | null>(null);
  const [budgetEditor, setBudgetEditor] = useState<BudgetEditorState | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetError, setBudgetError] = useState("");
  const [budgetAutosaving, setBudgetAutosaving] = useState(false);
  const [budgetLastSavedAt, setBudgetLastSavedAt] = useState<Date | null>(null);
  const [budgetAutoError, setBudgetAutoError] = useState("");
  const [budgetApoio, setBudgetApoio] = useState<ApoioOrcamento | null>(null);
  const [budgetApoioLoading, setBudgetApoioLoading] = useState(false);
  const [budgetTab, setBudgetTab] = useState<BudgetTab>("orcamento");
  const [artigoSearch, setArtigoSearch] = useState("");
  const [artigoDropdownOpen, setArtigoDropdownOpen] = useState(false);
  const artigoDropdownRef = useRef<HTMLDivElement>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipAutosaveRef = useRef(false);
  const [budgetContext, setBudgetContext] = useState<BudgetContextInfo | null>(null);

  // States for shipment details (only for vessels of other islands)
  const [transitario, setTransitario] = useState("");
  const [dataEntrega, setDataEntrega] = useState(() => {
    return getLocalDateKey();
  });
  const [trackingCode, setTrackingCode] = useState("");

  const selectedShipObject = useMemo(() => {
    return navios.find((n) => String(n.id) === selectedShipId) || null;
  }, [navios, selectedShipId]);

  const isOtherIsland = useMemo(() => {
    if (!selectedShipObject?.ilha) return false;
    const island = selectedShipObject.ilha.toLowerCase();
    return island !== "são miguel" && island !== "sao miguel";
  }, [selectedShipObject]);

  // Handle URL query parameters to auto-open request modal
  useEffect(() => {
    if (openRequest === "true") {
      setIsRequestModalOpen(true);
      if (urlShipId) {
        setSelectedShipId(urlShipId);
      }
    }
  }, [openRequest, urlShipId]);

  // Pre-select ship if client only has 1 ship
  useEffect(() => {
    if (navios.length === 1 && !selectedShipId) {
      setSelectedShipId(String(navios[0].id));
    }
  }, [navios, selectedShipId]);

  const shipNameMap = useMemo(() => {
    return new Map(navios.map((n) => [n.id, n.nome]));
  }, [navios]);

  const filteredOrdens = useMemo(() => {
    return ordens.filter((o) => {
      const matchesStatus = !statusFilter || o.status === statusFilter;
      const matchesSearch =
        !searchTerm ||
        o.numeroOrdem.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.jangada?.serial && o.jangada.serial.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (o.descricao && o.descricao.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesStatus && matchesSearch;
    });
  }, [ordens, statusFilter, searchTerm]);

  // Filter jangadas by selected ship
  const filteredJangadas = useMemo(() => {
    if (!selectedShipId) return [];
    return jangadas.filter((j) => j.shipId === Number(selectedShipId));
  }, [jangadas, selectedShipId]);

  // Filter ships by search text
  const filteredShips = useMemo(() => {
    const term = shipSearch.trim().toLowerCase();
    if (!term) return navios;
    return navios.filter((n) =>
      n.nome.toLowerCase().includes(term) ||
      (n.ilha || "").toLowerCase().includes(term),
    );
  }, [navios, shipSearch]);

  // Close ship dropdown when clicking outside
  useEffect(() => {
    if (!shipDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (shipComboboxRef.current && !shipComboboxRef.current.contains(e.target as Node)) {
        setShipDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [shipDropdownOpen]);

  // Automatically select first available jangada when ship changes, preserving urlJangadaId if matches
  useEffect(() => {
    if (filteredJangadas.length > 0) {
      if (urlJangadaId && filteredJangadas.some((j) => String(j.id) === urlJangadaId)) {
        setSelectedJangadaId(urlJangadaId);
      } else {
        setSelectedJangadaId(String(filteredJangadas[0].id));
      }
    } else {
      setSelectedJangadaId("");
    }
  }, [filteredJangadas, urlJangadaId]);

  const formatPrice = (value: number) => {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: "EUR",
    }).format(value);
  };

  const formatDate = (dateVal: Date | string | null) => {
    if (!dateVal) return "—";
    return new Date(dateVal).toLocaleDateString("pt-PT");
  };

  const formatDateTime = (dateVal: Date | string | null) => {
    if (!dateVal) return "—";
    const d = new Date(dateVal);
    const dateStr = d.toLocaleDateString("pt-PT");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${dateStr} às ${hours}:${minutes}`;
  };

  const openBudgetEditor = async (ordem: OrdemServico) => {
    setBudgetOrdem(ordem);
    setBudgetEditor(null);
    setBudgetError("");
    setBudgetAutoError("");
    setBudgetLastSavedAt(null);
    skipAutosaveRef.current = true;
    setBudgetApoio(null);
    setBudgetContext(null);
    setBudgetApoioLoading(true);
    setBudgetTab("orcamento");
    setArtigoSearch("");
    setArtigoDropdownOpen(false);
    setBudgetLoading(true);
    try {
      const [res, apoioRes] = await Promise.all([
        fetch(`/api/ordens-servico/${ordem.id}`),
        fetch(`/api/ordens-servico/${ordem.id}/apoio-orcamento`),
      ]);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Erro ao carregar a ordem de serviço.");
      }
      const row = await res.json();
      const meta = row?.metadados && typeof row.metadados === "object" ? row.metadados : {};
      const orc = meta.orcamento && typeof meta.orcamento === "object" ? meta.orcamento : null;
      const rawLinhas = Array.isArray(orc?.linhas) ? orc.linhas : Array.isArray(meta.linhas) ? meta.linhas : [];

      const linhas: BudgetLine[] = rawLinhas.map((l: Record<string, unknown>, i: number) => {
        const existingId = l.id && String(l.id) ? String(l.id) : `manual-${i}`;
        return {
          id: existingId,
          referencia: String(l.referencia || ""),
          descricao: String(l.descricao || ""),
          quantidade: Number(l.quantidade) || 0,
          unitPrice: Number(l.unitPrice) || 0,
          total: Number(l.total) || 0,
          source: String(l.source || "manual"),
        };
      });

      if (linhas.length === 0) {
        linhas.push({ id: `manual-${Date.now()}`, referencia: "", descricao: "", quantidade: 1, unitPrice: 0, total: 0, source: "manual" });
      }

      setBudgetEditor({
        orcamentoStatus: String(row.orcamentoStatus || "Rascunho"),
        linhas,
        valorMaoObra: Number(row.valorMaoObra) || 0,
        valorDesconto: Number(row.valorDesconto) || 0,
        isIsentoIva: Boolean(row.isIsentoIva),
        codigoIsencaoIva: (row.codigoIsencaoIva as string | null) ?? null,
      });

      const draft = loadBudgetDraft(ordem.id);
      if (draft && draft.linhas && draft.linhas.length > 0) {
        setBudgetEditor(draft);
        appToast.info("Rascunho local restaurado (guardado automaticamente).");
      }

      const jangadas = Array.isArray(row.jangadas) ? row.jangadas : row.jangada ? [row.jangada] : [];
      setBudgetContext({
        clienteNome: row?.cliente?.nome || null,
        shipName: String(meta.shipName || "") || jangadas[0]?.shipNameManual || jangadas[0]?.owner || null,
        jangadas: jangadas.map((j: Record<string, unknown>) => ({
          id: Number(j.id) || 0,
          serial: j.serial ? String(j.serial) : null,
          brand: j.brand ? String(j.brand) : null,
          model: j.model ? String(j.model) : null,
          shipNameManual: j.shipNameManual ? String(j.shipNameManual) : null,
          owner: j.owner ? String(j.owner) : null,
        })),
      });

      if (apoioRes.ok) {
        const apoio = await apoioRes.json();
        setBudgetApoio(apoio && typeof apoio === "object" ? apoio : null);
      }
    } catch (e) {
      setBudgetError(e instanceof Error ? e.message : "Erro ao carregar orçamento.");
    } finally {
      setBudgetLoading(false);
      setBudgetApoioLoading(false);
    }
  };

  const closeBudgetEditor = () => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    if (budgetOrdem && budgetEditor) {
      void handleAutoSave();
    }
    setBudgetOrdem(null);
    setBudgetEditor(null);
    setBudgetError("");
    setBudgetAutoError("");
    setBudgetApoio(null);
    setBudgetContext(null);
    setBudgetApoioLoading(false);
    setBudgetTab("orcamento");
    setArtigoSearch("");
    setArtigoDropdownOpen(false);
  };

  const updateBudgetLine = (index: number, patch: Partial<BudgetLine>) => {
    setBudgetEditor((prev) => {
      if (!prev) return prev;
      const linhas = prev.linhas.map((l, i) => (i === index ? { ...l, ...patch } : l));
      const linha = linhas[index];
      if (linha) {
        const q = Number(linha.quantidade) || 0;
        const p = Number(linha.unitPrice) || 0;
        linhas[index] = { ...linha, total: Math.round(q * p * 100) / 100 };
      }
      return { ...prev, linhas };
    });
  };

  const addBudgetLine = (preset?: { referencia?: string; descricao?: string; quantidade?: number; unitPrice?: number }) => {
    setBudgetEditor((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        linhas: [
          ...prev.linhas,
          {
            id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            referencia: String(preset?.referencia || ""),
            descricao: String(preset?.descricao || ""),
            quantidade: Number(preset?.quantidade) || 1,
            unitPrice: Number(preset?.unitPrice) || 0,
            total: Math.round((Number(preset?.quantidade) || 1) * (Number(preset?.unitPrice) || 0) * 100) / 100,
            source: preset?.referencia ? "apoio" : "manual",
          },
        ],
      };
    });
  };

  const addDropdownItem = (item: BudgetDropdownItem) => {
    if (!item.referencia.trim()) return;
    addBudgetLine({
      referencia: item.referencia,
      descricao: item.descricao,
      quantidade: Math.max(1, Number(item.quantidade) || 1),
      unitPrice: Number(item.precoVenda) || 0,
    });
    setArtigoSearch("");
    setArtigoDropdownOpen(false);
  };

  const addApoioArtigo = (artigo: ApoioArtigo) => {
    if (!artigo.referenciaExibida.trim()) return;
    addDropdownItem({
      id: `raft-${artigo.id}`,
      referencia: artigo.referenciaExibida,
      descricao: artigo.descricao || artigo.name,
      quantidade: Math.max(1, Number(artigo.quantidade) || 1),
      precoVenda: 0,
      isRaft: true,
    });
  };

  const dropdownItems = useMemo<BudgetDropdownItem[]>(() => {
    const raft: BudgetDropdownItem[] = (budgetApoio?.artigosJangada || []).map((a) => ({
      id: `raft-${a.id}`,
      referencia: a.referenciaExibida,
      descricao: a.descricao || a.name,
      quantidade: Math.max(1, Number(a.quantidade) || 1),
      precoVenda: 0,
      isRaft: true,
    }));
    const stock: BudgetDropdownItem[] = (budgetApoio?.stock || []).map((s) => ({
      id: `stock-${s.id}`,
      referencia: s.referencia,
      descricao: s.descricao,
      quantidade: 1,
      precoVenda: s.precoVenda || 0,
      isRaft: false,
    }));
    const q = artigoSearch.trim().toLowerCase();
    const filter = (items: BudgetDropdownItem[]) =>
      !q
        ? items
        : items.filter(
            (i) =>
              i.referencia.toLowerCase().includes(q) ||
              i.descricao.toLowerCase().includes(q),
          );
    return [...filter(raft), ...filter(stock)];
  }, [budgetApoio, artigoSearch]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (artigoDropdownRef.current && !artigoDropdownRef.current.contains(e.target as Node)) {
        setArtigoDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const formatMonthYear = (value: string | Date | null | undefined) => {
    if (!value) return "—";
    const d = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return "—";
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };

  const removeBudgetLine = (index: number) => {
    setBudgetEditor((prev) => {
      if (!prev) return prev;
      const linhas = prev.linhas.filter((_, i) => i !== index);
      return { ...prev, linhas: linhas.length > 0 ? linhas : prev.linhas };
    });
  };

  const budgetValorPecas = budgetEditor
    ? budgetEditor.linhas.reduce((acc, l) => acc + Math.round((Number(l.quantidade) || 0) * (Number(l.unitPrice) || 0) * 100) / 100, 0)
    : 0;
  const budgetValorMaoObra = budgetEditor ? Number(budgetEditor.valorMaoObra) || 0 : 0;
  const budgetValorDesconto = budgetEditor ? Number(budgetEditor.valorDesconto) || 0 : 0;
  const budgetSubtotal = Math.max(0, budgetValorPecas + budgetValorMaoObra - budgetValorDesconto);
  const budgetIva = budgetEditor?.isIsentoIva ? 0 : budgetSubtotal * getIvaRate();
  const budgetTotal = Math.round((budgetSubtotal + budgetIva) * 100) / 100;

  const handleSaveBudget = async () => {
    if (!budgetOrdem || !budgetEditor) return;
    const semReferencia = budgetEditor.linhas.filter((l) => !l.referencia.trim());
    if (semReferencia.length > 0) {
      setBudgetError("Não é possível guardar: todas as linhas do orçamento precisam de ter referência.");
      return;
    }
    setBudgetSaving(true);
    setBudgetError("");
    try {
      const res = await fetch(`/api/ordens-servico/${budgetOrdem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updatedAt: budgetOrdem.updatedAt,
          orcamentoStatus: budgetEditor.orcamentoStatus,
          linhas: budgetEditor.linhas.map((l) => ({
            referencia: l.referencia,
            descricao: l.descricao,
            quantidade: Number(l.quantidade) || 0,
            unitPrice: Number(l.unitPrice) || 0,
            total: l.total,
            source: l.source,
          })),
          valorMaoObra: budgetValorMaoObra,
          valorDesconto: budgetValorDesconto,
          isIsentoIva: budgetEditor.isIsentoIva,
          codigoIsencaoIva: budgetEditor.isIsentoIva ? budgetEditor.codigoIsencaoIva : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao guardar orçamento.");
      setBudgetOrdem((prev) => (prev ? { ...prev, updatedAt: data.updatedAt ?? prev.updatedAt } : null));

      appToast.success("Orçamento guardado com sucesso!");

      const updatedMeta = typeof data.metadados === "string" ? data.metadados : JSON.stringify(data.metadados || {});
      setItems((prev) => ({
        ...prev,
        ordens: prev.ordens.map((o) =>
          o.id === budgetOrdem.id
            ? {
                ...o,
                valorPecas: Number(data.valorPecas) || 0,
                valorMaoObra: Number(data.valorMaoObra) || 0,
                valorDesconto: Number(data.valorDesconto) || 0,
                valorTotal: Number(data.valorTotal) || 0,
                metadados: updatedMeta,
                isIsentoIva: Boolean(data.isIsentoIva),
                codigoIsencaoIva: (data.codigoIsencaoIva as string | null) ?? null,
              }
            : o,
        ),
      }));
      clearBudgetDraft(budgetOrdem.id);
      closeBudgetEditor();
    } catch (e) {
      setBudgetError(e instanceof Error ? e.message : "Erro ao guardar orçamento.");
    } finally {
      setBudgetSaving(false);
    }
  };

  const handleAutoSave = async () => {
    if (!budgetOrdem || !budgetEditor) return;
    setBudgetAutosaving(true);
    setBudgetAutoError("");
    try {
      const res = await fetch(`/api/ordens-servico/${budgetOrdem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updatedAt: budgetOrdem.updatedAt,
          orcamentoStatus: budgetEditor.orcamentoStatus,
          linhas: budgetEditor.linhas.map((l) => ({
            referencia: l.referencia,
            descricao: l.descricao,
            quantidade: Number(l.quantidade) || 0,
            unitPrice: Number(l.unitPrice) || 0,
            total: l.total,
            source: l.source,
          })),
          valorMaoObra: budgetValorMaoObra,
          valorDesconto: budgetValorDesconto,
          isIsentoIva: budgetEditor.isIsentoIva,
          codigoIsencaoIva: budgetEditor.isIsentoIva ? budgetEditor.codigoIsencaoIva : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao guardar automaticamente.");
      setBudgetLastSavedAt(new Date());
      setBudgetOrdem((prev) => (prev ? { ...prev, updatedAt: data.updatedAt ?? prev.updatedAt } : null));
      setItems((prev) => ({
        ...prev,
        ordens: prev.ordens.map((o) =>
          o.id === budgetOrdem.id
            ? {
                ...o,
                valorPecas: Number(data.valorPecas) || 0,
                valorMaoObra: Number(data.valorMaoObra) || 0,
                valorDesconto: Number(data.valorDesconto) || 0,
                valorTotal: Number(data.valorTotal) || 0,
                isIsentoIva: Boolean(data.isIsentoIva),
                codigoIsencaoIva: (data.codigoIsencaoIva as string | null) ?? null,
              }
            : o,
        ),
      }));
      clearBudgetDraft(budgetOrdem.id);
    } catch (e) {
      setBudgetAutoError(e instanceof Error ? e.message : "Erro ao guardar automaticamente.");
    } finally {
      setBudgetAutosaving(false);
    }
  };

  const handleAutoSaveRef = useRef<() => void>(() => {});
  handleAutoSaveRef.current = () => {
    void handleAutoSave();
  };

  useEffect(() => {
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }
    if (!budgetOrdem || !budgetEditor) return;
    saveBudgetDraft(budgetOrdem.id, budgetEditor);
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      handleAutoSaveRef.current();
    }, 1200);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [budgetEditor, budgetOrdem, budgetValorMaoObra, budgetValorDesconto]);

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShipId || !porto || !dataPretendida) {
      setSubmitError("Por favor preencha todos os campos obrigatórios.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const res = await fetch("/api/portal/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId: clientes.length > 0 ? (activeClientId ?? undefined) : undefined,
          shipId: Number(selectedShipId),
          jangadaId: selectedJangadaId ? Number(selectedJangadaId) : null,
          porto,
          dataPretendida: `${dataPretendida}T${horaPretendida}`,
          necessitaHRU,
          observacoes,
          transitario: isOtherIsland ? transitario : undefined,
          dataEntrega: isOtherIsland ? dataEntrega : undefined,
          trackingCode: isOtherIsland ? trackingCode : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao criar pedido de assistência.");
      }

      appToast.success("Pedido de assistência enviado com sucesso!");
      setIsRequestModalOpen(false);

      // Reset fields
      setSelectedShipId("");
      setSelectedJangadaId("");
      setPorto("Ponta Delgada");
      setNecessitaHRU("no");
      setObservacoes("");
      setHoraPretendida("09:00");
      setTransitario("");
      setDataEntrega(getLocalDateKey());
      setTrackingCode("");

      // Refresh server components
      router.refresh();
    } catch (err: any) {
      setSubmitError(err?.message || "Ocorreu um erro inesperado.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelOrder = async (orderId: number) => {
    if (!confirm("Tem a certeza que deseja cancelar e eliminar este pedido de assistência?")) {
      return;
    }

    setIsCancelling(true);
    try {
      const res = await fetch(`/api/ordens-servico/${orderId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao cancelar o pedido.");
      }

      appToast.success("Pedido de assistência cancelado com sucesso.");
      setSelectedOrdem(null);
      router.refresh();
    } catch (err: any) {
      alert(err.message || "Ocorreu um erro ao cancelar o pedido.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSwitchClient = async (id: number) => {
    setClientId(id);
    setClientLoading(true);
    setSelectedOrdem(null);
    setSelectedShipId("");
    setSelectedJangadaId("");
    setStatusFilter("");
    setSearchTerm("");

    try {
      const res = await fetch(`/api/portal/clientes/${id}`, { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao carregar o cliente.");
      }
      const data = await res.json();
      setItems({
        ordens: data.ordens || [],
        navios: data.navios || [],
        jangadas: data.jangadas || [],
      });
    } catch (err: any) {
      appToast.error(err?.message || "Não foi possível carregar os dados do cliente.");
    } finally {
      setClientLoading(false);
    }
  };

  const statusLabels: Record<string, string> = {
    pendente: "Pendente",
    "em_curso": "Em Curso",
    "em_progresso": "Em Curso",
    concluido: "Concluído",
    faturado: "Faturado",
  };

  const statusColors: Record<string, string> = {
    pendente: "bg-gray-100 text-gray-700 border-gray-200",
    "em_curso": "bg-blue-50 text-blue-700 border-blue-200 animate-pulse",
    "em_progresso": "bg-blue-50 text-blue-700 border-blue-200 animate-pulse",
    concluido: "bg-emerald-50 text-emerald-700 border-emerald-200",
    faturado: "bg-slate-50 text-slate-600 border-slate-200",
  };

  const priorityColors: Record<string, string> = {
    baixa: "bg-slate-100 text-slate-700",
    normal: "bg-gray-100 text-gray-700",
    alta: "bg-orange-100 text-orange-800",
    urgente: "bg-rose-100 text-rose-800",
  };

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center w-full sm:w-auto">
          {/* Search */}
          <div className="relative w-full sm:w-80">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar por Nº Ordem, S/N..."
              className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs text-slate-700 shadow-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Status Dropdown */}
          <div className="relative w-full sm:w-48">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Filter className="h-4 w-4 text-slate-400" />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-xs text-slate-700 shadow-sm focus:outline-none focus:border-blue-500 appearance-none"
            >
              <option value="">Todos os Estados</option>
              <option value="pendente">Pendentes</option>
              <option value="em_curso">Em Curso</option>
              <option value="concluido">Concluídas</option>
              <option value="faturado">Faturadas</option>
            </select>
          </div>

          {clientes.length > 0 && (
            <div className="relative w-full sm:w-56">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Info className="h-4 w-4 text-slate-400" />
              </div>
              <select
                value={activeClientId ?? ""}
                onChange={(e) => { const id = Number(e.target.value); if (id) void handleSwitchClient(id); }}
                disabled={clientLoading}
                className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-xs text-slate-700 shadow-sm focus:outline-none focus:border-blue-500 appearance-none"
              >
                <option value="">Selecionar cliente...</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Request Service Button */}
        <button
          type="button"
          onClick={() => setIsRequestModalOpen(true)}
          className="rounded-2xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 text-xs font-bold transition-all shadow-sm hover:shadow flex items-center gap-1.5 w-full sm:w-auto justify-center cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Pedir Assistência / Inspeção
        </button>
      </div>

      {/* Orders Grid */}
      {filteredOrdens.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <Info className="mx-auto h-12 w-12 text-slate-400 mb-3" />
          <h3 className="text-base font-bold text-slate-700">Nenhuma ordem encontrada</h3>
          <p className="text-sm text-slate-500 mt-1">Experimente remover ou alterar os filtros ativos.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredOrdens.map((ordem) => {
            const shipName = shipNameMap.get(ordem.shipId || 0) || "Não associado";
            const orderStatusColor = statusColors[ordem.status] || "bg-gray-100 text-gray-700";

            let shipmentInfo = null;
            try {
              if (ordem.metadados) {
                const meta = JSON.parse(ordem.metadados);
                if (meta.transitario) {
                  shipmentInfo = {
                    transitario: meta.transitario,
                    dataEntrega: meta.dataEntrega,
                    trackingCode: meta.trackingCode,
                  };
                }
              }
            } catch (e) { console.warn("Failed to parse shipment metadata:", e); }

            return (
              <div
                key={ordem.id}
                onClick={() => setSelectedOrdem(ordem)}
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer flex flex-col justify-between hover:border-slate-300"
              >
                <div className="space-y-3.5">
                  {/* Title info */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">
                        {ordem.tipo === "inspecao" ? "Inspeção Periódica" : "Manutenção"}
                      </span>
                      <h3 className="text-base font-extrabold text-slate-800 tracking-tight uppercase mt-0.5">
                        Nº {ordem.numeroOrdem}
                      </h3>
                    </div>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border ${orderStatusColor}`}>
                      {statusLabels[ordem.status] || ordem.status}
                    </span>
                  </div>

                  <div className="border-t border-slate-100 py-1" />

                  {/* Details */}
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Equipamento:</span>
                      <span className="font-semibold text-slate-800">
                        {ordem.jangada
                          ? `${ordem.jangada.brand || ""} ${ordem.jangada.model || ""} (S/N: ${ordem.jangada.serial || ""})`
                          : "Sem jangada associada"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Embarcação:</span>
                      <span className="font-semibold text-slate-800">{shipName}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Abertura:</span>
                      <span className="font-semibold text-slate-800">{formatDate(ordem.dataAbertura)}</span>
                    </div>
                    {ordem.dataPlaneadaInicio && (
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-rose-700 font-semibold">Agendamento:</span>
                        <span className="font-bold text-rose-700">{formatDateTime(ordem.dataPlaneadaInicio)}</span>
                      </div>
                    )}
                    {ordem.dataConclusao ? (
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Conclusão:</span>
                        <span className="font-semibold text-slate-800">{formatDate(ordem.dataConclusao)}</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Previsão:</span>
                        <span className="font-semibold text-slate-800">{formatDate(ordem.dataPrevista)}</span>
                      </div>
                    )}
                  </div>

                  {shipmentInfo && (
                    <div className="rounded-xl border border-blue-50 bg-blue-50/30 p-2.5 mt-3 space-y-1 text-[11px] text-blue-700">
                      <div className="font-bold flex items-center gap-1.5 uppercase text-[9px] tracking-wide">
                        <span>📦</span> Envio Transitário
                      </div>
                      <div><strong>Transitário:</strong> {shipmentInfo.transitario}</div>
                      <div><strong>Data Envio:</strong> {formatDate(shipmentInfo.dataEntrega)}</div>
                      {shipmentInfo.trackingCode && <div><strong>Rastreio:</strong> <code className="bg-white/60 px-1 rounded">{shipmentInfo.trackingCode}</code></div>}
                    </div>
                  )}
                </div>

                {/* Card footer details */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className={`inline-flex rounded px-1.5 py-0.5 font-semibold text-[10px] uppercase ${priorityColors[ordem.prioridade] || "bg-slate-100"}`}>
                    Prio: {ordem.prioridade}
                  </span>
                  <div className="text-right">
                    <span className="block text-[10px] text-slate-400 font-medium">Valor Estimado</span>
                    <span className="block text-sm font-bold text-slate-800">
                      {ordem.valorTotal > 0 ? formatPrice(ordem.valorTotal) : "—"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Details Modal */}
      {selectedOrdem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-black text-blue-600 tracking-wider">
                  Detalhes da Ordem de Serviço
                </span>
                <h2 className="text-xl font-black text-slate-800 tracking-tight mt-0.5 uppercase">
                  Ordem nº {selectedOrdem.numeroOrdem}
                </h2>
              </div>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold uppercase border ${statusColors[selectedOrdem.status] || "bg-gray-100"}`}>
                {statusLabels[selectedOrdem.status] || selectedOrdem.status}
              </span>
            </div>

            {/* Description */}
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 text-xs space-y-2">
              <span className="font-bold text-slate-700 block">Descrição do Serviço:</span>
              <p className="text-slate-600 leading-relaxed whitespace-pre-line">
                {selectedOrdem.descricao || "Nenhuma descrição fornecida."}
              </p>
            </div>

            {selectedOrdem.dataPlaneadaInicio && (
              <div className="rounded-2xl bg-rose-50/50 border border-rose-100/80 p-3.5 text-xs flex items-center justify-between">
                <div>
                  <span className="font-semibold text-rose-800 block">Data/Hora Pretendida:</span>
                  <span className="text-rose-700 font-bold text-sm mt-0.5 block">
                    {formatDateTime(selectedOrdem.dataPlaneadaInicio)}
                  </span>
                </div>
                <span className="text-rose-500 text-lg">📅</span>
              </div>
            )}

            {/* Technical details block */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <span className="block text-slate-400 font-semibold">Embarcação</span>
                <span className="block text-slate-800 font-bold">
                  {shipNameMap.get(selectedOrdem.shipId || 0) || "Não associada"}
                </span>
              </div>
              <div className="space-y-1">
                <span className="block text-slate-400 font-semibold">Técnico Responsável</span>
                <span className="block text-slate-800 font-bold">
                  {selectedOrdem.tecnicoResponsavel || "Equipa de Turno"}
                </span>
              </div>
              <div className="space-y-1">
                <span className="block text-slate-400 font-semibold">Jangada</span>
                <span className="block text-slate-800 font-bold">
                  {selectedOrdem.jangada ? `${selectedOrdem.jangada.brand || ""} ${selectedOrdem.jangada.model || ""}` : "Sem jangada"}
                </span>
              </div>
              <div className="space-y-1">
                <span className="block text-slate-400 font-semibold">Nº de Série da Jangada</span>
                <span className="block text-slate-800 font-bold font-mono uppercase">
                  {selectedOrdem.jangada?.serial || "—"}
                </span>
              </div>
              <div className="space-y-1">
                <span className="block text-slate-400 font-semibold">Data de Abertura</span>
                <span className="block text-slate-800 font-bold">
                  {formatDate(selectedOrdem.dataAbertura)}
                </span>
              </div>
              <div className="space-y-1">
                <span className="block text-slate-400 font-semibold">
                  {selectedOrdem.dataConclusao ? "Data de Conclusão" : "Previsão de Conclusão"}
                </span>
                <span className="block text-slate-800 font-bold">
                  {selectedOrdem.dataConclusao ? formatDate(selectedOrdem.dataConclusao) : formatDate(selectedOrdem.dataPrevista)}
                </span>
              </div>
            </div>

            {/* Financial Details */}
            {selectedOrdem.valorTotal > 0 && (
              <div className="border-t border-slate-100 pt-4 text-xs space-y-2">
                <span className="font-bold text-slate-700 block">Orçamento & Faturação:</span>
                <div className="grid grid-cols-3 gap-2 border border-slate-100 rounded-xl bg-slate-50/50 p-3">
                  <div>
                    <span className="block text-[10px] text-slate-400 font-medium">Peças/Materiais</span>
                    <span className="block font-semibold text-slate-700">{formatPrice(selectedOrdem.valorPecas)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 font-medium">Mão de Obra</span>
                    <span className="block font-semibold text-slate-700">{formatPrice(selectedOrdem.valorMaoObra)}</span>
                  </div>
                  <div className="border-l border-slate-200 pl-3">
                    <span className="block text-[10px] text-slate-400 font-bold">Valor Total</span>
                    <span className="block font-black text-blue-700 text-sm">{formatPrice(selectedOrdem.valorTotal)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Shipment details if present */}
            {(() => {
              let shipmentInfo = null;
              try {
                if (selectedOrdem.metadados) {
                  const meta = JSON.parse(selectedOrdem.metadados);
                  if (meta.transitario) {
                    shipmentInfo = {
                      transitario: meta.transitario,
                      dataEntrega: meta.dataEntrega,
                      trackingCode: meta.trackingCode,
                    };
                  }
                }
              } catch (e) { console.warn("Failed to parse shipment metadata:", e); }

              if (!shipmentInfo) return null;

              return (
                <div className="border-t border-slate-100 pt-4 text-xs space-y-2">
                  <span className="font-bold text-slate-700 block">Informações do Envio:</span>
                  <div className="rounded-xl border border-blue-100 bg-blue-50/20 p-3 space-y-1.5 text-blue-800">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="block text-[10px] text-slate-400 font-semibold">Transitário</span>
                        <span className="font-bold">{shipmentInfo.transitario}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 font-semibold">Data do Envio</span>
                        <span className="font-bold">{formatDate(shipmentInfo.dataEntrega)}</span>
                      </div>
                    </div>
                    {shipmentInfo.trackingCode && (
                      <div>
                        <span className="block text-[10px] text-slate-400 font-semibold">Código de Rastreio</span>
                        <code className="bg-white/80 border border-blue-100 px-1.5 py-0.5 rounded font-mono font-bold text-xs inline-block mt-0.5">
                          {shipmentInfo.trackingCode}
                        </code>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Close / Cancel Actions */}
            <div className="pt-2 flex justify-between items-center">
              <div>
                {selectedOrdem.status === "pendente" && (
                  <button
                    type="button"
                    onClick={() => handleCancelOrder(selectedOrdem.id)}
                    disabled={isCancelling}
                    className="rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 px-4 py-2 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isCancelling ? "A cancelar..." : "Cancelar Pedido"}
                  </button>
                )}
              </div>
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => {
                    const o = selectedOrdem;
                    setSelectedOrdem(null);
                    if (o) openBudgetEditor(o);
                  }}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-bold transition-colors cursor-pointer shadow-sm inline-flex items-center gap-1"
                >
                  ✏️ Editar Orçamento
                </button>
                {selectedOrdem.jangada?.id && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/jangadas/${selectedOrdem.jangada?.id}/aprovar-orcamento`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ acao: "aprovar" }),
                        });
                        const j = await res.json();
                        if (!res.ok) throw new Error(j.error || "Erro ao aprovar");
                        appToast.success("Orçamento aprovado com sucesso!");
                        setSelectedOrdem(null);
                        router.refresh();
                      } catch (err: unknown) {
                        appToast.error(err instanceof Error ? err.message : "Erro ao aprovar orçamento");
                      }
                    }}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold transition-colors cursor-pointer shadow-sm"
                  >
                    ✅ Aprovar Orçamento
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedOrdem(null)}
                  className="rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 text-xs font-bold transition-colors cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Budget Editor Modal */}
      {budgetOrdem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-black text-blue-600 tracking-wider">
                  Edição de Orçamento
                </span>
                <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase">
                  Ordem nº {budgetOrdem.numeroOrdem}
                </h2>
                {budgetContext && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    {budgetContext.clienteNome && (
                      <span className="font-semibold text-slate-600">
                        Cliente: {budgetContext.clienteNome}
                      </span>
                    )}
                    {budgetContext.shipName && (
                      <span className="font-semibold text-slate-600">
                        Navio: {budgetContext.shipName}
                      </span>
                    )}
                    {budgetContext.jangadas.length > 0 && (
                      <span className="inline-flex items-center gap-1.5">
                        Jangada{budgetContext.jangadas.length > 1 ? "s" : ""}:
                        {budgetContext.jangadas.map((j) => (
                          <span
                            key={j.id}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-bold text-slate-600"
                          >
                            {j.serial || "—"}
                            {j.brand ? <span className="font-normal text-slate-400">{j.brand}{j.model ? ` ${j.model}` : ""}</span> : null}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={closeBudgetEditor}
                className="rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 transition-colors cursor-pointer"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-1.5 border-b border-slate-100 pb-3">
              {(
                [
                  { key: "orcamento", label: "Orçamento" },
                  { key: "ultima", label: "Última Inspeção" },
                  { key: "previsao", label: "Previsão Próxima" },
                  { key: "artigos", label: "Artigos da Jangada" },
                ] as Array<{ key: BudgetTab; label: string }>
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setBudgetTab(tab.key)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                    budgetTab === tab.key
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {tab.label}
                  {tab.key === "previsao" &&
                    (budgetApoio?.dataProxInspecao ? (
                      <span className="ml-1.5 text-[10px]">{formatMonthYear(budgetApoio.dataProxInspecao)}</span>
                    ) : null)}
                  {tab.key === "artigos" && budgetApoio ? (
                    <span className="ml-1.5 text-[10px] opacity-80">{budgetApoio.artigosJangada.length}</span>
                  ) : null}
                </button>
              ))}
            </div>

            {budgetLoading ? (
              <div className="py-12 text-center text-sm text-slate-500">A carregar orçamento…</div>
            ) : !budgetEditor ? (
              budgetError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
                  {budgetError}
                </div>
              )
            ) : (
              <>
                {budgetTab === "orcamento" && (
                <div className="space-y-4">
                {/* Status / Valores globais */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Estado do Orçamento
                    </label>
                    <select
                      value={budgetEditor.orcamentoStatus}
                      onChange={(e) =>
                        setBudgetEditor((prev) => (prev ? { ...prev, orcamentoStatus: e.target.value } : prev))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                    >
                      {["Rascunho", "Enviado", "Aprovado", "Rejeitado"].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Inspeção de Jangada (€)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={budgetEditor.valorMaoObra}
                      onChange={(e) =>
                        setBudgetEditor((prev) => (prev ? { ...prev, valorMaoObra: Number(e.target.value) || 0 } : prev))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Desconto (€)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={budgetEditor.valorDesconto}
                      onChange={(e) =>
                        setBudgetEditor((prev) => (prev ? { ...prev, valorDesconto: Number(e.target.value) || 0 } : prev))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-end pb-1.5">
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={budgetEditor.isIsentoIva}
                        onChange={(e) =>
                          setBudgetEditor((prev) => (prev ? { ...prev, isIsentoIva: e.target.checked } : prev))
                        }
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      IVA isento
                    </label>
                    {budgetEditor.isIsentoIva && (
                      <select
                        value={budgetEditor.codigoIsencaoIva ?? ""}
                        onChange={(e) =>
                          setBudgetEditor((prev) =>
                            prev ? { ...prev, codigoIsencaoIva: e.target.value || null } : prev,
                          )
                        }
                        className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
                      >
                        <option value="">— motivo (opcional) —</option>
                        {IVA_ISENCAO_CODES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code} — {c.mencao}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Linhas */}
                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold">Referência</th>
                        <th className="px-3 py-2 text-left font-bold">Descrição</th>
                        <th className="px-3 py-2 text-right font-bold">Qtd</th>
                        <th className="px-3 py-2 text-right font-bold">Preço Unit. (€)</th>
                        <th className="px-3 py-2 text-right font-bold">Total (€)</th>
                        <th className="px-2 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {budgetEditor.linhas.map((l, i) => (
                        <tr key={l.id}>
                          <td className="px-3 py-1.5">
                            <input
                              value={l.referencia}
                              onChange={(e) => updateBudgetLine(i, { referencia: e.target.value })}
                              className="w-24 rounded border border-slate-200 px-2 py-1 focus:border-blue-400 focus:outline-none"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              value={l.descricao}
                              onChange={(e) => updateBudgetLine(i, { descricao: e.target.value })}
                              className="w-full rounded border border-slate-200 px-2 py-1 focus:border-blue-400 focus:outline-none"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={l.quantidade}
                              onChange={(e) => updateBudgetLine(i, { quantidade: Number(e.target.value) })}
                              className="w-16 rounded border border-slate-200 px-2 py-1 text-right focus:border-blue-400 focus:outline-none"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={l.unitPrice}
                              onChange={(e) => updateBudgetLine(i, { unitPrice: Number(e.target.value) })}
                              className="w-24 rounded border border-slate-200 px-2 py-1 text-right focus:border-blue-400 focus:outline-none"
                            />
                          </td>
                           <td className="px-3 py-1.5 text-right font-bold text-slate-700">
                            {formatPrice(Math.round((Number(l.quantidade) || 0) * (Number(l.unitPrice) || 0) * 100) / 100)}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => removeBudgetLine(i)}
                              className="text-slate-300 hover:text-rose-600 transition-colors cursor-pointer"
                              aria-label="Remover linha"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div ref={artigoDropdownRef} className="relative">
                    <input
                      value={artigoSearch}
                      onChange={(e) => {
                        setArtigoSearch(e.target.value);
                        setArtigoDropdownOpen(true);
                      }}
                      onFocus={() => setArtigoDropdownOpen(true)}
                      placeholder="Pesquisar referência (ex.: L-NAP)…"
                      className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
                    />
                    {artigoDropdownOpen && (
                      <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                        {budgetApoioLoading ? (
                          <div className="px-3 py-2 text-xs text-slate-500">A carregar artigos…</div>
                        ) : dropdownItems.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-slate-400">Sem artigos disponíveis.</div>
                        ) : (
                          <>
                            {dropdownItems.some((a) => a.isRaft) && (
                              <div className="sticky top-0 z-10 bg-sky-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-600 border-b border-sky-100">
                                Artigos da Jangada
                              </div>
                            )}
                            {dropdownItems.map((a, idx) => {
                              const isLastRaft = a.isRaft && (!dropdownItems[idx + 1] || !dropdownItems[idx + 1].isRaft);
                              const hasRef = a.referencia.trim().length > 0;
                              return (
                                <React.Fragment key={a.id}>
                                  {isLastRaft && dropdownItems.some((x) => !x.isRaft) && (
                                    <div className="sticky top-0 z-10 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                                      Stock
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    disabled={!hasRef}
                                    onClick={() => hasRef && addDropdownItem(a)}
                                    className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors ${
                                      hasRef
                                        ? "hover:bg-blue-50 cursor-pointer"
                                        : "cursor-not-allowed opacity-40"
                                    }`}
                                  >
                                    <span className="flex items-center gap-2 text-xs">
                                      <span className="font-bold text-slate-700">
                                        {a.referencia || "Sem referência"}
                                      </span>
                                      <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${
                                        a.isRaft
                                          ? "bg-sky-100 text-sky-600"
                                          : "bg-slate-100 text-slate-500"
                                      }`}>
                                        {a.isRaft ? "Jangada" : "Stock"}
                                      </span>
                                    </span>
                                    <span className="text-[11px] text-slate-500 truncate">
                                      {a.descricao}{a.quantidade > 1 ? ` · Qtd ${a.quantidade}` : ""}
                                    </span>
                                  </button>
                                </React.Fragment>
                              );
                            })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => addBudgetLine()}
                    className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar linha
                  </button>
                </div>

                {/* Totais */}
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 text-sm space-y-1.5">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-semibold">{formatPrice(budgetSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>IVA ({budgetEditor.isIsentoIva ? "isento" : `${Math.round(getIvaRate() * 100)}%`})</span>
                    <span className="font-semibold">{formatPrice(budgetIva)}</span>
                  </div>
                  <div className="flex justify-between text-base font-black text-slate-800 border-t border-slate-200 pt-2">
                    <span>Total c/ IVA</span>
                    <span>{formatPrice(budgetTotal)}</span>
                  </div>
                </div>
                </div>
                )}

                {budgetTab === "ultima" && (
                  <div className="space-y-3">
                    {budgetApoio?.ultimaInspecao ? (
                      <>
                        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                          <span className="rounded-lg bg-slate-100 px-2.5 py-1">
                            Certificado: <b>{budgetApoio.ultimaInspecao.certificadoNumero || "—"}</b>
                          </span>
                          <span className="rounded-lg bg-slate-100 px-2.5 py-1">
                            Inspeção: <b>{formatDateTime(budgetApoio.ultimaInspecao.dataInspecao)}</b>
                          </span>
                          <span className="rounded-lg bg-slate-100 px-2.5 py-1">
                            Próxima: <b>{formatMonthYear(budgetApoio.ultimaInspecao.dataProxInspecao)}</b>
                          </span>
                        </div>
                        <div className="rounded-2xl border border-slate-200 overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 text-slate-500">
                              <tr>
                                <th className="px-3 py-2 text-left font-bold">Referência</th>
                                <th className="px-3 py-2 text-left font-bold">Descrição</th>
                                <th className="px-3 py-2 text-right font-bold">Qtd</th>
                                <th className="px-3 py-2 text-left font-bold">Validade</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {budgetApoio.ultimaInspecao.artigos.map((a) => (
                                <tr key={a.id}>
                                  <td className="px-3 py-1.5 font-bold text-slate-700">
                                    {a.referenciaExibida || a.referencia || "—"}
                                  </td>
                                  <td className="px-3 py-1.5">{a.descricao || a.name}</td>
                                  <td className="px-3 py-1.5 text-right">{a.quantidade}</td>
                                  <td className="px-3 py-1.5">{formatMonthYear(a.validade)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-500">
                        Sem inspeção anterior registada para esta jangada.
                      </div>
                    )}
                  </div>
                )}

                {budgetTab === "previsao" && (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                      Próxima inspeção prevista: <b>{formatMonthYear(budgetApoio?.dataProxInspecao)}</b>
                    </div>
                    {(() => {
                      const aSubstituir = (budgetApoio?.artigosJangada || []).filter((a) => a.previstoSubstituir);
                      return aSubstituir.length === 0 ? (
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-500">
                          Nenhum artigo com validade a expirar antes da próxima inspeção.
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 text-slate-500">
                              <tr>
                                <th className="px-3 py-2 text-left font-bold">Referência</th>
                                <th className="px-3 py-2 text-left font-bold">Descrição</th>
                                <th className="px-3 py-2 text-right font-bold">Qtd</th>
                                <th className="px-3 py-2 text-left font-bold">Validade</th>
                                <th className="px-3 py-2 text-center font-bold">Previsto</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {aSubstituir.map((a) => (
                                <tr key={a.id}>
                                  <td className="px-3 py-1.5 font-bold text-slate-700">
                                    {a.referenciaExibida || a.referencia || "—"}
                                  </td>
                                  <td className="px-3 py-1.5">{a.descricao || a.name}</td>
                                  <td className="px-3 py-1.5 text-right">{a.quantidade}</td>
                                  <td className="px-3 py-1.5">{formatMonthYear(a.validade)}</td>
                                  <td className="px-3 py-1.5 text-center">
                                    <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-bold">
                                      Substituir
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {budgetTab === "artigos" && (
                  <div className="space-y-3">
                    <div className="text-xs text-slate-500">
                      Artigos atualmente associados à jangada (clique para adicionar ao orçamento).
                    </div>
                    <div className="rounded-2xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-3 py-2 text-left font-bold">Referência</th>
                            <th className="px-3 py-2 text-left font-bold">Descrição</th>
                            <th className="px-3 py-2 text-right font-bold">Qtd</th>
                            <th className="px-3 py-2 text-left font-bold">Validade</th>
                            <th className="px-3 py-2 text-center font-bold"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(budgetApoio?.artigosJangada || []).map((a) => (
                            <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-3 py-1.5 font-bold text-slate-700">
                                {a.referenciaExibida || a.referencia || "—"}
                              </td>
                              <td className="px-3 py-1.5">{a.descricao || a.name}</td>
                              <td className="px-3 py-1.5 text-right">{a.quantidade}</td>
                              <td className="px-3 py-1.5">{formatMonthYear(a.validade)}</td>
                              <td className="px-3 py-1.5 text-center">
                                <button
                                  type="button"
                                  disabled={!a.referenciaExibida.trim()}
                                  onClick={() => addApoioArtigo(a)}
                                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                    a.referenciaExibida.trim()
                                      ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                                  }`}
                                >
                                  Adicionar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {budgetError && (
                  <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
                    {budgetError}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <div className="text-[11px] text-slate-400">
                    {budgetAutosaving ? (
                      <span className="inline-flex items-center gap-1 text-blue-600">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                        A guardar automaticamente…
                      </span>
                    ) : budgetAutoError ? (
                      <span className="text-rose-600" title={budgetAutoError}>
                        Guarda automática falhou — use "Guardar Orçamento"
                      </span>
                    ) : budgetLastSavedAt ? (
                      <span>
                        Guardado automaticamente às{" "}
                        {String(budgetLastSavedAt.getHours()).padStart(2, "0")}:
                        {String(budgetLastSavedAt.getMinutes()).padStart(2, "0")}
                      </span>
                    ) : (
                      <span>As alterações são guardadas automaticamente</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={closeBudgetEditor}
                      className="rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 text-xs font-bold transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveBudget}
                      disabled={budgetSaving}
                      className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-bold transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      {budgetSaving ? "A guardar…" : "Guardar Orçamento"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Request Inspection Modal */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div>
              <span className="text-[10px] uppercase font-black text-blue-600 tracking-wider">
                Solicitar Serviço
              </span>
              <h2 className="text-xl font-black text-slate-800 tracking-tight mt-0.5">
                Pedir Assistência / Inspeção
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Submeta um pedido de inspeção obrigatória ou manutenção. A nossa equipa entrará em contacto para agendar.
              </p>
            </div>

            <form onSubmit={handleRequestSubmit} className="space-y-4">
              {submitError && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800">
                  {submitError}
                </div>
              )}

              {/* Vessel Select */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-600">
                  Embarcação / Navio <span className="text-rose-500">*</span>
                </label>
                <div className="relative" ref={shipComboboxRef}>
                <input
                  type="text"
                  value={shipSearch}
                  onFocus={() => setShipDropdownOpen(true)}
                  onChange={(e) => {
                    setShipSearch(e.target.value);
                    setShipDropdownOpen(true);
                  }}
                  placeholder={selectedShipId ? (navios.find((n) => String(n.id) === selectedShipId)?.nome || "Pesquisar navio...") : "Pesquisar navio..."}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 pr-9 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
                />
                {selectedShipId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedShipId("");
                      setShipSearch("");
                      setShipDropdownOpen(true);
                    }}
                    tabIndex={-1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    title="Limpar seleção"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <ChevronDown
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                  />
                )}
                {shipDropdownOpen && (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                    {filteredShips.length === 0 ? (
                      <div className="px-3 py-2.5 text-xs text-slate-500">Nenhum navio encontrado.</div>
                    ) : (
                      filteredShips.map((n) => (
                        <button
                          type="button"
                          key={n.id}
                          onClick={() => {
                            setSelectedShipId(String(n.id));
                            setShipSearch("");
                            setShipDropdownOpen(false);
                          }}
                          className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-xs transition hover:bg-blue-50 ${
                            String(n.id) === selectedShipId ? "bg-blue-50 text-blue-700" : "text-slate-700"
                          }`}
                        >
                          <span>{n.nome}</span>
                          {n.ilha ? <span className="text-[10px] text-slate-400">{n.ilha}</span> : null}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Liferaft Select (Conditional on ship select) */}
              {selectedShipId && (
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-600">
                    Jangada Salva-vidas <span className="text-rose-500">*</span>
                  </label>
                  {filteredJangadas.length === 0 ? (
                    <div className="text-xs text-rose-600 font-semibold p-1">
                      Este navio não tem jangadas registadas. Por favor contacte o suporte.
                    </div>
                  ) : (
                    <select
                      required
                      value={selectedJangadaId}
                      onChange={(e) => setSelectedJangadaId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
                    >
                      {filteredJangadas.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.brand} {j.model} (S/N: {j.serial})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Port Select */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-600">
                    Porto de Assistência (S. Miguel) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={porto}
                    onChange={(e) => setPorto(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
                  >
                    <option value="Ponta Delgada">Ponta Delgada</option>
                    <option value="Rabo de Peixe">Rabo de Peixe</option>
                    <option value="Lagoa">Lagoa</option>
                    <option value="Vila Franca do Campo">Vila Franca do Campo</option>
                    <option value="Ribeira Grande">Ribeira Grande</option>
                    <option value="Nordeste">Nordeste</option>
                    <option value="Povoação">Povoação</option>
                    <option value="Outro (S. Miguel)">Outro (S. Miguel)</option>
                  </select>
                  <p className="text-[10px] text-amber-600 font-semibold mt-0.5 leading-tight">
                    A assistência está disponível exclusivamente na ilha de São Miguel.
                  </p>
                </div>

                <div className="space-y-2">
                  {/* Preferred Date */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-600">
                      Data Pretendida <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={dataPretendida}
                      onChange={(e) => setDataPretendida(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Preferred Time */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-600">
                      Hora Pretendida <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      required
                      value={horaPretendida}
                      onChange={(e) => setHoraPretendida(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Shipment Info for other islands */}
              {isOtherIsland && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3.5 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-800 uppercase tracking-wider">
                    <span>📦</span> Detalhes do Envio (Transitário)
                  </div>
                  <p className="text-[10px] text-blue-600 leading-normal">
                    Como a sua embarcação pertence à ilha de <strong>{selectedShipObject?.ilha}</strong>, a assistência requer o envio do equipamento para a nossa estação em São Miguel. Por favor, preencha os dados do envio.
                  </p>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-600">
                      Transitário / Transportadora <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Transitário Açoreano, Bensaude, etc."
                      value={transitario}
                      onChange={(e) => setTransitario(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-slate-600">
                        Data de Entrega / Envio <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={dataEntrega}
                        onChange={(e) => setDataEntrega(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-slate-600">
                        Código de Rastreio <span className="text-slate-400 font-normal">(Opcional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Nº Guia / Rastreio"
                        value={trackingCode}
                        onChange={(e) => setTrackingCode(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* New HRU Checkbox */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 flex items-start gap-3">
                <input
                  type="checkbox"
                  id="hru_checkbox"
                  checked={necessitaHRU === "yes"}
                  onChange={(e) => setNecessitaHRU(e.target.checked ? "yes" : "no")}
                  className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="hru_checkbox" className="text-xs text-slate-600 cursor-pointer select-none">
                  <span className="font-bold text-slate-700 block">Necessita de Novo HRU?</span>
                  Assinale se necessita de fornecimento e instalação de um novo Dispositivo de Libertação Hidrostática (HRU) para a jangada.
                </label>
              </div>

              {/* Observations */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-600">
                  Observações / Instruções Adicionais
                </label>
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Ex: Porto alternativo, detalhes da urgência ou outros equipamentos a verificar..."
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Footer Buttons */}
              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!!(isSubmitting || !selectedShipId || (selectedShipId && filteredJangadas.length === 0))}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? "A enviar..." : "Submeter Pedido"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
