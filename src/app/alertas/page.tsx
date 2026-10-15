"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Mail,
  MessageSquare,
  MessageSquareText,
  Phone,
  X,
  Loader2,
  Flame,
  Waves,
  AlertTriangle,
  LifeBuoy,
  FileText,
  Radio,
  Ship,
  User,
  Copy,
  Search,
  Check,
} from "lucide-react";
import { formatDateAuto } from "@/lib/date-utils";

type AlertaTipo = "inspecao" | "certificado" | "assistencia" | "epirb" | "extintor" | "fato";

type Alerta = {
  tipo: AlertaTipo;
  id: number;
  referencia: string;
  data?: string | null;
  jangadaId?: number | null;
  jangadaSerial?: string | null;
  jangadaMarca?: string | null;
  jangadaModelo?: string | null;
  jangadaCapacidade?: number | null;
  status?: string | null;
  sourceYear?: number | null;
  ordemId?: number | null;
  epirbId?: number | null;
  extintorId?: number | null;
  navioNome?: string | null;
  clienteNome?: string | null;
  clienteEmail?: string | null;
  clienteTelefone?: string | null;
};

type AlertsPayload = {
  total: number;
  inspecoes: number;
  certificados: number;
  pedidosAssistencia: number;
  epirbs: number;
  extintores: number;
  fatos: number;
  alertas: Alerta[];
};

const TIPO_CONFIG: Record<AlertaTipo, { label: string; badgeClass: string; icon: React.ElementType }> = {
  assistencia: { label: "Pedido Assistência", badgeClass: "bg-rose-50 border-rose-200 text-rose-700", icon: AlertTriangle },
  inspecao: { label: "Inspeção", badgeClass: "bg-indigo-50 border-indigo-200 text-indigo-700", icon: LifeBuoy },
  certificado: { label: "Certificado", badgeClass: "bg-amber-50 border-amber-200 text-amber-700", icon: FileText },
  epirb: { label: "EPIRB", badgeClass: "bg-amber-50 border-amber-200 text-amber-800", icon: Radio },
  extintor: { label: "Extintor", badgeClass: "bg-orange-50 border-orange-200 text-orange-700", icon: Flame },
  fato: { label: "Fato de imersão", badgeClass: "bg-sky-50 border-sky-200 text-sky-700", icon: Waves },
};

function parseFlexible(value?: string | null): Date | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;
  const br = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const parsed = new Date(year, month - 1, day);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return null;
}

