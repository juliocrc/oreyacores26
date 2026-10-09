"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Search, X, ClipboardCheck, History, FileText, ExternalLink, ArrowRightCircle, Plus, Trash2, Save, CheckCircle2, Ban, FileDown, AlertCircle, ChevronRight } from "lucide-react";
import { formatDateTimeShort } from "@/lib/date-utils";
import { getIvaRate } from "@/lib/iva";

const ORCAMENTO_STATUS_LIST = ["Rascunho", "Enviado", "Aprovado", "Rejeitado"];

const STATUS_LABELS: Record<string, string> = {
  Rascunho: "Orçamento em rascunho",
  Enviado: "Orçamento em análise",
  Pendente: "Orçamento em análise",
  Emitido: "Em análise (emitido na inspeção)",
  Aprovado: "Orçamento aprovado",
  Rejeitado: "Orçamento rejeitado",
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  Rascunho: "bg-slate-100 text-slate-700 border-slate-300",
  Enviado: "bg-amber-50 text-amber-800 border-amber-300",
  Pendente: "bg-amber-50 text-amber-800 border-amber-300",
  Emitido: "bg-amber-50 text-amber-800 border-amber-300",
  Aprovado: "bg-emerald-50 text-emerald-800 border-emerald-300",
  Rejeitado: "bg-rose-50 text-rose-800 border-rose-300",
};

const statusLabel = (status?: string | null) => STATUS_LABELS[status || ""] || status || "—";

const round2 = (value: number) => Math.round((value || 0) * 100) / 100;

type OrcamentoLinha = {
  id: string;
  stockId?: number | string | null;
  referencia: string;
  descricao: string;
  quantidade: number;
  unitPrice: number;
  total: number;
  source: "service" | "pack" | "componente" | "stock" | "manual" | "closure" | string;
};

const normalizeLinhas = (metaLinhas: unknown): OrcamentoLinha[] => {
  if (!Array.isArray(metaLinhas)) return [];
  const seen = new Set<string>();
  return (metaLinhas as OrcamentoLinha[]).map((l) => {
    let id = l.id || `linha-${Math.random().toString(36).slice(2, 8)}`;
    if (seen.has(id)) id = `${id}-${Math.random().toString(36).slice(2, 8)}`;
    seen.add(id);
    return {
      ...l,
      id,
      referencia: l.referencia || "",
      descricao: l.descricao || "",
      quantidade: Number(l.quantidade) || 0,
      unitPrice: Number(l.unitPrice) || 0,
      total: Number(l.total) || 0,
    };
  });
};

const getMeta = (row: OrcamentoRow | null): Record<string, any> =>
  row?.metadados && typeof row.metadados === "object" ? (row.metadados as Record<string, any>) : {};

type InspectionArtigo = { name?: string; referencia?: string | null; quantidade?: number };
type InspectionInfo = {
  id?: number;
  certificadoNumero?: string | null;
  dataInspecao?: string | null;
  dataProxInspecao?: string | null;
  status?: string | null;
  testeWP?: string | null;
  testeNAP?: string | null;
  testeFS?: string | null;
  testeGI?: string | null;
  testeDL?: string | null;
  artigos?: InspectionArtigo[];
};

type OrcamentoRow = {
  id: number;
  numeroOrdem?: string | null;
  grupoNumeroOrdem?: string | null;
  tipo?: string | null;
  status?: string | null;
  prioridade?: string | null;
  orcamentoStatus?: string | null;
  valorTotal?: number | null;
  valorPecas?: number | null;
  valorMaoObra?: number | null;
  valorDesconto?: number | null;
  dataAbertura?: string | null;
  dataPrevista?: string | null;
  dataPlaneadaInicio?: string | null;
  inspecaoId?: number | null;
  metadados?: unknown;
  jangada?: { id?: number; serial?: string | null; brand?: string | null; model?: string | null; owner?: string | null; numeroObra?: string | null } | null;
  jangadas?: Array<{ id?: number; serial?: string | null; brand?: string | null; model?: string | null; owner?: string | null; numeroObra?: string | null }> | null;
  cliente?: { nome?: string | null; ilha?: string | null } | null;
  inspecao?: InspectionInfo | null;
  latestInspectionSummary?: {
    historyCount?: number;
    replacementCount?: number;
    totalTestesReprovados?: number;
    latestDate?: string | null;
  } | null;
};

