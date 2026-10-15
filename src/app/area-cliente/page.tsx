"use client";

import React, { useEffect, useState } from "react";
import {
  Anchor,
  Ship,
  FileText,
  CalendarClock,
  AlertTriangle,
  ShieldCheck,
  Wrench,
  Loader2,
  ExternalLink,
  Clock,
  LogIn,
  LogOut,
} from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { formatDate } from "@/lib/date-utils";
import { INSPECTION_STATUS_STYLES, type InspectionStatusColor } from "@/lib/inspection-status";
import ClienteNaviosPanel from "./ClienteNaviosPanel";
import ClienteJangadasPanel from "./ClienteJangadasPanel";
import ClienteFichaPanel from "./ClienteFichaPanel";

type SearchMode = "nif" | "codigo";

type JangadaEstado = {
  id: number;
  serial: string;
  brand: string;
  model: string;
  capacity: number;
  owner: string;
  navioId?: number | null;
  navioNome: string | null;
  tipoPesca?: string | null;
  isPesca?: boolean;
  dataInspecao: string | null;
  dataProxInspecao: string | null;
  status: { label: string; color: InspectionStatusColor; daysLeft: number | null };
  diasParaProxima: number | null;
  ultimoCertificadoNumero: string | null;
  certificadoExternoNumero: string | null;
  certificadoExternoUrl: string | null;
  certificadoPdfUrl: string | null;
  certificadoPdfPublicUrl?: string | null;
  hruReferencia: string | null;
  hruValidade: string | null;
  hruValidadeDias?: number | null;
  diasHru: number | null;
  radarReflector: string | null;
  radarReflectorValidade: string | null;
  diasRadarReflector: number | null;
  cylinderSistema: string | null;
  cylinderDataTeste: string | null;
  cylinderDataProxTeste: string | null;
  diasProxTesteCilindro: number | null;
  workflowStatus?: {
    state: "SEM_ESTADO" | "RECEIONADA" | "EM_INSPECAO" | "FINALIZADA" | "OUTRO";
    label: string;
    dataHora?: string | null;
    queueStatus?: string | null;
  };
};

type OrdemServicoResumo = {
  id: number;
  numeroOrdem: string | null;
  status: string;
  orcamentoStatus: string | null;
  valorTotal: number | null;
  createdAt: string;
  dataConclusao: string | null;
  jangada: { id: number; serial: string; brand: string; model: string } | null;
};

type FaturaResumo = {
  id: number;
  numeroFatura: string;
  valorTotal: number;
  valorPago: number;
  pagamentoStatus: string;
  dataEmissao: string;
  cancelada: boolean;
  motivoCancelamento: string | null;
  numeroNotaCredito: string | null;
  numeroRecibo: string | null;
  ordemServicos: Array<{
    id: number;
    numeroOrdem: string;
    jangada: { id: number; serial: string; brand: string; model: string } | null;
  }>;
};
type PedidoCliente = { id: number; tipoAssistencia: string | null; descricao: string; dataPreferida?: string | null; estado: string; createdAt: string };

type RespostaClienteAuth = {
  cliente: {
    id: number;
    nome: string;
    nif: string | null;
    numeroCliente: string | null;
    email: string | null;
    telefone: string | null;
    telmovel: string | null;
    morada: string | null;
    moradaNumero: string | null;
    codigoPostal: string | null;
    localidade: string | null;
    ilha: string | null;
  };
  navios: Array<{ id: number; nome: string; matricula?: string; ilha?: string; tipoPesca?: string }>;
  jangadas: JangadaEstado[];
  ordensServico: OrdemServicoResumo[];
  faturas: FaturaResumo[];
  resumoFaturas: { totalFaturas: number; totalFaturado: number; totalRecebido: number; totalEmDivida: number };
};

