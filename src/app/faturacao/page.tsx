"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  FileText, Receipt, Search, Loader2, Save, Download,
  CheckCircle2, AlertCircle, Edit3, RefreshCcw, Percent,
  DollarSign, ShieldCheck, Zap, Link2, Check,
  TrendingUp, PieChart, Building2, BarChart3, Wallet, MessageSquare, CreditCard,
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
import { useSession } from "next-auth/react";
import { useDebounce } from "@/hooks/useDebounce";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { persistedQuoteLines } from "../orcamentos/quote-editor";
import { billingRecipient, recipientFields, type BillingRecipient } from "@/lib/billing-recipient";
import { roundQuoteMoney } from "@/lib/ordem-quote-input";
import { summarizeInvoiceBalances, type InvoiceBalance } from "./invoice-balances";
import { invoiceDisplay, MAX_OFFICIAL_PDF_BYTES } from "@/lib/invoice-official";
import { useWhatsAppAllowed, WHATSAPP_ALLOWED_USER_EMAIL } from "@/lib/use-whatsapp-allowed";
import OfficialInvoiceCompose from '@/components/shared/OfficialInvoiceCompose';

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
  updatedAt?: string;
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
    isIsentoIva?: boolean;
    valorPago?: number;
    valorPendente?: number;
    linhas?: OrcamentoLinha[];
    materials?: Array<{
      id?: string | null;
      stockId?: number | string | null;
      referencia?: string | null;
      descricao?: string | null;
      quantidadePrevista?: number | null;
      quantidadeUsada?: number | null;
      precoUnitario?: number | null;
      origem?: string | null;
    }>;
  } | null;
  jangada?: { serial?: string | null; brand?: string | null; model?: string | null; owner?: string | null; shipNameManual?: string | null } | null;
  cliente?: { id?: number; nome?: string | null; nif?: string | null; morada?: string | null; localidade?: string | null; ilha?: string | null } | null;
  serviceStation?: { codigo?: string | null; nome?: string | null } | null;
  tecnico?: { nome?: string | null } | null;
};

type FaturaItem = InvoiceBalance & {
  id: number;
  numeroFatura: string;
  numeroFaturaOficial?: string | null;
  numeroFaturaDisplay?: string;
  updatedAt?: string;
  pdfOficial?: ReturnType<typeof invoiceDisplay>["pdfOficial"];
  numeroObra?: string | null;
  numerosObra?: string[];
  cliente?: { id?: number; nome?: string | null } | null;
  valorTotal?: number | null;
  pagamentoStatus?: string | null;
  valorSubtotal?: number;
  valorIva?: number;
  isIsentoIva?: boolean;
  cancelada?: boolean;
  dataEmissao?: string | null;
  ordemServicos?: Array<{ id: number; numeroOrdem?: string | null; serviceStation?: string | null }>;
  notaCredito?: { numeroNotaCredito: string; dataEmissao?: string | null } | null;
  numeroRecibo?: string | null;
};

type OrcamentoLinha = {
  id: string;
  stockId?: number | string | null;
  referencia: string;
  descricao: string;
  quantidade: number;
  unitPrice: number;
  total: number;
  source: string;
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
  return meta.pagamentoStatus || "Pendente";
}

