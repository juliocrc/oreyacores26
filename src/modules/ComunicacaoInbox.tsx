"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowUpRight, CheckCheck, Clock3, Inbox, Loader2, Mail,
  MessageCircle, MessageSquare, Plus, RefreshCw, Reply, Search,
  Send, Smartphone, Trash2, X, XCircle, FileText, ChevronDown, PhoneCall, Volume2,
} from "lucide-react";
import { appToast } from "@/lib/app-toast";
import { TTS_VOICES } from "@/lib/tts-voices";
import { takeCommunicationAlert } from "@/lib/communication-alert-draft";
import EmailSenderSelect, { type SenderAccount, type SenderAccountStatus } from '@/components/shared/EmailSenderSelect';
import LocalOutlookCompose from '@/components/shared/LocalOutlookCompose';
import WhatsAppPdfSend from '@/components/shared/WhatsAppPdfSend';
import OpenWaConnection, { type OpenWaStatus } from "@/components/shared/OpenWaConnection";
import {
  audioFailureIsDefinitive, createDraft, groupConversations, matchesConversation, matchesLocalDraft, phoneIdentity, replyReference, validRecipient,
  type Channel, type Conversation, type HistoryChannel, type InboxDraft, type InboxFilter, type InboxMessage,
} from "@/lib/communication-inbox";

type ConnectionStatus = {
  allowed?: boolean;
  sms?: { configured: boolean; provider?: string | null };
  email?: { configured: boolean; accounts?: SenderAccountStatus[] };
  audio?: { configured: boolean; speechConfigured: boolean; deliveryConfigured: boolean; maxMessageLength: number; defaultVoice?: string | null };
};

const CHANNELS: Channel[] = ["WHATSAPP", "EMAIL", "SMS"];
const HISTORY_CHANNELS: HistoryChannel[] = [...CHANNELS, "CHAMADA"];
const LABELS: Record<HistoryChannel, string> = { SMS: "SMS", WHATSAPP: "WhatsApp", EMAIL: "Email", CHAMADA: "Chamada" };
const STATUS: Record<string, string> = {
  enviado: "Enviado", entregue: "Entregue", lido: "Lido", pendente: "Pendente",
  falhou: "Falhou", recebido: "Recebido", rascunho: "Rascunho",
};
const TEMPLATES = [
  { key: "vistoria", label: "Agendar vistoria", body: "Olá,\n\nRelembramos que está na altura de agendar a vistoria técnica da sua jangada salva-vidas. Confirme, por favor, a sua disponibilidade.\n\nCom os melhores cumprimentos,\nOrey Tecnica- Serviços Navais, Lda" },
  { key: "certificado", label: "Certificado disponível", body: "Olá,\n\nO certificado da vistoria da sua jangada salva-vidas já está disponível. Estamos à sua disposição para qualquer esclarecimento.\n\nCom os melhores cumprimentos,\nOrey Tecnica- Serviços Navais, Lda" },
  { key: "fatura-oficial", label: "Fatura oficial — WhatsApp", body: "Exmos. Senhores,\n\nInformamos que a fatura oficial [número da fatura] está disponível para consulta na sua área de cliente.\n\nPara qualquer esclarecimento, contacte-nos.\n\nCom os melhores cumprimentos,\nOrey Tecnica- Serviços Navais, Lda" },
  { key: "pagamento", label: "Recordação de pagamento", body: "Olá,\n\nRecordamos que existem faturas por regularizar. Agradecemos o seu contacto.\n\nCom os melhores cumprimentos,\nOrey Tecnica- Serviços Navais, Lda" },
];
const TABS: { key: InboxFilter; label: string }[] = [
  { key: "all", label: "Todas" }, { key: "unanswered", label: "Sem resposta" },
  { key: "received", label: "Recebidas" }, { key: "sent", label: "Enviadas" },
  { key: "pending", label: "Pendentes" }, { key: "failed", label: "Falhas" }, { key: "drafts", label: "Rascunhos" },
];
const fieldClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60";
const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";

function channelIcon(channel: HistoryChannel, size = 15) {
  return channel === "CHAMADA" ? <PhoneCall size={size} /> : channel === "EMAIL" ? <Mail size={size} /> : channel === "WHATSAPP" ? <MessageCircle size={size} /> : <Smartphone size={size} />;
}

function dateLabel(value: string, full = false) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data indisponível" : full ? date.toLocaleString("pt-PT") : date.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
}

function audioResponseError(res: Response, json: { error?: unknown; code?: unknown }) {
  if (res.status === 503 && json.code === "AUDIO_RATE_LIMIT_UNAVAILABLE") {
    return "Audio indisponivel: contacte a administracao para configurar o limitador de pedidos. Nenhum audio foi enviado.";
  }
  const message = typeof json.error === "string" ? json.error.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").trim().slice(0, 500) : "";
  if (res.status === 429) {
    const retry = res.headers.get("Retry-After");
    const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.ceil((Date.parse(retry) - Date.now()) / 1000) : NaN;
    return `${message || "Limite de pedidos de audio atingido."} ${Number.isFinite(seconds) && seconds > 0 ? `Tente novamente dentro de ${seconds} segundos.` : "Aguarde antes de tentar novamente."}`;
  }
  return message || (res.status === 503 ? "Audio indisponivel. Contacte a administracao para verificar a configuracao do servico." : "Nao foi possivel gerar a pre-escuta. Nenhum audio foi enviado.");
}