const statusLabelExtra: Record<InspectionStatusColor, string> = {
  green: "Inspeção em dia",
  yellow: "GI a aproximar-se",
  orange: "GI urgente",
  red: "INSPEÇÃO EXPIRADA",
  gray: "Sem inspeção registada",
};

function formatDias(dias: number | null): string {
  if (dias === null || dias === undefined) return "—";
  if (dias < 0) return `há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"}`;
  if (dias === 0) return "hoje";
  return `em ${dias} dia${dias === 1 ? "" : "s"}`;
}

export default function AreaClientePage() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const previewClienteId = session?.user?.role === "ADMIN" ? searchParams.get("previewClienteId") : null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespostaClienteAuth | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([]);
  const [pedidoForm, setPedidoForm] = useState({ motivo: "Assistência técnica", descricao: "", prioridade: "normal", jangadaId: "", navioId: "", dataPreferida: "" });
  const [pedidoBusy, setPedidoBusy] = useState(false);
  const [pedidoMessage, setPedidoMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const query = previewClienteId ? `?previewClienteId=${encodeURIComponent(previewClienteId)}` : "";
    Promise.all([
      fetch(`/api/portal/me${query}`, { cache: "no-store" }).then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Erro ao carregar a sua área.");
        return json;
      }),
      fetch("/api/portal/pedidos-assistencia", { cache: "no-store" }).then((res) => res.ok ? res.json() : { pedidos: [] }),
    ])
      .then(async (res) => {
        if (!cancelled) { setResultado(res[0]); setPedidos(res[1].pedidos || []); }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar a sua área.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setHasSearched(true);
      });
    return () => {
      cancelled = true;
    };
  }, [previewClienteId, status]);

  const pedirAssistencia = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resultado || !pedidoForm.descricao.trim()) return;
    setPedidoBusy(true); setPedidoMessage(null);
    try {
      const res = await fetch("/api/portal/pedidos-assistencia", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId: resultado.cliente.id, jangadaId: pedidoForm.jangadaId || undefined, navioId: pedidoForm.navioId || undefined, motivo: pedidoForm.motivo, descricao: pedidoForm.descricao, prioridade: pedidoForm.prioridade, dataPreferida: pedidoForm.dataPreferida || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível enviar o pedido.");
      setPedidos((current) => [{ ...data.pedido, createdAt: data.pedido.createdAt }, ...current]);
      setPedidoForm({ motivo: "Assistência técnica", descricao: "", prioridade: "normal", jangadaId: "", navioId: "", dataPreferida: "" });
      setPedidoMessage("Pedido enviado. A nossa equipa irá responder logo que possível.");
    } catch (error) { setPedidoMessage(error instanceof Error ? error.message : "Erro ao enviar pedido."); }
    finally { setPedidoBusy(false); }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-slate-50 to-indigo-50">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  if (status !== "authenticated") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-slate-50 to-indigo-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/60 shadow-sm p-8 text-center">
          <div className="mx-auto w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-md shadow-indigo-600/20">
            <Anchor size={24} />
          </div>
          <h1 className="mt-4 text-xl font-extrabold text-slate-800">Área do Cliente</h1>
          <p className="mt-2 text-sm text-slate-500">
             Inicie sessão com o seu email e código para consultar jangadas, certificados, serviços e faturas.
          </p>
          <a
            href="/login?callbackUrl=%2Farea-cliente"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-indigo-700"
          >
            <LogIn size={18} /> Iniciar sessão
          </a>
        </div>
      </div>
    );
  }

  const jangadasComAlerta = resultado?.jangadas.filter((jangada) =>
    jangada.status.color === "red" || jangada.status.color === "orange" || jangada.status.color === "yellow",
  ).length ?? 0;
  const servicosAtivos = resultado?.ordensServico.filter((ordem) =>
    !["CONCLUIDA", "CONCLUÍDA", "CANCELADA", "CANCELADO"].includes(String(ordem.status || "").toUpperCase()),
  ).length ?? 0;
  const totalEmDivida = resultado?.resumoFaturas.totalEmDivida ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-slate-50 to-indigo-50">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
          <section className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 sm:p-8">
            {previewClienteId && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                <span>Pré-visualização administrativa do portal do cliente.</span>
                <a href={`/clientes/${previewClienteId}`} className="rounded-lg bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700">Voltar à ficha</a>
              </div>
            )}
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-indigo-600 text-white rounded-xl p-2.5 shadow-md shadow-indigo-600/20">
              <Anchor size={22} />
            </div>
            <div>
              <p className="text-sm font-extrabold text-slate-800 leading-tight">Orey Açores</p>
              <p className="text-xs text-slate-500 font-medium">Área do Cliente</p>
            </div>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800">
                Bem-vindo{resultado?.cliente?.nome ? `, ${resultado.cliente.nome}` : ""}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Consulte aqui o estado das suas jangadas, certificados, serviços e faturas.
              </p>
            </div>
            {session?.user?.email && (
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
              >
                <LogOut size={16} /> Terminar sessão
              </button>
            )}
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">
              <AlertTriangle size={18} className="shrink-0" />
              <p className="text-sm font-semibold">{error}</p>
            </div>
          )}

          {hasSearched && !loading && !error && resultado && resultado.jangadas.length === 0 && (
            <div className="mt-4 flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <ShieldCheck size={18} className="shrink-0" />
              <p className="text-sm font-semibold">Este cliente não tem jangadas registadas no sistema.</p>
            </div>
          )}
        </section>

        {resultado && !loading && (
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Jangadas</p>
              <p className="mt-2 text-2xl sm:text-3xl font-black text-indigo-950">{resultado.jangadas.length}</p>
              <p className="mt-1 text-xs font-semibold text-indigo-700">equipamentos associados</p>
            </div>
            <div className={`rounded-2xl border p-4 sm:p-5 ${jangadasComAlerta > 0 ? "border-amber-200 bg-amber-50" : "border-emerald-100 bg-emerald-50"}`}>
              <p className={`text-xs font-bold uppercase tracking-wide ${jangadasComAlerta > 0 ? "text-amber-700" : "text-emerald-700"}`}>Atenção</p>
              <p className={`mt-2 text-2xl sm:text-3xl font-black ${jangadasComAlerta > 0 ? "text-amber-950" : "text-emerald-950"}`}>{jangadasComAlerta}</p>
              <p className={`mt-1 text-xs font-semibold ${jangadasComAlerta > 0 ? "text-amber-700" : "text-emerald-700"}`}>{jangadasComAlerta ? "validade a acompanhar" : "tudo em dia"}</p>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-sky-600">Serviços</p>
              <p className="mt-2 text-2xl sm:text-3xl font-black text-sky-950">{servicosAtivos}</p>
              <p className="mt-1 text-xs font-semibold text-sky-700">ordens em acompanhamento</p>
            </div>
            <div className={`rounded-2xl border p-4 sm:p-5 ${totalEmDivida > 0 ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}>
              <p className={`text-xs font-bold uppercase tracking-wide ${totalEmDivida > 0 ? "text-rose-700" : "text-slate-500"}`}>Conta corrente</p>
              <p className={`mt-2 text-xl sm:text-2xl font-black ${totalEmDivida > 0 ? "text-rose-950" : "text-slate-900"}`}>{totalEmDivida.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}</p>
              <p className={`mt-1 text-xs font-semibold ${totalEmDivida > 0 ? "text-rose-700" : "text-slate-500"}`}>{totalEmDivida > 0 ? "valor em dívida" : "sem valores pendentes"}</p>
            </div>
          </section>
        )}

        {resultado && !loading && (
          <ClienteJangadasPanel navios={resultado.navios} jangadas={resultado.jangadas} />
        )}

        {resultado && !loading && (
          <ClienteNaviosPanel navios={resultado.navios} />
        )}

        {resultado && !loading && (
          <ClienteFichaPanel cliente={resultado.cliente} />
        )}

        {resultado && !loading && (
          <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4">
            <form onSubmit={pedirAssistencia} className="rounded-3xl border border-indigo-100 bg-white p-6 sm:p-8 shadow-sm space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Assistência</p>
                <h2 className="mt-1 text-lg font-extrabold text-slate-800">Precisa de ajuda?</h2>
                <p className="mt-1 text-sm text-slate-500">Envie um pedido diretamente à nossa equipa.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select value={pedidoForm.motivo} onChange={(e) => setPedidoForm({ ...pedidoForm, motivo: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-medium text-slate-700">
                  <option>Assistência técnica</option><option>Agendar inspeção</option><option>Pedido de documento</option><option>Faturação</option><option>Outro assunto</option>
                </select>
                <select value={pedidoForm.prioridade} onChange={(e) => setPedidoForm({ ...pedidoForm, prioridade: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-medium text-slate-700">
                  <option value="normal">Prioridade normal</option><option value="urgente">Urgente</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select value={pedidoForm.navioId} onChange={(e) => setPedidoForm({ ...pedidoForm, navioId: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-medium text-slate-700">
                  <option value="">Selecionar navio (opcional)</option>
                  {resultado.navios.map((navio) => <option key={navio.id} value={navio.id}>{navio.nome}{navio.matricula ? ` · ${navio.matricula}` : ""}</option>)}
                </select>
                <select value={pedidoForm.jangadaId} onChange={(e) => setPedidoForm({ ...pedidoForm, jangadaId: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-medium text-slate-700">
                  <option value="">Selecionar jangada (opcional)</option>
                  {resultado.jangadas.map((jangada) => <option key={jangada.id} value={jangada.id}>{jangada.brand} {jangada.model} · {jangada.serial}</option>)}
                </select>
              </div>
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
                Data preferida para a intervenção (opcional)
                <input type="date" value={pedidoForm.dataPreferida} onChange={(e) => setPedidoForm({ ...pedidoForm, dataPreferida: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-medium text-slate-700" />
              </label>
              <textarea value={pedidoForm.descricao} onChange={(e) => setPedidoForm({ ...pedidoForm, descricao: e.target.value })} required rows={4} placeholder="Descreva o que necessita..." className="w-full resize-none rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
              <div className="flex items-center justify-between gap-3">
                {pedidoMessage && <p className="text-xs font-semibold text-indigo-700">{pedidoMessage}</p>}
                <button disabled={pedidoBusy} className="ml-auto rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50">{pedidoBusy ? "A enviar..." : "Enviar pedido"}</button>
              </div>
            </form>
            <div className="rounded-3xl border border-slate-200/60 bg-white p-6 sm:p-8 shadow-sm">
              <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Pedidos recentes</p><h2 className="mt-1 text-lg font-extrabold text-slate-800">Acompanhamento</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{pedidos.length}</span></div>
              <div className="mt-5 space-y-3">
                {pedidos.length === 0 ? <p className="text-sm text-slate-500">Ainda não existem pedidos de assistência.</p> : pedidos.slice(0, 4).map((pedido) => <div key={pedido.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-bold text-slate-700">{pedido.tipoAssistencia || "Assistência"}</p><span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-700">{pedido.estado}</span></div><p className="mt-1 line-clamp-2 text-xs text-slate-500">{pedido.descricao}</p>{pedido.dataPreferida && <p className="mt-1 text-[11px] font-semibold text-indigo-600">Data preferida: {pedido.dataPreferida}</p>}</div>)}
              </div>
            </div>
          </section>
        )}

        {resultado && !loading && (
          <>
            <section className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Cliente</p>
                  <h2 className="text-lg font-extrabold text-slate-800">{resultado.cliente.nome}</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {resultado.cliente.numeroCliente && (
                    <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                      Código: {resultado.cliente.numeroCliente}
                    </span>
                  )}
                  {resultado.cliente.ilha && (
                    <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                      {resultado.cliente.ilha}
                    </span>
                  )}
                </div>
              </div>

              {resultado.jangadas.length > 0 && (
                <>
                  <h3 className="text-sm font-extrabold text-slate-700 uppercase tracking-wider">
                    Jangadas ({resultado.jangadas.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {resultado.jangadas.map((j) => {
                      const styles = INSPECTION_STATUS_STYLES[j.status.color];
                      return (
                        <div key={j.id} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 space-y-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-extrabold text-slate-800">{j.brand || "—"} {j.model || ""}</p>
                                {j.capacity ? <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{j.capacity}P</span> : null}
                              </div>
                              <p className="text-xs font-mono font-semibold text-slate-500 mt-0.5">S/N: {j.serial}</p>
                              {j.navioNome && (
                                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                                  <Ship size={12} className="text-slate-400" /> {j.navioNome}
                                </p>
                              )}
                            </div>
                            <span className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${styles.badge}`}>
                              <span className={`w-2 h-2 rounded-full ${styles.dot}`} />
                              {j.status.color === "gray" ? "Sem inspeção" :
                                      j.status.color === "red" ? "INSPEÇÃO EXPIRADA" :
                               j.status.color === "orange" ? `GI em ${j.status.daysLeft}d` :
                               j.status.color === "yellow" ? `GI em ${j.status.daysLeft}d` :
                               "Inspeção em dia"}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="bg-white rounded-xl border border-slate-200 p-3">
                              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                <CalendarClock size={12} /> Última Inspeção
                              </p>
                              <p className="font-bold text-slate-700 mt-0.5">{j.dataInspecao ? formatDate(j.dataInspecao) : "—"}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200 p-3">
                              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                <Clock size={12} /> Próxima Inspeção
                              </p>
                              <p className="font-bold text-slate-700 mt-0.5">
                                {j.dataProxInspecao ? formatDate(j.dataProxInspecao) : "—"}
                              </p>
                              {j.diasParaProxima !== null && (
                                <p className={`text-[11px] font-semibold mt-0.5 ${j.diasParaProxima < 0 ? "text-red-600" : j.diasParaProxima <= 30 ? "text-orange-600" : "text-emerald-600"}`}>
                                  {formatDias(j.diasParaProxima)}
                                </p>
                              )}
                            </div>
                          </div>

                          {(j.ultimoCertificadoNumero || j.certificadoExternoNumero) && (
                            <div className="space-y-1.5">
                              {j.ultimoCertificadoNumero && (
                                <p className="text-xs text-slate-600 flex items-center gap-1.5 flex-wrap">
                                  <FileText size={13} className="text-indigo-500 shrink-0" />
                                  Certificado: <span className="font-mono font-semibold">{j.ultimoCertificadoNumero}</span>
                                  {j.certificadoPdfUrl && (
                                    <a href={j.certificadoPdfUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-bold inline-flex items-center gap-0.5">
                                      descarregar <ExternalLink size={11} />
                                    </a>
                                  )}
                                </p>
                              )}
                              {j.certificadoExternoNumero && (
                                <p className="text-xs text-slate-600 flex items-center gap-1.5">
                                  <FileText size={13} className="text-amber-500 shrink-0" />
                                  Cert. externo: <span className="font-mono font-semibold">{j.certificadoExternoNumero}</span>
                                  {j.certificadoExternoUrl && (
                                    <a href={j.certificadoExternoUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-bold inline-flex items-center gap-0.5">
                                      ver <ExternalLink size={11} />
                                    </a>
                                  )}
                                </p>
                              )}
                            </div>
                          )}

                          <div className="flex flex-wrap gap-1.5">
                            {j.hruValidade && (
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg border ${j.diasHru !== null && j.diasHru < 0 ? "bg-red-50 border-red-200 text-red-700" : "bg-white border-slate-200 text-slate-600"}`}>
                                HRU {j.hruValidade ? formatDate(j.hruValidade) : ""}
                                {j.diasHru !== null && j.diasHru < 0 ? " · expirado" : ""}
                              </span>
                            )}
                            {j.radarReflectorValidade && (
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg border ${j.diasRadarReflector !== null && j.diasRadarReflector < 0 ? "bg-red-50 border-red-200 text-red-700" : "bg-white border-slate-200 text-slate-600"}`}>
                                Radar {j.radarReflectorValidade ? formatDate(j.radarReflectorValidade) : ""}
                                {j.diasRadarReflector !== null && j.diasRadarReflector < 0 ? " · expirado" : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {statusLabelExtra.green} · {statusLabelExtra.yellow} · {statusLabelExtra.orange} · {statusLabelExtra.red}
                  </p>
                </>
              )}
            </section>

            {resultado.ordensServico.length > 0 && (
              <section className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 sm:p-8 space-y-4">
                <h3 className="text-sm font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <Wrench size={16} className="text-slate-400" /> Serviços recentes
                </h3>
                <div className="space-y-3">
                  {resultado.ordensServico.map((o) => (
                    <div key={o.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-700">
                          {o.jangada ? `${o.jangada.brand || ""} ${o.jangada.model || ""} · ${o.jangada.serial}` : "Serviço"}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {o.numeroOrdem ? `OS ${o.numeroOrdem} · ` : ""}
                          {o.createdAt ? formatDate(o.createdAt) : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {o.valorTotal != null && (
                          <span className="text-sm font-bold text-slate-700">{Number(o.valorTotal).toFixed(2)} €</span>
                        )}
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {o.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {resultado.faturas.length > 0 && (
              <section className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 sm:p-8 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h3 className="text-sm font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <FileText size={16} className="text-slate-400" /> Faturas
                  </h3>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                      Faturado: <b className="text-slate-800">{resultado.resumoFaturas.totalFaturado.toFixed(2)} €</b>
                    </span>
                    <span className="font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                      Pago: <b className="text-emerald-700">{resultado.resumoFaturas.totalRecebido.toFixed(2)} €</b>
                    </span>
                    <span className={`font-semibold px-2.5 py-1 rounded-full ${resultado.resumoFaturas.totalEmDivida > 0 ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                      Em dívida: <b>{resultado.resumoFaturas.totalEmDivida.toFixed(2)} €</b>
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  {resultado.faturas.map((f) => (
                    <div key={f.id} className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-700">{f.numeroFatura}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {f.dataEmissao ? formatDate(f.dataEmissao) : ""}
                            {f.ordemServicos[0]?.numeroOrdem ? ` · OS ${f.ordemServicos[0].numeroOrdem}` : ""}
                            {f.ordemServicos[0]?.jangada ? ` · ${f.ordemServicos[0].jangada.brand || ""} ${f.ordemServicos[0].jangada.model || ""} (${f.ordemServicos[0].jangada.serial})` : ""}
                          </p>
                          {f.numeroNotaCredito && (
                            <p className="text-xs text-rose-600 mt-0.5 font-semibold">
                              Nota de crédito: {f.numeroNotaCredito}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-bold text-slate-700">{Number(f.valorTotal).toFixed(2)} €</span>
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${f.cancelada ? "bg-slate-100 text-slate-500 border-slate-200" : f.pagamentoStatus === "Pago" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : f.pagamentoStatus === "Pago Parcialmente" ? "bg-blue-50 text-blue-700 border-blue-200" : f.pagamentoStatus === "Vencido" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                            {f.cancelada ? "Anulada" : f.pagamentoStatus}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="max-w-5xl mx-auto px-4 sm:px-6 pb-10 text-center">
        <p className="text-xs text-slate-400">
          Orey Açores · Manutenção e inspeção de jangadas salva-vidas · Se não conseguir aceder, contacte a nossa oficina.
        </p>
      </footer>
    </div>
  );
}
