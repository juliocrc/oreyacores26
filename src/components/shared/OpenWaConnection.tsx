"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MessageCircle, RefreshCw, X } from "lucide-react";

export type OpenWaStatus = {
  configured: boolean;
  status?: string;
  connected: boolean;
  qrCode?: string;
  businessHours?: { open: boolean; timeZone: "Atlantic/Azores"; label: string };
};

const endpoint = "/api/comunicacoes/openwa";
const hours = "Dias úteis, 09:00-12:30 / 14:00-17:30 (Atlantic/Azores)";
const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";

export default function OpenWaConnection({ onStatusChange }: { onStatusChange?: (status: OpenWaStatus | null) => void }) {
  const [status, setStatus] = useState<OpenWaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [request, setRequest] = useState({ revision: 0, connect: false });
  const [deadline, setDeadline] = useState(0);
  const [expired, setExpired] = useState(false);
  const callback = useRef(onStatusChange);
  const controller = useRef<AbortController | null>(null);
  const panelId = useId();
  useEffect(() => { callback.current = onStatusChange; }, [onStatusChange]);

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      active = false;
      abort.abort();
      setStatus(null);
      callback.current?.(null);
      setError("O serviço demorou demasiado a responder. O Render gratuito pode estar a iniciar. Tente atualizar o estado manualmente.");
      setLoading(false);
    }, 110_000);
    async function load() {
      setLoading(true);
      setError("");
      callback.current?.(null);
      try {
        const fetchStatus = async (connect: boolean) => {
          const res = await fetch(endpoint, {
            method: connect ? "POST" : "GET", cache: "no-store", signal: abort.signal,
            ...(connect ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "connect" }) } : {}),
          });
          if (!active || abort.signal.aborted) throw new Error("cancelled");
          if (res.status === 401 || res.status === 403) {
            setUnauthorized(true);
            throw new Error("auth");
          }
          if (!res.ok) throw new Error("request");
          return res.json();
        };
        const data = await fetchStatus(request.connect);
        if (!active || abort.signal.aborted) return;
        if (typeof data.configured !== "boolean" || typeof data.ready !== "boolean" || typeof data.open !== "boolean" || data.status === "unavailable") throw new Error("status");
        // Only the pairing image is rendered, never raw provider responses or identifiers.
        const qrCode = typeof data.qrCode === "string" && data.qrCode.length <= 2_000_000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data.qrCode) ? data.qrCode : undefined;
        const next: OpenWaStatus = {
          configured: data.configured, connected: data.ready,
          status: typeof data.status === "string" ? data.status : undefined,
          qrCode: data.ready ? undefined : qrCode,
          businessHours: { open: data.open, timeZone: "Atlantic/Azores", label: hours },
        };
        setUnauthorized(false);
        setStatus(next);
        callback.current?.(next);
      } catch (err) {
        if (!active || abort.signal.aborted) return;
        setStatus(null);
        callback.current?.(null);
        setError(err instanceof Error && err.message === "auth"
          ? "Sessão terminada ou sem permissão para gerir a ligação WhatsApp. Inicie sessão com uma conta autorizada e tente novamente."
          : "Não foi possível confirmar a ligação WhatsApp. O serviço pode estar a iniciar no Render gratuito. Tente novamente.");
      } finally {
        window.clearTimeout(timer);
        if (active && !abort.signal.aborted) setLoading(false);
      }
    }
    void load();
    const cancel = () => { active = false; window.clearTimeout(timer); };
    abort.signal.addEventListener("abort", cancel, { once: true });
    return () => { cancel(); abort.abort(); };
  }, [request]);

  useEffect(() => {
    if (!panelOpen || !deadline || expired || status?.connected || error) return;
    // Keep checking visibility without restarting a request that is still in flight.
    const timer = window.setInterval(() => {
      if (Date.now() >= deadline) { setExpired(true); window.clearInterval(timer); return; }
      if (!loading && document.visibilityState === "visible") setRequest((previous) => ({ revision: previous.revision + 1, connect: false }));
    }, Math.max(1, Math.min(5_000, deadline - Date.now())));
    return () => window.clearInterval(timer);
  }, [panelOpen, deadline, expired, status, error, loading, request]);

  function refresh(connect = false) {
    if (loading) return;
    setExpired(false);
    setDeadline(Date.now() + 60_000);
    setLoading(true);
    setRequest((previous) => ({ revision: previous.revision + 1, connect }));
  }

  const outsideHours = status?.businessHours?.open === false;
  const label = loading ? "A iniciar" : outsideHours ? "Fora horário" : status?.connected ? "Ligado" : ["created", "initializing", "authenticating"].includes(status?.status || "") ? "A iniciar" : "Desligado";
  return <section aria-label="Ligação WhatsApp OpenWA" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><MessageCircle size={21} className="shrink-0 text-emerald-700" /><div><h2 className="text-sm font-bold text-slate-900">WhatsApp · OpenWA</h2><p className="mt-1 text-xs text-slate-500">{hours}</p></div></div>
      <div className="flex flex-wrap items-center gap-2">
        <span role="status" className={`rounded-full px-3 py-1 text-xs font-semibold ${!loading && status?.connected && !outsideHours ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{label}</span>
        <button type="button" className={buttonClass} disabled={loading} onClick={() => refresh()}><RefreshCw size={14} />Atualizar estado WhatsApp</button>
        <button type="button" className={buttonClass} disabled={loading || unauthorized || !status?.configured || status.connected || ["initializing", "authenticating"].includes(status?.status || "")} aria-expanded={panelOpen} aria-controls={panelId} onClick={() => { setPanelOpen(true); refresh(true); }}>Ligar WhatsApp</button>
        {!panelOpen && !status?.connected && <button type="button" className={buttonClass} aria-controls={panelId} onClick={() => { setPanelOpen(true); setDeadline(Date.now() + 60_000); setExpired(false); }}>Mostrar QR</button>}
      </div>
    </div>
    <p className="mt-3 text-xs leading-5 text-slate-500">Render gratuito: o serviço pode adormecer, demorar a iniciar ou perder a sessão ao reiniciar. Pode ser necessário ler um novo QR várias vezes ao dia. Não há garantia de ligação permanente nem de entrega.</p>
    {loading && <p role="status" className="mt-3 flex items-center gap-2 text-xs text-slate-600"><Loader2 size={15} className="animate-spin" />A consultar a sessão WhatsApp; o arranque pode demorar até 110 segundos.</p>}
    {error && <p role="alert" className="mt-3 text-xs leading-5 text-amber-800">{error}</p>}
    {status?.configured === false && <p className="mt-3 text-xs text-amber-800">OpenWA não configurado no servidor. Contacte a administração; não introduza credenciais nesta página.</p>}
    {outsideHours && <p className="mt-3 text-xs text-amber-800">Pode ligar e ler o QR a qualquer hora. O envio está suspenso fora do horário indicado.</p>}
    {panelOpen && <div id={panelId} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-800">Emparelhar WhatsApp</h3><button type="button" className={buttonClass} onClick={() => { setPanelOpen(false); setDeadline(0); controller.current?.abort(); setLoading(false); }}><X size={14} />Fechar QR</button></div>
      <p className="text-xs leading-5 text-slate-600">No WhatsApp do telefone, abra Dispositivos associados e escolha Associar dispositivo. Leia o QR aqui. Não partilhe este código.</p>
      {!error && status?.qrCode && !expired && <img src={status.qrCode} alt="Código QR para associar o WhatsApp ao OpenWA" width={280} height={280} className="h-auto w-full max-w-[280px] rounded-lg border border-slate-200 bg-white p-2" />}
      {!loading && !error && !status?.qrCode && !status?.connected && <p role="status" className="text-xs text-slate-600">QR ainda indisponível. Use Ligar WhatsApp para iniciar a sessão ou atualize o estado.</p>}
      {status?.connected && <p role="status" className="text-xs font-semibold text-emerald-800">Sessão WhatsApp ligada. Isto não confirma entrega de mensagens.</p>}
      <p className="text-xs text-slate-500">{expired ? "Atualização automática terminada. Atualize o estado manualmente para obter um QR atual." : "Atualização apenas com este painel aberto, por um máximo de 60 segundos. Depois, use a atualização manual."}</p>
    </div>}
  </section>;
}