export type ComunicacaoInboxProps = {
  canalInicial?: Channel;
  titulo?: string;
  descricao?: string;
  acento?: "indigo" | "emerald";
};

export default function ComunicacaoInbox({
  canalInicial: requestedChannel, titulo = "Central de Comunicações",
  descricao = "Conversas, respostas e seguimento num único espaço.", acento = "indigo",
}: ComunicacaoInboxProps) {
  const canalInicial = requestedChannel === "EMAIL" ? "EMAIL" : "WHATSAPP";
  const [items, setItems] = useState<InboxMessage[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const loadedPages = useRef(1);
  const [canDelete, setCanDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [senderAccount, setSenderAccount] = useState<SenderAccount>("julio");
  const [openWa, setOpenWa] = useState<OpenWaStatus | null>(null);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [channelFilter, setChannelFilter] = useState<HistoryChannel | "">(requestedChannel || "");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  // Drafts deliberately live only in this component, never in browser storage.
  const [drafts, setDrafts] = useState<Record<string, InboxDraft>>({});
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [whatsappLink, setWhatsappLink] = useState<{ key: string; url: string } | null>(null);
  const sendLock = useRef(false);
  const mounted = useRef(false);
  const threadEnd = useRef<HTMLDivElement>(null);
  const [audioVoice, setAudioVoice] = useState("");
  const [preview, setPreview] = useState<{ identity: string; url: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [audioConfirmed, setAudioConfirmed] = useState(false);
  const [uncertainAudio, setUncertainAudio] = useState<Record<string, boolean>>({});
  const [uncertainSms, setUncertainSms] = useState<Record<string, boolean>>({});
  const previewRequest = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const alert = takeCommunicationAlert();
    if (!alert) return;
    setDrafts((previous) => ({ ...previous, new: { ...createDraft(null, "WHATSAPP"), ...alert } }));
    setSelection("new");
    setMobileDetail(true);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      setCanDelete(false);
      setConnection(null);
      const statusRequest = fetch("/api/whatsapp/status", { signal: controller.signal, cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) throw new Error();
          const json = await res.json();
          if (!controller.signal.aborted) setConnection(json);
        }).catch(() => { if (!controller.signal.aborted) setConnection(null); });
      try {
        const loaded: InboxMessage[] = [];
        let cursor: number | null = null;
        let firstPage: { total?: number; permissions?: { canDelete?: boolean } } = {};
        for (let page = 0; page < loadedPages.current; page++) {
          const res: Response = await fetch(`/api/comunicacoes?limite=500${cursor !== null ? `&cursor=${cursor}` : ""}`, { signal: controller.signal, cache: "no-store" });
          if (!res.ok) throw new Error("Não foi possível carregar o histórico.");
          const json: { items?: InboxMessage[]; nextCursor?: number | null; total?: number; permissions?: { canDelete?: boolean } } = await res.json();
          if (page === 0) firstPage = json;
          if (!Array.isArray(json.items)) throw new Error("Histórico inválido.");
          loaded.push(...json.items);
          cursor = typeof json.nextCursor === "number" ? json.nextCursor : null;
          if (cursor === null) break;
        }
        if (controller.signal.aborted) return;
        setItems(Array.from(new Map(loaded.map((item) => [item.id, item])).values()));
        setNextCursor(cursor);
        setTotal(typeof firstPage.total === "number" ? firstPage.total : null);
        setCanDelete(firstPage.permissions?.canDelete === true);
        setUpdatedAt(new Date());
      } catch {
        if (!controller.signal.aborted) setError("Não foi possível atualizar o histórico. Os dados anteriores, se existentes, continuam disponíveis.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
      await statusRequest;
    }
    void load();
    return () => controller.abort();
  }, [refresh]);

  const conversations = groupConversations(items);
  const current = conversations.find((c) => c.key === selection) || null;
  const draftKey = selection || "new";
  const initialDraft = createDraft(current, canalInicial);
  const draft = drafts[draftKey] || initialDraft;
  const visible = conversations.filter((c) => matchesConversation(c, search, channelFilter, filter, drafts[c.key]));
  const showNewDraft = matchesLocalDraft(drafts.new, search, channelFilter, filter);
  const unanswered = conversations.filter((c) => c.unanswered > 0).length;
  const failed = conversations.filter((c) => c.messages.some((m) => m.status === "falhou")).length;
  const pending = conversations.filter((c) => c.messages.some((m) => m.status === "pendente")).length;
  const draftCount = Object.values(drafts).filter((d) => d.body.trim() || d.subject.trim()).length;
  const whatsappReady = openWa?.configured === true && openWa.connected && openWa.businessHours?.open === true;
  const canSelectSender = Boolean(connection?.email?.accounts?.length);
  const configured = draft.channel === "EMAIL" ? (canSelectSender ? connection?.email?.accounts?.find(account => account.id === senderAccount)?.configured : connection?.email?.configured) : draft.channel === "SMS" ? connection?.sms?.configured : whatsappReady;
  const asAudio = draft.channel === "WHATSAPP" && draft.asAudio === true;
  const audioLimit = Math.min(1500, connection?.audio?.maxMessageLength || 1500);
  const selectedAudioVoice = audioVoice || connection?.audio?.defaultVoice || "pt-BR-AntonioNeural";
  const previewIdentity = JSON.stringify([draftKey, draft.body, draft.recipient, selectedAudioVoice, asAudio, mobileDetail]);
  const currentPreview = preview?.identity === previewIdentity ? preview : null;
  const canPreview = asAudio && connection?.allowed === true && connection.audio?.speechConfigured === true && draft.body.trim().length >= 10 && draft.body.length <= audioLimit;
  const valid = !!draft.body.trim() && validRecipient(draft) && configured === true && (draft.channel !== "SMS" || !uncertainSms[draftKey]) && (draft.channel !== "WHATSAPP" || connection?.allowed === true) &&
    (!asAudio || (connection?.audio?.configured === true && !!currentPreview && audioConfirmed && !uncertainAudio[draftKey] && draft.body.trim().length >= 10 && draft.body.length <= audioLimit));
  const audioBlockReasons = asAudio ? [
    connection?.allowed !== true && "Confirme a permissao WhatsApp com a administracao.",
    connection?.audio?.speechConfigured !== true && "Geracao de voz indisponivel. Contacte a administracao.",
    connection?.audio?.configured !== true && "Configuracao do servico de audio por confirmar. Contacte a administracao.",
    !whatsappReady && "Ligue a sessao WhatsApp e confirme o horario no painel OpenWA. A pre-escuta nao exige sessao ligada.",
    !validRecipient(draft) && "Introduza um destinatario com telefone valido.",
    (draft.body.trim().length < 10 || draft.body.length > audioLimit) && `O texto do audio deve ter entre 10 e ${audioLimit} caracteres.`,
    !currentPreview && "Gere a pre-escuta antes de enviar.",
    !audioConfirmed && "Confirme a pre-escuta, o texto, a voz e o destinatario para autorizar o envio.",
    uncertainAudio[draftKey] && "Envio anterior sem confirmacao: verifique o historico e o fornecedor antes de novo envio.",
  ].filter(Boolean) : [];
  const activeColor = acento === "emerald" ? "bg-emerald-700 hover:bg-emerald-800" : "bg-indigo-600 hover:bg-indigo-700";
  const messageCount = current?.messages.length || 0;

  function clearPreview() {
    previewRequest.current?.abort();
    previewRequest.current = null;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null);
    setPreviewing(false);
    setAudioConfirmed(false);
    setPreviewError("");
  }

  useEffect(() => {
    clearPreview();
    return () => {
      previewRequest.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    };
  }, [previewIdentity]);

  async function generatePreview() {
    if (!canPreview || sendLock.current) return;
    clearPreview();
    const controller = new AbortController();
    previewRequest.current = controller;
    setPreviewing(true);
    let failure = "Nao foi possivel gerar a pre-escuta. Nenhum audio foi enviado.";
    const timer = window.setTimeout(() => {
      controller.abort();
      if (mounted.current && previewRequest.current === controller) {
        previewRequest.current = null;
        setPreviewing(false);
        setPreviewError("A pre-escuta demorou demasiado. Tente novamente. Nenhum audio foi enviado.");
      }
    }, 40_000);
    try {
      const res = await fetch("/api/comunicacoes/whatsapp-audio/preview", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ mensagem: draft.body.trim(), voice: selectedAudioVoice }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        failure = audioResponseError(res, json || {});
        throw new Error();
      }
      if (!res.headers.get("content-type")?.startsWith("audio/mpeg")) throw new Error("Nao foi possivel gerar a pre-escuta. Resposta de audio invalida. Nenhum audio foi enviado.");
      const blob = await res.blob();
      if (controller.signal.aborted || !mounted.current) return;
      if (!blob.size || blob.size > 10 * 1024 * 1024) throw new Error("Pre-escuta com tamanho invalido. Nenhum audio foi enviado.");
      const url = URL.createObjectURL(blob);
      previewUrl.current = url;
      setPreview({ identity: previewIdentity, url });
    } catch {
      if (mounted.current && previewRequest.current === controller) setPreviewError(failure);
    } finally {
      window.clearTimeout(timer);
      if (previewRequest.current === controller) {
        previewRequest.current = null;
        if (mounted.current) setPreviewing(false);
      }
    }
  }

  useEffect(() => {
    if (mobileDetail) threadEnd.current?.scrollIntoView({ block: "nearest" });
  }, [selection, messageCount, mobileDetail]);

  function updateDraft(patch: Partial<InboxDraft>) {
    if (sendLock.current) return;
    clearPreview();
    setWhatsappLink(null);
    setDrafts((previous) => {
      const next = { ...(previous[draftKey] || draft), ...patch };
      if (patch.channel && patch.channel !== "WHATSAPP") next.asAudio = false;
      if (patch.reply === undefined && (patch.channel !== undefined || patch.recipient !== undefined)) next.reply = null;
      return { ...previous, [draftKey]: next };
    });
  }

  function openConversation(conversation: Conversation) {
    setDrafts((previous) => {
      const next = createDraft(conversation);
      return previous[conversation.key] ? previous : { ...previous, [conversation.key]: next };
    });
    setSelection(conversation.key);
    setMobileDetail(true);
  }

  function newMessage() {
    setDrafts((previous) => previous.new ? previous : { ...previous, new: createDraft(null, canalInicial) });
    setSelection("new");
    setMobileDetail(true);
  }

  function confirmReplace() {
    return !(draft.body.trim() || draft.subject.trim()) || window.confirm("Substituir o texto e o assunto do rascunho atual?");
  }

  function applyMessage(message: InboxMessage) {
    if (message.tipo === "CHAMADA" || sendLock.current || !confirmReplace()) return;
    updateDraft({
      channel: message.tipo, recipient: message.destinatario?.trim() || "",
      subject: message.tipo === "EMAIL" ? (message.status !== "recebido" ? message.assunto || "" : `Re: ${message.assunto || "A sua mensagem"}`) : "",
      body: message.status !== "recebido" ? message.mensagem : "Olá,\n\nAgradecemos o seu contacto.\n\nCom os melhores cumprimentos,\nOrey Tecnica- Serviços Navais, Lda",
      reply: message.status === "recebido" ? message : null,
      asAudio: message.canal === "infinireach-audio" || message.canal === "openwa-audio",
    });
  }

  async function send() {
    if (sendLock.current || !valid) return;
    sendLock.current = true;
    const snapshot = draft;
    const key = draftKey;
    const audio = snapshot.channel === "WHATSAPP" && snapshot.asAudio === true;
    if (audio && !window.confirm(`Enviar o audio para ${phoneIdentity(snapshot.recipient)} com a voz ${selectedAudioVoice}?\n\nA voz e gerada por Edge TTS gratuito, nao oficial e sem SLA. O texto sera enviado a Microsoft. O audio sera enviado por WhatsApp atraves do OpenWA. Nao e uma chamada.\n\nTexto:\n${snapshot.body.trim()}`)) {
      sendLock.current = false;
      return;
    }
    setSending(true);
    let definitiveAudioFailure = false;
    try {
      const res = await fetch(audio ? "/api/comunicacoes/whatsapp-audio" : "/api/comunicacoes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(audio ? {
          destinatario: phoneIdentity(snapshot.recipient), mensagem: snapshot.body.trim(), voice: selectedAudioVoice, confirmed: true,
          ...replyReference(snapshot),
        } : {
          tipo: snapshot.channel, destinatario: snapshot.recipient.trim(), mensagem: snapshot.body,
          assunto: snapshot.channel === "EMAIL" ? snapshot.subject.trim() || undefined : undefined,
          senderAccount: snapshot.channel === "EMAIL" && canSelectSender ? senderAccount : undefined,
           ...replyReference(snapshot),
        }),
      });
      const json = await res.json();
      if (!mounted.current) return;
      if (!res.ok) {
        if (audio) definitiveAudioFailure = audioFailureIsDefinitive(res.status, json);
        if (snapshot.channel === "SMS" && json.uncertain === true) setUncertainSms((previous) => ({ ...previous, [key]: true }));
        if (audio && json.uncertain === true) setUncertainAudio((previous) => ({ ...previous, [key]: true }));
        throw new Error(audio ? audioResponseError(res, json) : json.error || "O servidor não confirmou o envio.");
      }
      if (json.whatsappUrl) {
        const url = new URL(json.whatsappUrl);
        if (url.protocol !== "https:" || !["wa.me", "api.whatsapp.com", "web.whatsapp.com"].includes(url.hostname)) throw new Error("Link WhatsApp inválido. O envio não foi confirmado.");
        setWhatsappLink({ key, url: url.toString() });
        window.open(url.toString(), "_blank", "noopener,noreferrer");
        appToast.warning("Link WhatsApp preparado. Confirme o envio na aplicação. Não há confirmação de envio por esta central.");
        // Keep the draft until the operator has confirmed in the external application.
      } else {
        appToast.success(audio ? "Pedido de envio de áudio aceite. Entrega ainda não confirmada." : "Comunicação enviada ao fornecedor. A entrega depende do canal.");
        if (typeof json.warning === "string") appToast.warning(json.warning);
        setDrafts((previous) => previous[key] === snapshot ? { ...previous, [key]: { ...snapshot, subject: "", body: "", reply: null } } : previous);
      }
    } catch (err) {
      // A lost response may follow provider acceptance. Do not offer a one-click resend.
      if (audio && !definitiveAudioFailure && mounted.current) setUncertainAudio((previous) => ({ ...previous, [key]: true }));
      if (snapshot.channel === "SMS" && mounted.current) setUncertainSms((previous) => ({ ...previous, [key]: true }));
      if (mounted.current) appToast.error(`${err instanceof Error ? err.message : "Não foi possível confirmar o envio."} Rascunho preservado. ${definitiveAudioFailure ? "O envio não foi aceite; pode corrigir o problema e tentar novamente." : "Verifique o histórico antes de voltar a enviar."}`);
    } finally {
      sendLock.current = false;
      if (mounted.current) {
        if (audio) clearPreview();
        setSending(false);
        setRefresh((value) => value + 1);
      }
    }
  }

  async function discard(message: InboxMessage) {
    if (!canDelete || deleting !== null || !window.confirm("Eliminar esta mensagem do histórico? Esta ação não pode ser desfeita.")) return;
    setDeleting(message.id);
    try {
      const res = await fetch(`/api/comunicacoes/${message.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      if (!mounted.current) return;
      setDrafts((previous) => Object.fromEntries(Object.entries(previous).map(([key, value]) => [key, value.reply?.id === message.id ? { ...value, reply: null } : value])));
      setRefresh((value) => value + 1);
      appToast.success("Mensagem eliminada.");
    } catch {
      if (mounted.current) appToast.error("Não foi possível eliminar a mensagem.");
    } finally {
      if (mounted.current) setDeleting(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-4 sm:py-6">
      <div className="ds-page space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-indigo-200"><MessageSquare size={21} /></span>
            <div><h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{titulo}</h1><p className="text-xs text-slate-500 sm:text-sm">{descricao}</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className={buttonClass} disabled={loading} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={14} className={loading ? "animate-spin" : ""} />Atualizar</button>
            <button className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${activeColor}`} onClick={newMessage}><Plus size={15} />Nova mensagem</button>
          </div>
        </header>

        <OpenWaConnection onStatusChange={setOpenWa} />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3" aria-label="Resumo do histórico carregado">
          {[
            { label: "Sem resposta", value: unanswered, filter: "unanswered" as const, icon: Reply, color: "bg-indigo-50 text-indigo-600" },
            { label: "Pendentes", value: pending, filter: "pending" as const, icon: Clock3, color: "bg-amber-50 text-amber-700" },
            { label: "Com falhas", value: failed, filter: "failed" as const, icon: XCircle, color: "bg-rose-50 text-rose-600" },
            { label: "Rascunhos locais", value: draftCount, filter: "drafts" as const, icon: FileText, color: "bg-slate-100 text-slate-600" },
          ].map((card) => <button key={card.label} onClick={() => { setFilter(card.filter); setMobileDetail(false); }} aria-pressed={filter === card.filter} className={`flex items-center gap-3 rounded-xl border bg-white p-3 text-left transition hover:border-indigo-300 focus-visible:ring-2 focus-visible:ring-indigo-500 ${filter === card.filter ? "border-indigo-300 ring-1 ring-indigo-100" : "border-slate-200"}`}>
            <span className={`rounded-lg p-2 ${card.color}`}><card.icon size={17} /></span>
            <span><span className="block text-xl font-bold leading-6 text-slate-900">{card.value}</span><span className="text-xs text-slate-500">{card.label}</span></span>
          </button>)}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-500">
          <p>Histórico · {items.length} de {total ?? "—"} mensagens <span className="hidden sm:inline">· Resumos relativos aos dados carregados</span></p>
          <p role="status">{loading ? "A atualizar…" : updatedAt ? `Atualizado às ${updatedAt.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })} · atualização manual` : "Ainda não atualizado"}</p>
        </div>
        {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><span>{error}</span><button className={buttonClass} disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Recarregar histórico</button></div>}

        <div className="grid min-h-[650px] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside aria-label="Conversas" className={`${mobileDetail ? "hidden" : "flex"} min-w-0 flex-col border-slate-200 lg:flex lg:border-r`}>
            <div className="space-y-3 border-b border-slate-100 p-3">
              <div className="flex items-center justify-between px-1"><h2 className="text-sm font-bold text-slate-900">Conversas</h2><span className="text-xs text-slate-400">{visible.length} / {conversations.length}</span></div>
              <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" /><input aria-label="Pesquisar contactos, assuntos e todas as mensagens carregadas" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar no histórico…" className={`${fieldClass} !bg-slate-50 !pl-9`} /></div>
              <div className="flex flex-wrap gap-1" aria-label="Filtrar estado da conversa">{TABS.map((tab) => <button key={tab.key} aria-pressed={filter === tab.key} onClick={() => setFilter(tab.key)} className={`min-h-8 rounded-lg px-2.5 text-[11px] font-semibold focus-visible:ring-2 focus-visible:ring-indigo-500 ${filter === tab.key ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{tab.label}</button>)}</div>
                <div className="grid grid-cols-5 gap-1 rounded-lg bg-slate-100 p-1" aria-label="Filtrar canal">{(["", "SMS", "WHATSAPP", "EMAIL", "CHAMADA"] as const).map((channel) => <button key={channel} aria-pressed={channelFilter === channel} onClick={() => setChannelFilter(channel)} className={`min-h-10 rounded-md text-[11px] font-semibold focus-visible:ring-2 focus-visible:ring-indigo-500 ${channelFilter === channel ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{channel ? LABELS[channel] : "Todos"}</button>)}</div>
            </div>
            <div className="max-h-[650px] flex-1 overflow-y-auto" aria-busy={loading}>
              {showNewDraft && <button onClick={newMessage} className="w-full border-b border-slate-100 bg-amber-50 px-4 py-4 text-left focus-visible:ring-2 focus-visible:ring-indigo-500"><span className="block text-sm font-semibold text-slate-800">Rascunho de nova mensagem</span><span className="mt-1 block truncate text-xs text-slate-600">{drafts.new.recipient || LABELS[drafts.new.channel]} · {drafts.new.subject || drafts.new.body}</span></button>}
              {loading && !items.length ? <div role="status" className="flex flex-col items-center gap-3 p-12 text-sm text-slate-500"><Loader2 size={24} className="animate-spin text-indigo-500" />A carregar conversas…</div> : !visible.length && !showNewDraft ? <div className="space-y-3 p-8 text-center"><Inbox size={30} className="mx-auto text-slate-300" /><p className="text-sm font-semibold text-slate-700">{error ? "Histórico indisponível" : conversations.length ? "Sem resultados" : "Ainda sem conversas"}</p><p className="text-xs leading-5 text-slate-500">{conversations.length ? "Experimente outro termo ou remova os filtros." : "Inicie uma mensagem para contactar um cliente."}</p>{conversations.length > 0 && <button className={buttonClass} onClick={() => { setSearch(""); setFilter("all"); setChannelFilter(""); }}>Limpar filtros</button>}<button className={buttonClass} onClick={newMessage}><Plus size={14} />Nova mensagem</button></div> : visible.map((conversation) => {
                const latest = conversation.messages[conversation.messages.length - 1];
                const hasDraft = !!(drafts[conversation.key]?.body.trim() || drafts[conversation.key]?.subject.trim());
                return <button key={conversation.key} onClick={() => openConversation(conversation)} aria-current={selection === conversation.key ? "true" : undefined} className={`w-full border-b border-l-[3px] border-b-slate-100 px-3 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${selection === conversation.key ? "border-l-indigo-600 bg-indigo-50/70" : "border-l-transparent hover:bg-slate-50"}`}>
                  <div className="flex items-center gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selection === conversation.key ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>{channelIcon(conversation.channel, 17)}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-slate-800">{conversation.name || conversation.contact || "Contacto desconhecido"}</span><time className="shrink-0 text-[10px] text-slate-400">{dateLabel(latest.enviadoEm)}</time></div><p className="mt-1 truncate text-xs text-slate-500">{latest.mensagem || latest.assunto || "Sem texto"}</p></div></div>
                  <div className="mt-2 flex items-center gap-2 pl-12 text-[10px] text-slate-400"><span>{[...new Set(conversation.messages.map((m) => LABELS[m.tipo]))].join(" · ")}</span>{hasDraft && <span className="font-semibold text-amber-700">Rascunho local</span>}{conversation.unanswered > 0 && <span className="ml-auto rounded-full bg-indigo-100 px-2 py-0.5 font-bold text-indigo-700">{conversation.unanswered} sem resposta</span>}</div>
                </button>;
              })}
            </div>
            {nextCursor !== null && <button className={`${buttonClass} m-3`} disabled={loading} onClick={() => { loadedPages.current += 1; setRefresh((value) => value + 1); }}>{loading ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}Carregar mensagens anteriores</button>}
            <p className="border-t border-slate-100 px-4 py-3 text-[10px] text-slate-400">Filtros por conversa · o detalhe mantém todos os canais.</p>
          </aside>

          <section aria-label="Detalhe da conversa" className={`${mobileDetail ? "flex" : "hidden"} min-w-0 flex-col lg:flex`}>
            {selection === null ? <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center"><span className="rounded-2xl bg-indigo-50 p-5 text-indigo-400"><MessageSquare size={32} /></span><h2 className="mt-2 font-semibold text-slate-800">O próximo contacto começa aqui</h2><p className="max-w-xs text-sm leading-6 text-slate-500">Selecione uma conversa para consultar o histórico e responder, ou inicie uma nova mensagem.</p><button className={`${buttonClass} mt-2`} onClick={newMessage}><Plus size={15} />Nova mensagem</button></div> : <>
              <header className="flex items-center gap-3 border-b border-slate-200 px-3 py-4 sm:px-5">
                <button aria-label="Voltar às conversas" onClick={() => setMobileDetail(false)} className={`${buttonClass} !px-2 lg:hidden`}><ArrowLeft size={18} /></button>
                <span className="hidden h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-indigo-200 sm:flex">{current ? channelIcon(current.channel, 19) : <Plus size={19} />}</span>
                <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-bold text-slate-900">{current?.name || current?.contact || (selection === "new" ? "Nova mensagem" : "Conversa indisponível")}</h2><p className="truncate text-xs text-slate-500">{current ? `${current.contact || "Sem contacto"} · ${messageCount} mensagens carregadas` : "Escolha o canal e o destinatário"}</p></div>
              </header>

              <div className="min-h-[240px] max-h-[480px] flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-3 sm:p-5">
                {!current ? <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center"><Send size={24} className="text-indigo-300" /><p className="text-sm font-medium text-slate-600">{selection === "new" ? "Uma nova conversa, com contexto." : "Sem mensagens no histórico recente."}</p><p className="text-xs text-slate-400">O rascunho fica apenas nesta sessão.</p></div> : <>
                  <p className="text-center text-[10px] font-medium uppercase tracking-wider text-slate-400">Histórico recente · todos os canais</p>
                  {current.messages.map((message) => {
                    const isCall = message.tipo === "CHAMADA";
                    const incoming = !isCall && message.status === "recebido";
                    const statusLabel = isCall ? (message.status === "pendente" ? "Chamada solicitada" : message.status === "falhou" ? "Pedido de chamada falhou" : "Registo de chamada") : STATUS[message.status] || message.status;
                    return <article key={message.id} aria-label={isCall ? "Registo de chamada com aviso" : `${incoming ? "Mensagem recebida" : "Mensagem de saída"} por ${LABELS[message.tipo]}`} className={`flex ${incoming ? "justify-start" : "justify-end"}`}>
                      <div className={`min-w-0 max-w-[94%] rounded-2xl border px-3.5 py-3 shadow-sm sm:max-w-[85%] ${incoming ? "rounded-tl-sm border-slate-200 bg-white" : "rounded-tr-sm border-indigo-100 bg-indigo-50/70"}`}>
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-500"><span className="flex items-center gap-1">{channelIcon(message.tipo, 12)}{LABELS[message.tipo]}</span><span className={message.status === "falhou" ? "text-rose-700" : message.status === "pendente" ? "text-amber-700" : "text-slate-500"}>{statusLabel}</span>{!isCall && message.status === "lido" && <CheckCheck size={13} />}{!isCall && message.respondidoEm && <span className="text-emerald-700">Respondido</span>}{!incoming && <ArrowUpRight size={12} className="ml-auto" />}</div>
                         {isCall && <p className="mt-2 text-xs leading-5 text-amber-800">Aviso de voz · o registo do pedido não confirma atendimento nem que o aviso foi ouvido.</p>}
                          {(message.canal === "infinireach-audio" || message.canal === "openwa-audio") && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-indigo-700"><Volume2 size={14} />Áudio WhatsApp · voz sintética em português · transcrição abaixo</p>}
                        {message.assunto && <h3 className="mt-2 break-words text-sm font-semibold text-slate-800">{message.assunto}</h3>}
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800 [overflow-wrap:anywhere]">{message.mensagem}</p>
                        {message.erro && <p className="mt-2 break-words rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{message.erro}</p>}
                        <p className="mt-2 text-[10px] text-slate-500">{dateLabel(message.enviadoEm, true)}{!incoming && message.enviadoPor ? ` · ${message.enviadoPor}` : ""}</p>
                         {((!isCall && (incoming || ["rascunho", "falhou"].includes(message.status))) || canDelete) && <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-2">
                            {!isCall && message.tipo !== "SMS" && (incoming || ["rascunho", "falhou"].includes(message.status)) && <button disabled={sending} onClick={() => applyMessage(message)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"><Reply size={13} />{incoming ? "Responder" : message.status === "falhou" ? "Reutilizar mensagem" : "Usar rascunho"}</button>}
                          {canDelete && <button aria-label={`Eliminar mensagem ${message.id}`} disabled={deleting !== null || sending} onClick={() => void discard(message)} className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs text-slate-500 hover:bg-rose-50 hover:text-rose-700 focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50">{deleting === message.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}Eliminar</button>}
                        </div>}
                      </div>
                    </article>;
                  })}
                </>}
                <div ref={threadEnd} />
              </div>

              <form className="border-t border-slate-200 bg-white p-3 sm:p-4" onSubmit={(e) => { e.preventDefault(); void send(); }} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); if (valid) void send(); } }}>
                <fieldset disabled={sending} className="min-w-0 space-y-3">
                  <legend className="sr-only">Compor mensagem</legend>
                  {draft.reply && <div className="flex items-center justify-between gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700"><span className="truncate">A responder a #{draft.reply.id} · {draft.reply.mensagem.slice(0, 70)}</span><button type="button" aria-label="Cancelar referência de resposta" onClick={() => updateDraft({ reply: null })} className="rounded p-1 focus-visible:ring-2 focus-visible:ring-indigo-500"><X size={15} /></button></div>}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-1" aria-label="Canal de envio">{CHANNELS.map((channel) => <button type="button" key={channel} aria-pressed={draft.channel === channel} onClick={() => updateDraft({ channel })} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-indigo-500 ${draft.channel === channel ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-transparent text-slate-500 hover:bg-slate-50"}`}>{channelIcon(channel, 13)}{LABELS[channel]}</button>)}</div>
                    <select aria-label="Aplicar modelo de mensagem" value="" className="min-h-9 max-w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 focus-visible:ring-2 focus-visible:ring-indigo-500" onChange={(e) => { const template = TEMPLATES.find((t) => t.key === e.target.value); if (template && confirmReplace()) updateDraft({ body: template.body, subject: "" }); }}><option value="" disabled>Inserir modelo…</option>{TEMPLATES.map((template) => <option key={template.key} value={template.key}>{template.label}</option>)}</select>
                  </div>
                  <div className={`grid gap-2 ${draft.channel === "EMAIL" ? "sm:grid-cols-2" : ""}`}>
                    <label className="space-y-1 text-[11px] font-semibold text-slate-500"><span>Destinatário</span><input type={draft.channel === "EMAIL" ? "email" : "tel"} autoComplete="off" required aria-describedby="send-guidance" value={draft.recipient} onChange={(e) => updateDraft({ recipient: e.target.value })} placeholder={draft.channel === "EMAIL" ? "email@exemplo.pt" : "+351 912 345 678"} className={fieldClass} /></label>
                    {draft.channel === "EMAIL" && <EmailSenderSelect value={senderAccount} onChange={setSenderAccount} accounts={connection?.email?.accounts} />}
                    {draft.channel === "EMAIL" && <label className="space-y-1 text-[11px] font-semibold text-slate-500"><span>Assunto</span><input value={draft.subject} onChange={(e) => updateDraft({ subject: e.target.value })} placeholder="Assunto do email" className={fieldClass} /></label>}
                  </div>
                  <label className="block"><span className="sr-only">Mensagem</span><textarea required rows={4} value={draft.body} onChange={(e) => updateDraft({ body: e.target.value })} placeholder="Escreva a sua mensagem…" className={`${fieldClass} min-h-24 resize-y leading-relaxed`} /></label>
                  {draft.channel === "EMAIL" && <LocalOutlookCompose key={draftKey} recipient={draft.recipient} subject={draft.subject} body={draft.body} senderAccount={senderAccount} onSenderChange={setSenderAccount} />}
                  {draft.channel === "WHATSAPP" && <WhatsAppPdfSend key={draftKey} recipient={draft.recipient} ready={whatsappReady && connection?.allowed === true} onComplete={() => setRefresh(value => value + 1)} />}
                  {draft.channel === "WHATSAPP" && <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-xs leading-5 text-slate-600">
                    <label className="flex min-h-9 items-center gap-2 font-semibold text-indigo-800"><input type="checkbox" checked={asAudio} disabled={connection?.allowed !== true || connection?.audio?.speechConfigured !== true} onChange={(event) => updateDraft({ asAudio: event.target.checked })} className="h-4 w-4 accent-indigo-600" />Enviar como áudio automático</label>
                     <p>{connection?.audio?.speechConfigured ? `Voz sintética em português por Edge TTS gratuito, não oficial e sem SLA. O texto é enviado à Microsoft. MP3 por WhatsApp através do OpenWA, não uma chamada. Texto de 10 a ${audioLimit} caracteres. O envio exige uma sessão ligada e confirmação.` : "Áudio indisponível: não foi possível confirmar o estado do Edge TTS no servidor."}</p>
                     {asAudio && (draft.body.trim().length < 10 || draft.body.length > audioLimit) && <p role="status" className="mt-1 font-semibold text-amber-800">O texto do áudio deve ter entre 10 e {audioLimit} caracteres.</p>}
                     {asAudio && <div className="mt-3 space-y-3">
                       <label className="block space-y-1"><span>Voz do audio</span><select aria-label="Voz do audio" value={selectedAudioVoice} className={fieldClass} onChange={(event) => { clearPreview(); setAudioVoice(event.target.value); }}>
                         {TTS_VOICES.map((voice) => <option key={voice} value={voice}>{voice.replace("Neural", "")} {voice.startsWith("pt-PT") ? "(Portugal)" : "(Brasil)"}</option>)}
                       </select></label>
                       <p>Pre-escuta gratuita: gera audio sem enviar nem criar um registo de entrega. O envio pelo OpenWA e separado e depende da sessao WhatsApp ligada.</p>
                       <button type="button" className={buttonClass} disabled={!canPreview || previewing} onClick={() => void generatePreview()}>{previewing ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />}{previewing ? "A gerar pre-escuta..." : "Ouvir antes de enviar"}</button>
                       {currentPreview && <audio key={currentPreview.url} aria-label="Pre-escuta do audio WhatsApp" controls preload="metadata" src={currentPreview.url} className="w-full" />}
                       {previewError && <p role="alert">{previewError}</p>}
                       <label className="flex items-start gap-2"><input type="checkbox" checked={audioConfirmed} disabled={!currentPreview || !!uncertainAudio[draftKey]} onChange={(event) => setAudioConfirmed(event.target.checked)} className="mt-1 h-4 w-4" /><span>Confirmo a pre-escuta, o texto, a voz e o destinatario {phoneIdentity(draft.recipient) || "(telefone invalido)"}. Autorizo o envio WhatsApp.</span></label>
                       {uncertainAudio[draftKey] && <p role="alert" className="font-semibold text-amber-800">Envio sem confirmacao. Nao repita: verifique o historico e o fornecedor. Este rascunho esta bloqueado para novo envio de audio.</p>}
                     </div>}
                  </div>}
                   {audioBlockReasons.length > 0 && <div id="audio-send-guidance" role="status" className="text-xs leading-5 text-amber-800"><p className="font-semibold">Envio de audio bloqueado:</p><ul className="list-disc pl-4">{audioBlockReasons.map((reason) => <li key={String(reason)}>{reason}</li>)}</ul></div>}
                    <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-[10px] text-slate-400">{draft.body.length} caracteres · Rascunho só em memória · Ctrl/⌘ + Enter</span><button type="submit" aria-describedby={asAudio ? "audio-send-guidance send-guidance" : "send-guidance"} disabled={!valid || sending} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-xs font-bold text-white transition focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${activeColor}`}>{sending ? <Loader2 size={15} className="animate-spin" /> : asAudio ? <Volume2 size={15} /> : <Send size={15} />}{sending ? "A processar…" : asAudio ? "Enviar áudio confirmado" : draft.channel === "EMAIL" ? "Enviar email" : draft.channel === "SMS" ? "Enviar SMS" : "Enviar WhatsApp"}</button></div>
                </fieldset>
                {whatsappLink?.key === draftKey && <div role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Envio não confirmado. Termine na aplicação WhatsApp. Se o separador não abriu, <a href={whatsappLink.url} target="_blank" rel="noopener noreferrer" className="font-bold underline focus-visible:ring-2 focus-visible:ring-indigo-500">abrir o link preparado</a>, sem repetir o pedido de envio.</div>}
                <p id="send-guidance" className={`mt-3 text-[11px] leading-5 ${configured === false && draft.channel !== "WHATSAPP" ? "text-amber-700" : "text-slate-500"}`}>
                  {draft.channel === "WHATSAPP" ? connection === null || openWa === null ? "Estado WhatsApp indisponível. Atualize o estado antes de enviar." : connection.allowed !== true ? "A sua conta não tem permissão para enviar por WhatsApp. Contacte a administração." : openWa.businessHours?.open === false ? "Fora do horário de atendimento. O rascunho é preservado." : whatsappReady ? "Sessão OpenWA ligada. O envio só é iniciado por si e não confirma entrega." : "Ligue o WhatsApp e confirme o horário no painel OpenWA antes de enviar." : draft.channel === "SMS" ? configured === true ? "Serviço SMS configurado. Confirme o destinatário; a aceitação não garante entrega." : configured === false ? "Serviço SMS não configurado. Contacte a administração." : "Não foi possível confirmar a configuração do serviço SMS." : configured === true ? "Conta de email selecionada configurada. O envio so e iniciado por si; a configuracao nao confirma autenticacao ou entrega." : configured === false ? "Conta de email selecionada nao configurada. Contacte a administracao." : "Nao foi possivel confirmar a configuracao da conta selecionada. Contacte a administracao."}
                  {draft.recipient.trim() && !validRecipient(draft) && " Introduza um email válido ou um telefone com indicativo internacional (números PT de 9 dígitos também são aceites)."}
                  {draft.channel === "SMS" && uncertainSms[draftKey] && " SMS sem confirmação: não repita; verifique a fila e o histórico no fornecedor."}
                </p>
              </form>
            </>}
          </section>
        </div>
      </div>
    </div>
  );
}
