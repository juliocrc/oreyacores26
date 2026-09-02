"use client";

import React, { useState, useEffect } from "react";
import { MessageSquare, Send, CheckCircle2, AlertCircle, Loader2, Phone, RefreshCw, ShieldCheck } from "lucide-react";
import { appToast } from "@/lib/app-toast";

type Comunicacao = {
  id: number;
  destinatario: string;
  mensagem: string;
  status: string;
  canal?: string | null;
  enviadoEm: string;
  erro?: string | null;
};

export default function WhatsAppModule() {
  const [telefone, setTelefone] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [template, setTemplate] = useState("custom");
  const [loading, setLoading] = useState(false);
  const [comunicacoes, setComunicacoes] = useState<Comunicacao[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = async () => {
    try {
      const res = await fetch("/api/comunicacoes?tipo=WHATSAPP&pageSize=50");
      if (res.ok) {
        const data = await res.json();
        setComunicacoes(data.comunicacoes || data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleTemplateChange = (val: string) => {
    setTemplate(val);
    if (val === "vistoria") {
      setMensagem("Olá, relembramos que a vistoria técnica da sua jangada salva-vidas tem validade prevista próxima. Para garantir a segurança e conformidade, confirme se podemos agendar a intervenção. Orey Azores");
    } else if (val === "orcamento") {
      setMensagem("Olá, o orçamento para a vistoria da sua jangada salva-vidas foi emitido e aguarda a sua aprovação. Pode consultar os detalhes e aprovar online. Orey Azores");
    } else if (val === "certificado") {
      setMensagem("Olá, informamos que o certificado da vistoria da sua jangada salva-vidas já está disponível. Orey Azores");
    } else {
      setMensagem("");
    }
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
      if (data.whatsappUrl) {
        window.open(data.whatsappUrl, "_blank");
      }
      setMensagem("");
      setTelefone("");
      loadHistory();
    } catch (err: any) {
      appToast.error(err?.message || "Erro ao enviar mensagem.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-3xl p-8 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/30 text-emerald-100 text-xs font-bold mb-3 border border-emerald-400/30">
            <MessageSquare size={14} /> Módulo WhatsApp Business / Zapier
          </div>
          <h1 className="text-3xl font-black tracking-tight">Gestão de Comunicações WhatsApp</h1>
          <p className="text-emerald-100 text-sm mt-1 max-w-2xl">
            Envio automatizado e direto via WABA API / Zapier MCP com fallback para wa.me e histórico centralizado.
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/20">
          <ShieldCheck className="text-emerald-300" size={24} />
          <div>
            <div className="text-xs text-emerald-200 font-semibold">Estado da Conexão</div>
            <div className="text-sm font-bold text-white">Ativo (WABA + Zapier MCP)</div>
          </div>
        </div>
      </div>

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

        {/* History Table */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200/60 p-6 shadow-sm space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <MessageSquare className="text-emerald-600" size={20} /> Histórico de Envios WhatsApp
            </h2>
            <button
              onClick={() => { setLoadingHistory(true); loadHistory(); }}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition"
              title="Atualizar histórico"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="overflow-x-auto">
            {loadingHistory ? (
              <div className="flex justify-center items-center py-20 gap-2 text-slate-500 font-medium">
                <Loader2 className="animate-spin text-emerald-600" size={24} /> A carregar histórico...
              </div>
            ) : comunicacoes.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="p-3">Destinatário</th>
                    <th className="p-3">Mensagem</th>
                    <th className="p-3">Canal</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {comunicacoes.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/60 transition">
                      <td className="p-3 font-mono font-bold text-slate-800">{c.destinatario}</td>
                      <td className="p-3 text-slate-600 max-w-xs truncate">{c.mensagem}</td>
                      <td className="p-3">
                        <span className="px-2 py-1 bg-slate-100 text-slate-700 font-semibold rounded-lg text-[10px] uppercase">
                          {c.canal || "wa.me"}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                          c.status === "enviado" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                          c.status === "pendente" ? "bg-amber-50 text-amber-700 border-amber-200" :
                          "bg-rose-50 text-rose-700 border-rose-200"
                        }`}>
                          {c.status === "enviado" ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                          {c.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500 font-mono">{new Date(c.enviadoEm).toLocaleString("pt-PT")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-16 text-slate-400">
                <MessageSquare size={36} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-semibold">Nenhuma mensagem de WhatsApp registada.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