function getRaftDisplay(row: OrcamentoRow) {
  if (row.jangada) {
    const s = row.jangada.serial || "";
    const b = row.jangada.brand || "";
    const m = row.jangada.model || "";
    return `${b} ${m}`.trim() + (s ? ` — ${s}` : "");
  }
  if (row.jangadas?.length) {
    const first = row.jangadas[0];
    return `${first.brand || ""} ${first.model || ""}`.trim() + (first.serial ? ` — ${first.serial}` : "");
  }
  return "—";
}

function getEmbarcacao(row: OrcamentoRow) {
  return row.cliente?.nome || row.jangada?.owner || (row.jangadas?.[0]?.owner) || "—";
}

function getPrioridadeLabel(prioridade?: string | null) {
  const p = String(prioridade || "").toLowerCase();
  if (p === "critica") return { label: "Crítica", cls: "bg-rose-100 text-rose-700" };
  if (p === "alta") return { label: "Alta", cls: "bg-orange-100 text-orange-700" };
  if (p === "normal") return { label: "Normal", cls: "bg-slate-100 text-slate-600" };
  return { label: prioridade || "—", cls: "bg-slate-100 text-slate-600" };
}

export default function OrcamentosPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<OrcamentoRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const [detailRow, setDetailRow] = useState<OrcamentoRow | null>(null);
  const [detailHistory, setDetailHistory] = useState<InspectionInfo[]>([]);
  const [detailHistoryLoading, setDetailHistoryLoading] = useState(false);
  const [detailHistoryError, setDetailHistoryError] = useState<string | null>(null);

  // Análise / edição do orçamento (o wizard apenas submete; quem decide é aqui)
  const [linhas, setLinhas] = useState<OrcamentoLinha[]>([]);
  const [maoObra, setMaoObra] = useState("0");
  const [desconto, setDesconto] = useState("0");
  const [isentoIva, setIsentoIva] = useState(false);
  const [novo, setNovo] = useState({ referencia: "", descricao: "", quantidade: 1, unitPrice: 0 });
  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [savingAnalise, setSavingAnalise] = useState(false);
  const [decidindo, setDecidindo] = useState(false);
  const [emitindo, setEmitindo] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const loadEditor = (row: OrcamentoRow) => {
    setLinhas(normalizeLinhas(getMeta(row).linhas));
    setMaoObra(String(row.valorMaoObra ?? 0));
    setDesconto(String(row.valorDesconto ?? 0));
    setIsentoIva(Boolean(getMeta(row).isIsentoIva));
    setNovo({ referencia: "", descricao: "", quantidade: 1, unitPrice: 0 });
    setMostrarNovo(false);
    setFeedback(null);
  };

  const openDetail = async (row: OrcamentoRow) => {
    setDetailRow(row);
    loadEditor(row);
    setDetailHistory([]);
    setDetailHistoryError(null);
    const jangadaId = row.jangada?.id || row.jangadas?.[0]?.id || null;
    if (!jangadaId) return;
    setDetailHistoryLoading(true);
    try {
      const res = await fetch(`/api/inspecoes?jangadaId=${jangadaId}`);
      const data = await res.json();
      setDetailHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      setDetailHistoryError("Erro ao carregar o histórico de inspeções.");
    } finally {
      setDetailHistoryLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailRow(null);
    setDetailHistory([]);
    setDetailHistoryError(null);
  };

  const linhasTotal = linhas.reduce((acc, l) => acc + (Number(l.total) || 0), 0);
  const metaTemLinhas = Array.isArray(getMeta(detailRow).linhas);
  const pecasEfetivas = linhas.length > 0 ? linhasTotal : Number(detailRow?.valorPecas || 0);
  const subtotal = Math.max(0, pecasEfetivas + (Number(maoObra) || 0) - (Number(desconto) || 0));
  const ivaValor = isentoIva ? 0 : Math.round(subtotal * getIvaRate() * 100) / 100;
  const totalGeral = Math.round((subtotal + ivaValor) * 100) / 100;

  const orcStatus = detailRow?.orcamentoStatus || "Rascunho";
  const faturaNumero = String(getMeta(detailRow).faturaNumero || "") || null;
  const podeEditar = Boolean(detailRow) && !faturaNumero;

  const aplicarAtualizacao = (updated: OrcamentoRow) => {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
    setDetailRow((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
  };

  const guardarAnalise = async (): Promise<boolean> => {
    if (!detailRow) return false;
    setSavingAnalise(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/ordens-servico/${detailRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linhas: metaTemLinhas || linhas.length > 0 ? linhas : undefined,
          valorMaoObra: Number(maoObra) || 0,
          valorDesconto: Number(desconto) || 0,
          isIsentoIva: isentoIva,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const detalhes = Array.isArray(body?.details) && body.details.length ? `: ${body.details.join("; ")}` : "";
        throw new Error(`${body?.error || "Erro ao guardar o orçamento."}${detalhes}`);
      }
      aplicarAtualizacao(body as OrcamentoRow);
      setFeedback({ type: "ok", text: "Alterações guardadas." });
      return true;
    } catch (e) {
      setFeedback({ type: "err", text: e instanceof Error ? e.message : "Erro ao guardar o orçamento." });
      return false;
    } finally {
      setSavingAnalise(false);
    }
  };

  const decidir = async (novoEstado: "Aprovado" | "Rejeitado") => {
    if (!detailRow) return;
    if (linhas.length === 0) {
      setFeedback({ type: "err", text: "Não existem linhas de orçamento para decidir." });
      return;
    }
    if (novoEstado === "Rejeitado" && !window.confirm("Rejeitar este orçamento? O técnico será notificado para rever e reenviar.")) {
      return;
    }
    setDecidindo(true);
    setFeedback(null);
    try {
      const guardado = await guardarAnalise();
      if (!guardado) return;
      const res = await fetch(`/api/ordens-servico/${detailRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orcamentoStatus: novoEstado }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Erro ao ${novoEstado === "Aprovado" ? "aprovar" : "rejeitar"} o orçamento.`);
      aplicarAtualizacao(body as OrcamentoRow);
      setFeedback({
        type: "ok",
        text: novoEstado === "Aprovado"
          ? "Orçamento aprovado. Já pode emitir a fatura."
          : "Orçamento rejeitado. Aguarda revisão no wizard.",
      });
    } catch (e) {
      setFeedback({ type: "err", text: e instanceof Error ? e.message : "Erro ao decidir o orçamento." });
    } finally {
      setDecidindo(false);
    }
  };

  const emitirFatura = async () => {
    if (!detailRow) return;
    setFeedback(null);
    if (faturaNumero) {
      setFeedback({ type: "err", text: `Já existe a fatura ${faturaNumero} para esta OT.` });
      return;
    }
    if (orcStatus !== "Aprovado") {
      setFeedback({ type: "err", text: "Aprove o orçamento antes de emitir a fatura." });
      return;
    }
    setEmitindo(true);
    try {
      const guardado = await guardarAnalise();
      if (!guardado) return;

      if (detailRow.status !== "concluida") {
        const putRes = await fetch(`/api/ordens-servico/${detailRow.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "concluida" }),
        });
        const putBody = await putRes.json().catch(() => null);
        if (!putRes.ok) throw new Error(putBody?.error || "Não foi possível concluir a ordem de serviço.");
        aplicarAtualizacao(putBody as OrcamentoRow);
      }

      const res = await fetch(`/api/ordens-servico/${detailRow.id}/faturar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagamentoStatus: "Pendente" }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Erro ao emitir a fatura.");

      const numero = (body?.numeroFatura || body?.fatura?.numeroFatura) as string | null;
      const faturaId = Number(body?.fatura?.id) || null;
      setDetailRow((prev) =>
        prev && prev.id === detailRow.id
          ? {
              ...prev,
              metadados: {
                ...(getMeta(prev) as object),
                faturaId,
                faturaNumero: numero,
                faturaEmitidaEm: new Date().toISOString(),
                pagamentoStatus: "Pendente",
              },
            }
          : prev
      );
      setRows((prev) =>
        prev.map((r) =>
          r.id === detailRow.id
            ? {
                ...r,
                metadados: { ...(getMeta(r) as object), faturaId, faturaNumero: numero, faturaEmitidaEm: new Date().toISOString(), pagamentoStatus: "Pendente" },
              }
            : r
        )
      );
      setFeedback({ type: "ok", text: numero ? `Fatura ${numero} emitida com sucesso.` : "Fatura emitida com sucesso." });
      window.open(`/api/ordens-servico/${detailRow.id}/fatura-excel`, "_blank");
    } catch (e) {
      setFeedback({ type: "err", text: e instanceof Error ? e.message : "Erro ao emitir a fatura." });
    } finally {
      setEmitindo(false);
    }
  };

  const adicionarLinha = () => {
    if (!novo.descricao.trim()) return;
    const quantidade = Math.max(1, Number(novo.quantidade) || 1);
    const unitPrice = Math.max(0, Number(novo.unitPrice) || 0);
    setLinhas((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        referencia: novo.referencia.trim(),
        descricao: novo.descricao.trim(),
        quantidade,
        unitPrice,
        total: round2(quantidade * unitPrice),
        source: "manual",
      },
    ]);
    setNovo({ referencia: "", descricao: "", quantidade: 1, unitPrice: 0 });
    setMostrarNovo(false);
  };

  const atualizarLinha = (id: string, patch: Partial<OrcamentoLinha>) => {
    setLinhas((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        next.quantidade = Math.max(0, Number(next.quantidade) || 0);
        next.unitPrice = Math.max(0, Number(next.unitPrice) || 0);
        next.total = round2(next.quantidade * next.unitPrice);
        return next;
      }),
    );
  };

  const removerLinha = (id: string) => setLinhas((prev) => prev.filter((l) => l.id !== id));

  const startWizard = (row: OrcamentoRow) => {
    const jangadaId = row.jangada?.id || row.jangadas?.[0]?.id || null;
    if (!jangadaId) return;
    closeDetail();
    router.push(`/jangadas/${jangadaId}?startInspection=1`);
  };

  const openLastInspection = (row: OrcamentoRow) => {
    const jangadaId = row.jangada?.id || row.jangadas?.[0]?.id || null;
    const lastInspection = detailHistory && detailHistory.length > 0 ? detailHistory[0] : null;
    if (!jangadaId) return;
    if (!lastInspection?.id) {
      alert("Ainda não existe nenhuma vistoria registada para esta jangada.");
      return;
    }
    closeDetail();
    router.push(`/jangadas/${jangadaId}?startInspection=1&inspecaoId=${lastInspection.id}`);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ includeClosed: "1" });
      if (statusFilter) params.set("orcamentoStatus", statusFilter);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/ordens-servico?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || "Erro ao carregar orçamentos.");
        setRows([]);
        return;
      }
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError("Erro ao carregar orçamentos.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, q]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    if (!isAdmin) {
      setError("Apenas administradores podem aceder à área de orçamentos.");
      setLoading(false);
      setRows([]);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setLoading(true) no início do fetch assíncrono controla o estado de carregamento.
    load();
  }, [load, sessionStatus, isAdmin]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const confirmText = window.confirm(
      `Eliminar definitivamente ${ids.length} orçamento(s)/OT(s)?\n\nEsta ação não pode ser anulada.`,
    );
    if (!confirmText) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/ordens-servico/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao eliminar ordens.");
      setSelectedIds(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao eliminar ordens.");
    } finally {
      setDeleting(false);
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="ds-page">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Orçamentos</h1>
            <p className="text-sm text-slate-500">Todas as ordens de serviço com orçamento.</p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStatusFilter("")}
            className={`border px-3 py-1.5 text-sm rounded-lg font-medium ${
              statusFilter === "" ? "border-blue-400 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Todos
          </button>
          {ORCAMENTO_STATUS_LIST.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
              className={`border px-3 py-1.5 text-sm rounded-lg font-medium ${
                statusFilter === s ? "border-blue-400 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {STATUS_LABELS[s] || s}
            </button>
          ))}

          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar jangada, cliente, nº ordem…"
              className="w-72 rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>
        </div>

        {error && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> A carregar orçamentos…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            Sem orçamentos encontrados neste filtro.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => {
              const orcStatus = row.orcamentoStatus || "Rascunho";
              const badge = STATUS_BADGE_CLASSES[orcStatus] || STATUS_BADGE_CLASSES.Rascunho;
              const label = STATUS_LABELS[orcStatus] || orcStatus;
              const cert = row.inspecao?.certificadoNumero || row.latestInspectionSummary?.latestDate;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => openDetail(row)}
                  className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:shadow-md hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <span className="text-xs font-semibold text-slate-400">
                        #{row.numeroOrdem || row.id}
                      </span>
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badge}`}>
                      {label}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-800">{getRaftDisplay(row)}</div>
                  <div className="mt-0.5 text-sm text-slate-500">
                    Embarcação: <span className="font-medium text-slate-600">{getEmbarcacao(row)}</span>
                  </div>
                  {cert && (
                    <div className="mt-0.5 text-xs text-slate-400">
                      {row.inspecao?.certificadoNumero ? (
                        <>Certificado: <span className="font-mono text-slate-500">{row.inspecao.certificadoNumero}</span></>
                      ) : (
                        <>Última inspeção: {formatDateTimeShort(cert)}</>
                      )}
                    </div>
                  )}
                  {row.inspecao?.dataInspecao && (
                    <div className="mt-0.5 text-xs text-slate-400">
                      Inspeção: {formatDateTimeShort(row.inspecao.dataInspecao)}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>Aberto {row.dataAbertura ? formatDateTimeShort(row.dataAbertura) : "—"}</span>
                    {typeof row.valorTotal === "number" && (
                      <span className="font-semibold text-slate-600">€ {row.valorTotal.toFixed(2)}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {detailRow && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="mt-8 w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">
                    OT #{detailRow.numeroOrdem || detailRow.id}
                  </span>
                  {detailRow.grupoNumeroOrdem && (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      Grupo {detailRow.grupoNumeroOrdem}
                    </span>
                  )}
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[detailRow.orcamentoStatus || "Rascunho"] || STATUS_BADGE_CLASSES.Rascunho}`}>
                    {statusLabel(detailRow.orcamentoStatus)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getPrioridadeLabel(detailRow.prioridade).cls}`}>
                    {getPrioridadeLabel(detailRow.prioridade).label}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {detailRow.tipo === "inspecao" ? "Inspeção Periódica" : detailRow.tipo === "reparacao" ? "Reparação" : detailRow.tipo === "manutencao" ? "Manutenção" : "Ordem"} · Aberto {detailRow.dataAbertura ? formatDateTimeShort(detailRow.dataAbertura) : "—"}
                </div>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              {/* Percurso do orçamento: submetido no wizard → analisado/editado aqui → aprovado → fatura */}
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {[
                  { key: "submetido", label: "Submetido" },
                  { key: "analise", label: "Análise e edição" },
                  { key: "aprovado", label: "Aprovado" },
                  { key: "fatura", label: "Fatura" },
                ].map((etapa, idx, arr) => {
                  const estadoAtual = faturaNumero
                    ? "fatura"
                    : orcStatus === "Aprovado"
                      ? "aprovado"
                      : orcStatus === "Rejeitado"
                        ? "analise"
                        : "analise";
                  const ordem = { submetido: 0, analise: 1, aprovado: 2, fatura: 3 } as Record<string, number>;
                  const feita = ordem[etapa.key] <= ordem[estadoAtual];
                  const atual = etapa.key === estadoAtual;
                  return (
                    <Fragment key={etapa.key}>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${
                          atual
                            ? "bg-blue-600 text-white"
                            : feita
                              ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                              : "bg-white text-slate-400 border border-slate-200"
                        }`}
                      >
                        {feita && !atual ? <CheckCircle2 className="h-3 w-3" /> : null}
                        {etapa.label}
                      </span>
                      {idx < arr.length - 1 ? <ChevronRight className="h-3 w-3 text-slate-300" /> : null}
                    </Fragment>
                  );
                })}
              </div>

              {feedback && (
                <div
                  className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
                    feedback.type === "ok"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-rose-200 bg-rose-50 text-rose-700"
                  }`}
                >
                  {feedback.type === "ok" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <span>{feedback.text}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Equipamento</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">{getRaftDisplay(detailRow)}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    Embarcação: <span className="font-medium text-slate-600">{getEmbarcacao(detailRow)}</span>
                  </div>
                  {detailRow.jangada?.numeroObra && (
                    <div className="mt-0.5 text-xs text-slate-500">
                      Nº Obra: <span className="font-mono text-slate-600">{detailRow.jangada.numeroObra}</span>
                    </div>
                  )}
                </div>

                {/* Valores editáveis (análise) */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Valores</div>
                    {faturaNumero && (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        Fatura {faturaNumero}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Mão de obra €</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={maoObra}
                        disabled={!podeEditar}
                        onChange={(e) => setMaoObra(e.target.value)}
                        className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:cursor-not-allowed disabled:bg-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Desconto €</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={desconto}
                        disabled={!podeEditar}
                        onChange={(e) => setDesconto(e.target.value)}
                        className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:cursor-not-allowed disabled:bg-slate-100"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={isentoIva}
                          disabled={!podeEditar}
                          onChange={(e) => setIsentoIva(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        Isento IVA
                      </label>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>Peças / linhas</span>
                      <span className="font-semibold text-slate-800">€ {pecasEfetivas.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span className="font-semibold text-slate-800">€ {subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>IVA ({isentoIva ? "isento" : `${Math.round(getIvaRate() * 100)}%`})</span>
                      <span className="font-semibold text-slate-800">€ {ivaValor.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-1.5 text-sm">
                      <span className="font-bold text-slate-900">Total</span>
                      <span className="font-black text-blue-700">€ {totalGeral.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Linhas do orçamento — análise e edição */}
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <FileText className="h-4 w-4" />
                    Linhas do orçamento
                    {linhas.length > 0 && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        {linhas.length} · € {linhasTotal.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {podeEditar && (
                      <>
                        <button
                          type="button"
                          onClick={() => setMostrarNovo((v) => !v)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Plus className="h-3.5 w-3.5" /> Adicionar linha
                        </button>
                        <button
                          type="button"
                          onClick={guardarAnalise}
                          disabled={savingAnalise}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {savingAnalise ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          Guardar
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {mostrarNovo && (
                  <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-blue-100 bg-blue-50/60 p-3 sm:grid-cols-[110px_1fr_90px_110px_auto]">
                    <input
                      value={novo.referencia}
                      onChange={(e) => setNovo((p) => ({ ...p, referencia: e.target.value }))}
                      placeholder="Referência"
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <input
                      value={novo.descricao}
                      onChange={(e) => setNovo((p) => ({ ...p, descricao: e.target.value }))}
                      placeholder="Descrição"
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <input
                      type="number"
                      min="1"
                      value={novo.quantidade}
                      onChange={(e) => setNovo((p) => ({ ...p, quantidade: Number(e.target.value) || 1 }))}
                      placeholder="Qtd"
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={novo.unitPrice}
                      onChange={(e) => setNovo((p) => ({ ...p, unitPrice: Number(e.target.value) || 0 }))}
                      placeholder="Preço €"
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <button
                      type="button"
                      onClick={adicionarLinha}
                      disabled={!novo.descricao.trim()}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Adicionar
                    </button>
                  </div>
                )}

                {linhas.length === 0 ? (
                  <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    Sem linhas de orçamento registadas. Use “Adicionar linha” ou abra a vistoria no wizard para gerar
                    as linhas a partir das substituições.
                  </div>
                ) : (
                  <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Artigo</th>
                          <th className="w-20 px-2 py-2 text-right font-semibold">Qtd</th>
                          <th className="w-28 px-2 py-2 text-right font-semibold">Preço €</th>
                          <th className="w-28 px-2 py-2 text-right font-semibold">Total €</th>
                          <th className="w-10 px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {linhas.map((linha) => (
                          <tr key={linha.id}>
                            <td className="px-3 py-2">
                              <div className="font-bold text-slate-800">{linha.referencia || "—"}</div>
                              <div className="text-slate-500">{linha.descricao}</div>
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={linha.quantidade}
                                disabled={!podeEditar}
                                onChange={(e) => atualizarLinha(linha.id, { quantidade: Number(e.target.value) || 0 })}
                                className="w-full rounded-lg border border-slate-300 px-1.5 py-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:cursor-not-allowed disabled:bg-slate-100"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={linha.unitPrice}
                                disabled={!podeEditar}
                                onChange={(e) => atualizarLinha(linha.id, { unitPrice: Number(e.target.value) || 0 })}
                                className="w-full rounded-lg border border-slate-300 px-1.5 py-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:cursor-not-allowed disabled:bg-slate-100"
                              />
                            </td>
                            <td className="px-2 py-2 text-right font-semibold text-slate-800">€ {Number(linha.total || 0).toFixed(2)}</td>
                            <td className="px-2 py-2 text-center">
                              {podeEditar && (
                                <button
                                  type="button"
                                  onClick={() => removerLinha(linha.id)}
                                  className="text-slate-400 hover:text-rose-600"
                                  aria-label="Remover linha"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {detailRow.inspecao && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    <FileText className="h-4 w-4" />
                    Inspeção de origem
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="text-sm text-slate-700">
                      Certificado: <span className="font-mono font-semibold text-slate-900">{detailRow.inspecao.certificadoNumero || "—"}</span>
                    </div>
                    <div className="text-sm text-slate-700">
                      Data: {detailRow.inspecao.dataInspecao ? formatDateTimeShort(detailRow.inspecao.dataInspecao) : "—"}
                    </div>
                    <div className="text-sm text-slate-700">
                      Estado: <span className="font-medium text-slate-800">{detailRow.inspecao.status || "—"}</span>
                    </div>
                    <div className="text-sm text-slate-700">
                      Próx. inspeção: {detailRow.inspecao.dataProxInspecao ? formatDateTimeShort(detailRow.inspecao.dataProxInspecao) : "—"}
                    </div>
                  </div>
                  {(() => {
                    const testes = ["testeWP", "testeNAP", "testeFS", "testeGI", "testeDL"] as const;
                    const labels: Record<string, string> = { testeWP: "WP", testeNAP: "NAP", testeFS: "FS", testeGI: "GI", testeDL: "DL" };
                    const reprovados = testes.filter((t) => {
                      const v = String(detailRow.inspecao?.[t] || "").toUpperCase();
                      return v === "REPROVOU" || v === "REPROVADO";
                    });
                    if (reprovados.length > 0) {
                      return (
                        <div className="mt-2 text-xs font-semibold text-rose-600">
                          Testes reprovados: {reprovados.map((t) => labels[t]).join(", ")}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <History className="h-4 w-4" />
                  Histórico de inspeções
                </div>
                {detailHistoryLoading ? (
                  <div className="flex items-center gap-2 py-3 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> A carregar histórico…
                  </div>
                ) : detailHistoryError ? (
                  <div className="py-3 text-sm text-rose-600">{detailHistoryError}</div>
                ) : detailHistory.length === 0 ? (
                  <div className="py-3 text-sm text-slate-400">Sem inspeções registadas.</div>
                ) : (
                  <ul className="mt-2 divide-y divide-slate-100">
                    {detailHistory.slice(0, 8).map((insp) => (
                      <li key={insp.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <div>
                          <span className="font-mono font-semibold text-slate-700">{insp.certificadoNumero || "—"}</span>
                          <span className="ml-2 text-slate-500">{insp.dataInspecao ? formatDateTimeShort(insp.dataInspecao) : ""}</span>
                          {(() => {
                            const testes = ["testeWP", "testeNAP", "testeFS", "testeGI", "testeDL"] as const;
                            const reprovados = testes.filter((t) => {
                              const v = String(insp[t] || "").toUpperCase();
                              return v === "REPROVOU" || v === "REPROVADO";
                            });
                            return reprovados.length > 0 ? (
                              <span className="ml-2 text-xs font-semibold text-rose-600">Reprovou</span>
                            ) : null;
                          })()}
                        </div>
                        <span className={`text-xs font-medium ${String(insp.status || "").toUpperCase() === "CONCLUÍDA" || String(insp.status || "").toUpperCase() === "CONCLUIDA" ? "text-emerald-600" : "text-slate-400"}`}>
                          {insp.status || "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={guardarAnalise}
                  disabled={!podeEditar || savingAnalise}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savingAnalise ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Guardar alterações
                </button>
                <button
                  type="button"
                  onClick={() => decidir("Aprovado")}
                  disabled={decidindo || savingAnalise || !!faturaNumero || orcStatus === "Aprovado"}
                  title={faturaNumero ? "Já existe fatura emitida" : orcStatus === "Aprovado" ? "Orçamento já aprovado" : "Aprovar orçamento e libertar faturação"}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {decidindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Aprovar
                </button>
                <button
                  type="button"
                  onClick={() => decidir("Rejeitado")}
                  disabled={decidindo || savingAnalise || !!faturaNumero || orcStatus === "Rejeitado"}
                  title={faturaNumero ? "Já existe fatura emitida" : orcStatus === "Rejeitado" ? "Orçamento já rejeitado" : "Rejeitar e devolver ao wizard"}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {decidindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                  Rejeitar
                </button>
                <button
                  type="button"
                  onClick={emitirFatura}
                  disabled={emitindo || !podeEditar || orcStatus !== "Aprovado" || !!faturaNumero}
                  title={
                    faturaNumero
                      ? `Fatura ${faturaNumero} já emitida`
                      : orcStatus !== "Aprovado"
                        ? "Aprove primeiro o orçamento"
                        : "Emitir fatura desta ordem"
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {emitindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  {faturaNumero ? `Fatura ${faturaNumero}` : "Emitir fatura"}
                </button>
                {(() => {
                  const jangadaId = detailRow.jangada?.id || detailRow.jangadas?.[0]?.id || null;
                  return jangadaId ? (
                    <>
                      <Link
                        href={`/jangadas/${jangadaId}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <ExternalLink className="h-4 w-4" /> Abrir jangada
                      </Link>
                      <button
                        type="button"
                        onClick={() => startWizard(detailRow)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                      >
                        <ClipboardCheck className="h-4 w-4" /> Nova Vistoria
                      </button>
                      <button
                        type="button"
                        onClick={() => openLastInspection(detailRow)}
                        disabled={!detailHistory || detailHistory.length === 0}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <History className="h-4 w-4" /> Vistoria Registada
                      </button>
                    </>
                  ) : null;
                })()}
                {detailRow.inspecaoId && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                    <ArrowRightCircle className="h-4 w-4" /> Inspeção {detailRow.inspecaoId} · Certificado {detailRow.inspecao?.certificadoNumero || "—"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto w-full max-w-3xl">
          <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 shadow-lg">
            <span className="text-sm font-semibold text-rose-700">{selectedIds.size} selecionada(s)</span>
            <div className="flex items-center gap-2">
              <button
                onClick={clearSelection}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Limpar seleção
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting ? "A eliminar…" : "Eliminar selecionadas"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}