"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search, X, ClipboardCheck, History, FileText, ExternalLink, ArrowRightCircle } from "lucide-react";
import { formatDateTimeShort } from "@/lib/date-utils";

const ORCAMENTO_STATUS_LIST = ["Rascunho", "Enviado", "Aprovado", "Rejeitado"];

const STATUS_LABELS: Record<string, string> = {
  Rascunho: "Orçamento em rascunho",
  Enviado: "Orçamento em análise",
  Pendente: "Orçamento em análise",
  Aprovado: "Orçamento aprovado",
  Rejeitado: "Orçamento rejeitado",
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  Rascunho: "bg-slate-100 text-slate-700 border-slate-300",
  Enviado: "bg-amber-50 text-amber-800 border-amber-300",
  Pendente: "bg-amber-50 text-amber-800 border-amber-300",
  Aprovado: "bg-emerald-50 text-emerald-800 border-emerald-300",
  Rejeitado: "bg-rose-50 text-rose-800 border-rose-300",
};

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

  const openDetail = async (row: OrcamentoRow) => {
    setDetailRow(row);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setLoading(true) no início do fetch assíncrono controla o estado de carregamento.
    load();
  }, [load]);

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
      <div className="mx-auto max-w-6xl">
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
          <div className="mt-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
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
                    {STATUS_LABELS[detailRow.orcamentoStatus || "Rascunho"] || detailRow.orcamentoStatus}
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
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Valores</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-lg font-bold text-slate-800">€ {Number(detailRow.valorTotal || 0).toFixed(2)}</span>
                    <span className="text-xs text-slate-400">total</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Peças: € {Number(detailRow.valorPecas || 0).toFixed(2)} · Mão de obra: € {Number(detailRow.valorMaoObra || 0).toFixed(2)} · Desconto: € {Number(detailRow.valorDesconto || 0).toFixed(2)}
                  </div>
                </div>
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