export default function FaturacaoConsolePage() {
  const { allowed: whatsappAllowed } = useWhatsAppAllowed();
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [viewMode, setViewMode] = useState<"console" | "kpis">("console");
  const [loadingList, setLoadingList] = useState(true);
  const [orders, setOrders] = useState<OrdemItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const ordersRequest = useRef<AbortController | null>(null);
  const balanceRequest = useRef<AbortController | null>(null);
  const mutationLock = useRef(false);
  const [baseline, setBaseline] = useState("");
  const [recipient, setRecipient] = useState<BillingRecipient>(() => billingRecipient(null));
  const [recipientBaseline, setRecipientBaseline] = useState("");
  const [recipientReady, setRecipientReady] = useState(false);
  const [recipientLocked, setRecipientLocked] = useState(false);
  const recipientDirty = recipientReady && JSON.stringify(recipient) !== recipientBaseline;
  const [selectedRecord, setSelectedRecord] = useState<OrdemItem | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedIdRef = useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState<"orcamento" | "fatura">("orcamento");

  // Editable fields for selected order
  const [editPecas, setEditPecas] = useState("0");
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
  const [faturasLoaded, setFaturasLoaded] = useState(false);
  const [faturasError, setFaturasError] = useState<string | null>(null);
  const [invoiceFilter, setInvoiceFilter] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const faturasRequest = useRef<AbortController | null>(null);
  const [selectedFaturaIds, setSelectedFaturaIds] = useState<Set<number>>(new Set());
  const [deletingFaturas, setDeletingFaturas] = useState(false);
  const [openingInvoice, setOpeningInvoice] = useState(false);
  const [officialDraft, setOfficialDraft] = useState<{ id: number; number: string; updatedAt?: string; file: File | null } | null>(null);
  const [savingOfficial, setSavingOfficial] = useState(false);
  const [invoiceCompose, setInvoiceCompose] = useState<{ id: number; portalUrl: string } | null>(null);
  const officialFileInput = useRef<HTMLInputElement | null>(null);

  // Linhas de orçamento editáveis
  const [linhas, setLinhas] = useState<OrcamentoLinha[]>([]);
  const [stockOptions, setStockOptions] = useState<StockOption[]>([]);
  const [addingLinha, setAddingLinha] = useState(false);
  const [newLinha, setNewLinha] = useState({ descricao: "", referencia: "", quantidade: 1, unitPrice: 0, stockId: null as number | null });
  const savingLinhas = saving;
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentBalance, setPaymentBalance] = useState<{ valorPago: number; valorPendente: number; pagamentoHistoricoSemRecibo?: boolean } | null>(null);
  const snapshot = JSON.stringify([linhas, editPecas, editDesconto, editIsentoIva, editOrcamentoStatus, editStatus, editPagamento]);
  const dirty = selectedId !== null && (snapshot !== baseline || recipientDirty);
  const { confirmLeave } = useUnsavedChanges(dirty || addingLinha || Boolean(paymentAmount) || Boolean(officialDraft));
  const busy = saving || savingLinhas || emitindoFatura || cancelandoFatura || atualizandoPagamento || deletingFaturas || openingInvoice || savingOfficial;

  const selectOrder = (ordem: OrdemItem, confirmed = false) => {
    if (mutationLock.current || (!confirmed && selectedIdRef.current !== null && !confirmLeave())) return;
    const loadedLines = persistedQuoteLines(ordem);
    const exempt = Boolean(ordem.isIsentoIva ?? ordem.metadados?.isIsentoIva);
    setSelectedRecord(ordem);
    setOfficialDraft(null);
    setInvoiceCompose(null);
    if (selectedIdRef.current !== ordem.id) {
      setRecipientReady(false);
      setRecipientLocked(false);
    }
    setBaseline(JSON.stringify([loadedLines, String(ordem.valorPecas ?? 0), String(ordem.valorDesconto ?? 0), exempt, ordem.orcamentoStatus || "Rascunho", ordem.status || "aberta", getPagamentoStatus(ordem)]));
    setSelectedId(ordem.id);
    selectedIdRef.current = ordem.id;
    setEditPecas(String(ordem.valorPecas ?? 0));
    setEditDesconto(String(ordem.valorDesconto ?? 0));
    setEditIsentoIva(exempt);
    setEditOrcamentoStatus(ordem.orcamentoStatus || "Rascunho");
    setEditStatus(ordem.status || "aberta");
    setEditPagamento(getPagamentoStatus(ordem));
    setErrorMsg(null);
    setSuccessMsg(null);
    setCopiedLink(false);
    setLinhas(loadedLines);
    setPaymentAmount("");
    setPaymentBalance(null);
    setStockOptions([]);
    setAddingLinha(false);
  };

  const editorRef = useRef<{ dirty: boolean; select: typeof selectOrder } | null>(null);
  useEffect(() => {
    editorRef.current = { dirty: dirty || addingLinha || Boolean(paymentAmount) || Boolean(officialDraft), select: selectOrder };
  });

  const fetchOrders = useCallback(async () => {
    ordersRequest.current?.abort();
    const controller = new AbortController();
    ordersRequest.current = controller;
    setLoadingList(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({ includeClosed: "1" });
      if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
      if (statusFilter) params.set("orcamentoStatus", statusFilter);
      const res = await fetch(`/api/ordens-servico?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) throw new Error("Falha ao carregar ordens de serviço.");
      const data = await res.json();
      if (controller.signal.aborted) return;
      const list = Array.isArray(data) ? data : [];
      setOrders(list);
      if (list.length > 0 && !selectedIdRef.current) {
        editorRef.current?.select(list[0]);
      } else if (!editorRef.current?.dirty && !mutationLock.current) {
        const fresh = list.find((order: OrdemItem) => order.id === selectedIdRef.current);
        if (fresh) editorRef.current?.select(fresh);
      }
    } catch (e: unknown) {
      if (!controller.signal.aborted) setErrorMsg(e instanceof Error ? e.message : "Erro ao carregar lista.");
    } finally {
      if (!controller.signal.aborted) setLoadingList(false);
    }
  // Selection is deliberately retained, including edits, when a filter hides it.
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    if (!isAdmin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Access denial must clear the initial loading state.
      setErrorMsg("Apenas administradores podem aceder à área de faturação.");
      setLoadingList(false);
      return;
    }
    fetchOrders();
    return () => ordersRequest.current?.abort();
  }, [fetchOrders, sessionStatus, isAdmin]);

  const fetchFaturas = useCallback(async () => {
    faturasRequest.current?.abort();
    const controller = new AbortController();
    faturasRequest.current = controller;
    setFaturasLoading(true);
    setFaturasError(null);
    try {
      const res = await fetch("/api/faturas?incluirCanceladas=true", { signal: controller.signal, cache: "no-store" });
      const data = await res.json();
      if (controller.signal.aborted) return;
      if (!res.ok) throw new Error(data?.error || "Falha ao carregar faturas.");
      if (!Array.isArray(data?.faturas) || data.faturas.some((invoice: FaturaItem) =>
        !Number.isFinite(invoice.valorPago) || !Number.isFinite(invoice.valorPendente))) {
        throw new Error("Saldos das faturas indisponíveis na resposta do servidor.");
      }
      setFaturasList(data.faturas);
      setFaturasLoaded(true);
    } catch (e: unknown) {
      if (!controller.signal.aborted) setFaturasError(e instanceof Error ? e.message : "Erro ao carregar faturas.");
    } finally {
      if (!controller.signal.aborted) setFaturasLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Load authoritative invoice balances when access becomes available.
    void fetchFaturas();
    return () => faturasRequest.current?.abort();
  }, [fetchFaturas, sessionStatus, isAdmin]);

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
      total: roundQuoteMoney(Math.max(1, newLinha.quantidade) * Math.max(0, newLinha.unitPrice)),
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
          next.total = roundQuoteMoney((next.quantidade || 0) * (next.unitPrice || 0));
        }
        return next;
      })
    );
  };

  const linhasTotal = linhas.reduce((acc, l) => acc + (l.total || 0), 0);

  const handleSaveLinhas = async () => {
    await handleSave(undefined, false, true);
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
    if (selectedFaturaIds.size === 0 || mutationLock.current || !confirmLeave()) return;
    const ids = [...selectedFaturaIds];
    const confirmText = window.confirm(
      `Eliminar definitivamente ${ids.length} fatura(s)?\n\nInclui recibos e notas de crédito associadas. Esta ação não pode ser anulada.`,
    );
    if (!confirmText) return;
    mutationLock.current = true;
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
      mutationLock.current = false;
      setDeletingFaturas(false);
    }
  };

  const selectedOrder = selectedRecord;
  const selectedInvoice = faturasList.find(invoice => invoice.id === Number(selectedOrder?.metadados?.faturaId));
  const faturaNumero = selectedInvoice ? invoiceDisplay(selectedInvoice).numeroFaturaDisplay :
    (selectedOrder?.metadados?.faturaNumero as string | undefined) || null;
  const faturaId = Number(selectedOrder?.metadados?.faturaId) || null;
  const faturaEmitida = Boolean(faturaNumero || faturaId || recipientLocked);
  const faturaCancelada = faturaEmitida && (selectedInvoice?.cancelada || selectedOrder?.metadados?.pagamentoStatus === "Cancelado");

  const saveOfficial = async () => {
    if (!officialDraft || mutationLock.current || officialDraft.id !== faturaId) return;
    if (!officialDraft.number.trim()) { setErrorMsg("Indique o numero oficial Navision."); return; }
    if (officialDraft.file && (!officialDraft.file.size || officialDraft.file.size > MAX_OFFICIAL_PDF_BYTES)) {
      setErrorMsg("O PDF deve ter entre 1 byte e 4 MB."); return;
    }
    const draft = officialDraft;
    const form = new FormData();
    form.set("numeroFaturaOficial", draft.number.trim());
    if (draft.updatedAt) form.set("expectedUpdatedAt", draft.updatedAt);
    if (draft.file) form.set("pdf", draft.file);
    mutationLock.current = true;
    faturasRequest.current?.abort();
    setFaturasLoading(false);
    setSavingOfficial(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const response = await fetch(`/api/faturas/${draft.id}/oficial`, { method: "PATCH", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Erro ao guardar referencia/PDF Navision.");
      setFaturasList(previous => previous.map(invoice => invoice.id === draft.id ? { ...invoice, ...body } : invoice));
      setOfficialDraft(null);
      setSuccessMsg("Referencia Navision guardada. Nenhuma fatura foi emitida ou alterada no Navision.");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Erro ao guardar dados Navision.");
    } finally {
      mutationLock.current = false;
      setSavingOfficial(false);
    }
  };

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    fetch(`/api/ordens-servico/${selectedId}/destinatario`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "Erro ao carregar destinatario.");
        if (controller.signal.aborted) return;
        const loaded = billingRecipient(body.destinatario);
        setRecipient(loaded);
        setRecipientBaseline(JSON.stringify(loaded));
        setRecipientLocked(body.locked);
        setRecipientReady(true);
      })
      .catch(error => { if (!controller.signal.aborted) setErrorMsg(error instanceof Error ? error.message : "Erro ao carregar destinatario."); });
    return () => controller.abort();
  }, [selectedId]);

  useEffect(() => {
    if (!faturaId) return;
    const controller = new AbortController();
    balanceRequest.current = controller;
    const params = new URLSearchParams({ incluirCanceladas: "true" });
    if (selectedOrder?.cliente?.id) params.set("clienteId", String(selectedOrder.cliente.id));
    fetch(`/api/faturas?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async res => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Erro ao carregar saldo da fatura.");
        if (controller.signal.aborted) return;
        const invoice = (body?.faturas as FaturaItem[] | undefined)?.find(item => item.id === faturaId);
        if (invoice) {
          setPaymentBalance({ valorPago: invoice.valorPago, valorPendente: invoice.valorPendente, pagamentoHistoricoSemRecibo: invoice.pagamentoHistoricoSemRecibo });
          const status = invoice.cancelada ? "Cancelado" : invoice.pagamentoStatus || "Pendente";
          setEditPagamento(status);
          setBaseline(previous => {
            const fields = JSON.parse(previous);
            fields[6] = status;
            return JSON.stringify(fields);
          });
        }
      })
      .catch(e => { if (!controller.signal.aborted) setErrorMsg(e instanceof Error ? e.message : "Erro ao carregar saldo."); });
    return () => controller.abort();
  }, [faturaId, selectedOrder?.cliente?.id]);

  // Support data only: selecting an order never writes or reprices its lines.
  useEffect(() => {
    if (!selectedOrder || faturaEmitida) return;
    const controller = new AbortController();
    fetch(`/api/ordens-servico/${selectedOrder.id}/apoio-orcamento`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (controller.signal.aborted) return;
        if (Array.isArray(data?.stock)) setStockOptions(data.stock);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [selectedOrder, faturaEmitida]);

  // Live calculations
  const numPecas = linhasTotal;
  const numDesconto = Number(editDesconto) || 0;
  const pecasFromLinhas = linhasTotal;
  const numMaoObra = Number(selectedOrder?.valorMaoObra) || 0;
  const subtotal = Math.max(0, pecasFromLinhas + numMaoObra - numDesconto);
  const iva = calcIva(subtotal, editIsentoIva);
  const total = subtotal + iva;

  const handleSave = async (override?: { orcamentoStatus?: string; status?: string }, internal = false, financialOnly = false): Promise<OrdemItem | null> => {
    if (!selectedOrder || !recipientReady || (mutationLock.current && !internal)) return null;
    if (faturaEmitida) {
      await handlePayment();
      return null;
    }
    mutationLock.current = true;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const payloadOrcStatus = override?.orcamentoStatus ?? editOrcamentoStatus;
    const payloadStatus = override?.status ?? editStatus;

    try {
      let updatedAt = selectedOrder.updatedAt;
      if (recipientDirty || internal) {
        const response = await fetch(`/api/ordens-servico/${selectedOrder.id}/destinatario`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destinatario: recipient, updatedAt }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error || "Erro ao guardar destinatario.");
        updatedAt = result.updatedAt;
        setRecipientBaseline(JSON.stringify(recipient));
        setSelectedRecord(previous => previous ? { ...previous, updatedAt } : previous);
      }
      const res = await fetch(`/api/ordens-servico/${selectedOrder.id}`, {
        method: financialOnly ? "PATCH" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updatedAt,
          valorMaoObra: numMaoObra,
          valorDesconto: numDesconto,
          isIsentoIva: editIsentoIva,
          orcamentoStatus: payloadOrcStatus,
          status: financialOnly ? undefined : payloadStatus,
          linhas,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const details = body?.details?.length ? `: ${body.details.join("; ")}` : "";
        throw new Error(`${body?.error || "Erro ao atualizar valores."}${details}`);
      }

      const updated = await res.json();
      const record = { ...selectedOrder, ...updated } as OrdemItem;
      setOrders((prev) => prev.map((o) => (o.id === record.id ? record : o)));
      setSelectedRecord(record);
      const savedLines = persistedQuoteLines(record);
      const exempt = Boolean(record.isIsentoIva ?? record.metadados?.isIsentoIva);
      setLinhas(savedLines);
      setEditPecas(String(record.valorPecas ?? 0));
      setEditDesconto(String(record.valorDesconto ?? 0));
      setEditIsentoIva(exempt);
      setEditOrcamentoStatus(record.orcamentoStatus || payloadOrcStatus);
      if (!financialOnly) setEditStatus(record.status || payloadStatus);
      setBaseline(JSON.stringify([savedLines, String(record.valorPecas ?? 0), String(record.valorDesconto ?? 0), exempt, record.orcamentoStatus || payloadOrcStatus, record.status || payloadStatus, editPagamento]));

      setSuccessMsg(override?.orcamentoStatus === "Aprovado"
        ? "Orçamento aprovado com sucesso!"
        : "Orçamento / Valores / Pagamento atualizados com sucesso!");
      return record;
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao salvar alterações.");
      return null;
    } finally {
      if (!internal) mutationLock.current = false;
      setSaving(false);
    }
  };

  const handlePayment = async (): Promise<boolean> => {
    if (!selectedOrder || !faturaId || faturaCancelada || mutationLock.current) return false;
    if (paymentBalance?.pagamentoHistoricoSemRecibo || selectedInvoice?.pagamentoHistoricoSemRecibo) {
      setErrorMsg("Pagamento histórico sem recibos completos. Reconcilie os documentos antes de registar pagamentos.");
      return false;
    }
    const amount = Number(paymentAmount.replace(",", "."));
    if (editPagamento === "Pago Parcialmente" && (!Number.isFinite(amount) || amount <= 0)) {
      setErrorMsg("Indique o valor deste pagamento parcial (incremental), superior a zero.");
      return false;
    }
    mutationLock.current = true;
    balanceRequest.current?.abort();
    setAtualizandoPagamento(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/faturas/${faturaId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagamentoStatus: editPagamento, valorPago: editPagamento === "Pago Parcialmente" ? amount : undefined }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Erro ao registar pagamento.");
      const result = body?.fatura || body;
      const status = result?.pagamentoStatus || body?.pagamentoStatus || editPagamento;
      const paid = Number(body?.valorPago ?? result?.valorPago);
      const pending = Number(body?.valorPendente ?? result?.valorPendente);
      const historicalWithoutReceipt = Boolean(body?.pagamentoHistoricoSemRecibo ?? result?.pagamentoHistoricoSemRecibo);
      if (Number.isFinite(paid) && Number.isFinite(pending)) setPaymentBalance({ valorPago: paid, valorPendente: pending, pagamentoHistoricoSemRecibo: historicalWithoutReceipt });
      const record = { ...selectedOrder, metadados: { ...selectedOrder.metadados, pagamentoStatus: status,
        ...(Number.isFinite(paid) ? { valorPago: paid } : {}), ...(Number.isFinite(pending) ? { valorPendente: pending } : {}) } };
      setSelectedRecord(record);
      setOrders(prev => prev.map(o => o.id === record.id ? record : o));
      setEditPagamento(status);
      setPaymentAmount("");
      setBaseline(JSON.stringify([linhas, editPecas, editDesconto, editIsentoIva, editOrcamentoStatus, editStatus, status]));
      const receipt = body?.numeroRecibo ?? result?.numeroRecibo;
      setSuccessMsg(`${historicalWithoutReceipt ? "Estado histórico de pagamento sem recibo: requer reconciliação." : "Estado de pagamento atualizado."}${receipt ? ` Recibo ${receipt}.` : " Nenhum recibo emitido nesta operação."}`);
      await fetchFaturas();
      return true;
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao registar pagamento.");
      return false;
    } finally {
      mutationLock.current = false;
      setAtualizandoPagamento(false);
    }
  };

  // Aprovação é exclusiva do módulo de Orçamentos (/orcamentos).
  // Aqui conclui-se a ordem e emite-se a fatura (exige orçamento aprovado).
  const handleConcluirEmitirFatura = async () => {
    if (!selectedOrder || mutationLock.current || faturaEmitida) return;
    if (!recipientReady || addingLinha) {
      setErrorMsg("Termine a linha em edicao e aguarde os dados do destinatario.");
      return;
    }
    if (!recipient.nome || !recipient.nif || !recipient.morada || linhas.length === 0 ||
      linhas.some(line => !line.descricao.trim() || !Number.isFinite(line.quantidade) || line.quantidade <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0)) {
      setErrorMsg("Preencha nome, NIF e morada do destinatario e artigos com quantidade positiva e preco valido.");
      return;
    }
    if (editOrcamentoStatus !== "Aprovado") {
      setErrorMsg("Orçamento ainda não aprovado. Aprove-o no módulo de Orçamentos (/orcamentos) antes de concluir e faturar.");
      return;
    }
    if (!window.confirm(`Registar fatura interna para ${recipient.nome}, NIF ${recipient.nif}, no total de EUR ${total.toFixed(2)}? Os dados ficarao bloqueados. Esta operacao nao emite uma fatura fiscal no Navision.`)) return;
    mutationLock.current = true;
    setEmitindoFatura(true);
    try {
      const savedOrder = await handleSave({ status: "concluida" }, true);
      if (savedOrder) await handleEmitirFatura(savedOrder);
    } finally {
      mutationLock.current = false;
      setEmitindoFatura(false);
    }
  };

  // Register the invoice in the database (Fatura linked to OT + cliente) and download the Excel
  const handleEmitirFatura = async (savedOrder?: OrdemItem) => {
    const internal = Boolean(savedOrder);
    const order = savedOrder ?? selectedOrder;
    if (!order || order.metadados?.faturaNumero || (mutationLock.current && !internal)) return;
    if (!internal && dirty) {
      setErrorMsg("Guarde as alterações antes de emitir a fatura.");
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);

    if (order.status !== "concluida") {
      setErrorMsg("Para registar o documento interno, a Ordem de Serviço deve estar concluída.");
      return;
    }

    if (order.orcamentoStatus !== "Aprovado") {
      setErrorMsg("Orçamento não aprovado — a aprovação é feita no módulo de Orçamentos (/orcamentos).");
      return;
    }

    setEmitindoFatura(true);
    mutationLock.current = true;
    try {
      const res = await fetch(`/api/ordens-servico/${order.id}/faturar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagamentoStatus: "Pendente", updatedAt: order.updatedAt }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Erro ao emitir fatura.");
      }

      const emittedNumero = (body?.numeroFatura || body?.fatura?.numeroFatura) as string | null;
      const emittedId = Number(body?.fatura?.id) || null;
      setSelectedRecord(prev => prev ? { ...prev, metadados: { ...prev.metadados, faturaId: emittedId, faturaNumero: emittedNumero, pagamentoStatus: "Pendente" } } : prev);
      setEditPagamento("Pendente");
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? {
                ...o,
                metadados: {
                  ...(o.metadados || {}),
                  faturaId: emittedId,
                  faturaNumero: emittedNumero,
                  faturaEmitidaEm: new Date().toISOString(),
                  pagamentoStatus: "Pendente",
                },
              }
            : o
        )
      );
       setSuccessMsg(emittedNumero ? `Documento interno ${emittedNumero} registado. A fatura fiscal e emitida externamente no Navision.` : "Documento interno registado; sem emissao fiscal.");
      await fetchFaturas();
      window.open(`/api/ordens-servico/${order.id}/fatura-excel`, "_blank");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao emitir fatura.");
    } finally {
      if (!internal) mutationLock.current = false;
      setEmitindoFatura(false);
    }
  };

  const handleAnularFatura = async () => {
    if (!selectedOrder || !faturaId || mutationLock.current) return;
    const motivo = window.prompt("Motivo da anulação da fatura (opcional):", "");
    if (motivo === null) return;
    mutationLock.current = true;
    balanceRequest.current?.abort();
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
      setPaymentBalance(previous => previous ? { ...previous, valorPendente: 0 } : null);
      setSelectedRecord(prev => prev ? { ...prev, metadados: { ...prev.metadados, pagamentoStatus: "Cancelado" } } : prev);
      setEditPagamento("Cancelado");
      setBaseline(JSON.stringify([linhas, editPecas, editDesconto, editIsentoIva, editOrcamentoStatus, editStatus, "Cancelado"]));
      setOrders((prev) =>
        prev.map((o) =>
          o.id === selectedOrder.id
            ? { ...o, metadados: { ...(o.metadados || {}), pagamentoStatus: "Cancelado", notaCreditoNumero: numeroNC } }
            : o
        )
      );
      setSuccessMsg(`Fatura ${faturaNumero} anulada. ${numeroNC ? `Nota de crédito ${numeroNC} emitida.` : ""}`);
      await fetchFaturas();
      if (numeroNC) window.open(`/api/ordens-servico/${selectedOrder.id}/nota-credito-excel`, "_blank");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao anular fatura.");
    } finally {
      mutationLock.current = false;
      setCancelandoFatura(false);
    }
  };

  const handleCopyPublicLink = () => {
    if (!selectedOrder) return;
    const url = `${window.location.origin}/public/orcamento/${selectedOrder.id}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const handleWhatsAppShare = () => {
    if (!whatsappAllowed) {
      setErrorMsg(`WhatsApp disponível apenas para o administrador ${WHATSAPP_ALLOWED_USER_EMAIL}.`);
      return;
    }
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
    if (dirty || mutationLock.current) {
      setErrorMsg("Guarde as alterações antes de descarregar o documento.");
      return;
    }
    if (type === "fatura" && !faturaEmitida) {
      setErrorMsg("Registe o documento interno antes de o descarregar.");
      return;
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
  const invoiceBalances = summarizeInvoiceBalances(faturasList);
  const invoicedOrders = orders.filter(order => invoiceBalances.active.some(invoice => invoice.ordemServicos?.some(link => link.id === order.id)));
  const filteredInvoices = faturasList.filter(invoice => {
    const query = invoiceSearch.trim().toLocaleLowerCase("pt-PT");
    const matchesStatus = !invoiceFilter || (invoiceFilter === "Cancelado" ? invoice.cancelada :
      invoiceFilter === "Reconciliar" ? invoice.pagamentoHistoricoSemRecibo :
      !invoice.cancelada && invoice.pagamentoStatus === invoiceFilter);
    return matchesStatus && (!query || [invoice.numeroFatura, invoice.numeroFaturaOficial, invoice.cliente?.nome,
      invoice.notaCredito?.numeroNotaCredito, ...(invoice.ordemServicos?.map(order => order.numeroOrdem) || [])]
      .some(value => value?.toLocaleLowerCase("pt-PT").includes(query)));
  });
  const openInvoice = async (invoice: FaturaItem) => {
    if (mutationLock.current || !confirmLeave()) return;
    const orderId = invoice.ordemServicos?.[0]?.id;
    if (!orderId) {
      setErrorMsg("Esta fatura não tem uma ordem associada disponível.");
      return;
    }
    mutationLock.current = true;
    setOpeningInvoice(true);
    try {
      const res = await fetch(`/api/ordens-servico/${orderId}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Erro ao carregar ordem da fatura.");
      mutationLock.current = false;
      selectOrder(body, true);
      setActiveTab("fatura");
      setViewMode("console");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Erro ao abrir fatura.");
    } finally {
      mutationLock.current = false;
      setOpeningInvoice(false);
    }
  };
  const faturasReady = faturasLoaded && !faturasLoading && !faturasError;
  const paymentBreakdown = PAGAMENTO_STATUS_LIST.map((status) => ({
    status,
    count: invoiceBalances.active.filter(invoice => invoice.pagamentoStatus === status).length,
    pending: invoiceBalances.active.filter(invoice => invoice.pagamentoStatus === status).reduce((sum, invoice) => sum + invoice.valorPendente, 0),
    paid: invoiceBalances.active.filter(invoice => invoice.pagamentoStatus === status).reduce((sum, invoice) => sum + invoice.valorPago, 0),
  }));

  // Group billing by service station
  const stationBillingMap = new Map<string, { nome: string; count: number; total: number }>();
  orders.forEach((o) => {
    if (invoicedOrders.some(order => order.id === o.id)) {
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
  invoiceBalances.active.forEach((o) => {
    const rawDate = o.dataEmissao;
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
  invoiceBalances.active.forEach((o) => {
    const name = o.cliente?.nome || "Cliente Particular";
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
  const avgInvoice = invoiceBalances.active.length > 0
    ? invoiceBalances.active.reduce((acc, o) => acc + Number(o.valorTotal || 0), 0) / invoiceBalances.active.length
    : 0;

  const handleDownloadNotaCredito = () => {
    if (!selectedOrder) return;
    if (!faturaCancelada || !selectedInvoice?.notaCredito) {
      setErrorMsg("Anule a fatura antes de descarregar a nota de crédito registada.");
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
            onClick={() => { void fetchOrders(); void fetchFaturas(); }}
            disabled={busy || loadingList || faturasLoading}
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
                  Em dívida: {faturasReady ? `€ ${invoiceBalances.totalOutstanding.toFixed(2)}` : "Indisponível"}
                </div>
              </div>

              {faturasError && <p role="alert" className="text-sm text-rose-700">{faturasError}</p>}
              {invoiceBalances.reconciliation.length > 0 && <p className="text-sm text-amber-700">{invoiceBalances.reconciliation.length} fatura(s) historicamente paga(s) com recibos em falta. Requerem reconciliação e não são dívida confirmada.</p>}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {paymentBreakdown.map((entry) => (
                  <div key={entry.status} className={`rounded-xl border p-4 space-y-2 ${PAGAMENTO_BADGE_CLASSES[entry.status] || PAGAMENTO_BADGE_CLASSES.Pendente}`}>
                    <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{entry.status}</div>
                    <div className="text-xl font-black font-mono">{faturasReady ? `€ ${(entry.status === "Pago" ? entry.paid : entry.pending).toFixed(2)}` : "Indisponível"}</div>
                    <div className="text-xs">{entry.status === "Pago" ? "Recebido com recibos" : "Saldo pendente"}</div>
                    <div className="text-xs opacity-80">{entry.count} faturas</div>
                  </div>
                ))}
              </div>

              {!faturasReady ? (
                <div className="py-6 text-sm text-slate-500">{faturasLoading ? "A carregar saldos..." : "Saldos indisponíveis. Atualize para tentar novamente."}</div>
              ) : invoiceBalances.outstanding.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-sm">Sem dívida confirmada nas faturas ativas. Consulte os avisos de reconciliação.</div>
              ) : (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto"><table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-700 uppercase tracking-wider">
                        <th className="p-3">Fatura</th>
                        <th className="p-3">Cliente</th>
                        <th className="p-3">Estado Pagamento</th>
                        <th className="p-3 text-right">Valor em dívida</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {invoiceBalances.outstanding.map((o) => (
                        <tr key={o.id} className="hover:bg-slate-50">
                          <td className="p-3 font-mono text-indigo-600"><button disabled={busy} onClick={() => void openInvoice(o)} className="underline">{invoiceDisplay(o).numeroFaturaDisplay}</button></td>
                          <td className="p-3 font-semibold text-slate-700">{o.cliente?.nome || "Cliente Particular"}</td>
                          <td className="p-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${PAGAMENTO_BADGE_CLASSES[o.pagamentoStatus || "Pendente"] || PAGAMENTO_BADGE_CLASSES.Pendente}`}>
                              {o.pagamentoStatus}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-rose-600">€ {o.valorPendente.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </div>
              )}
            </div>

            {/* Station Billing Consolidation */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-xl">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                <Building2 className="text-indigo-600" size={20} />
                  <h3 className="text-base font-bold text-slate-800">Valores das OTs Faturadas por Estação de Serviço</h3>
              </div>

              {stationBillingList.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">Sem dados suficientes para consolidação por estação.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stationBillingList.map((station, idx) => (
                    <div key={idx} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                      <div className="text-sm font-bold text-slate-700">{station.nome}</div>
                      <div className="flex justify-between items-center pt-2">
                        <span className="text-xs text-slate-500">{station.count} OTs faturadas na seleção</span>
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
                    {invoiceBalances.active.length} faturas ativas
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
                    <span className="text-xs font-mono text-slate-500">Média/fatura: € {avgInvoice.toFixed(2)}</span>
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
                  <input aria-label="Pesquisar faturas" placeholder="Fatura, cliente, ordem ou nota de crédito" value={invoiceSearch} onChange={event => setInvoiceSearch(event.target.value)} className="w-full rounded-lg border border-slate-300 p-2 text-xs" />
                  <select aria-label="Filtrar faturas por estado" value={invoiceFilter} onChange={event => setInvoiceFilter(event.target.value)} className="w-full rounded-lg border border-slate-300 p-2 text-xs">
                    {["", ...PAGAMENTO_STATUS_LIST, "Cancelado", "Reconciliar"].map(status => <option key={status} value={status}>{status || "Todos os estados"}</option>)}
                  </select>
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
                ) : faturasError ? (
                  <div role="alert" className="p-8 text-sm text-rose-700">{faturasError}</div>
                ) : filteredInvoices.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">Nenhuma fatura encontrada.</div>
                ) : (
                  filteredInvoices.map((fat) => {
                    const isSelected = selectedFaturaIds.has(fat.id);
                    return (
                      <div
                        key={fat.id}
                        className={`p-4 transition flex items-start gap-3 ${isSelected ? "bg-rose-50 border-l-4 border-rose-400" : "hover:bg-slate-100"}`}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${invoiceDisplay(fat).numeroFaturaDisplay}`}
                          disabled={busy}
                          checked={isSelected}
                          onChange={() => toggleFaturaSelect(fat.id)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <button disabled={busy} onClick={() => void openInvoice(fat)} className="text-xs font-bold text-indigo-600 underline">#{invoiceDisplay(fat).numeroFaturaDisplay}</button>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                              {fat.pagamentoStatus || "Pendente"}
                            </span>
                          </div>
                          {fat.numeroFaturaOficial && <p className="text-xs text-slate-500">Navision | Interno: {fat.numeroFatura}</p>}
                          <div className="text-sm font-semibold text-slate-700 truncate mt-0.5">
                            {fat.cliente?.nome || "Cliente Particular"}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {fat.dataEmissao ? formatDateTimeShort(fat.dataEmissao) : "—"}
                          </div>
                          {Boolean(fat.numerosObra?.length) && <p className="text-xs text-slate-600 break-words">Obra(s): {fat.numerosObra?.join(", ")}</p>}
                          <div className="flex items-center justify-between text-xs pt-1 font-mono text-slate-700">
                            <span>{fat.cancelada ? "Anulada" : ""}</span>
                            <span className="font-bold text-indigo-600">€ {(fat.valorTotal || 0).toFixed(2)}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600">Pago: € {fat.valorPago.toFixed(2)} | Pendente: € {fat.valorPendente.toFixed(2)}</p>
                          {fat.notaCredito && <p className="text-xs text-rose-700">Nota de crédito: {fat.notaCredito.numeroNotaCredito}</p>}
                          {fat.pagamentoHistoricoSemRecibo && <p className="text-xs text-amber-700">Pagamento histórico: reconciliar recibos em falta.</p>}
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
                  const linkedInvoice = faturasList.find(invoice => invoice.ordemServicos?.some(link => link.id === ord.id));
                  const pagamento = linkedInvoice ? (linkedInvoice.cancelada ? "Cancelado" : linkedInvoice.pagamentoStatus || "Indisponível") :
                    ord.metadados?.faturaNumero ? "Saldo indisponível" : "Por faturar";
                  return (
                    <button
                      key={ord.id}
                      disabled={busy}
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
                <div className="sticky top-0 z-20 rounded-2xl border border-indigo-200 bg-indigo-50 p-3 flex flex-wrap items-center justify-between gap-2 shadow-sm">
                  <div className="text-xs text-indigo-700">
                    <strong>{selectedOrder.numeroOrdem || selectedOrder.id}</strong>
                    {" · "}{faturaEmitida ? `Fatura ${faturaNumero || "registada"}` : `Total: EUR ${total.toFixed(2)}`}
                  </div>
                  <button onClick={handleConcluirEmitirFatura}
                    disabled={busy || !recipientReady || faturaEmitida || editOrcamentoStatus !== "Aprovado"}
                    title={editOrcamentoStatus !== "Aprovado" ? "Aprove o orcamento no modulo de Orcamentos (/orcamentos)" : "Guardar, concluir e registar a fatura"}
                    className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50">
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}
                    {busy ? "A processar..." : faturaEmitida ? "Fatura registada" : "Registar fatura"}
                  </button>
                </div>
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
                    {Boolean(selectedInvoice?.numerosObra?.length) && <p className="text-xs text-slate-600 break-words">Obra(s): {selectedInvoice?.numerosObra?.join(", ")}</p>}
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
                        Fatura / Navision
                      </button>
                    </div>

                    <button
                      onClick={() => handleDownloadExcel(activeTab)}
                      disabled={busy || dirty || Boolean(officialDraft) || (activeTab === "fatura" && !faturaEmitida)}
                      className="flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition shadow-sm"
                    >
                      <Download size={14} /> {activeTab === "orcamento" ? "Orçamento .xlsx" : "Documento interno .xlsx"}
                    </button>

                    {activeTab === "fatura" && (
                      <button
                        onClick={() => selectedOrder && window.open(selectedInvoice?.pdfOficial ? `/api/faturas/${selectedInvoice.id}/oficial` : `/api/ordens-servico/${selectedOrder.id}/fatura-pdf`, "_blank")}
                        disabled={busy || !faturaEmitida || dirty || Boolean(officialDraft)}
                        className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition shadow-sm"
                        title={selectedInvoice?.pdfOficial ? "Descarregar PDF oficial anexado" : "Documento interno, nao e fatura fiscal"}
                      >
                        <FileText size={14} /> {selectedInvoice?.pdfOficial ? "PDF oficial Navision" : "Documento interno / pro-forma .pdf"}
                      </button>
                    )}

                    <button
                      onClick={handleDownloadNotaCredito}
                      disabled={busy || !faturaCancelada || !selectedInvoice?.notaCredito}
                      className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition shadow-sm"
                      title="Descarregar a nota de crédito já registada na anulação"
                    >
                      <FileMinus size={14} /> Nota de Crédito
                    </button>

                    <button
                      onClick={() => selectedOrder && window.open(`/api/ordens-servico/${selectedOrder.id}/recibo-excel`, "_blank")}
                      disabled={busy || !selectedInvoice?.numeroRecibo}
                      className="flex items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-3.5 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100 transition shadow-sm"
                      title="Descarregar o último recibo registado desta fatura"
                    >
                      <FileText size={14} /> Recibo .xlsx
                    </button>
                  </div>
                </div>

                {/* Quick Actions Bar */}
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-xs text-indigo-700">
                    <Zap size={16} className="text-indigo-600 animate-pulse" />
                    <span>1. Orçamento {editOrcamentoStatus === "Aprovado" ? "aprovado" : "por aprovar"} → 2. Trabalho {selectedOrder.status === "concluida" ? "concluído" : "em curso"} → 3. Fatura {faturaEmitida ? "emitida" : "por emitir"}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleWhatsAppShare}
                      className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                    >
                      <MessageSquare size={14} className="text-emerald-600" /> WhatsApp
                    </button>

                    <button
                      onClick={handleCopyPublicLink}
                      className="flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                    >
                      {copiedLink ? <Check size={14} className="text-emerald-600" /> : <Link2 size={14} />}
                      {copiedLink ? "Link Copiado!" : "Copiar Link"}
                    </button>

                    {faturaEmitida && !faturaCancelada && (
                      <button
                        onClick={handleAnularFatura}
                        disabled={busy || Boolean(officialDraft)}
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

                {faturaId && activeTab === "fatura" && (
                  <fieldset disabled={busy} className="rounded-2xl border border-indigo-200 bg-white p-5 space-y-3">
                    <legend className="text-sm font-bold text-indigo-700">Fatura externa Navision</legend>
                    <p className="text-sm text-slate-600">A fatura fiscal e emitida e certificada externamente no Navision. Aqui regista-se apenas a referencia e o PDF recebido, sem alterar valores.</p>
                    <p className="text-xs text-slate-500">Referencia interna preservada: {selectedInvoice?.numeroFatura || selectedOrder.metadados?.faturaNumero}</p>
                    <p className="text-sm">Numero oficial: {selectedInvoice?.numeroFaturaOficial || "Nao registado"}</p>
                    {selectedInvoice?.pdfOficial && <p className="text-xs text-slate-600 break-all">PDF: {selectedInvoice.pdfOficial.filename} ({selectedInvoice.pdfOficial.size} bytes). Enviado por {selectedInvoice.pdfOficial.uploadedBy} em {formatDateTimeShort(selectedInvoice.pdfOficial.uploadedAt)}. SHA-256: {selectedInvoice.pdfOficial.sha256}</p>}
                    {selectedInvoice?.pdfOficial && selectedInvoice.numeroFaturaOficial && !officialDraft && !faturaCancelada && <>
                      <button type="button" disabled={busy || faturasLoading || Boolean(faturasError)} onClick={() => setInvoiceCompose({ id: selectedInvoice.id, portalUrl: `${window.location.origin}/area-cliente#faturas` })}
                        className="rounded-lg border border-indigo-300 px-4 py-2 text-sm text-indigo-700">Preparar email / WhatsApp da fatura oficial</button>
                      {invoiceCompose?.id === selectedInvoice.id && <OfficialInvoiceCompose key={`${selectedInvoice.id}:${selectedInvoice.numeroFaturaOficial}`} invoiceId={selectedInvoice.id}
                        officialNumber={selectedInvoice.numeroFaturaOficial} clientName={selectedInvoice.cliente?.nome || selectedOrder.cliente?.nome || recipient.nome || 'Cliente'} portalUrl={invoiceCompose.portalUrl} />}
                    </>}
                    {officialDraft?.id === faturaId ? <>
                      <label className="block text-sm">Numero oficial Navision
                        <input maxLength={120} value={officialDraft.number} onChange={event => setOfficialDraft(previous => previous ? { ...previous, number: event.target.value } : null)}
                          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" />
                      </label>
                      <label className="block text-sm">PDF oficial (opcional, maximo 4 MB)
                        <input ref={officialFileInput} type="file" accept="application/pdf,.pdf" onChange={event => setOfficialDraft(previous => previous ? { ...previous, file: event.target.files?.[0] || null } : null)} className="mt-1 block w-full text-sm" />
                      </label>
                      <p className="text-xs text-slate-500">Guardar envia o numero e o PDF juntos. Sem novo ficheiro, o PDF atual e preservado. As versoes substituidas ficam retidas para auditoria.</p>
                      <div className="flex flex-wrap gap-3">
                        <button onClick={() => void saveOfficial()} disabled={busy || !officialDraft.number.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">{savingOfficial ? "A guardar Navision..." : "Guardar dados Navision"}</button>
                        <button onClick={() => { setOfficialDraft(null); if (officialFileInput.current) officialFileInput.current.value = ""; }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancelar edicao Navision</button>
                      </div>
                    </> : <button disabled={!selectedInvoice || faturasLoading || Boolean(faturasError) || faturaCancelada} onClick={() => selectedInvoice && setOfficialDraft({ id: selectedInvoice.id, number: selectedInvoice.numeroFaturaOficial || "", updatedAt: selectedInvoice.updatedAt, file: null })}
                      className="rounded-lg border border-indigo-300 px-4 py-2 text-sm text-indigo-700">Editar referencia / anexar PDF Navision</button>}
                  </fieldset>
                )}

                {/* Interactive Editor Form */}
                <fieldset disabled={busy || !recipientReady || faturaEmitida} className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                  <legend className="text-sm font-bold text-indigo-600">Destinatario de faturacao</legend>
                  <p className="text-xs text-slate-500">Dados deste documento, sem alterar a ficha global do cliente. Campos desconhecidos ficam em branco.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {recipientFields.map(field => <label key={field} className="text-xs font-semibold text-slate-600">
                      {{ nome: "Nome", nif: "NIF", morada: "Morada", localidade: "Localidade", ilha: "Ilha" }[field]}
                      <input value={recipientReady ? recipient[field] : ""} onChange={event => setRecipient(previous => ({ ...previous, [field]: event.target.value }))}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    </label>)}
                  </div>
                </fieldset>
                <fieldset disabled={busy || Boolean(officialDraft)} className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-2">
                      <Edit3 size={16} /> Parâmetros de Cálculo, Estado & Pagamento
                    </h3>
                    <button
                      onClick={() => handleSave()}
                      disabled={busy || faturaCancelada || (faturaEmitida && (!paymentBalance || paymentBalance.pagamentoHistoricoSemRecibo))}
                      className="flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 transition disabled:opacity-50"
                    >
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {busy ? "A processar..." : faturaEmitida ? "Registar pagamento" : "Guardar alterações"}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Total de Linhas (€)</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input
                          type="number"
                          step="0.01"
                          value={linhasTotal.toFixed(2)}
                          onChange={(e) => setEditPecas(e.target.value)}
                          disabled
                          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-8 pr-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none font-mono disabled:bg-slate-100"
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
                          disabled={faturaEmitida}
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
                        disabled
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
                        disabled={faturaEmitida}
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
                          disabled={!faturaEmitida || faturaCancelada}
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
                          disabled={faturaEmitida}
                          onChange={(e) => setEditIsentoIva(e.target.checked)}
                          className="w-5 h-5 rounded border-slate-300 bg-white text-indigo-500 focus:ring-indigo-500 focus:ring-offset-white"
                        />
                        <span className="text-sm font-medium text-slate-700">Isenção de IVA</span>
                      </label>
                    </div>
                  </div>
                  {faturaEmitida && !faturaCancelada && editPagamento === "Pago Parcialmente" && (
                    <label className="block text-xs font-semibold text-slate-600">
                      Valor deste pagamento (€), a adicionar ao total já pago
                      <input type="number" min="0.01" step="0.01" value={paymentAmount}
                        onChange={e => setPaymentAmount(e.target.value)}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    </label>
                  )}
                  {faturaEmitida && (paymentBalance || selectedOrder.metadados?.valorPago != null) && (
                    <p className="text-sm text-slate-600" aria-live="polite">
                      Pago acumulado: € {Number(paymentBalance?.valorPago ?? selectedOrder.metadados?.valorPago ?? 0).toFixed(2)}
                      {" · "}Pendente: € {Number(paymentBalance?.valorPendente ?? selectedOrder.metadados?.valorPendente ?? 0).toFixed(2)}
                    </p>
                  )}
                  {paymentBalance?.pagamentoHistoricoSemRecibo && <p role="alert" className="text-sm text-amber-700">Pagamento histórico sem recibos completos. Requer reconciliação; não volte a cobrar esta fatura.</p>}
                  {faturaCancelada && <p className="text-sm text-rose-700">Fatura anulada{selectedInvoice?.notaCredito ? ` pela nota de crédito ${selectedInvoice.notaCredito.numeroNotaCredito}` : ""}. Os recibos existentes são preservados; a anulação não regista um reembolso.</p>}
                  <p className="text-xs text-slate-500">Mão de obra preservada: € {numMaoObra.toFixed(2)}. {dirty ? "Alterações por guardar." : "Sem alterações por guardar."}</p>
                </fieldset>

                {/* Linhas de Orçamento Editáveis */}
                {!faturaEmitida && (
                  <fieldset disabled={busy} className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-2">
                        <Package size={16} /> Orçamento de Oficina — Jangadas
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
                            disabled={busy}
                            className="flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition disabled:opacity-50"
                          >
                            {savingLinhas ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            {saving ? "A guardar..." : "Guardar valores e linhas"}
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
                        <div className="overflow-x-auto"><table className="w-full text-left border-collapse text-sm">
                          <thead>
                            <tr className="bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                              <th className="p-3">Referência</th>
                              <th className="p-3">Descrição</th>
                              <th className="p-3 text-center">Qtd</th>
                              <th className="p-3 text-right">Preço Unit.</th>
                              <th className="p-3 text-right">Total</th>
                              <th className="p-3 text-center">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {(["service", "material"] as const).map((group) => {
                              const groupLines = linhas.filter((linha) =>
                                group === "service" ? linha.source === "service" : linha.source !== "service",
                              );
                              if (groupLines.length === 0) return null;
                              return (
                                <Fragment key={group}>
                                  <tr className={group === "service" ? "bg-indigo-50/70" : "bg-cyan-50/70"}>
                                    <td
                                      colSpan={6}
                                      className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${
                                        group === "service" ? "text-indigo-700" : "text-cyan-700"
                                      }`}
                                    >
                                      {group === "service" ? "Serviços / Inspeção" : "Peças e Materiais"}
                                    </td>
                                  </tr>
                                  {groupLines.map((linha) => (
                                    <tr key={linha.id} className="hover:bg-slate-50">
                                      <td className="p-2">
                                        <input
                                          type="text"
                                          value={linha.referencia}
                                          onChange={(e) => updateLinha(linha.id, "referencia", e.target.value)}
                                          placeholder="REF"
                                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 font-mono focus:border-indigo-400 focus:outline-none"
                                        />
                                      </td>
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
                                </Fragment>
                              );
                            })}
                          </tbody>
                        </table></div>
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
                  </fieldset>
                )}

                {/* Live Preview Card */}
                <div className="rounded-2xl border border-indigo-200 bg-white p-6 space-y-6 shadow-2xl">
                  {activeTab === "fatura" && !faturaEmitida && <p className="text-sm text-amber-700">Simulação de valores. Ainda nao existe um documento interno registado. A emissao fiscal e externa, no Navision.</p>}
                  {activeTab === "fatura" && (selectedInvoice?.ordemServicos?.length || 0) > 1 && <p className="text-sm text-indigo-700">Fatura agrupada de {selectedInvoice?.ordemServicos?.length} ordens. As linhas abaixo são apenas desta OT; os totais são da fatura completa. Descarregue o documento para consultar todas as linhas.</p>}
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="text-indigo-600" size={20} />
                      <h3 className="text-base font-bold text-slate-800">
                        Pré-visualização em Tempo Real — {activeTab === "orcamento" ? "ORÇAMENTO" : "RESUMO INTERNO / NAVISION"}
                      </h3>
                    </div>
                    <span className="text-xs font-mono bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full border border-indigo-200">
                      Cálculo Automático Ativo
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                    <div className="space-y-2 bg-white/60 p-4 rounded-xl border border-slate-200">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Dados do Destinatário</div>
                       <p className="font-bold text-slate-800">{recipientReady ? recipient.nome || "—" : "A carregar destinatario..."}</p>
                       <p className="text-slate-500 text-xs">NIF: <span className="text-slate-700 font-mono">{recipientReady ? recipient.nif || "—" : "—"}</span></p>
                       <p className="text-slate-500 text-xs">Morada: <span className="text-slate-700">{recipientReady ? recipient.morada || "—" : "—"}</span></p>
                       <p className="text-slate-500 text-xs">Localidade/Ilha: <span className="text-slate-700">{recipientReady ? `${recipient.localidade} ${recipient.ilha}` : ""}</span></p>
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
                    <div className="overflow-x-auto"><table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-100/80 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                          <th className="p-3">Referência</th>
                          <th className="p-3">Descrição do Serviço / Artigo</th>
                          <th className="p-3 text-center">Qtd</th>
                          <th className="p-3 text-right">Preço Unit.</th>
                          <th className="p-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono text-xs">
                        {linhas.length > 0 ? (
                          <>
                            {linhas.some((linha) => linha.source === "service") && (
                              <tr className="bg-indigo-50/60">
                                <td colSpan={5} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 font-sans">
                                  Serviços / Inspeção
                                </td>
                              </tr>
                            )}
                            {linhas.filter((linha) => linha.source === "service").map((linha) => (
                              <tr key={linha.id}>
                                <td className="p-3 text-indigo-700">{linha.referencia || "—"}</td>
                                <td className="p-3 text-slate-700 font-sans">{linha.descricao}</td>
                                <td className="p-3 text-center">{linha.quantidade}</td>
                                <td className="p-3 text-right text-slate-600">€ {linha.unitPrice.toFixed(2)}</td>
                                <td className="p-3 text-right font-bold text-slate-800">€ {linha.total.toFixed(2)}</td>
                              </tr>
                            ))}
                            {linhas.some((linha) => linha.source !== "service") && (
                              <tr className="bg-cyan-50/60">
                                <td colSpan={5} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-700 font-sans">
                                  Peças e Materiais
                                </td>
                              </tr>
                            )}
                            {linhas.filter((linha) => linha.source !== "service").map((linha) => (
                              <tr key={linha.id}>
                                <td className="p-3 text-cyan-700">{linha.referencia || "—"}</td>
                                <td className="p-3 text-slate-700 font-sans">{linha.descricao}</td>
                                <td className="p-3 text-center">{linha.quantidade}</td>
                                <td className="p-3 text-right text-slate-600">€ {linha.unitPrice.toFixed(2)}</td>
                                <td className="p-3 text-right font-bold text-slate-800">€ {linha.total.toFixed(2)}</td>
                              </tr>
                            ))}
                          </>
                        ) : (
                          <tr>
                            <td className="p-3 text-slate-400">—</td>
                            <td className="p-3 text-slate-700 font-sans">Materiais aplicados (sem linhas detalhadas)</td>
                            <td className="p-3 text-center">1</td>
                            <td className="p-3 text-right text-slate-600">€ {numPecas.toFixed(2)}</td>
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
                    </table></div>
                  </div>

                  {/* Totals box */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col items-end space-y-1.5 font-mono text-sm">
                    <div className="flex justify-between w-64 text-slate-500 text-xs">
                      <span>Subtotal:</span>
                      <span className="text-slate-700">{activeTab === "fatura" && faturaEmitida ? selectedInvoice?.valorSubtotal != null ? `€ ${selectedInvoice.valorSubtotal.toFixed(2)}` : "Indisponível" : `€ ${subtotal.toFixed(2)}`}</span>
                    </div>
                    <div className="flex justify-between w-64 text-slate-500 text-xs">
                        <span>IVA ({(activeTab === "fatura" && faturaEmitida ? selectedInvoice?.isIsentoIva : editIsentoIva) ? "Isento" : `${Math.round(getIvaRate() * 100)}%`}):</span>
                      <span className="text-slate-700">{activeTab === "fatura" && faturaEmitida ? selectedInvoice?.valorIva != null ? `€ ${selectedInvoice.valorIva.toFixed(2)}` : "Indisponível" : `€ ${iva.toFixed(2)}`}</span>
                    </div>
                    <div className="flex justify-between w-64 text-indigo-600 font-bold text-base pt-2 border-t border-slate-200">
                      <span>TOTAL:</span>
                      <span>{activeTab === "fatura" && faturaEmitida ? selectedInvoice?.valorTotal != null ? `€ ${selectedInvoice.valorTotal.toFixed(2)}` : "Indisponível" : `€ ${total.toFixed(2)}`}</span>
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
