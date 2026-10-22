"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquare,
  MessageCircle,
  Mail,
  Smartphone,
  Send,
  RefreshCw,
  Search,
  Inbox,
  Reply,
  CheckCheck,
  Clock3,
  XCircle,
  Loader2,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { appToast } from "@/lib/app-toast";

type Canal = "SMS" | "WHATSAPP" | "EMAIL";

type Comunicacao = {
  id: number;
  tipo: Canal;
  canal?: string | null;
  destinatario?: string | null;
  assunto?: string | null;
  mensagem: string;
  status: string;
  erro?: string | null;
  refTipo?: string | null;
  refId?: number | null;
  enviadoPor?: string | null;
  enviadoEm: string;
  respondidoEm?: string | null;
  clienteId?: number | null;
  tentativas?: number | null;
};

type ConnectionStatus = {
  canSend: boolean;
  provider?: string | null;
};

type FiltroDirecao = "todas" | "recebidas" | "enviadas" | "rascunhos" | "falhas";

type Conversa = {
  key: string;
  contacto: string;
  nome: string;
  canal: Canal;
  ultimaEm: string;
  ultimaMensagem: string;
  mensagens: Comunicacao[];
  naoLidas: number;
};

const STATUS_BADGES: Record<string, { label: string; bg: string }> = {
  enviado: { label: "Enviado", bg: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  entregue: { label: "Entregue", bg: "bg-sky-100 text-sky-700 border-sky-200" },
  lido: { label: "Lido", bg: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  pendente: { label: "Pendente", bg: "bg-amber-100 text-amber-700 border-amber-200" },
  falhou: { label: "Falhou", bg: "bg-rose-100 text-rose-700 border-rose-200" },
  recebido: { label: "Recebido", bg: "bg-violet-100 text-violet-700 border-violet-200" },
  rascunho: { label: "Rascunho", bg: "bg-slate-100 text-slate-600 border-slate-200" },
};

const TEMPLATES: Array<{ key: string; label: string; build: (nome: string) => string }> = [
  {
    key: "vistoria",
    label: "Recordação de vistoria",
    build: (nome) =>
      `Olá ${nome || "Exmo. Cliente"},\n\nRelembramos que está na altura de agendar a vistoria técnica da(s) jangada(s) salva-vidas da sua embarcação.\n\nPara garantir a segurança da embarcação e a conformidade legal, confirme por favor se podemos agendar a vistoria e a emissão do novo certificado.\n\nCom os melhores cumprimentos,\nOrey Azores`,
  },
  {
    key: "orcamento",
    label: "Orçamento aprovado",
    build: (nome) =>
      `Olá ${nome || "Exmo. Cliente"},\n\nO orçamento para a vistoria da sua jangada salva-vidas foi aprovado.\n\nEntraremos em contacto para agendar a data da intervenção.\n\nOrey Azores`,
  },
  {
    key: "certificado",
    label: "Certificado pronto",
    build: (nome) =>
      `Olá ${nome || "Exmo. Cliente"},\n\nInformamos que o certificado da vistoria da sua jangada salva-vidas já está disponível.\n\nEstamos à sua disposição para qualquer esclarecimento.\n\nOrey Azores`,
  },
  {
    key: "pagamento",
    label: "Recordação de pagamento",
    build: (nome) =>
      `Olá ${nome || "Exmo. Cliente"},\n\nRecordamos que existem faturas em dívida na nossa conta corrente.\n\nAgradecemos o seu contacto para regularização.\n\nOrey Azores`,
  },
];

function contactoKey(c: Comunicacao): string {
  const dest = String(c.destinatario || "").trim();
  const digits = dest.replace(/\D/g, "").replace(/^0+/, "");
  if (digits) return `tel:${digits.slice(-9)}`;
  if (dest.includes("@")) return `mail:${dest.toLowerCase()}`;
  if (c.clienteId) return `cli:${c.clienteId}`;
  if (c.refTipo && c.refId) return `ref:${c.refTipo}:${c.refId}`;
  return `id:${c.id}`;
}

function remetenteNome(c: Comunicacao): string {
  return String(c.enviadoPor || "").replace(/^remetente:/, "").trim();
}

function contactoLabel(c: Comunicacao): string {
  const dest = String(c.destinatario || "").trim();
  if (dest) return dest;
  const nome = remetenteNome(c);
  return nome || "Desconhecido";
}

const tipoIcon = (tipo: string, size = 14) =>
  tipo === "WHATSAPP" ? (
    <MessageCircle size={size} className="text-emerald-600" />
  ) : tipo === "EMAIL" ? (
    <Mail size={size} className="text-indigo-500" />
  ) : (
    <Smartphone size={size} className="text-sky-600" />
  );

export type ComunicacaoInboxProps = {
  canalInicial?: Canal;
  titulo?: string;
  descricao?: string;
  acento?: "indigo" | "emerald";
};

export default function ComunicacaoInbox({
  canalInicial,
  titulo = "Central de Comunicações",
  descricao = "Conversas por SMS, WhatsApp e e-mail num só lugar, com histórico centralizado.",
  acento = "indigo",
}: ComunicacaoInboxProps) {
  const [items, setItems] = useState<Comunicacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnectionStatus | null>(null);

  const [filtroDirecao, setFiltroDirecao] = useState<FiltroDirecao>("todas");
  const [filtroTipo, setFiltroTipo] = useState<Canal | "">(canalInicial ?? "");
  const [busca, setBusca] = useState("");
  const [selecao, setSelecao] = useState<string | null>(null);

  const [tipo, setTipo] = useState<Canal>(canalInicial ?? "SMS");
  const [destinatario, setDestinatario] = useState("");
  const [assunto, setAssunto] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [responderA, setResponderA] = useState<Comunicacao | null>(null);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroTipo) params.set("tipo", filtroTipo);
      const res = await fetch(`/api/comunicacoes?${params.toString()}`);
      if (!res.ok) throw new Error("Falha ao carregar");
      const json = await res.json();
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch {
      appToast.error("Não foi possível carregar o histórico.");
    } finally {
      setLoading(false);
    }
  }, [filtroTipo]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/status");
      setConnStatus(res.ok ? ((await res.json()) as ConnectionStatus) : null);
    } catch {
      setConnStatus(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStatus();
  }, [fetchStatus]);

  const conversas = useMemo<Conversa[]>(() => {
    const map = new Map<string, Conversa>();
    for (const c of items) {
      const key = contactoKey(c);
      const existente = map.get(key);
      if (!existente) {
        map.set(key, {
          key,
          contacto: String(c.destinatario || "").trim() || contactoLabel(c),
          nome: remetenteNome(c) || String(c.destinatario || "").trim(),
          canal: c.tipo,
          ultimaEm: c.enviadoEm,
          ultimaMensagem: c.mensagem,
          mensagens: [c],
          naoLidas: c.status === "recebido" && !c.respondidoEm ? 1 : 0,
        });
        continue;
      }
      existente.mensagens.push(c);
      if (new Date(c.enviadoEm).getTime() > new Date(existente.ultimaEm).getTime()) {
        existente.ultimaEm = c.enviadoEm;
        existente.ultimaMensagem = c.mensagem;
        existente.canal = c.tipo;
      }
      if (c.status === "recebido") existente.canal = "WHATSAPP";
      if (c.status === "recebido" && !c.respondidoEm) existente.naoLidas += 1;
    }
    const lista = Array.from(map.values());
    for (const cv of lista) cv.mensagens.sort((a, b) => new Date(a.enviadoEm).getTime() - new Date(b.enviadoEm).getTime());
    return lista.sort((a, b) => new Date(b.ultimaEm).getTime() - new Date(a.ultimaEm).getTime());
  }, [items]);

  const conversasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return conversas.filter((cv) => {
      const temRecebido = cv.mensagens.some((m) => m.status === "recebido");
      const temFalha = cv.mensagens.some((m) => m.status === "falhou" || m.status === "pendente");
      const temRascunho = cv.mensagens.some((m) => m.status === "rascunho");
      if (filtroDirecao === "recebidas" && !temRecebido) return false;
      if (filtroDirecao === "enviadas" && temRecebido && cv.mensagens.every((m) => m.status === "recebido")) return false;
      if (filtroDirecao === "falhas" && !temFalha) return false;
      if (filtroDirecao === "rascunhos" && !temRascunho) return false;
      if (termo) {
        const alvo = `${cv.contacto} ${cv.nome} ${cv.ultimaMensagem}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [conversas, filtroDirecao, busca]);

  const conversaAtual = useMemo(
    () => conversasFiltradas.find((cv) => cv.key === selecao) ?? conversas.find((cv) => cv.key === selecao) ?? null,
    [conversasFiltradas, conversas, selecao],
  );

  const totals = useMemo(() => {
    let recebidas = 0;
    let semResposta = 0;
    let pendentes = 0;
    let falhas = 0;
    let rascunhos = 0;
    for (const c of items) {
      if (c.status === "recebido") {
        recebidas += 1;
        if (!c.respondidoEm) semResposta += 1;
      }
      if (c.status === "pendente") pendentes += 1;
      if (c.status === "falhou") falhas += 1;
      if (c.status === "rascunho") rascunhos += 1;
    }
    return { recebidas, semResposta, pendentes, falhas, rascunhos };
  }, [items]);

  useEffect(() => {
    if (conversaAtual) {
      const c = conversaAtual;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTipo(c.canal);
      setDestinatario(c.contacto);
    }
  }, [conversaAtual]);

  const numMensagensAtual = conversaAtual?.mensagens.length ?? 0;
  useEffect(() => {
    if (selecao) threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selecao, numMensagensAtual]);

  const limparComposer = (cv: Conversa | null) => {
    setResponderA(null);
    setAssunto("");
    setMensagem("");
    setDestinatario(cv?.contacto ?? "");
    setTipo(cv?.canal ?? canalInicial ?? "SMS");
  };

  const preencherResposta = (c: Comunicacao) => {
    setResponderA(c);
    setTipo(c.tipo === "EMAIL" ? "EMAIL" : "WHATSAPP");
    setDestinatario(String(c.destinatario || "").trim());
    setAssunto(c.tipo === "EMAIL" ? `Re: ${c.assunto || "A sua mensagem"}` : "");
    setMensagem(`Olá,\n\nAgradecemos o seu contacto.\n\nCom os melhores cumprimentos,\nOrey Azores`);
  };

  const handleEnviar = async () => {
    if (!mensagem.trim()) return appToast.warning("Escreva a mensagem.");
    setSending(true);
    try {
      const res = await fetch("/api/comunicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          mensagem,
          assunto: assunto || undefined,
          destinatario: destinatario || undefined,
          clienteId: responderA?.clienteId ?? undefined,
          refTipo: responderA?.refTipo ?? undefined,
          refId: responderA?.refId ?? undefined,
          responderA: responderA?.id || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        appToast.error(json.error || "Falha ao enviar.");
        return;
      }
      if (json.whatsappUrl) {
        window.open(json.whatsappUrl, "_blank");
        appToast.success("Link WhatsApp aberto. Confirme o envio na aplicação.");
      } else {
        appToast.success(responderA ? "Resposta enviada." : "Comunicação enviada.");
      }
      limparComposer(conversaAtual);
      await fetchHistory();
    } catch {
      appToast.error("Erro ao enviar comunicação.");
    } finally {
      setSending(false);
    }
  };

  const handleTwilioVoipCall = async () => {
    const phone = destinatario.trim() || conversaAtual?.contacto || "+351910000000";
    const name = conversaAtual?.nome || "Artur Manuel Santos Arraial Pacheco";
    try {
      setSending(true);
      const res = await fetch("/api/comunicacoes/voip-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteNome: name,
          telefone: phone,
          jangadaModel: "SEASAVA PLUS R",
          capacidade: "12",
          serial: "4583200300158",
          navioNome: "Pesca Açores",
          dataValidade: "22/10/2026",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha na chamada VoIP.");
      appToast.success(`Chamada VoIP REST API iniciada com sucesso para ${name} (${phone})!`);
      await fetchHistory();
    } catch (err: any) {
      appToast.error(err?.message || "Erro ao iniciar chamada VoIP.");
    } finally {
      setSending(false);
    }
  };

  const descartar = async (c: Comunicacao) => {
    if (typeof window !== "undefined" && !window.confirm("Descartar esta mensagem do histórico?")) return;
    try {
      const res = await fetch(`/api/comunicacoes/${c.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        appToast.error(json.error || "Falha ao descartar.");
        return;
      }
      appToast.success("Mensagem descartada.");
      setItems((prev) => prev.filter((x) => x.id !== c.id));
      if (responderA?.id === c.id) setResponderA(null);
    } catch {
      appToast.error("Erro ao descartar mensagem.");
    }
  };

  const abrirWhatsApp = (c: Comunicacao) => {
    const nome = remetenteNome(c);
    const msg = encodeURIComponent(
      `Olá${nome ? ` ${nome}` : ""}, aqui é da Orey Azores.\n\nObrigado pelo seu contacto. Em que podemos ajudar?`,
    );
    const phone = String(c.destinatario || "").replace(/\D/g, "").replace(/^0+/, "");
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  };

  const abrirEmail = (c: Comunicacao) => {
    const to = c.destinatario || "";
    const subject = encodeURIComponent(`Re: ${c.assunto || "Orey Azores — a sua mensagem"}`);
    window.open(`mailto:${to}?subject=${subject}`, "_blank");
  };

  const acentoAtivo = acento === "emerald" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-indigo-600 hover:bg-indigo-700";
  const acentoTexto = acento === "emerald" ? "text-emerald-600" : "text-indigo-600";

  const tabs: Array<{ key: FiltroDirecao; label: string; badge?: number }> = [
    { key: "todas", label: "Todas" },
    { key: "recebidas", label: "Recebidas", badge: totals.semResposta },
    { key: "enviadas", label: "Enviadas" },
    { key: "rascunhos", label: "Rascunhos", badge: totals.rascunhos },
    { key: "falhas", label: "Falhas", badge: totals.falhas },
  ];

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="ds-page space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <MessageSquare className={acentoTexto} size={28} />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{titulo}</h1>
              <p className="text-sm text-slate-500">{descricao}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connStatus && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  connStatus.canSend
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
                title="Estado do provedor de envio"
              >
                <ShieldCheck size={13} />
                {connStatus.canSend ? `Ativo (${connStatus.provider || "WhatsApp"})` : "Envio não configurado"}
              </span>
            )}
            <button
              onClick={fetchHistory}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              <RefreshCw size={13} /> Atualizar
            </button>
          </div>
        </div>

        {/* Tecnico / VoIP & WhatsApp Banner */}
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-900 via-slate-900 to-sky-950 p-5 text-white shadow-md flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30">
              <Smartphone size={24} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-500/25 px-2.5 py-0.5 text-[10px] font-black uppercase text-emerald-300 ring-1 ring-emerald-500/30">
                  Estação de Serviço dos Açores
                </span>
                <span className="font-mono text-xs text-slate-300">Técnico Responsável</span>
              </div>
              <h2 className="text-xl font-black mt-0.5">Júlio Correia · +351 961 705 081</h2>
              <p className="text-xs text-slate-300">Central ativa para chamadas VoIP, WhatsApp, SMS e E-mail.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="tel:+351961705081"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
            >
              <Smartphone size={14} /> Ligar VoIP (+351 961 705 081)
            </a>
            <a
              href="https://wa.me/351961705081"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-sm hover:bg-emerald-400 transition"
            >
              <MessageCircle size={14} /> WhatsApp Directo
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center gap-3">
            <Inbox size={18} className="text-violet-500" />
            <div>
              <div className="text-2xl font-bold text-slate-900">{totals.recebidas}</div>
              <div className="text-xs text-slate-500">Recebidas</div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center gap-3">
            <Reply size={18} className="text-sky-500" />
            <div>
              <div className="text-2xl font-bold text-slate-900">{totals.semResposta}</div>
              <div className="text-xs text-slate-500">Sem resposta</div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center gap-3">
            <Clock3 size={18} className="text-amber-500" />
            <div>
              <div className="text-2xl font-bold text-slate-900">{totals.pendentes + totals.rascunhos}</div>
              <div className="text-xs text-slate-500">Pendentes / rascunhos</div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center gap-3">
            <XCircle size={18} className="text-rose-500" />
            <div>
              <div className="text-2xl font-bold text-slate-900">{totals.falhas}</div>
              <div className="text-xs text-slate-500">Falhas</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-[340px_1fr] min-h-[620px]">
          {/* Lista de conversas */}
          <div className="border-b lg:border-b-0 lg:border-r border-slate-100 flex flex-col">
            <div className="p-3 space-y-2 border-b border-slate-100">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Pesquisar conversa..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setFiltroDirecao(t.key)}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                      filtroDirecao === t.key ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {t.label}
                    {t.badge ? (
                      <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{t.badge}</span>
                    ) : null}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                {(["", "SMS", "WHATSAPP", "EMAIL"] as const).map((t) => (
                  <button
                    key={t || "all"}
                    onClick={() => setFiltroTipo(t)}
                    className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
                      filtroTipo === t ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    {t ? tipoIcon(t, 12) : null}
                    {t || "Todos"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-auto max-h-[540px] divide-y divide-slate-100">
              {loading ? (
                <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                  <Loader2 className="animate-spin" size={20} /> A carregar...
                </div>
              ) : conversasFiltradas.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  <MessageSquare size={30} className="mx-auto mb-2 opacity-40" />
                  Sem conversas
                </div>
              ) : (
                conversasFiltradas.map((cv) => (
                  <button
                    key={cv.key}
                    onClick={() => setSelecao(cv.key)}
                    className={`w-full text-left px-4 py-3 transition ${selecao === cv.key ? "bg-indigo-50/70" : "hover:bg-slate-50"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        {tipoIcon(cv.canal)}
                        <span className="truncate font-semibold text-slate-800 text-sm">{cv.nome || cv.contacto}</span>
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {new Date(cv.ultimaEm).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" })}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{cv.ultimaMensagem}</p>
                    <div className="mt-1 flex items-center gap-2">
                      {cv.contacto && cv.nome && cv.contacto !== cv.nome && (
                        <span className="truncate text-[10px] text-slate-400">{cv.contacto}</span>
                      )}
                      {cv.naoLidas > 0 && (
                        <span className="ml-auto rounded-full bg-violet-500 px-1.5 text-[10px] font-bold text-white">{cv.naoLidas}</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Thread + composer */}
          <div className="flex flex-col">
            {!conversaAtual ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2 p-10">
                <MessageSquare size={40} className="opacity-30" />
                <p className="text-sm font-semibold text-slate-500">Selecione uma conversa</p>
                <p className="text-xs">Escolha um contacto à esquerda ou escreva para um novo destinatário abaixo.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-auto p-5 space-y-3 max-h-[400px]">
                <div className="text-center text-[11px] text-slate-400">
                  {conversaAtual.nome || conversaAtual.contacto}
                </div>
                {conversaAtual.mensagens.map((m) => {
                  const recebida = m.status === "recebido";
                  const badge = STATUS_BADGES[m.status] || STATUS_BADGES.rascunho;
                  return (
                    <div key={m.id} className={`group flex ${recebida ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[78%] rounded-2xl border px-3.5 py-2.5 text-sm shadow-sm ${
                          recebida ? "border-violet-200 bg-violet-50 text-slate-800" : "border-slate-200 bg-white text-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {recebida ? tipoIcon(m.tipo, 12) : <ArrowUpRight size={12} className="text-slate-400" />}
                          <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${badge.bg}`}>{badge.label}</span>
                          {m.status === "lido" && <CheckCheck size={12} className="text-indigo-400" />}
                          {m.respondidoEm && <span className="text-[9px] font-bold uppercase text-emerald-600">respondido</span>}
                        </div>
                        {m.assunto && <p className="mt-1 text-xs font-semibold text-slate-600">{m.assunto}</p>}
                        <p className="mt-1 whitespace-pre-line">{m.mensagem}</p>
                        {m.erro && <p className="mt-1 text-[11px] text-rose-600">Erro: {m.erro}</p>}
                        <p className="mt-1 text-[10px] text-slate-400">
                          {new Date(m.enviadoEm).toLocaleString("pt-PT")}
                          {!recebida && m.enviadoPor ? ` · ${m.enviadoPor}` : ""}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
                          {recebida && (
                            <>
                              <button onClick={() => preencherResposta(m)} className="flex items-center gap-1 text-[10px] font-bold text-violet-600 hover:text-violet-800">
                                <Reply size={11} /> Responder
                              </button>
                              {m.tipo === "WHATSAPP" && (
                                <button onClick={() => abrirWhatsApp(m)} className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:text-emerald-800">
                                  <MessageCircle size={11} /> WhatsApp
                                </button>
                              )}
                              {m.tipo === "EMAIL" && (
                                <button onClick={() => abrirEmail(m)} className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800">
                                  <Mail size={11} /> Email
                                </button>
                              )}
                            </>
                          )}
                          {m.status === "rascunho" && (
                            <button
                              onClick={() => {
                                setResponderA(null);
                                setTipo(m.tipo);
                                setDestinatario(String(m.destinatario || ""));
                                setMensagem(m.mensagem);
                              }}
                              className="flex items-center gap-1 text-[10px] font-bold text-sky-600 hover:text-sky-800"
                            >
                              <FileText size={11} /> Usar rascunho
                            </button>
                          )}
                          <button onClick={() => descartar(m)} className="ml-auto flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-rose-600">
                            <Trash2 size={11} /> Descartar
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={threadEndRef} />
              </div>
            )}

            {/* Composer */}
            <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/60">
              {responderA && (
                <div className="flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs text-violet-700">
                  <span>A responder a mensagem #{responderA.id}</span>
                  <button onClick={() => setResponderA(null)} className="font-semibold text-violet-500 hover:text-violet-700">
                    Cancelar
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    {(["SMS", "WHATSAPP", "EMAIL"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTipo(t)}
                        className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                          tipo === t ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        {tipoIcon(t, 12)} {t}
                      </button>
                    ))}
                    <select
                      value=""
                      onChange={(e) => {
                        const t = TEMPLATES.find((x) => x.key === e.target.value);
                        if (t) setMensagem(t.build(conversaAtual?.nome || ""));
                      }}
                      className="ml-auto rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500"
                    >
                      <option value="" disabled>Modelo...</option>
                      {TEMPLATES.map((t) => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={destinatario}
                      onChange={(e) => setDestinatario(e.target.value)}
                      placeholder={tipo === "EMAIL" ? "email@exemplo.pt" : "9XXXXXXXX"}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {tipo === "EMAIL" && (
                      <input
                        value={assunto}
                        onChange={(e) => setAssunto(e.target.value)}
                        placeholder="Assunto"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    )}
                  </div>
                  <textarea
                    value={mensagem}
                    onChange={(e) => setMensagem(e.target.value)}
                    rows={3}
                    placeholder="Escreva a mensagem..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
                <div className="flex items-center gap-2 self-end">
                  <button
                    onClick={handleTwilioVoipCall}
                    disabled={sending}
                    className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    title="Ligar automaticamente por voz IA para o cliente"
                  >
                    <Smartphone size={16} /> Ligar VoIP IA
                  </button>
                  <button
                    onClick={handleEnviar}
                    disabled={sending}
                    className={`flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-bold text-white transition disabled:opacity-50 ${acentoAtivo}`}
                  >
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {responderA ? "Responder" : tipo === "WHATSAPP" ? "Abrir WhatsApp" : `Enviar ${tipo}`}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <ArrowDownLeft size={12} />
                O sistema não envia mensagens automaticamente. Cada envio é uma ação sua.
                {tipo === "WHATSAPP" && " O WhatsApp abre via link wa.me para confirmação."}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
