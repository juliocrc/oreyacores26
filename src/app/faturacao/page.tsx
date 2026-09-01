"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { 
  FileText, Receipt, Search, Loader2, Save, Download, 
  CheckCircle2, AlertCircle, Edit3, RefreshCcw, Percent, 
  DollarSign, Wrench, ShieldCheck, Zap, Link2, Check, 
  TrendingUp, PieChart, Building2, BarChart3, Wallet, MessageSquare, BadgeCheck, CreditCard,
  CalendarRange, Award, FileMinus, Gauge, Plus, Trash2, Package
} from "lucide-react";
import { Bar, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  type TooltipItem,
} from "chart.js";
import { formatDateTimeShort } from "@/lib/date-utils";
import { getIvaRate, calcIva } from "@/lib/iva";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const CHART_TICK_COLOR = "#94a3b8";
const CHART_GRID_COLOR = "rgba(148, 163, 184, 0.12)";

const PAGAMENTO_STATUS_LIST = ["Pendente", "Pago Parcialmente", "Pago", "Vencido"];

const PAGAMENTO_BADGE_CLASSES: Record<string, string> = {
  Pendente: "bg-amber-50 text-amber-700 border-amber-200",
  "Pago Parcialmente": "bg-blue-50 text-blue-700 border-blue-200",
  Pago: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Vencido: "bg-rose-50 text-rose-700 border-rose-200",
};

type OrdemItem = {
  id: number;
  numeroOrdem?: string | null;
  status?: string | null;
  orcamentoStatus?: string | null;
  valorPecas?: number | null;
  valorMaoObra?: number | null;
  valorDesconto?: number | null;
  isIsentoIva?: boolean | null;
  valorTotal?: number | null;
  dataAbertura?: string | null;
  dataConclusao?: string | null;
  metadados?: {
    faturaId?: number | string | null;
    faturaNumero?: string | null;
    faturaEmitidaEm?: string;
    faturaEmitidaPor?: string;
    pagamentoStatus?: string;
    linhas?: OrcamentoLinha[];
  } | null;
  jangada?: { serial?: string | null; brand?: string | null; model?: string | null; owner?: string | null; shipNameManual?: string | null } | null;
  cliente?: { id?: number; nome?: string | null; nif?: string | null; morada?: string | null; localidade?: string | null; ilha?: string | null } | null;
  serviceStation?: { codigo?: string | null; nome?: string | null } | null;
  tecnico?: { nome?: string | null } | null;
};

type FaturaItem = {
  id: number;
  numeroFatura: string;
  cliente?: { id?: number; nome?: string | null } | null;
  valorTotal?: number | null;
  pagamentoStatus?: string | null;
  cancelada?: boolean;
  dataEmissao?: string | null;
};

type OrcamentoLinha = {
  id: string;
  stockId?: number | string | null;
  referencia: string;
  descricao: string;
  quantidade: number;
  unitPrice: number;
  total: number;
  source: "service" | "pack" | "componente" | "stock" | "manual";
};

type StockOption = {
  id: number;
  referencia: string;
  descricao: string;
  precoVenda: number;
};

function getPagamentoStatus(ordem: OrdemItem | null) {
  if (!ordem) return "Pendente";
  const meta = ordem.metadados || {};
  return meta.pagamentoStatus || ordem.orcamentoStatus || "Pendente";
}

