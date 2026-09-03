"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2, Search, CreditCard, AlertTriangle, CheckCircle2, Wallet,
  Building2, MapPin, MessageSquare, RefreshCcw, Download, FileText, TrendingUp
} from "lucide-react";
import { formatDateTimeShort } from "@/lib/date-utils";
import { getCanonicalNavioLocationLabel } from "@/lib/navios-page-helpers";
import { useWhatsAppAllowed, WHATSAPP_ALLOWED_USER_EMAIL } from "@/lib/use-whatsapp-allowed";

const PAGAMENTO_STATUS_LIST = ["Pendente", "Pago Parcialmente", "Pago", "Vencido"];

const PAGAMENTO_BADGE_CLASSES: Record<string, string> = {
  Pendente: "bg-amber-100 text-amber-700 border-amber-200",
  "Pago Parcialmente": "bg-blue-100 text-blue-700 border-blue-200",
  Pago: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Vencido: "bg-rose-100 text-rose-700 border-rose-200",
  Cancelado: "bg-slate-100 text-slate-500 border-slate-200",
};

const PAYMENT_TERMS_DAYS = 30;

type FaturaItem = {
  id: number;
  numeroFatura: string;
  cliente: { id: number; nome: string; numeroCliente: string | null; ilha?: string | null } | null;
  valorTotal: number;
  pagamentoStatus: string;
  dataEmissao: string;
  cancelada: boolean;
  notaCredito: { numeroNotaCredito: string; dataEmissao: string } | null;
  numeroRecibo: string | null;
  ordemServicos: Array<{
    id: number;
    numeroOrdem: string;
    dataConclusao: string | null;
    serviceStation: string | null;
    jangada: { label: string; owner: string | null; shipNameManual: string | null } | null;
  }>;
};

function getDueDate(fatura: FaturaItem) {
  if (!fatura.dataEmissao) return null;
  const d = new Date(fatura.dataEmissao);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + PAYMENT_TERMS_DAYS);
  return d;
}

function getDiasVencido(fatura: FaturaItem) {
  const due = getDueDate(fatura);
  if (!due) return 0;
  const diff = Math.floor((Date.now() - due.getTime()) / 86400000);
  return Math.max(0, diff);
}

