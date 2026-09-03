"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  MessageSquare,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Phone,
  RefreshCw,
  ShieldCheck,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  Trash2,
  Clock,
  XCircle,
} from "lucide-react";
import { appToast } from "@/lib/app-toast";

type Comunicacao = {
  id: number;
  destinatario: string;
  mensagem: string;
  status: string;
  canal?: string | null;
  enviadoEm: string;
  erro?: string | null;
  assunto?: string | null;
  tentativas?: number;
  providerId?: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  enviado:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  recebido: "bg-blue-50 text-blue-700 border-blue-200",
  pendente: "bg-amber-50 text-amber-700 border-amber-200",
  falhou:   "bg-rose-50 text-rose-700 border-rose-200",
  rascunho: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function WhatsAppModule() {
  const [telefone, setTelefone] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [template, setTemplate] = useState("custom");
  const [loading, setLoading] = useState(false);
  const [comunicacoes, setComunicacoes] = useState<Comunicacao[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [tabFiltro, setTabFiltro] = useState<"todas" | "enviadas" | "recebidas" | "falhadas">("todas");
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/comunicacoes?tipo=WHATSAPP&limite=200");
      if (res.ok) {
        const data = await res.json();
        setComunicacoes(data.items || data.comunicacoes || data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleTemplateChange = (val: string) => {
    setTemplate(val);
    const templates: Record<string, string> = {
      vistoria:
        "Olá, relembramos que a vistoria técnica da sua jangada salva-vidas tem validade prevista próxima. Para garantir a segurança e conformidade, confirme se podemos agendar a intervenção. Orey Azores",
      orcamento:
        "Olá, o orçamento para a vistoria da sua jangada salva-vidas foi emitido e aguarda a sua aprovação. Pode consultar os detalhes e aprovar online. Orey Azores",
      certificado:
        "Olá, informamos que o certificado da vistoria da sua jangada salva-vidas já está disponível. Orey Azores",
    };
    setMensagem(templates[val] || "");
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!telefone.trim() || !mensagem.trim()) {
      appToast.error("Preencha o telemóvel e a mensagem.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/comunicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "WHATSAPP",
          destinatario: telefone.trim(),
          mensagem: mensagem.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar mensagem.");

      appToast.success("Mensagem de WhatsApp registada/enviada com sucesso!");
      if (data.whatsappUrl) window.open(data.whatsappUrl, "_blank");
      setMensagem("");
      setTelefone("");
      loadHistory();
    } catch (err: any) {
      appToast.error(err?.message || "Erro ao enviar mensagem.");
    } finally {
      setLoading(false);
    }
  };

  const retryMessage = async (id: number) => {
    setRetryingId(id);
    try {
      const res = await fetch(`/api/comunicacoes/${id}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao reenviar.");
      appToast.success("Mensagem reenviada com sucesso!");
      loadHistory();
    } catch (err: any) {
      appToast.error(err?.message || "Falha ao reenviar.");
    } finally {
      setRetryingId(null);
    }
  };

  const retryAllFailed = async () => {
    const falhadas = comunicacoes.filter((c) => c.status === "falhou" || c.status === "pendente");
    if (falhadas.length === 0) return;
    setRetryingAll(true);
    let ok = 0;
    let fail = 0;
    for (const c of falhadas) {
      try {
        const res = await fetch(`/api/comunicacoes/${c.id}/retry`, { method: "POST" });
        if (res.ok) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }
    setRetryingAll(false);
    appToast.success(`${ok} reenviada(s), ${fail} falha(s).`);
    loadHistory();
  };

  const filteredComunicacoes = comunicacoes.filter((c) => {
    if (tabFiltro === "enviadas") return c.status !== "recebido" && c.status !== "falhado";
    if (tabFiltro === "recebidas") return c.status === "recebido";
    if (tabFiltro === "falhadas") return c.status === "falhou" || c.status === "pendente";
    return true;
  });

  const totalFalhadas = comunicacoes.filter((c) => c.status === "falhou" || c.status === "pendente").length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-3xl p-8 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/30 text-emerald-100 text-xs font-bold mb-3 border border-emerald-400/30">
            <MessageSquare size={14} /> Módulo WhatsApp Business / Zapier / WABA
          </div>
          <h1 className="text-3xl font-black tracking-tight">Gestão de Comunicações WhatsApp</h1>
          <p className="text-emerald-100 text-sm mt-1 max-w-2xl">
            Envio automatizado, receção de mensagens, reenvio automático e histórico unificado.
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/20">
          <ShieldCheck className="text-emerald-300" size={24} />
          <div>
            <div className="text-xs text-emerald-200 font-semibold">Estado da Conexão</div>
            <div className="text-sm font-bold text-white">Ativo (WABA + Webhook Inbound)</div>
          </div>
        </div>
      </div>

      {/* Falhadas alert */}
      {totalFalhadas > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
              <AlertCircle size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-rose-800">{totalFalhadas} mensagem(ns) com falha ou pendente(s)</p>
              <p className="text-xs text-rose-600">Clique "Reenviar" em cada uma ou "Reenviar Todas" para retentar automaticamente.</p>
            </div>
          </div>
          <button
            onClick={retryAllFailed}
            disabled={retryingAll}
            className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-xl shadow-md shadow-rose-600/20 transition disabled:opacity-50"
          >
            {retryingAll ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
            Reenviar Todas
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Send Form */}
        <div className="bg-white rounded-3xl border border-slate-200/60 p-6 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Send className="text-emerald-600" size={20} /> Enviar Mensagem WhatsApp
          </h2>

          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Telemóvel do Destinatário</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                  <Phone size={16} />
                </span>
                <input
                  type="text"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="+351 912 345 678"
                  className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 text-sm font-mono"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Modelo / Template Rápido</label>
              <select
                value={template}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
              >
                <option value="custom">Mensagem personalizada livre</option>
                <option value="vistoria">Lembrete de Vistoria Técnica</option>
                <option value="orcamento">Notificação de Orçamento Emitido</option>
                <option value="certificado">Disponibilidade de Certificado</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Mensagem</label>
              <textarea
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                rows={5}
                placeholder="Escreva a mensagem para o cliente..."
                className="w-full p-4 border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 text-sm font-sans resize-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold py-3.5 rounded-2xl shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
              Enviar Mensagem WhatsApp
            </button>
          </form>
        </div>

        {/* History */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200/60 p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <MessageSquare className="text-emerald-600" size={20} /> Histórico de Mensagens
            </h2>
            <div className="flex items-center gap-2">
              <div className="inline-flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
                <button
                  onClick={() => setTabFiltro("todas")}
                  className={`px-3 py-1.5 rounded-lg transition ${tabFiltro === "todas" ? "bg-white text-slate-800 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                >
                  Todas
                </button>
                <button
                  onClick={() => setTabFiltro("enviadas")}
                  className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1 ${tabFiltro === "enviadas" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                >
                  <ArrowUpRight size={12} /> Enviadas
                </button>
                <button
                  onClick={() => setTabFiltro("recebidas")}
                  className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1 ${tabFiltro === "recebidas" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                >
                  <ArrowDownLeft size={12} /> Recebidas
                </button>
                <button
                  onClick={() => setTabFiltro("falhadas")}
                  className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1 ${tabFiltro === "falhadas" ? "bg-white text-rose-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                >
                  <XCircle size={12} /> Falhadas
                </button>
              </div>
              <button
                onClick={() => { setLoadingHistory(true); loadHistory(); }}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition"
                title="Atualizar histórico"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loadingHistory ? (
              <div className="flex justify-center items-center py-20 gap-2 text-slate-500 font-medium">
                <Loader2 className="animate-spin text-emerald-600" size={24} /> A carregar histórico...
              </div>
            ) : filteredComunicacoes.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="p-3">Direção / Contacto</th>
                    <th className="p-3">Mensagem</th>
                    <th className="p-3">Canal</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Tentativas</th>
                    <th className="p-3">Data</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredComunicacoes.map((c) => {
                    const isRecebido = c.status === "recebido";
                    const podeReenviar = c.status === "falhou" || c.status === "pendente";
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/60 transition">
                        <td className="p-3 font-mono font-bold text-slate-800 flex items-center gap-1.5">
                          {isRecebido ? (
                            <span className="p-1 rounded-md bg-blue-50 text-blue-600"><ArrowDownLeft size={12} /></span>
                          ) : (
                            <span className="p-1 rounded-md bg-emerald-50 text-emerald-600"><ArrowUpRight size={12} /></span>
                          )}
                          {c.destinatario}
                        </td>
                        <td className="p-3 text-slate-600 max-w-xs truncate" title={c.mensagem}>
                          {c.mensagem}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-1 bg-slate-100 text-slate-700 font-semibold rounded-lg text-[10px] uppercase">
                            {c.canal || (isRecebido ? "webhook" : "wa.me")}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${STATUS_STYLES[c.status] || STATUS_STYLES.rascunho}`}>
                            {c.status === "enviado" ? <CheckCircle2 size={10} /> : isRecebido ? <ArrowDownLeft size={10} /> : c.status === "pendente" ? <Clock size={10} /> : <AlertCircle size={10} />}
                            {c.status}
                          </span>
                          {c.erro && (
                            <p className="text-[10px] text-rose-500 mt-1 max-w-[180px] truncate" title={c.erro}>{c.erro}</p>
                          )}
                        </td>
                        <td className="p-3 text-slate-500 font-mono text-center">
                          {c.tentativas || 1}
                        </td>
                        <td className="p-3 text-slate-500 font-mono">{new Date(c.enviadoEm).toLocaleString("pt-PT")}</td>
                        <td className="p-3">
                          {podeReenviar && (
                            <button
                              onClick={() => retryMessage(c.id)}
                              disabled={retryingId === c.id}
                              className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[10px] font-bold transition disabled:opacity-50"
                              title="Reenviar esta mensagem"
                            >
                              {retryingId === c.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                              Reenviar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-16 text-slate-400">
                <MessageSquare size={36} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-semibold">Nenhuma mensagem encontrada para este filtro.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