function daysUntil(value?: string | null): number | null {
  const date = parseFlexible(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function urgencyBadge(value?: string | null) {
  const diff = daysUntil(value);
  if (diff === null) return null;
  if (diff < 0) {
    return { text: `há ${Math.abs(diff)} dia(s)`, className: "bg-red-100 text-red-700 border-red-200" };
  }
  if (diff === 0) {
    return { text: "vence hoje", className: "bg-red-100 text-red-700 border-red-200" };
  }
  if (diff <= 7) {
    return { text: `faltam ${diff} dia(s)`, className: "bg-amber-100 text-amber-800 border-amber-200" };
  }
  return { text: `faltam ${diff} dia(s)`, className: "bg-slate-100 text-slate-600 border-slate-200" };
}

function buildMessage(a: Alerta): string {
  const nome = (a.clienteNome || "").trim();
  const saudacao = nome ? `Olá ${nome},` : "Olá,";
  const navio = (a.navioNome || "").trim();
  const data = a.data ? formatDateAuto(a.data) : "—";
  const assinatura = "\n\nCom os melhores cumprimentos,\nOrey Azores";

  if (a.tipo === "assistencia") {
    return `${saudacao}\n\nRecebemos o seu pedido de assistência${navio ? ` relativo à embarcação "${navio}"` : ""} (${a.referencia}). Vamos analisar o pedido e entrar em contacto para agendar a intervenção.${assinatura}`;
  }

  if (a.tipo === "inspecao" || a.tipo === "certificado") {
    const modelo = [a.jangadaMarca, a.jangadaModelo].filter(Boolean).join(" ").trim() || "salva-vidas";
    const capacidade = a.jangadaCapacidade ? ` (${a.jangadaCapacidade}P)` : "";
    const serie = a.jangadaSerial ? `, Série: ${a.jangadaSerial}` : "";
    const instalada = navio ? ` instalada na embarcação "${navio}"` : "";
    return `${saudacao}\n\nRelembramos que a vistoria técnica da jangada ${modelo}${capacidade}${serie}${instalada} tem validade prevista até ${data}. Para garantir a segurança da embarcação e a conformidade legal, confirme por favor se podemos agendar a vistoria e a emissão do novo certificado. Ficamos a aguardar o seu contacto.${assinatura}`;
  }

  if (a.tipo === "epirb") {
    return `${saudacao}\n\nRelembramos que o ${a.referencia}${navio ? ` da embarcação "${navio}"` : ""} tem validade prevista até ${data}. Recomendamos agendar a respetiva revisão (ou substituição da bateria) para manter a conformidade.${assinatura}`;
  }

  if (a.tipo === "extintor") {
    const motivo = a.status ? ` (${a.status})` : "";
    return `${saudacao}\n\nRelembramos que o ${a.referencia}${navio ? ` da embarcação "${navio}"` : ""} tem manutenção prevista${motivo} até ${data}. Recomendamos agendar a respetiva recarga/inspeção.${assinatura}`;
  }

  return `${saudacao}\n\nRelembramos que o ${a.referencia}${navio ? ` da embarcação "${navio}"` : ""} tem inspeção prevista até ${data}. Recomendamos agendar a respetiva inspeção para manter a conformidade.${assinatura}`;
}

function buildSubject(a: Alerta): string {
  if (a.tipo === "assistencia") return `Pedido de assistência ${a.referencia}`;
  if (a.tipo === "epirb") return `Aviso de validade - EPIRB`;
  if (a.tipo === "extintor") return `Aviso de manutenção - Extintor`;
  if (a.tipo === "fato") return `Aviso de inspeção - Fato de imersão`;
  return `Aviso de vencimento de inspeção - ${a.referencia}`;
}

export default function AlertasPage() {
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<AlertsPayload>({
    total: 0,
    inspecoes: 0,
    certificados: 0,
    pedidosAssistencia: 0,
    epirbs: 0,
    extintores: 0,
    fatos: 0,
    alertas: [],
  });

  const [filterTipo, setFilterTipo] = useState<"todos" | AlertaTipo>("todos");
  const [search, setSearch] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // States for notifications
  const [isNotifying, setIsNotifying] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<Alerta | null>(null);
  const [contactInfo, setContactInfo] = useState<{ name: string; email: string; phone: string } | null>(null);
  const [canal, setCanal] = useState<"whatsapp" | "sms" | "email" | "chamada">("whatsapp");
  const [messageText, setMessageText] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [sendingSms, setSendingSms] = useState(false);
  const [sendStatus, setSendStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const CANAIS: { key: "whatsapp" | "sms" | "email" | "chamada"; label: string; icon: React.ElementType }[] = [
    { key: "whatsapp", label: "WhatsApp", icon: MessageSquare },
    { key: "sms", label: "SMS", icon: MessageSquareText },
    { key: "email", label: "E-mail", icon: Mail },
    { key: "chamada", label: "Chamada", icon: Phone },
  ];

  const canalNeedsPhone = canal === "whatsapp" || canal === "sms" || canal === "chamada";
  const canalDisabled = canalNeedsPhone ? !contactInfo?.phone : !contactInfo?.email;

  const canalHint = () => {
    if (!contactInfo) return "";
    if (canal === "whatsapp") return `Será aberto no WhatsApp para ${contactInfo.phone || "telemóvel não indicado"}.`;
    if (canal === "sms") return `Enviado por SMS (gateway) para ${contactInfo.phone || "telemóvel não indicado"}.`;
    if (canal === "chamada") return `Ligação telefónica para ${contactInfo.phone || "telemóvel não indicado"}.`;
    return `Enviado a partir do seu cliente de e-mail para ${contactInfo.email || "endereço não indicado"}.`;
  };

  const handleNotifyClick = (a: Alerta) => {
    setSelectedAlert(a);
    setIsNotifying(true);
    setCanal(a.clienteTelefone ? "whatsapp" : a.clienteEmail ? "email" : "whatsapp");
    setSendStatus(null);
    setContactInfo({
      name: a.clienteNome || "",
      email: a.clienteEmail || "",
      phone: a.clienteTelefone || "",
    });
    setMessageText(buildMessage(a));
    setEmailSubject(buildSubject(a));
  };

  const handleSendSms = async () => {
    if (!contactInfo?.phone || !messageText.trim()) return;
    setSendingSms(true);
    setSendStatus(null);
    try {
      const res = await fetch("/api/notificar-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: contactInfo.phone, message: messageText }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSendStatus({ ok: true, text: "SMS enviado com sucesso." });
      } else {
        setSendStatus({ ok: false, text: data?.error || `Falha ao enviar SMS (${res.status}).` });
      }
    } catch (e) {
      console.error(e);
      setSendStatus({ ok: false, text: "Erro de rede ao enviar SMS." });
    } finally {
      setSendingSms(false);
    }
  };

  const handleNotifyAction = async () => {
    if (!contactInfo) return;
    const number = (contactInfo.phone || "").replace(/\s+/g, "").replace(/^\+/, "");
    const email = contactInfo.email || "";
    setSendStatus(null);

    if (canal === "whatsapp" && number) {
      window.open(`https://wa.me/${number}?text=${encodeURIComponent(messageText)}`, "_blank");
      setSendStatus({ ok: true, text: "WhatsApp aberto para envio da mensagem." });
      return;
    }

    if (canal === "sms") {
      await handleSendSms();
      return;
    }

    if (canal === "chamada" && number) {
      window.location.href = `tel:${number}`;
      setSendStatus({ ok: true, text: `A iniciar chamada para ${contactInfo.phone}.` });
      return;
    }

    if (canal === "email") {
      const mailto = `mailto:${email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(messageText)}`;
      window.open(mailto, "_blank");
      setSendStatus({ ok: true, text: "Cliente de e-mail aberto com a mensagem preenchida." });
    }
  };

  const handleCopyContact = async (a: Alerta) => {
    const parts = [a.clienteNome, a.clienteTelefone, a.navioNome].filter(Boolean);
    if (parts.length === 0) return;
    try {
      await navigator.clipboard.writeText(parts.join(" · "));
      setCopiedKey(`${a.tipo}-${a.id}`);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alertas");
      const data = await res.json();
      setPayload({
        total: Number(data?.total || 0),
        inspecoes: Number(data?.inspecoes || 0),
        certificados: Number(data?.certificados || 0),
        pedidosAssistencia: Number(data?.pedidosAssistencia || 0),
        epirbs: Number(data?.epirbs || 0),
        extintores: Number(data?.extintores || 0),
        fatos: Number(data?.fatos || 0),
        alertas: Array.isArray(data?.alertas) ? data.alertas : [],
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await fetchAlerts();
    })();
  }, []);

  const handleQuickDelete = async (orderId: number) => {
    if (!confirm("Tem a certeza que deseja eliminar este pedido de assistência?")) return;
    try {
      const res = await fetch(`/api/ordens-servico/${orderId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchAlerts();
      } else {
        const errData = await res.json();
        alert(`Erro ao eliminar pedido: ${errData?.error || "Desconhecido"}`);
      }
    } catch (e) {
      console.error(e);
      alert("Erro ao eliminar pedido.");
    }
  };

  const kpis = useMemo(
    () => [
      { key: "todos" as const, label: "Total de Alertas", value: payload.total, accent: "text-red-600", icon: AlertTriangle, chip: "bg-red-50 text-red-700" },
      { key: "assistencia" as const, label: "Pedidos de Assistência", value: payload.pedidosAssistencia, accent: "text-rose-600", icon: AlertTriangle, chip: "bg-rose-50 text-rose-700" },
      { key: "inspecao" as const, label: "Inspeções Próximas", value: payload.inspecoes, accent: "text-indigo-600", icon: LifeBuoy, chip: "bg-indigo-50 text-indigo-700" },
      { key: "certificado" as const, label: "Certificados a Expirar", value: payload.certificados, accent: "text-amber-600", icon: FileText, chip: "bg-amber-50 text-amber-700" },
      { key: "epirb" as const, label: "EPIRBs a Expirar", value: payload.epirbs, accent: "text-amber-800", icon: Radio, chip: "bg-amber-50 text-amber-800" },
      { key: "extintor" as const, label: "Extintores a Expirar", value: payload.extintores, accent: "text-orange-600", icon: Flame, chip: "bg-orange-50 text-orange-700" },
      { key: "fato" as const, label: "Fatos de Imersão a Expirar", value: payload.fatos, accent: "text-sky-600", icon: Waves, chip: "bg-sky-50 text-sky-700" },
    ],
    [payload],
  );

  const alertasFiltrados = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payload.alertas.filter((a) => {
      if (filterTipo !== "todos" && a.tipo !== filterTipo) return false;
      if (!term) return true;
      return [a.referencia, a.navioNome, a.clienteNome, a.jangadaSerial]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [payload.alertas, filterTipo, search]);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Alertas e Pedidos de Assistência</h1>
          <p className="text-sm text-gray-600 mt-1">
            Monitorização de inspeções/certificados próximos do vencimento e novos pedidos de assistência do Portal do Cliente.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 mb-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            const ativo = filterTipo === kpi.key;
            return (
              <button
                key={kpi.key}
                type="button"
                onClick={() => setFilterTipo(ativo && kpi.key !== "todos" ? "todos" : kpi.key)}
                className={`text-left bg-white border rounded-xl p-4 transition cursor-pointer hover:shadow-sm ${
                  ativo ? "border-slate-900 ring-1 ring-slate-900/10" : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-gray-500 font-medium leading-tight">{kpi.label}</p>
                  <span className={`inline-flex items-center justify-center rounded-lg p-1 ${kpi.chip}`}>
                    <Icon size={13} />
                  </span>
                </div>
                <p className={`text-2xl font-black mt-1 ${kpi.accent}`}>{kpi.value}</p>
              </button>
            );
          })}
        </div>

        <div className="bg-white border rounded-xl mb-4 p-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(["todos", "assistencia", "inspecao", "certificado", "epirb", "extintor", "fato"] as const).map((key) => {
              const isTodos = key === "todos";
              const ativo = filterTipo === key;
              const count = isTodos
                ? payload.total
                : key === "assistencia"
                ? payload.pedidosAssistencia
                : key === "inspecao"
                ? payload.inspecoes
                : key === "certificado"
                ? payload.certificados
                : key === "epirb"
                ? payload.epirbs
                : key === "extintor"
                ? payload.extintores
                : payload.fatos;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilterTipo(key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                    ativo
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {isTodos ? "Todos" : TIPO_CONFIG[key].label}
                  <span className={`rounded-full px-1.5 text-[10px] ${ativo ? "bg-white/20" : "bg-gray-100"}`}>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="relative ml-auto w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar referência, navio, cliente..."
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="bg-white border rounded-xl p-4">
          {loading ? (
            <p className="text-sm text-gray-500">A carregar alertas...</p>
          ) : alertasFiltrados.length === 0 ? (
            <p className="text-sm text-gray-500">
              {payload.alertas.length === 0 ? "Sem alertas ou pedidos pendentes." : "Nenhum alerta corresponde ao filtro."}
            </p>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-2.5 text-left font-bold text-gray-700">Tipo</th>
                    <th className="p-2.5 text-left font-bold text-gray-700">Referência</th>
                    <th className="p-2.5 text-left font-bold text-gray-700">Navio / Cliente</th>
                    <th className="p-2.5 text-left font-bold text-gray-700">Data Pretendida / Limite</th>
                    <th className="p-2.5 text-left font-bold text-gray-700">Ações / Ligação</th>
                  </tr>
                </thead>
                <tbody>
                  {alertasFiltrados.map((a) => {
                    const cfg = TIPO_CONFIG[a.tipo];
                    const Icon = cfg.icon;
                    const urgency = a.tipo === "assistencia" ? null : urgencyBadge(a.data);
                    const rowKey = `${a.tipo}-${a.id}`;
                    return (
                      <tr
                        key={rowKey}
                        className={`border-t hover:bg-slate-50/60 ${a.tipo === "assistencia" ? "bg-rose-50/20" : ""}`}
                      >
                        <td className="p-2.5 align-top">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${cfg.badgeClass}`}>
                            <Icon size={12} />
                            {cfg.label}
                            {a.tipo === "epirb" && a.status ? ` · ${a.status}` : ""}
                          </span>
                        </td>
                        <td className="p-2.5 align-top font-medium text-gray-800">
                          {a.referencia}
                          {a.tipo === "extintor" && a.status && (
                            <span className="block text-xs text-orange-700 font-normal mt-0.5">{a.status}</span>
                          )}
                          {a.tipo === "fato" && a.status && (
                            <span className="block text-xs text-sky-700 font-normal mt-0.5">{a.status}</span>
                          )}
                        </td>
                        <td className="p-2.5 align-top">
                          {a.navioNome || a.clienteNome ? (
                            <div className="space-y-0.5">
                              {a.navioNome && (
                                <span className="flex items-center gap-1 text-gray-800 font-medium">
                                  <Ship size={12} className="text-gray-400" /> {a.navioNome}
                                </span>
                              )}
                              {a.clienteNome && (
                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                  <User size={11} className="text-gray-400" /> {a.clienteNome}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="p-2.5 align-top font-medium text-gray-700">
                          <div className="flex flex-col gap-1">
                            <span>{formatDateAuto(a.data)}</span>
                            {urgency && (
                              <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${urgency.className}`}>
                                {urgency.text}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2.5 align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            {a.tipo === "assistencia" && a.ordemId && (
                              <>
                                <Link
                                  className="inline-flex items-center rounded-lg bg-rose-100 text-rose-800 hover:bg-rose-200 px-3 py-1 font-bold text-xs transition-colors"
                                  href={`/ordens-servico/${a.ordemId}`}
                                >
                                  Controlar & Editar
                                </Link>
                                <button
                                  onClick={() => handleQuickDelete(a.ordemId!)}
                                  className="inline-flex items-center rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200/50 px-3 py-1 font-bold text-xs transition-colors cursor-pointer"
                                >
                                  Eliminar
                                </button>
                              </>
                            )}

                            {a.tipo === "epirb" && a.epirbId && (
                              <a className="text-blue-700 font-semibold hover:underline" href={`/epirbs/${a.epirbId}`}>
                                Abrir EPIRB
                              </a>
                            )}

                            {a.tipo === "extintor" && a.extintorId && (
                              <a className="text-orange-700 font-semibold hover:underline" href="/extintores">
                                Abrir Extintores
                              </a>
                            )}

                            {a.tipo === "fato" && (
                              <Link className="text-sky-700 font-semibold hover:underline" href="/fatos-imersao">
                                Abrir Fatos de Imersão
                              </Link>
                            )}

                            {a.jangadaId && (
                              <a className="text-blue-700 font-semibold hover:underline" href={`/jangadas/${a.jangadaId}`}>
                                Abrir jangada
                              </a>
                            )}

                            {!a.jangadaId && !a.ordemId && a.jangadaSerial && a.tipo !== "epirb" && (
                              <span className="text-gray-500 text-xs">Serial: {a.jangadaSerial}</span>
                            )}

                            <button
                              onClick={() => handleNotifyClick(a)}
                              className="inline-flex items-center gap-1 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 text-xs font-bold hover:bg-indigo-100 transition cursor-pointer"
                            >
                              <MessageSquare size={12} /> Notificar
                            </button>

                            {(a.clienteNome || a.clienteTelefone || a.navioNome) && (
                              <button
                                onClick={() => handleCopyContact(a)}
                                title="Copiar nome, telefone e navio"
                                className="inline-flex items-center gap-1 rounded border border-gray-200 text-gray-600 px-2 py-0.5 text-xs font-semibold hover:bg-gray-50 transition cursor-pointer"
                              >
                                {copiedKey === rowKey ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                {copiedKey === rowKey ? "Copiado" : "Contacto"}
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

      {/* Drawer/Modal de Notificação */}
      {isNotifying && selectedAlert && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 max-w-lg w-full overflow-hidden flex flex-col relative animate-in fade-in zoom-in-95 duration-250">
            <div className="bg-gradient-to-r from-sky-100 to-indigo-100 text-slate-900 p-6 flex justify-between items-center relative overflow-hidden border-b border-sky-200">
              <div className="absolute -top-16 -right-16 w-32 h-32 bg-indigo-200/40 rounded-full blur-xl pointer-events-none" />
              <div>
                <h3 className="font-bold text-lg">Notificar Cliente</h3>
                <p className="text-xs text-slate-600 mt-1">Alertar vencimento para: {selectedAlert.referencia}</p>
                {(selectedAlert.navioNome || selectedAlert.clienteNome) && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {[selectedAlert.clienteNome, selectedAlert.navioNome].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <button
                onClick={() => setIsNotifying(false)}
                className="text-slate-500 hover:text-slate-900 rounded-full p-1.5 hover:bg-white/70 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Nome do Cliente</label>
                  <input
                    type="text"
                    value={contactInfo?.name || ""}
                    onChange={(e) => setContactInfo((prev) => ({ ...prev!, name: e.target.value }))}
                    placeholder="Nome do cliente"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Telemóvel / Telefone</label>
                  <input
                    type="text"
                    value={contactInfo?.phone || ""}
                    onChange={(e) => setContactInfo((prev) => ({ ...prev!, phone: e.target.value }))}
                    placeholder="Telemóvel (WhatsApp)"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">E-mail</label>
                <input
                  type="email"
                  value={contactInfo?.email || ""}
                  onChange={(e) => setContactInfo((prev) => ({ ...prev!, email: e.target.value }))}
                  placeholder="Email de contacto"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Meio de Notificação</label>
                <div className="grid grid-cols-4 gap-2">
                  {CANAIS.map((c) => {
                    const Icon = c.icon;
                    const ativo = canal === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => {
                          setCanal(c.key);
                          setSendStatus(null);
                        }}
                        className={`inline-flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-bold transition cursor-pointer ${
                          ativo
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-200"
                            : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <Icon size={16} />
                        {c.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">{canalHint()}</p>
              </div>

              {canal === "email" && (
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Assunto (E-mail)</label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Assunto da mensagem"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  {canal === "chamada" ? "Mensagem (guião da chamada)" : "Corpo da Mensagem"}
                </label>
                <textarea
                  rows={6}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Escreva a mensagem..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-sans"
                />
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100">
              {sendStatus && (
                <span className={`text-xs font-semibold mr-auto ${sendStatus.ok ? "text-emerald-600" : "text-red-600"}`}>
                  {sendStatus.text}
                </span>
              )}
              <button
                onClick={handleNotifyAction}
                disabled={sendingSms || canalDisabled}
                title={canalDisabled ? "Contacto em falta — preencha o telemóvel/e-mail." : undefined}
                className={`inline-flex items-center gap-2 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                  canal === "whatsapp"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : canal === "sms"
                    ? "bg-amber-600 hover:bg-amber-700"
                    : canal === "chamada"
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {canal === "sms" && sendingSms ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  (() => {
                    const CanalIcon = CANAIS.find((c) => c.key === canal)?.icon || Mail;
                    return <CanalIcon size={14} />;
                  })()
                )}
                {canal === "sms" && sendingSms
                  ? "A enviar..."
                  : canal === "whatsapp"
                  ? "Enviar WhatsApp"
                  : canal === "sms"
                  ? "Enviar SMS"
                  : canal === "chamada"
                  ? "Iniciar Chamada"
                  : "Abrir E-mail"}
              </button>
              <button
                onClick={() => setIsNotifying(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
