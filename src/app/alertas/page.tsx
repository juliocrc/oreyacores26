"use client";

import { useEffect, useState } from "react";
import { Mail, MessageSquare, MessageSquareText, Phone, X, Loader2, Flame, Waves } from "lucide-react";
import { formatDateAuto } from "@/lib/date-utils";

type Alerta = {
  tipo: "inspecao" | "certificado" | "assistencia" | "epirb" | "extintor" | "fato";
  id: number;
  referencia: string;
  data?: string | null;
  jangadaId?: number | null;
  jangadaSerial?: string | null;
  status?: string | null;
  sourceYear?: number | null;
  ordemId?: number | null;
  epirbId?: number | null;
  extintorId?: number | null;
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

type ClienteDetalhe = {
  nome?: string;
  email?: string;
  telmovel?: string;
  telefone?: string;
};

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
    alertas: []
  });

  // States for notifications
  const [isNotifying, setIsNotifying] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<Alerta | null>(null);
  const [loadingContact, setLoadingContact] = useState(false);
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
  const canalDisabled = canalNeedsPhone ? !contactInfo?.phone : false;

  const canalHint = () => {
    if (!contactInfo) return "";
    if (canal === "whatsapp") return `Será aberto no WhatsApp para ${contactInfo.phone || "telemóvel não indicado"}.`;
    if (canal === "sms") return `Enviado por SMS (gateway) para ${contactInfo.phone || "telemóvel não indicado"}.`;
    if (canal === "chamada") return `Ligação telefónica para ${contactInfo.phone || "telemóvel não indicado"}.`;
    return `Enviado a partir do seu cliente de e-mail para ${contactInfo.email || "endereço não indicado"}.`;
  };

  const handleNotifyClick = async (a: Alerta) => {
    setSelectedAlert(a);
    setIsNotifying(true);
    setCanal("whatsapp");
    setSendStatus(null);
    setLoadingContact(true);
    setContactInfo(null);
    setMessageText("");
    setEmailSubject(`Aviso de Vencimento de Inspeção - ${a.referencia}`);

    try {
      let clientDetails: ClienteDetalhe | null = null;
      let jangadaId = a.jangadaId;
      let navioNome = "";
      let jangadaModel = "";
      let jangadaCapacity = "";
      let jangadaSerial = a.jangadaSerial || "";
      let dataValidade = a.data ? formatDateAuto(a.data) : "—";

      if (!jangadaId && a.jangadaSerial) {
        const resSerial = await fetch(`/api/jangadas/serial/${a.jangadaSerial}`);
        if (resSerial.ok) {
          const jData = await resSerial.json();
          jangadaId = jData?.id;
        }
      }

      if (jangadaId) {
        const resJangada = await fetch(`/api/jangadas/${jangadaId}`);
        if (resJangada.ok) {
          const data = await resJangada.json();
          const jangada = data?.jangada || data;
          jangadaModel = `${jangada?.brand || ""} ${jangada?.model || ""}`.trim();
          jangadaCapacity = String(jangada?.capacity || "");
          jangadaSerial = jangada?.serial || jangadaSerial;
          if (jangada?.dataProxInspecao) {
            dataValidade = formatDateAuto(jangada.dataProxInspecao);
          }
          const ship = jangada?.ship || data?.ship;
          navioNome = String(ship?.nome || ship?.name || jangada?.shipNome || jangada?.shipNameManual || "").trim();
          const client = jangada?.serviceStationQueue?.ordemServico?.cliente || ship?.cliente || jangada?.cliente;
          if (client?.id) {
            const resCli = await fetch(`/api/clientes/${client.id}`);
            if (resCli.ok) {
              clientDetails = await resCli.json();
            }
          }
        }
      }

      const name = clientDetails?.nome || "";
      const email = clientDetails?.email || "";
      const phone = clientDetails?.telmovel || clientDetails?.telefone || "";

      setContactInfo({ name, email, phone });

      const clienteExibido = name ? `Sr. ${name}` : "Exmo. Cliente";
      setMessageText(`Olá ${clienteExibido},\n\nRelembramos que a vistoria técnica da jangada salva-vidas ${jangadaModel || a.referencia}${jangadaCapacity ? ` (${jangadaCapacity}P` : ""}${jangadaSerial ? `, Série: ${jangadaSerial}` : ""}${jangadaCapacity ? ")" : ""}${navioNome ? ` instalada na embarcação "${navioNome}"` : ""} tem validade prevista até ${dataValidade}. Para garantir a segurança da embarcação e a conformidade legal, confirme por favor se podemos agendar a vistoria e a emissão do novo certificado. Ficamos a aguardar o seu contacto.\n\nCom os melhores cumprimentos,\nOrey Azores`);
    } catch (err) {
      console.error(err);
      setContactInfo({ name: "", email: "", phone: "" });
      setMessageText(`Olá Sr. Cliente,\n\nRelembramos que a vistoria técnica da jangada salva-vidas (${a.referencia}) tem validade prevista até ${a.data ? formatDateAuto(a.data) : "—"}. Para garantir a segurança da embarcação e a conformidade legal, confirme por favor se podemos agendar a vistoria e a emissão do novo certificado. Ficamos a aguardar o seu contacto.\n\nCom os melhores cumprimentos,\nOrey Azores`);
    } finally {
      setLoadingContact(false);
    }
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
    const number = (contactInfo.phone || "").replace(/\s+/g, "");
    const email = contactInfo.email || "";
    setSendStatus(null);

    if (canal === "whatsapp" && number) {
      window.open(
        `https://wa.me/${number}?text=${encodeURIComponent(messageText)}`,
        "_blank",
      );
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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Alertas e Pedidos de Assistência</h1>
          <p className="text-sm text-gray-600 mt-1">
            Monitorização de inspeções/certificados próximos do vencimento e novos pedidos de assistência do Portal do Cliente.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-7 gap-3 mb-4">
          <div className="bg-white border rounded-xl p-4">
            <p className="text-xs text-gray-500 font-medium">Total de Alertas</p>
            <p className="text-2xl font-black text-red-600">{payload.total}</p>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <p className="text-xs text-gray-500 font-medium font-semibold text-indigo-500">Pedidos de Assistência</p>
            <p className="text-2xl font-black text-rose-600">{payload.pedidosAssistencia}</p>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <p className="text-xs text-gray-500 font-medium">Inspeções Próximas</p>
            <p className="text-2xl font-black text-indigo-600">{payload.inspecoes}</p>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <p className="text-xs text-gray-500 font-medium">Certificados a Expirar</p>
            <p className="text-2xl font-black text-amber-600">{payload.certificados}</p>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <p className="text-xs text-gray-500 font-medium">EPIRBs a Expirar</p>
            <p className="text-2xl font-black text-amber-800">{payload.epirbs}</p>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <p className="text-xs text-gray-500 font-medium">Extintores a Expirar</p>
            <p className="text-2xl font-black text-orange-600">{payload.extintores}</p>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <p className="text-xs text-gray-500 font-medium">Fatos de Imersão a Expirar</p>
            <p className="text-2xl font-black text-sky-600">{payload.fatos}</p>
          </div>
        </div>

        <div className="bg-white border rounded-xl p-4">
          {loading ? (
            <p className="text-sm text-gray-500">A carregar alertas...</p>
          ) : payload.alertas.length === 0 ? (
            <p className="text-sm text-gray-500">Sem alertas ou pedidos pendentes.</p>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-2.5 text-left font-bold text-gray-700">Tipo</th>
                    <th className="p-2.5 text-left font-bold text-gray-700">Referência / Navio</th>
                    <th className="p-2.5 text-left font-bold text-gray-700">Data Pretendida / Limite</th>
                    <th className="p-2.5 text-left font-bold text-gray-700">Ações / Ligação</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.alertas.map((a) => (
                    <tr key={`${a.tipo}-${a.id}`} className={`border-t hover:bg-slate-50/50 ${a.tipo === "assistencia" ? "bg-rose-50/20" : ""}`}>
                      <td className="p-2.5">
                        {a.tipo === "assistencia" ? (
                          <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-200 text-rose-700 px-2 py-0.5 text-xs font-bold">
                            🚨 Pedido Assistência
                          </span>
                        ) : a.tipo === "epirb" ? (
                          <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 text-xs font-bold">
                            📡 EPIRB ({a.status})
                          </span>
                        ) : a.tipo === "extintor" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 px-2 py-0.5 text-xs font-bold">
                            <Flame size={12} /> Extintor
                          </span>
                        ) : a.tipo === "fato" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 text-sky-700 px-2 py-0.5 text-xs font-bold">
                            <Waves size={12} /> Fato de Imersão
                          </span>
                        ) : (
                          <span className="capitalize px-2 py-0.5 text-xs font-semibold bg-gray-100 border border-gray-200 rounded-full text-gray-700">
                            {a.tipo}
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 font-medium text-gray-800">
                        {a.referencia}
                        {a.tipo === "extintor" && a.status && (
                          <span className="block text-xs text-orange-700 font-normal mt-0.5">{a.status}</span>
                        )}
                        {a.tipo === "fato" && a.status && (
                          <span className="block text-xs text-sky-700 font-normal mt-0.5">{a.status}</span>
                        )}
                      </td>
                      <td className="p-2.5 font-medium text-gray-700">{formatDateAuto(a.data)}</td>
                      <td className="p-2.5">
                        {a.tipo === "assistencia" && a.ordemId ? (
                          <div className="flex items-center gap-2">
                            <a
                              className="inline-flex items-center rounded-lg bg-rose-100 text-rose-800 hover:bg-rose-200 px-3 py-1 font-bold text-xs transition-colors"
                              href={`/ordens-servico/${a.ordemId}`}
                            >
                              Controlar & Editar
                            </a>
                            <button
                              onClick={() => handleQuickDelete(a.ordemId!)}
                              className="inline-flex items-center rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200/50 px-3 py-1 font-bold text-xs transition-colors cursor-pointer"
                            >
                              Eliminar
                            </button>
                          </div>
                        ) : a.tipo === "epirb" && a.id ? (
                          <a className="text-blue-700 hover:underline" href={`/epirbs/${a.id}`}>
                            Abrir EPIRB
                          </a>
                        ) : a.tipo === "extintor" && a.extintorId ? (
                          <a className="text-orange-700 hover:underline font-semibold" href="/extintores">
                            Abrir Extintores
                          </a>
                        ) : a.tipo === "fato" && a.id ? (
                          <a className="text-sky-700 hover:underline font-semibold" href="/fatos-imersao">
                            Abrir Fatos de Imersão
                          </a>
                        ) : a.jangadaId ? (
                          <div className="flex items-center gap-3">
                            <a className="text-blue-750 font-semibold hover:underline" href={`/jangadas/${a.jangadaId}`}>
                              Abrir jangada
                            </a>
                            <button
                              onClick={() => handleNotifyClick(a)}
                              className="inline-flex items-center gap-1 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 text-xs font-bold hover:bg-indigo-100 transition cursor-pointer"
                            >
                              <MessageSquare size={12} /> Notificar
                            </button>
                          </div>
                        ) : a.jangadaSerial ? (
                          <div className="flex items-center gap-3">
                            <span className="text-gray-500">Serial: {a.jangadaSerial}</span>
                            <button
                              onClick={() => handleNotifyClick(a)}
                              className="inline-flex items-center gap-1 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 text-xs font-bold hover:bg-indigo-100 transition cursor-pointer"
                            >
                              <MessageSquare size={12} /> Notificar
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
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
            {/* Header */}
            <div className="bg-gradient-to-r from-sky-100 to-indigo-100 text-slate-900 p-6 flex justify-between items-center relative overflow-hidden border-b border-sky-200">
              <div className="absolute -top-16 -right-16 w-32 h-32 bg-indigo-200/40 rounded-full blur-xl pointer-events-none" />
              <div>
                <h3 className="font-bold text-lg">Notificar Cliente</h3>
                <p className="text-xs text-slate-600 mt-1">Alertar vencimento para: {selectedAlert.referencia}</p>
              </div>
              <button
                onClick={() => setIsNotifying(false)}
                className="text-slate-500 hover:text-slate-900 rounded-full p-1.5 hover:bg-white/70 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              {loadingContact ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Loader2 className="animate-spin text-indigo-600" size={32} />
                  <p className="text-sm text-slate-500 font-medium">A carregar contactos do cliente...</p>
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-6 py-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100">
              {sendStatus && (
                <span className={`text-xs font-semibold mr-auto ${sendStatus.ok ? "text-emerald-600" : "text-red-600"}`}>
                  {sendStatus.text}
                </span>
              )}
              <button
                onClick={handleNotifyAction}
                disabled={loadingContact || sendingSms || canalDisabled}
                title={canalDisabled ? "Contacto em falta — preencha o telemóvel." : undefined}
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