function getEffectiveStatus(fatura: FaturaItem) {
  if (fatura.cancelada) return "Cancelado";
  const manual = fatura.pagamentoStatus;
  if (manual === "Pago") return "Pago";
  if (getDiasVencido(fatura) > 0 && manual !== "Pago Parcialmente") return "Vencido";
  return manual;
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

export default function ContasReceberPage() {
  const { allowed: whatsappAllowed } = useWhatsAppAllowed();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FaturaItem[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [stationFilter, setStationFilter] = useState("");
  const [islandFilter, setIslandFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/faturas`, { cache: "no-store" });
      if (!res.ok) throw new Error("Falha ao carregar faturas.");
      const data = await res.json();
      setRows(Array.isArray(data.faturas) ? data.faturas : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setLoading(true) no início do fetch assíncrono controla o estado de carregamento.
    load();
  }, [load]);

  const invoices = useMemo(() => rows.filter((f) => !f.cancelada), [rows]);

  const stations = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((f) => {
      f.ordemServicos.forEach((os) => {
        if (os.serviceStation) set.add(os.serviceStation);
      });
    });
    return Array.from(set).sort();
  }, [invoices]);

  const islands = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((f) => {
      if (f.cliente?.ilha) set.add(f.cliente.ilha);
    });
    return Array.from(set).sort();
  }, [invoices]);

  const filtered = useMemo(() => {
    return invoices.filter((f) => {
      const eff = getEffectiveStatus(f);
      if (statusFilter && eff !== statusFilter) return false;
      if (stationFilter && !f.ordemServicos.some((os) => os.serviceStation === stationFilter)) return false;
      if (islandFilter && (f.cliente?.ilha || "") !== islandFilter) return false;
      if (q.trim()) {
        const hay = `${f.numeroFatura} ${f.cliente?.nome || ""} ${f.ordemServicos.map((os) => os.numeroOrdem).join(" ")} ${f.ordemServicos.map((os) => os.jangada?.owner || "").join(" ")} ${f.ordemServicos.map((os) => os.jangada?.shipNameManual || "").join(" ")}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, stationFilter, islandFilter, q]);

  const summary = useMemo(() => {
    let vencido = 0, pago = 0, parcial = 0;
    filtered.forEach((f) => {
      const eff = getEffectiveStatus(f);
      const v = Number(f.valorTotal || 0);
      if (eff === "Pago") pago += v;
      else if (eff === "Vencido") vencido += v;
      else if (eff === "Pago Parcialmente") parcial += v;
    });
    const emDivida = filtered.filter((f) => getEffectiveStatus(f) !== "Pago").reduce((a, f) => a + Number(f.valorTotal || 0), 0);
    const countEmDivida = filtered.filter((f) => getEffectiveStatus(f) !== "Pago").length;
    return { emDivida, vencido, pago, parcial, countEmDivida };
  }, [filtered]);

  const setPaymentStatus = async (faturaId: number, status: string) => {
    setSavingId(faturaId);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/faturas/${faturaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagamentoStatus: status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Falha ao atualizar estado de pagamento.");
      }
      setRows((prev) => prev.map((f) => (f.id === faturaId ? { ...f, pagamentoStatus: status } : f)));
      setSuccess(`Estado de pagamento atualizado para "${status}".`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar estado.");
    } finally {
      setSavingId(null);
    }
  };

  const sendWhatsAppReminder = (f: FaturaItem) => {
    if (!whatsappAllowed) {
      window.alert(`WhatsApp disponível apenas para o administrador ${WHATSAPP_ALLOWED_USER_EMAIL}.`);
      return;
    }
    const clientName = f.cliente?.nome || f.ordemServicos[0]?.jangada?.owner || "Cliente";
    const text = encodeURIComponent(
      `Olá ${clientName}, lembramos que a fatura ${f.numeroFatura} no valor de ${formatEuro(Number(f.valorTotal || 0))} continua em aberto. Agradecemos o pagamento. Obrigado!`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-teal-50 border border-teal-200 p-2.5 text-teal-600">
            <CreditCard size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Contas a Receber</h1>
            <p className="text-xs text-slate-500">Faturas registadas e controlo de pagamentos por cliente e estação</p>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
        >
          <RefreshCcw size={14} /> Atualizar
        </button>
      </header>

      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">Em Dívida (Filtro)</span>
                <Wallet size={18} className="text-amber-500" />
              </div>
              <div className="text-2xl font-black font-mono text-slate-900">{formatEuro(summary.emDivida)}</div>
              <div className="text-xs text-amber-600">{summary.countEmDivida} faturas em aberto</div>
            </div>

            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">Vencido</span>
                <AlertTriangle size={18} className="text-rose-500" />
              </div>
              <div className="text-2xl font-black font-mono text-slate-900">{formatEuro(summary.vencido)}</div>
              <div className="text-xs text-rose-600">Além dos {PAYMENT_TERMS_DAYS} dias de prazo</div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">Pago Parcialmente</span>
                <TrendingUp size={18} className="text-blue-500" />
              </div>
              <div className="text-2xl font-black font-mono text-slate-900">{formatEuro(summary.parcial)}</div>
              <div className="text-xs text-blue-600">Faturas com pagamento parcial</div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Pago</span>
                <CheckCircle2 size={18} className="text-emerald-500" />
              </div>
              <div className="text-2xl font-black font-mono text-slate-900">{formatEuro(summary.pago)}</div>
              <div className="text-xs text-emerald-600">Faturas liquidadas</div>
            </div>
          </div>

          {/* Filters */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Pesquisar nº fatura, cliente, OT, embarcação..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-none"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:border-teal-500 focus:outline-none"
            >
              <option value="">Estado: Todos</option>
              {PAGAMENTO_STATUS_LIST.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <select
              value={stationFilter}
              onChange={(e) => setStationFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:border-teal-500 focus:outline-none"
            >
              <option value="">Estação: Todas</option>
              {stations.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <select
              value={islandFilter}
              onChange={(e) => setIslandFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:border-teal-500 focus:outline-none"
            >
              <option value="">Ilha: Todas</option>
              {islands.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-center gap-2">
              <AlertTriangle size={16} /> {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 flex items-center gap-2">
              <CheckCircle2 size={16} /> {success}
            </div>
          )}

          {/* Table */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
                <Loader2 className="animate-spin" size={18} /> A carregar faturas...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-sm">
                {invoices.length === 0
                  ? "Ainda não existem faturas registadas (emita faturas a partir da consola de faturação)."
                  : "Nenhuma fatura corresponde aos filtros selecionados."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                      <th className="p-3">Fatura / Cliente</th>
                      <th className="p-3">Estação · Ilha</th>
                      <th className="p-3">Data Emissão</th>
                      <th className="p-3 text-right">Valor</th>
                      <th className="p-3">Dias Venc.</th>
                      <th className="p-3">Estado de Pagamento</th>
                      <th className="p-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((f) => {
                      const eff = getEffectiveStatus(f);
                      const dias = getDiasVencido(f);
                      const clientName = f.cliente?.nome || f.ordemServicos[0]?.jangada?.owner || "Cliente Particular";
                      const otId = f.ordemServicos[0]?.id ?? null;
                      return (
                        <tr key={f.id} className="hover:bg-slate-50">
                          <td className="p-3">
                            <div className="font-mono font-bold text-teal-600">{f.numeroFatura}</div>
                            <div className="text-xs font-semibold text-slate-700">{clientName}</div>
                            <div className="text-xs text-slate-500">
                              {f.ordemServicos.length > 1 ? `${f.ordemServicos.length} OTs` : f.ordemServicos[0]?.numeroOrdem || "—"}
                              {" · "}{f.ordemServicos[0]?.jangada?.shipNameManual || "—"}
                            </div>
                          </td>
                          <td className="p-3 text-xs text-slate-500">
                            <div className="flex items-center gap-1.5"><Building2 size={12} /> {f.ordemServicos[0]?.serviceStation || "—"}</div>
                            <div className="flex items-center gap-1.5 mt-1"><MapPin size={12} /> {(getCanonicalNavioLocationLabel(f.cliente?.ilha) || f.cliente?.ilha) || "—"}</div>
                          </td>
                          <td className="p-3 text-xs text-slate-500">
                            {f.dataEmissao ? formatDateTimeShort(f.dataEmissao) : "—"}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-800">{formatEuro(Number(f.valorTotal || 0))}</td>
                          <td className="p-3 text-center">
                            {eff === "Pago" ? (
                              <span className="text-emerald-600">—</span>
                            ) : (
                              <span className={`font-mono font-bold ${dias > 0 ? "text-rose-600" : "text-slate-500"}`}>{dias}</span>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-col gap-1.5">
                              <select
                                value={f.pagamentoStatus}
                                disabled={savingId === f.id}
                                onChange={(e) => setPaymentStatus(f.id, e.target.value)}
                                className={`rounded-lg border px-2 py-1 text-xs font-semibold bg-white focus:outline-none ${PAGAMENTO_BADGE_CLASSES[f.pagamentoStatus] || PAGAMENTO_BADGE_CLASSES.Pendente}`}
                              >
                                {PAGAMENTO_STATUS_LIST.map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                              {eff === "Vencido" && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600">
                                  <AlertTriangle size={10} /> Vencido
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center justify-end gap-1.5">
                              {otId && (
                                <>
                                  <a
                                    href={`/api/ordens-servico/${otId}/fatura-excel`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Descarregar fatura Excel"
                                    className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-teal-600 transition"
                                  >
                                    <Download size={14} />
                                  </a>
                                  <a
                                    href={`/api/ordens-servico/${otId}/fatura-pdf`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Descarregar fatura PDF"
                                    className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-rose-600 transition"
                                  >
                                    <FileText size={14} />
                                  </a>
                                  <a
                                    href={`/api/ordens-servico/${otId}/recibo-excel`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Descarregar recibo Excel"
                                    className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-sky-600 transition"
                                  >
                                    <FileText size={14} />
                                  </a>
                                </>
                              )}
                              <button
                                onClick={() => sendWhatsAppReminder(f)}
                                title="Enviar lembrete por WhatsApp"
                                className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-600 hover:bg-emerald-100 transition"
                              >
                                <MessageSquare size={14} />
                              </button>
                              {eff !== "Pago" && (
                                <button
                                  onClick={() => setPaymentStatus(f.id, "Pago")}
                                  disabled={savingId === f.id}
                                  title="Marcar como pago"
                                  className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50"
                                >
                                  {savingId === f.id ? <Loader2 size={12} className="animate-spin" /> : "Pagar"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