export default function FaturacaoConsolePage() {
  const [viewMode, setViewMode] = useState<"console" | "kpis">("console");
  const [loadingList, setLoadingList] = useState(true);
  const [orders, setOrders] = useState<OrdemItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedIdRef = useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState<"orcamento" | "fatura">("orcamento");

  // Editable fields for selected order
  const [editPecas, setEditPecas] = useState("0");
  const [editMaoObra, setEditMaoObra] = useState("0");
  const [editDesconto, setEditDesconto] = useState("0");
  const [editIsentoIva, setEditIsentoIva] = useState(false);
  const [editOrcamentoStatus, setEditOrcamentoStatus] = useState("Rascunho");
  const [editStatus, setEditStatus] = useState("aberta");
  const [editPagamento, setEditPagamento] = useState("Pendente");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [emitindoFatura, setEmitindoFatura] = useState(false);
  const [cancelandoFatura, setCancelandoFatura] = useState(false);
  const [atualizandoPagamento, setAtualizandoPagamento] = useState(false);

  // Sidebar mode: listar OTs ou Faturas (para eliminação em lote)
  const [sidebarMode, setSidebarMode] = useState<"ot" | "faturas">("ot");
  const [faturasList, setFaturasList] = useState<FaturaItem[]>([]);
  const [faturasLoading, setFaturasLoading] = useState(false);
  const [selectedFaturaIds, setSelectedFaturaIds] = useState<Set<number>>(new Set());
  const [deletingFaturas, setDeletingFaturas] = useState(false);

  // Linhas de orçamento editáveis
  const [linhas, setLinhas] = useState<OrcamentoLinha[]>([]);
  const [stockOptions, setStockOptions] = useState<StockOption[]>([]);
  const [addingLinha, setAddingLinha] = useState(false);
  const [newLinha, setNewLinha] = useState({ descricao: "", referencia: "", quantidade: 1, unitPrice: 0, stockId: null as number | null });
  const [savingLinhas, setSavingLinhas] = useState(false);

  const selectOrder = (ordem: OrdemItem) => {
    setSelectedId(ordem.id);
    selectedIdRef.current = ordem.id;
    setEditPecas(String(ordem.valorPecas ?? 0));
    setEditMaoObra(String(ordem.valorMaoObra ?? 0));
    setEditDesconto(String(ordem.valorDesconto ?? 0));
    setEditIsentoIva(Boolean(ordem.isIsentoIva));
    setEditOrcamentoStatus(ordem.orcamentoStatus || "Rascunho");
    setEditStatus(ordem.status || "aberta");
    setEditPagamento(getPagamentoStatus(ordem));
    setErrorMsg(null);
    setSuccessMsg(null);
    setCopiedLink(false);
    const metaLinhas = ordem.metadados?.linhas;
    if (Array.isArray(metaLinhas)) {
      const seen = new Set<string>();
      const normalized: OrcamentoLinha[] = (metaLinhas as unknown as OrcamentoLinha[]).map((l) => {
        let id = l.id || `unknown-${Math.random().toString(36).slice(2, 8)}`;
        if (seen.has(id)) {
          id = `${id}-${Math.random().toString(36).slice(2, 8)}`;
        }
        seen.add(id);
        return { ...l, id };
      });
      setLinhas(normalized);
    } else {
      setLinhas([]);
    }
    setAddingLinha(false);
  };

  const fetchOrders = useCallback(async () => {
    setLoadingList(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({ includeClosed: "1" });
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (statusFilter) params.set("orcamentoStatus", statusFilter);
      const res = await fetch(`/api/ordens-servico?${params.toString()}`);
      if (!res.ok) throw new Error("Falha ao carregar ordens de serviço.");
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setOrders(list);
      if (list.length > 0 && !selectedIdRef.current) {
        selectOrder(list[0]);
      }
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao carregar lista.");
    } finally {
      setLoadingList(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setLoading(true) no início do fetch assíncrono controla o estado de carregamento.
    fetchOrders();
  }, [fetchOrders]);

  const fetchFaturas = useCallback(async () => {
    setFaturasLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/faturas?incluirCanceladas=true");
      if (!res.ok) throw new Error("Falha ao carregar faturas.");
      const data = await res.json();
      setFaturasList(Array.isArray(data?.faturas) ? data.faturas : []);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao carregar faturas.");
    } finally {
      setFaturasLoading(false);
    }
  }, []);

  const openFaturasMode = () => {
    setSidebarMode("faturas");
    setSelectedFaturaIds(new Set());
    fetchFaturas();
  };

  const addLinha = () => {
    if (!newLinha.descricao.trim()) return;
    const linha: OrcamentoLinha = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      stockId: newLinha.stockId,
      referencia: newLinha.referencia,
      descricao: newLinha.descricao,
      quantidade: Math.max(1, newLinha.quantidade),
      unitPrice: Math.max(0, newLinha.unitPrice),
      total: Math.max(1, newLinha.quantidade) * Math.max(0, newLinha.unitPrice),
      source: "manual",
    };
    setLinhas((prev) => [...prev, linha]);
    setNewLinha({ descricao: "", referencia: "", quantidade: 1, unitPrice: 0, stockId: null });
    setAddingLinha(false);
  };

  const removeLinha = (id: string) => {
    setLinhas((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLinha = (id: string, field: keyof OrcamentoLinha, value: string | number) => {
    setLinhas((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, [field]: value };
        if (field === "quantidade" || field === "unitPrice") {
          next.total = (next.quantidade || 0) * (next.unitPrice || 0);
        }
        return next;
      })
    );
  };

  const linhasTotal = linhas.reduce((acc, l) => acc + (l.total || 0), 0);

  const handleSaveLinhas = async () => {
    if (!selectedOrder) return;
    setSavingLinhas(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/ordens-servico/${selectedOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linhas }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Erro ao guardar linhas.");
      }
      setEditPecas(String(linhasTotal));
      setSuccessMsg("Linhas de orçamento guardadas com sucesso!");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao guardar linhas.");
    } finally {
      setSavingLinhas(false);
    }
  };

  const handleStockSelect = (stockId: number) => {
    const stock = stockOptions.find((s) => s.id === stockId);
    if (stock) {
      setNewLinha((prev) => ({
        ...prev,
        stockId: stock.id,
        descricao: stock.descricao,
        referencia: stock.referencia,
        unitPrice: stock.precoVenda || 0,
      }));
    }
  };

  const toggleFaturaSelect = (id: number) => {
    setSelectedFaturaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDeleteFaturas = async () => {
    if (selectedFaturaIds.size === 0) return;
    const ids = [...selectedFaturaIds];
    const confirmText = window.confirm(
      `Eliminar definitivamente ${ids.length} fatura(s)?\n\nInclui recibos e notas de crédito associadas. Esta ação não pode ser anulada.`,
    );
    if (!confirmText) return;
    setDeletingFaturas(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/faturas/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao eliminar faturas.");
      setSelectedFaturaIds(new Set());
      setSuccessMsg(`${data.count || ids.length} fatura(s) eliminada(s) com sucesso.`);
      await fetchFaturas();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao eliminar faturas.");
    } finally {
      setDeletingFaturas(false);
    }
  };

  const selectedOrder = orders.find((o) => o.id === selectedId) || null;
  const faturaNumero = (selectedOrder?.metadados?.faturaNumero as string | undefined) || null;
  const faturaId = Number(selectedOrder?.metadados?.faturaId) || null;
  const faturaEmitida = Boolean(faturaNumero);
  const faturaCancelada = faturaEmitida && (selectedOrder?.metadados?.pagamentoStatus === "Cancelado");

  // Fetch stock options for line item selection
  useEffect(() => {
    if (!selectedOrder) return;
    fetch(`/api/ordens-servico/${selectedOrder.id}/apoio-orcamento`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.stock)) setStockOptions(data.stock);
      })
      .catch(() => {});
  }, [selectedOrder?.id]);

  // Live calculations
  const numPecas = Number(editPecas) || 0;
  const numMaoObra = Number(editMaoObra) || 0;
  const numDesconto = Number(editDesconto) || 0;
  const pecasFromLinhas = linhas.length > 0 ? linhasTotal : numPecas;
  const subtotal = Math.max(0, pecasFromLinhas + numMaoObra - numDesconto);
  const iva = calcIva(subtotal, editIsentoIva);
  const total = subtotal + iva;

  const handleSave = async (override?: { orcamentoStatus?: string; status?: string }): Promise<boolean> => {
    if (!selectedOrder) return false;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const payloadOrcStatus = override?.orcamentoStatus ?? editOrcamentoStatus;
    const payloadStatus = override?.status ?? editStatus;

    try {
      const res = await fetch(`/api/ordens-servico/${selectedOrder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valorPecas: linhas.length > 0 ? linhasTotal : numPecas,
          valorMaoObra: numMaoObra,
          valorDesconto: numDesconto,
          isIsentoIva: editIsentoIva,
          orcamentoStatus: payloadOrcStatus,
          status: payloadStatus,
          metadados: faturaEmitida ? undefined : { pagamentoStatus: editPagamento },
          linhas: linhas.length > 0 ? linhas : undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const details = body?.details?.length ? `: ${body.details.join("; ")}` : "";
        throw new Error(`${body?.error || "Erro ao atualizar valores."}${details}`);
      }

      const updated = await res.json();
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated, metadados: { ...(o.metadados || {}), pagamentoStatus: faturaEmitida ? o.metadados?.pagamentoStatus : editPagamento } } : o)));

      if (faturaEmitida && faturaId) {
        setAtualizandoPagamento(true);
        try {
          const payRes = await fetch(`/api/faturas/${faturaId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pagamentoStatus: editPagamento }),
          });
          if (!payRes.ok) {
            const payBody = await payRes.json().catch(() => null);
            throw new Error(payBody?.error || "Fatura registada, mas não foi possível atualizar o estado de pagamento.");
          }
          setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, metadados: { ...(o.metadados || {}), pagamentoStatus: editPagamento } } : o)));
        } finally {
          setAtualizandoPagamento(false);
        }
      }

      if (override?.orcamentoStatus) setEditOrcamentoStatus(override.orcamentoStatus);
      if (override?.status) setEditStatus(override.status);
      setSuccessMsg(override?.orcamentoStatus === "Aprovado"
        ? "Orçamento aprovado com sucesso!"
        : "Orçamento / Valores / Pagamento atualizados com sucesso!");
      return true;
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao salvar alterações.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Manual approval (just approve budget, no order closure required)
  const handleAprovarOrcamento = async () => {
    await handleSave({ orcamentoStatus: "Aprovado" });
  };

  // Approve + try to conclude + register & download invoice
  const handleAprovarEConcluirFaturar = async () => {
    if (!selectedOrder) return;
    const ok = await handleSave({ orcamentoStatus: "Aprovado", status: "concluida" });
    if (ok) {
      await handleEmitirFatura();
    }
  };

  // Register the invoice in the database (Fatura linked to OT + cliente) and download the Excel
  const handleEmitirFatura = async () => {
    if (!selectedOrder) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    if (selectedOrder.status !== "concluida" && editStatus !== "concluida") {
      setErrorMsg("Para emitir a Fatura Oficial, a Ordem de Serviço deve estar concluída.");
      return;
    }

    setEmitindoFatura(true);
    try {
      const res = await fetch(`/api/ordens-servico/${selectedOrder.id}/faturar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagamentoStatus: editPagamento }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Erro ao emitir fatura.");
      }

      const emittedNumero = (body?.numeroFatura || body?.fatura?.numeroFatura) as string | null;
      const emittedId = Number(body?.fatura?.id) || null;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === selectedOrder.id
            ? {
                ...o,
                metadados: {
                  ...(o.metadados || {}),
                  faturaId: emittedId,
                  faturaNumero: emittedNumero,
                  faturaEmitidaEm: new Date().toISOString(),
                  pagamentoStatus: editPagamento,
                },
              }
            : o
        )
      );
      setSuccessMsg(emittedNumero ? `Fatura ${emittedNumero} emitida com sucesso!` : "Fatura emitida com sucesso!");
      window.open(`/api/ordens-servico/${selectedOrder.id}/fatura-excel`, "_blank");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao emitir fatura.");
    } finally {
      setEmitindoFatura(false);
    }
  };

  const handleAnularFatura = async () => {
    if (!selectedOrder || !faturaId) return;
    const motivo = window.prompt("Motivo da anulação da fatura (opcional):", "") || "";
    if (motivo === null) return;
    setCancelandoFatura(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/faturas/${faturaId}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Erro ao anular fatura.");
      const numeroNC = body?.notaCredito?.numeroNotaCredito || "";
      setOrders((prev) =>
        prev.map((o) =>
          o.id === selectedOrder.id
            ? { ...o, metadados: { ...(o.metadados || {}), pagamentoStatus: "Cancelado", notaCreditoNumero: numeroNC } }
            : o
        )
      );
      setSuccessMsg(`Fatura ${faturaNumero} anulada. ${numeroNC ? `Nota de crédito ${numeroNC} emitida.` : ""}`);
      if (numeroNC) window.open(`/api/ordens-servico/${selectedOrder.id}/nota-credito-excel`, "_blank");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao anular fatura.");
    } finally {
      setCancelandoFatura(false);
    }
  };

  const handleWhatsAppShareFatura = () => {
    if (!selectedOrder || !faturaNumero) return;
    const clientName = selectedOrder.cliente?.nome || selectedOrder.jangada?.owner || "Cliente";
    const text = encodeURIComponent(
      `Olá ${clientName}, a fatura ${faturaNumero} da Ordem de Serviço #${selectedOrder.numeroOrdem || selectedOrder.id} no valor de € ${total.toFixed(2)} já foi emitida.${editPagamento === "Pago" ? " Pagamento recebido. Obrigado!" : editPagamento !== "Pendente" ? ` Estado de pagamento: ${editPagamento}.` : ""}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const handleCopyPublicLink = () => {
    if (!selectedOrder) return;
    const url = `${window.location.origin}/public/orcamento/${selectedOrder.id}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const handleWhatsAppShare = () => {
    if (!selectedOrder) return;
    const url = `${window.location.origin}/public/orcamento/${selectedOrder.id}`;
    const clientName = selectedOrder.cliente?.nome || selectedOrder.jangada?.owner || "Cliente";
    const orderNum = selectedOrder.numeroOrdem || selectedOrder.id;
    const text = encodeURIComponent(
      `Olá ${clientName}, o orçamento para a Ordem de Serviço #${orderNum} (Total: € ${total.toFixed(2)}) já está disponível para consulta e aprovação online em: ${url}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const handleDownloadExcel = (type: "orcamento" | "fatura") => {
    if (!selectedOrder) return;
    if (type === "fatura" && selectedOrder.status !== "concluida" && editStatus !== "concluida") {
      setErrorMsg("Atenção: Para emitir a Fatura Oficial, a Ordem de Serviço deve estar concluída.");
    }
    const endpoint = type === "orcamento" ? "orcamento-excel" : "fatura-excel";
    window.open(`/api/ordens-servico/${selectedOrder.id}/${endpoint}`, "_blank");
  };

  // KPI Calculations
  const pendingOrders = orders.filter((o) => !o.orcamentoStatus || o.orcamentoStatus === "Rascunho" || o.orcamentoStatus === "Enviado" || o.orcamentoStatus === "Pendente");
  const approvedOrders = orders.filter((o) => o.orcamentoStatus === "Aprovado");
  const rejectedOrders = orders.filter((o) => o.orcamentoStatus === "Rejeitado");

  const totalPendingValue = pendingOrders.reduce((acc, o) => acc + Number(o.valorTotal || 0), 0);
  const totalApprovedValue = approvedOrders.reduce((acc, o) => acc + Number(o.valorTotal || 0), 0);

  const totalDecided = approvedOrders.length + rejectedOrders.length;
  const conversionRate = totalDecided > 0 ? (approvedOrders.length / totalDecided) * 100 : 0;

  // Contas a Receber
  const invoicedOrders = orders.filter((o) => o.status === "concluida");
  const paymentBreakdown = PAGAMENTO_STATUS_LIST.map((status) => ({
    status,
    count: invoicedOrders.filter((o) => getPagamentoStatus(o) === status).length,
    total: invoicedOrders.filter((o) => getPagamentoStatus(o) === status).reduce((acc, o) => acc + Number(o.valorTotal || 0), 0),
  }));
  const outstandingOrders = invoicedOrders.filter((o) => getPagamentoStatus(o) !== "Pago");
  const totalOutstanding = outstandingOrders.reduce((acc, o) => acc + Number(o.valorTotal || 0), 0);

  // Group billing by service station
  const stationBillingMap = new Map<string, { nome: string; count: number; total: number }>();
  orders.forEach((o) => {
    if (o.status === "concluida" || o.orcamentoStatus === "Aprovado") {
      const stationName = o.serviceStation?.nome || "Orey Técnica (Geral)";
      const current = stationBillingMap.get(stationName) || { nome: stationName, count: 0, total: 0 };
      current.count += 1;
      current.total += Number(o.valorTotal || 0);
      stationBillingMap.set(stationName, current);
    }
  });
  const stationBillingList = Array.from(stationBillingMap.values());

  // ── Dashboard avançado ─────────────────────────────────────────────
  // Faturação mensal (últimos 12 meses, ordens concluídas)
  const monthlyBillingMap = new Map<string, number>();
  const now = new Date();
  const last12Keys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    last12Keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  invoicedOrders.forEach((o) => {
    const rawDate = o.dataConclusao || o.dataAbertura;
    const d = rawDate ? new Date(rawDate) : null;
    const key = d && !Number.isNaN(d.getTime())
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      : null;
    if (!key) return;
    monthlyBillingMap.set(key, (monthlyBillingMap.get(key) || 0) + Number(o.valorTotal || 0));
  });
  const monthlyLabels = last12Keys.map((k) => {
    const [y, m] = k.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return `${d.toLocaleDateString("pt-PT", { month: "short" })}/${String(y).slice(2)}`;
  });
  const monthlyValues = last12Keys.map((k) => monthlyBillingMap.get(k) || 0);
  const hasMonthlyBilling = monthlyValues.some((v) => v > 0);

  const monthlyChartData = {
    labels: monthlyLabels,
    datasets: [
      {
        label: "Faturação (€)",
        data: monthlyValues,
        backgroundColor: monthlyValues.map((_, idx) =>
          idx === monthlyValues.length - 1 ? "#2dd4bf" : "#14b8a6"
        ),
        borderRadius: 6,
      },
    ],
  };
  const monthlyChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<"bar">) => `€ ${Number(ctx.parsed.y || 0).toFixed(2)}`,
        },
      },
    },
    scales: {
      x: { ticks: { color: CHART_TICK_COLOR }, grid: { color: CHART_GRID_COLOR } },
      y: {
        ticks: { color: CHART_TICK_COLOR, callback: (v: number | string) => `€${v}` },
        grid: { color: CHART_GRID_COLOR },
      },
    },
  };

  // Top clientes (por valor faturado)
  const clientBillingMap = new Map<string, number>();
  invoicedOrders.forEach((o) => {
    const name = o.cliente?.nome || o.jangada?.owner || "Cliente Particular";
    clientBillingMap.set(name, (clientBillingMap.get(name) || 0) + Number(o.valorTotal || 0));
  });
  const topClients = Array.from(clientBillingMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxClientValue = topClients.length > 0 ? topClients[0][1] : 0;

  // Composição da faturação: Mão de obra vs Peças
  const totalMaoObraFaturado = invoicedOrders.reduce((acc, o) => acc + Number(o.valorMaoObra || 0), 0);
  const totalPecasFaturado = invoicedOrders.reduce((acc, o) => acc + Number(o.valorPecas || 0), 0);
  const totalComponentes = totalMaoObraFaturado + totalPecasFaturado;

  const compositionChartData = {
    labels: ["Mão de Obra", "Peças / Materiais"],
    datasets: [
      {
        data: [totalMaoObraFaturado, totalPecasFaturado],
        backgroundColor: ["#2dd4bf", "#3b82f6"],
        borderColor: ["#0f766e", "#1d4ed8"],
        borderWidth: 2,
      },
    ],
  };
  const compositionChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: { color: CHART_TICK_COLOR },
      },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<"doughnut">) => `€ ${Number(ctx.parsed || 0).toFixed(2)}`,
        },
      },
    },
  };

  // Margem média por OT concluída
  const avgInvoice = invoicedOrders.length > 0
    ? invoicedOrders.reduce((acc, o) => acc + Number(o.valorTotal || 0), 0) / invoicedOrders.length
    : 0;

  const handleDownloadNotaCredito = () => {
    if (!selectedOrder) return;
    if (selectedOrder.status !== "concluida" && editStatus !== "concluida") {
      setErrorMsg("Para emitir a Nota de Crédito, a Ordem de Serviço deve estar concluída.");
      return;
    }
    window.open(`/api/ordens-servico/${selectedOrder.id}/nota-credito-excel`, "_blank");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-2.5 text-indigo-600">
            <Receipt size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">Consola de Faturação & Orçamentos</h1>
            <p className="text-xs text-slate-500">Gestão interativa, aprovação, WhatsApp, contas a receber e KPIs financeiros</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-300">
            <button
              onClick={() => setViewMode("console")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === "console" ? "bg-indigo-600 text-white shadow" : "text-slate-700 hover:text-slate-900"
              }`}
            >
              Consola de Emissão
            </button>
            <button
              onClick={() => setViewMode("kpis")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
                viewMode === "kpis" ? "bg-indigo-600 text-white shadow" : "text-slate-700 hover:text-slate-900"
              }`}
            >
              <BarChart3 size={14} /> Dashboard KPIs
            </button>
          </div>

          <button
            onClick={fetchOrders}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
          >
            <RefreshCcw size={14} /> Atualizar
          </button>
        </div>
      </header>

      {viewMode === "kpis" ? (
        /* KPI Dashboard View */
        <div className="flex-1 p-8 overflow-y-auto bg-white">
          <div className="max-w-6xl mx-auto space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-1">Dashboard de KPIs Financeiros</h2>
              <p className="text-sm text-slate-500">Métricas de orçamentos, conversão, contas a receber e faturação por estação.</p>
            </div>

            {/* Metric Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Orçamentos Pendentes</span>
                  <div className="rounded-xl bg-amber-50 p-2 text-amber-500"><Wallet size={20} /></div>
                </div>
                <div className="text-2xl font-black text-slate-800 font-mono">€ {totalPendingValue.toFixed(2)}</div>
                <p className="text-xs text-amber-600 font-medium">{pendingOrders.length} orçamentos aguardando resposta</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Orçamentos Aprovados</span>
                  <div className="rounded-xl bg-emerald-50 p-2 text-emerald-500"><TrendingUp size={20} /></div>
                </div>
                <div className="text-2xl font-black text-slate-800 font-mono">€ {totalApprovedValue.toFixed(2)}</div>
                <p className="text-xs text-emerald-600 font-medium">{approvedOrders.length} orçamentos aprovados</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Taxa de Conversão</span>
                  <div className="rounded-xl bg-indigo-50 p-2 text-indigo-500"><PieChart size={20} /></div>
                </div>
                <div className="text-2xl font-black text-indigo-600 font-mono">{conversionRate.toFixed(1)}%</div>
                <p className="text-xs text-slate-500">Baseado em {totalDecided} orçamentos decididos</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Analisado</span>
                  <div className="rounded-xl bg-blue-50 p-2 text-blue-500"><DollarSign size={20} /></div>
                </div>
                <div className="text-2xl font-black text-slate-800 font-mono">{orders.length} OTs</div>
                <p className="text-xs text-slate-500">Ordens de serviço no sistema</p>
              </div>
            </div>

            {/* Contas a Receber */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="text-indigo-600" size={20} />
                  <h3 className="text-base font-bold text-slate-800">Contas a Receber — Estados de Pagamento</h3>
                </div>
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-1.5 text-xs font-bold text-rose-600">
                  Em dívida: € {totalOutstanding.toFixed(2)}
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {paymentBreakdown.map((entry) => (
                  <div key={entry.status} className={`rounded-xl border p-4 space-y-2 ${PAGAMENTO_BADGE_CLASSES[entry.status] || PAGAMENTO_BADGE_CLASSES.Pendente}`}>
                    <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{entry.status}</div>
                    <div className="text-xl font-black font-mono">€ {entry.total.toFixed(2)}</div>
                    <div className="text-xs opacity-80">{entry.count} faturas</div>
                  </div>
                ))}
              </div>

              {outstandingOrders.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-sm">Sem valores em dívida. Todas as faturas emitidas estão pagas.</div>
              ) : (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-700 uppercase tracking-wider">
                        <th className="p-3">Ordem</th>
                        <th className="p-3">Cliente</th>
                        <th className="p-3">Estado Pagamento</th>
                        <th className="p-3 text-right">Valor em dívida</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {outstandingOrders.map((o) => (
                        <tr key={o.id} className="hover:bg-slate-50">
                          <td className="p-3 font-mono text-indigo-600">#{o.numeroOrdem || o.id}</td>
                          <td className="p-3 font-semibold text-slate-700">{o.cliente?.nome || o.jangada?.owner || "Cliente Particular"}</td>
                          <td className="p-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${PAGAMENTO_BADGE_CLASSES[getPagamentoStatus(o)] || PAGAMENTO_BADGE_CLASSES.Pendente}`}>
                              {getPagamentoStatus(o)}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-rose-600">€ {Number(o.valorTotal || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Station Billing Consolidation */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-xl">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                <Building2 className="text-indigo-600" size={20} />
                <h3 className="text-base font-bold text-slate-800">Faturação Consolidada por Estação de Serviço</h3>
              </div>

              {stationBillingList.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">Sem dados suficientes para consolidação por estação.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stationBillingList.map((station, idx) => (
                    <div key={idx} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                      <div className="text-sm font-bold text-slate-700">{station.nome}</div>
                      <div className="flex justify-between items-center pt-2">
                        <span className="text-xs text-slate-500">{station.count} OTs concl./aprov.</span>
                        <span className="text-base font-mono font-bold text-indigo-600">€ {station.total.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Dashboard Avançado ── */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 pt-2">
                <Gauge className="text-indigo-600" size={20} />
                <h3 className="text-lg font-bold text-slate-800">Análise Avançada</h3>
              </div>

              {/* Faturação mensal */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <CalendarRange className="text-indigo-600" size={20} />
                    <h4 className="text-base font-bold text-slate-800">Faturação Mensal (últimos 12 meses)</h4>
                  </div>
                  <span className="text-xs font-mono bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full border border-indigo-200">
                    {invoicedOrders.length} faturas emitidas
                  </span>
                </div>
                {!hasMonthlyBilling ? (
                  <div className="text-center py-10 text-slate-500 text-sm">Sem faturas emitidas nos últimos 12 meses.</div>
                ) : (
                  <div className="h-64">
                    <Bar data={monthlyChartData} options={monthlyChartOptions} />
                  </div>
                )}
              </div>

              {/* Top clientes + Composição */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-xl">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                    <Award className="text-amber-500" size={20} />
                    <h4 className="text-base font-bold text-slate-800">Top Clientes</h4>
                  </div>
                  {topClients.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 text-sm">Sem clientes faturados.</div>
                  ) : (
                    <div className="space-y-4">
                      {topClients.map(([name, total], idx) => {
                        const pct = maxClientValue > 0 ? (total / maxClientValue) * 100 : 0;
                        return (
                          <div key={idx} className="space-y-1.5">
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[10px] font-black text-slate-500 w-5">{idx + 1}º</span>
                                <span className="font-semibold text-slate-700 truncate">{name}</span>
                              </div>
                              <span className="font-mono font-bold text-indigo-700 text-xs">€ {total.toFixed(2)}</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100 overflow-hidden ml-7">
                              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="text-blue-500" size={20} />
                      <h4 className="text-base font-bold text-slate-800">Composição da Faturação</h4>
                    </div>
                    <span className="text-xs font-mono text-slate-500">Média/OT: € {avgInvoice.toFixed(2)}</span>
                  </div>
                  {totalComponentes <= 0 ? (
                    <div className="text-center py-10 text-slate-500 text-sm">Sem valores de componentes.</div>
                  ) : (
                    <div className="flex flex-col items-center gap-5 sm:flex-row">
                      <div className="h-44 w-44 shrink-0">
                        <Doughnut data={compositionChartData} options={compositionChartOptions} />
                      </div>
                      <div className="flex-1 space-y-3 w-full">
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600">Inspeção de Jangada</div>
                          <div className="text-lg font-black font-mono text-slate-800">€ {totalMaoObraFaturado.toFixed(2)}</div>
                          <div className="text-xs text-slate-500">{totalComponentes > 0 ? ((totalMaoObraFaturado / totalComponentes) * 100).toFixed(0) : 0}% do total</div>
                        </div>
                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600">Peças / Materiais</div>
                          <div className="text-lg font-black font-mono text-slate-800">€ {totalPecasFaturado.toFixed(2)}</div>
                          <div className="text-xs text-slate-500">{totalComponentes > 0 ? ((totalPecasFaturado / totalComponentes) * 100).toFixed(0) : 0}% do total</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Console View */
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left Sidebar: Order Selection */}
          <div className="lg:col-span-4 border-r border-slate-200 bg-slate-50 flex flex-col h-[calc(100vh-73px)]">
            <div className="p-4 border-b border-slate-200 space-y-3">
              <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-300">
                <button
                  onClick={() => setSidebarMode("ot")}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    sidebarMode === "ot" ? "bg-indigo-600 text-white shadow" : "text-slate-700 hover:text-slate-900"
                  }`}
                >
                  Ordens de Serviço
                </button>
                <button
                  onClick={openFaturasMode}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    sidebarMode === "faturas" ? "bg-indigo-600 text-white shadow" : "text-slate-700 hover:text-slate-900"
                  }`}
                >
                  Faturas
                </button>
              </div>

              {sidebarMode === "ot" ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                      type="text"
                      placeholder="Pesquisar nº ordem, cliente, jangada..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                    {["", "Rascunho", "Enviado", "Aprovado"].map((st) => (
                      <button
                        key={st}
                        onClick={() => setStatusFilter(st)}
                        className={`rounded-lg px-2.5 py-1 font-medium whitespace-nowrap transition ${
                          statusFilter === st
                            ? "bg-indigo-600 text-white font-bold"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {st === "" ? "Todos" : st}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">
                    {selectedFaturaIds.size > 0 ? `${selectedFaturaIds.size} selecionada(s)` : "Eliminar faturas em lote"}
                  </span>
                  {selectedFaturaIds.size > 0 && (
                    <>
                      <button
                        onClick={() => setSelectedFaturaIds(new Set())}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                      >
                        Limpar
                      </button>
                      <button
                        onClick={handleBulkDeleteFaturas}
                        disabled={deletingFaturas}
                        className="rounded-lg px-2.5 py-1 text-xs font-bold bg-rose-700 text-slate-800 hover:bg-rose-600 transition disabled:opacity-50"
                      >
                        {deletingFaturas ? "A eliminar…" : "Eliminar selecionadas"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
              {sidebarMode === "faturas" ? (
                faturasLoading ? (
                  <div className="flex items-center justify-center py-20 text-slate-500 gap-2">
                    <Loader2 className="animate-spin" size={18} /> A carregar faturas...
                  </div>
                ) : faturasList.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">Nenhuma fatura encontrada.</div>
                ) : (
                  faturasList.map((fat) => {
                    const isSelected = selectedFaturaIds.has(fat.id);
                    return (
                      <div
                        key={fat.id}
                        className={`p-4 transition flex items-start gap-3 ${isSelected ? "bg-rose-50 border-l-4 border-rose-400" : "hover:bg-slate-100"}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleFaturaSelect(fat.id)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-indigo-600">#{fat.numeroFatura}</span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                              {fat.pagamentoStatus || "Pendente"}
                            </span>
                          </div>
                          <div className="text-sm font-semibold text-slate-700 truncate mt-0.5">
                            {fat.cliente?.nome || "Cliente Particular"}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {fat.dataEmissao ? formatDateTimeShort(fat.dataEmissao) : "—"}
                          </div>
                          <div className="flex items-center justify-between text-xs pt-1 font-mono text-slate-700">
                            <span>{fat.cancelada ? "Anulada" : ""}</span>
                            <span className="font-bold text-indigo-600">€ {(fat.valorTotal || 0).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )
              ) : loadingList ? (
                <div className="flex items-center justify-center py-20 text-slate-500 gap-2">
                  <Loader2 className="animate-spin" size={18} /> A carregar ordens...
                </div>
              ) : orders.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">Nenhuma ordem encontrada.</div>
              ) : (
                orders.map((ord) => {
                  const isSelected = ord.id === selectedId;
                  const raft = ord.jangada ? `${ord.jangada.brand || ""} ${ord.jangada.model || ""} (${ord.jangada.serial || "Sem serial"})` : "Sem jangada";
                  const pagamento = getPagamentoStatus(ord);
                  return (
                    <button
                      key={ord.id}
                      onClick={() => selectOrder(ord)}
                      className={`w-full text-left p-4 transition flex flex-col gap-1.5 ${
                        isSelected ? "bg-indigo-50 border-l-4 border-indigo-500" : "hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-600">#{ord.numeroOrdem || ord.id}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          ord.orcamentoStatus === "Aprovado" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                          ord.orcamentoStatus === "Enviado" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}>
                          {ord.orcamentoStatus || "Rascunho"}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-slate-700 truncate">{ord.cliente?.nome || ord.jangada?.owner || "Cliente Particular"}</div>
                      <div className="text-xs text-slate-500 truncate">{raft}</div>
                      <div className="flex items-center justify-between text-xs pt-1 font-mono text-slate-700">
                        <span>{ord.dataAbertura ? formatDateTimeShort(ord.dataAbertura) : "—"}</span>
                        <span className="font-bold text-indigo-600">€ {(ord.valorTotal || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${PAGAMENTO_BADGE_CLASSES[pagamento] || PAGAMENTO_BADGE_CLASSES.Pendente}`}>
                          <CreditCard size={10} /> {pagamento}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Content / Workbench */}
          <div className="lg:col-span-8 flex flex-col h-[calc(100vh-73px)] overflow-y-auto p-6 bg-white">
            {!selectedOrder ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                <FileText size={48} className="mb-3 text-slate-700" />
                <p className="text-base font-medium">Selecione uma ordem de serviço na lista ao lado.</p>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto w-full space-y-6">
                {/* Header card */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-indigo-600">Ordem #{selectedOrder.numeroOrdem || selectedOrder.id}</span>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-300 font-medium">
                        Estado OT: {editStatus}
                      </span>
                      {faturaEmitida && (
                        <span className={`text-xs px-2 py-0.5 rounded-md border font-semibold ${faturaCancelada ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                          {faturaCancelada ? `Fatura ${faturaNumero} ANULADA` : `Fatura ${faturaNumero} ✓`}
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg font-bold text-slate-800">{selectedOrder.cliente?.nome || selectedOrder.jangada?.owner || "Cliente Particular"}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Embarcação: <span className="text-slate-700">{selectedOrder.jangada?.shipNameManual || "—"}</span> · Jangada: <span className="text-slate-700">{selectedOrder.jangada?.brand || ""} {selectedOrder.jangada?.model || ""} ({selectedOrder.jangada?.serial || "—"})</span>
                    </p>
                  </div>

                  {/* Document Type Switcher & Quick Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-300">
                      <button
                        onClick={() => setActiveTab("orcamento")}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          activeTab === "orcamento" ? "bg-indigo-600 text-white shadow" : "text-slate-700 hover:text-slate-900"
                        }`}
                      >
                        Orçamento
                      </button>
                      <button
                        onClick={() => setActiveTab("fatura")}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          activeTab === "fatura" ? "bg-indigo-600 text-white shadow" : "text-slate-700 hover:text-slate-900"
                        }`}
                      >
                        Fatura Oficial
                      </button>
                    </div>

                    <button
                      onClick={() => handleDownloadExcel(activeTab)}
                      className="flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition shadow-sm"
                    >
                      <Download size={14} /> {activeTab === "orcamento" ? "Orçamento .xlsx" : "Fatura .xlsx"}
                    </button>

                    {activeTab === "fatura" && (
                      <button
                        onClick={() => selectedOrder && window.open(`/api/ordens-servico/${selectedOrder.id}/fatura-pdf`, "_blank")}
                        className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition shadow-sm"
                        title="Gerar PDF da fatura"
                      >
                        <FileText size={14} /> Fatura .pdf
                      </button>
                    )}

                    <button
                      onClick={handleDownloadNotaCredito}
                      className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition shadow-sm"
                      title="Emitir nota de crédito que anula/corrige a fatura desta ordem de serviço"
                    >
                      <FileMinus size={14} /> Nota de Crédito
                    </button>

                    <button
                      onClick={() => selectedOrder && window.open(`/api/ordens-servico/${selectedOrder.id}/recibo-excel`, "_blank")}
                      className="flex items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-3.5 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100 transition shadow-sm"
                      title="Emitir recibo da fatura desta ordem de serviço"
                    >
                      <FileText size={14} /> Recibo .xlsx
                    </button>
                  </div>
                </div>

                {/* Quick Actions Bar */}
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-xs text-indigo-700">
                    <Zap size={16} className="text-indigo-600 animate-pulse" />
                    <span>Ações: Aprovar orçamento, enviar por WhatsApp ou faturar.</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleAprovarOrcamento}
                      disabled={saving || editOrcamentoStatus === "Aprovado"}
                      className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
                      {editOrcamentoStatus === "Aprovado" ? "Orçamento Aprovado ✓" : "Aprovar Orçamento"}
                    </button>

                    <button
                      onClick={handleWhatsAppShare}
                      className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                    >
                      <MessageSquare size={14} className="text-emerald-600" /> WhatsApp
                    </button>

                    {faturaEmitida && (
                      <button
                        onClick={handleWhatsAppShareFatura}
                        className="flex items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-3.5 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition"
                        title="Enviar aviso da fatura emitida ao cliente via WhatsApp"
                      >
                        <Receipt size={14} className="text-sky-600" /> Partilhar Fatura
                      </button>
                    )}

                    <button
                      onClick={handleCopyPublicLink}
                      className="flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                    >
                      {copiedLink ? <Check size={14} className="text-emerald-600" /> : <Link2 size={14} />}
                      {copiedLink ? "Link Copiado!" : "Copiar Link"}
                    </button>

                    <button
                      onClick={handleAprovarEConcluirFaturar}
                      disabled={saving}
                      className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-indigo-500 px-4 py-2 text-xs font-bold text-white hover:from-emerald-400 hover:to-indigo-400 transition shadow-sm disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                      ⚡ Aprovar & Faturar
                    </button>

                    <button
                      onClick={handleEmitirFatura}
                      disabled={emitindoFatura || saving}
                      className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-2 text-xs font-bold text-white hover:from-sky-400 hover:to-indigo-400 transition shadow-sm disabled:opacity-50"
                    >
                      {emitindoFatura ? <Loader2 size={14} className="animate-spin" /> : faturaEmitida ? <CheckCircle2 size={14} /> : <CreditCard size={14} />}
                      {faturaEmitida ? "Reemitir Fatura" : "Emitir Fatura"}
                    </button>

                    {faturaEmitida && !faturaCancelada && (
                      <button
                        onClick={handleAnularFatura}
                        disabled={cancelandoFatura}
                        className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition disabled:opacity-50"
                        title="Anula a fatura e emite a Nota de Crédito correspondente"
                      >
                        {cancelandoFatura ? <Loader2 size={14} className="animate-spin" /> : <FileMinus size={14} />}
                        Anular Fatura
                      </button>
                    )}
                  </div>
                </div>

                {errorMsg && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-center gap-2">
                    <AlertCircle size={18} /> {errorMsg}
                  </div>
                )}
                {successMsg && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 flex items-center gap-2">
                    <CheckCircle2 size={18} /> {successMsg}
                  </div>
                )}

                {/* Interactive Editor Form */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-2">
                      <Edit3 size={16} /> Parâmetros de Cálculo, Estado & Pagamento
                    </h3>
                    <button
                      onClick={() => handleSave()}
                      disabled={saving || atualizandoPagamento}
                      className="flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 transition disabled:opacity-50"
                    >
                      {saving || atualizandoPagamento ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar Alterações
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Valor Peças / Materiais (€)</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input
                          type="number"
                          step="0.01"
                          value={editPecas}
                          onChange={(e) => setEditPecas(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-8 pr-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Valor Inspeção de Jangada (€)</label>
                      <div className="relative">
                        <Wrench className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input
                          type="number"
                          step="0.01"
                          value={editMaoObra}
                          onChange={(e) => setEditMaoObra(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-8 pr-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Desconto Aplicado (€)</label>
                      <div className="relative">
                        <Percent className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input
                          type="number"
                          step="0.01"
                          value={editDesconto}
                          onChange={(e) => setEditDesconto(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-8 pr-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Estado do Orçamento</label>
                      <select
                        value={editOrcamentoStatus}
                        onChange={(e) => setEditOrcamentoStatus(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white py-2.5 px-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="Rascunho">Rascunho</option>
                        <option value="Enviado">Enviado</option>
                        <option value="Aprovado">Aprovado</option>
                        <option value="Rejeitado">Rejeitado</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Estado da Ordem de Serviço</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white py-2.5 px-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="aberta">Aberta</option>
                        <option value="em_progresso">Em Progresso</option>
                        <option value="concluida">Concluída (Pronta para Faturar)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Estado de Pagamento (Fatura)</label>
                      <div className="relative">
                        <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <select
                          value={editPagamento}
                          onChange={(e) => setEditPagamento(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-8 pr-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                        >
                          {PAGAMENTO_STATUS_LIST.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={editIsentoIva}
                          onChange={(e) => setEditIsentoIva(e.target.checked)}
                          className="w-5 h-5 rounded border-slate-300 bg-white text-indigo-500 focus:ring-indigo-500 focus:ring-offset-white"
                        />
                        <span className="text-sm font-medium text-slate-700">Isenção de IVA</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Linhas de Orçamento Editáveis */}
                {!faturaEmitida && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-2">
                        <Package size={16} /> Linhas do Orçamento
                      </h3>
                      <div className="flex items-center gap-2">
                        {linhas.length > 0 && (
                          <span className="text-xs font-mono bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full border border-indigo-200">
                            Subtotal peças: € {linhasTotal.toFixed(2)}
                          </span>
                        )}
                        <button
                          onClick={() => setAddingLinha(true)}
                          className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                        >
                          <Plus size={14} /> Adicionar Linha
                        </button>
                        {linhas.length > 0 && (
                          <button
                            onClick={handleSaveLinhas}
                            disabled={savingLinhas}
                            className="flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition disabled:opacity-50"
                          >
                            {savingLinhas ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            Guardar Linhas
                          </button>
                        )}
                      </div>
                    </div>

                    {linhas.length === 0 && !addingLinha && (
                      <div className="text-center py-8 text-slate-400 text-sm">
                        <Package size={32} className="mx-auto mb-2 opacity-40" />
                        Sem linhas de orçamento adicionadas. Clique &quot;Adicionar Linha&quot; para incluir artigos ou serviços.
                      </div>
                    )}

                    {linhas.length > 0 && (
                      <div className="rounded-xl border border-slate-200 overflow-hidden">
                        <table className="w-full text-left border-collapse text-sm">
                          <thead>
                            <tr className="bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                              <th className="p-3">Descrição</th>
                              <th className="p-3">Referência</th>
                              <th className="p-3 text-center">Qtd</th>
                              <th className="p-3 text-right">Preço Unit.</th>
                              <th className="p-3 text-right">Total</th>
                              <th className="p-3 text-center">Origem</th>
                              <th className="p-3 text-center">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {linhas.map((linha) => (
                              <tr key={linha.id} className="hover:bg-slate-50">
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={linha.descricao}
                                    onChange={(e) => updateLinha(linha.id, "descricao", e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-indigo-400 focus:outline-none"
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={linha.referencia}
                                    onChange={(e) => updateLinha(linha.id, "referencia", e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 font-mono focus:border-indigo-400 focus:outline-none"
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    type="number"
                                    min="1"
                                    value={linha.quantidade}
                                    onChange={(e) => updateLinha(linha.id, "quantidade", Number(e.target.value))}
                                    className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 text-center font-mono focus:border-indigo-400 focus:outline-none"
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={linha.unitPrice}
                                    onChange={(e) => updateLinha(linha.id, "unitPrice", Number(e.target.value))}
                                    className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 text-right font-mono focus:border-indigo-400 focus:outline-none"
                                  />
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-slate-800 text-xs">
                                  € {linha.total.toFixed(2)}
                                </td>
                                <td className="p-3 text-center">
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                    {linha.source}
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    onClick={() => removeLinha(linha.id)}
                                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition"
                                    title="Remover linha"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {addingLinha && (
                      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-indigo-700">Nova Linha de Orçamento</span>
                          <button
                            onClick={() => { setAddingLinha(false); setNewLinha({ descricao: "", referencia: "", quantidade: 1, unitPrice: 0, stockId: null }); }}
                            className="text-xs text-slate-500 hover:text-slate-700 transition"
                          >
                            Cancelar
                          </button>
                        </div>

                        {stockOptions.length > 0 && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Artigo do Stock (opcional)</label>
                            <select
                              value={newLinha.stockId || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val) handleStockSelect(Number(val));
                                else setNewLinha((prev) => ({ ...prev, stockId: null, descricao: "", referencia: "", unitPrice: 0 }));
                              }}
                              className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                            >
                              <option value="">Escrever manualmente...</option>
                              {stockOptions.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.descricao} ({s.referencia}) — € {s.precoVenda.toFixed(2)}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Descrição *</label>
                            <input
                              type="text"
                              value={newLinha.descricao}
                              onChange={(e) => setNewLinha((prev) => ({ ...prev, descricao: e.target.value }))}
                              placeholder="Ex: Colete Coleman size 5"
                              className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Referência</label>
                            <input
                              type="text"
                              value={newLinha.referencia}
                              onChange={(e) => setNewLinha((prev) => ({ ...prev, referencia: e.target.value }))}
                              placeholder="REF-001"
                              className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-sm text-slate-800 font-mono focus:border-indigo-500 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Quantidade</label>
                            <input
                              type="number"
                              min="1"
                              value={newLinha.quantidade}
                              onChange={(e) => setNewLinha((prev) => ({ ...prev, quantidade: Math.max(1, Number(e.target.value)) }))}
                              className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-sm text-slate-800 font-mono focus:border-indigo-500 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Preço Unitário (€)</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={newLinha.unitPrice}
                              onChange={(e) => setNewLinha((prev) => ({ ...prev, unitPrice: Math.max(0, Number(e.target.value)) }))}
                              className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-sm text-slate-800 font-mono focus:border-indigo-500 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <span className="text-sm font-bold text-slate-700">
                            Total: € {(newLinha.quantidade * newLinha.unitPrice).toFixed(2)}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => { setAddingLinha(false); setNewLinha({ descricao: "", referencia: "", quantidade: 1, unitPrice: 0, stockId: null }); }}
                              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={addLinha}
                              disabled={!newLinha.descricao.trim()}
                              className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-400 transition disabled:opacity-50"
                            >
                              <Plus size={14} /> Adicionar
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Live Preview Card */}
                <div className="rounded-2xl border border-indigo-200 bg-white p-6 space-y-6 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="text-indigo-600" size={20} />
                      <h3 className="text-base font-bold text-slate-800">
                        Pré-visualização em Tempo Real — {activeTab === "orcamento" ? "ORÇAMENTO" : "FATURA OFICIAL"}
                      </h3>
                    </div>
                    <span className="text-xs font-mono bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full border border-indigo-200">
                      Cálculo Automático Ativo
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                    <div className="space-y-2 bg-white/60 p-4 rounded-xl border border-slate-200">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Dados do Destinatário</div>
                      <p className="font-bold text-slate-800">{selectedOrder.cliente?.nome || selectedOrder.jangada?.owner || "Cliente Particular"}</p>
                      <p className="text-slate-500 text-xs">NIF: <span className="text-slate-700 font-mono">{selectedOrder.cliente?.nif || "—"}</span></p>
                      <p className="text-slate-500 text-xs">Morada: <span className="text-slate-700">{selectedOrder.cliente?.morada || "—"}</span></p>
                      <p className="text-slate-500 text-xs">Localidade/Ilha: <span className="text-slate-700">{selectedOrder.cliente?.localidade || ""} {selectedOrder.cliente?.ilha || ""}</span></p>
                    </div>

                    <div className="space-y-2 bg-white/60 p-4 rounded-xl border border-slate-200">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Referência & Equipamento</div>
                      <p className="text-slate-700 text-xs">Documento Nº: <span className="font-bold text-slate-800 font-mono">{selectedOrder.numeroOrdem || selectedOrder.id}</span></p>
                      {faturaEmitida && (
                        <p className="text-slate-700 text-xs">Fatura Nº: <span className="font-bold text-emerald-600 font-mono">{faturaNumero}</span></p>
                      )}
                      <p className="text-slate-700 text-xs">Embarcação: <span className="font-bold text-slate-800">{selectedOrder.jangada?.shipNameManual || "—"}</span></p>
                      <p className="text-slate-700 text-xs">Jangada: <span className="font-bold text-slate-800">{selectedOrder.jangada?.brand || ""} {selectedOrder.jangada?.model || ""}</span></p>
                      <p className="text-slate-700 text-xs">Nº Série: <span className="font-mono text-indigo-700">{selectedOrder.jangada?.serial || "—"}</span></p>
                    </div>
                  </div>

                  {/* Line items table */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-100/80 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                          <th className="p-3">Descrição do Serviço / Artigo</th>
                          <th className="p-3 text-center">Qtd</th>
                          <th className="p-3 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono text-xs">
                        <tr>
                          <td className="p-3 text-slate-700 font-sans">Mão-de-obra (trabalhos técnicos executados)</td>
                          <td className="p-3 text-center">1</td>
                          <td className="p-3 text-right font-bold text-slate-800">€ {numMaoObra.toFixed(2)}</td>
                        </tr>
                        {linhas.length > 0 ? (
                          linhas.map((linha) => (
                            <tr key={linha.id}>
                              <td className="p-3 text-slate-700 font-sans">{linha.descricao}</td>
                              <td className="p-3 text-center">{linha.quantidade}</td>
                              <td className="p-3 text-right font-bold text-slate-800">€ {linha.total.toFixed(2)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="p-3 text-slate-700 font-sans">Peças e Materiais aplicados</td>
                            <td className="p-3 text-center">1</td>
                            <td className="p-3 text-right font-bold text-slate-800">€ {numPecas.toFixed(2)}</td>
                          </tr>
                        )}
                        {numDesconto > 0 && (
                          <tr className="text-rose-400">
                            <td className="p-3 font-sans">Desconto Comercial</td>
                            <td className="p-3 text-center">1</td>
                            <td className="p-3 text-right font-bold">- € {numDesconto.toFixed(2)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals box */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col items-end space-y-1.5 font-mono text-sm">
                    <div className="flex justify-between w-64 text-slate-500 text-xs">
                      <span>Subtotal:</span>
                      <span className="text-slate-700">€ {subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between w-64 text-slate-500 text-xs">
                        <span>IVA ({editIsentoIva ? "Isento" : `${Math.round(getIvaRate() * 100)}%`}):</span>
                      <span className="text-slate-700">€ {iva.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between w-64 text-indigo-600 font-bold text-base pt-2 border-t border-slate-200">
                      <span>TOTAL:</span>
                      <span>€ {total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
