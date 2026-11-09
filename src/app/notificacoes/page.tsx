"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, MessageSquare, AlertTriangle, LifeBuoy, Loader2, RefreshCw, CalendarDays, FileText } from "lucide-react";
import { formatDateAuto } from "@/lib/date-utils";
import type { NotificacaoItem, NotificacoesPayload } from "@/lib/notificacoes";
import Link from "next/link";

export default function NotificacoesPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<NotificacaoItem[]>([]);
  const [error, setError] = useState("");
  const activeRequest = useRef<AbortController | null>(null);

  const loadNotificacoes = async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/notificacoes", { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error('Request failed');
      const payload: NotificacoesPayload = await response.json();
      if (!Array.isArray(payload.items) || !Array.isArray(payload.errors)) throw new Error('Invalid response');
      if (controller.signal.aborted) return;
      setItems(payload.items);
      setError(payload.errors.join(" "));
    } catch {
      if (!controller.signal.aborted) {
        setItems([]);
        setError("Não foi possível carregar as notificações. Tente novamente.");
      }
    } finally {
      if (!controller.signal.aborted) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadNotificacoes();
    const interval = window.setInterval(() => {
      if (!activeRequest.current) void loadNotificacoes();
    }, 60_000);
    return () => {
      window.clearInterval(interval);
      activeRequest.current?.abort();
    };
  }, []);

  return (
    <div className="space-y-8 p-6 lg:p-10 animate-in fade-in duration-300 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <Bell className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Centro de Notificações Centralizado</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">Mensagens recebidas por responder, validades, assistência, agenda de hoje e orçamentos em análise. Atualização automática a cada minuto.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadNotificacoes()}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
            <span className="font-medium">A carregar notificações...</span>
          </div>
        </div>
      ) : items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between gap-4 hover:border-slate-300 transition-all">
              <div className="flex items-start gap-4">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  item.tipo === "alerta" ? "bg-red-50 text-red-600" :
                  item.tipo === "whatsapp" ? "bg-emerald-50 text-emerald-600" :
                  "bg-sky-50 text-sky-600"
                }`}>
                  {item.tipo === "alerta" ? <AlertTriangle className="h-5 w-5" /> :
                   item.tipo === "whatsapp" ? <MessageSquare className="h-5 w-5" /> :
                   item.tipo === "agendamento" ? <CalendarDays className="h-5 w-5" /> :
                   item.tipo === "orcamento" ? <FileText className="h-5 w-5" /> :
                   <LifeBuoy className="h-5 w-5" />}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{item.titulo}</h3>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">{item.descricao}</p>
                  <p className="text-[10px] font-medium text-slate-400 mt-2">{formatDateAuto(item.data)}</p>
                </div>
              </div>
              {item.link && (
                <Link
                  href={item.link}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 shrink-0"
                >
                  Ver Detalhes
                </Link>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          {error ? "Não foi possível confirmar todas as notificações. Atualize para tentar novamente." : "Não existem notificações ou alertas pendentes neste momento."}
        </div>
      )}
    </div>
  );
}
