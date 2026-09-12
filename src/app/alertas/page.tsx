"use client";

import { useEffect, useState } from "react";
import { Mail, MessageSquare, MessageSquareText, X, Loader2, Flame, Waves } from "lucide-react";
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
  const [messageText, setMessageText] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [sendingSms, setSendingSms] = useState(false);
  const [smsStatus, setSmsStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const handleNotifyClick = async (a: Alerta) => {
    setSelectedAlert(a);
    setIsNotifying(true);
    setLoadingContact(true);
    setContactInfo(null);
    setMessageText("");
    setEmailSubject(`Aviso de Vencimento de Inspeção - ${a.referencia}`);

    try {
      let clientDetails: ClienteDetalhe | null = null;
      let jangadaId = a.jangadaId;

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
          const jangada = data?.jangada;
          const client = jangada?.serviceStationQueue?.ordemServico?.cliente || jangada?.ship?.cliente || jangada?.cliente;
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
      
      const dateLabel = a.data ? formatDateAuto(a.data) : "—";
      setMessageText(`Olá ${name || 'Exmo. Cliente'},\n\nLembramos que a inspeção/certificação do seu equipamento (${a.referencia}) expira em ${dateLabel}.\n\nPara garantir a segurança da embarcação e o cumprimento dos regulamentos marítimos, por favor contacte-nos com a brevidade possível para procedermos ao agendamento da revisão técnica.\n\nCom os melhores cumprimentos,\nEstação de Serviço`);
    } catch (err) {
      console.error(err);
      setContactInfo({ name: "", email: "", phone: "" });
      setMessageText(`Olá,\n\nLembramos que a inspeção do seu equipamento (${a.referencia}) está próxima do vencimento.\n\nPor favor, contacte-nos para agendar a revisão técnica.\n\nCumprimentos,\nEstação de Serviço`);
    } finally {
      setLoadingContact(false);
    }
  };

  const handleSendSms = async () => {
    if (!contactInfo?.phone || !messageText.trim()) return;
    setSendingSms(true);
    setSmsStatus(null);
    try {
      const res = await fetch("/api/notificar-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: contactInfo.phone, message: messageText }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSmsStatus({ ok: true, text: "SMS enviado com sucesso." });
      } else {
        setSmsStatus({ ok: false, text: data?.error || `Falha ao enviar SMS (${res.status}).` });
      }
    } catch (e) {
      console.error(e);
      setSmsStatus({ ok: false, text: "Erro de rede ao enviar SMS." });
    } finally {
      setSendingSms(false);
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
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Assunto (E-mail)</label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Assunto da mensagem"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Corpo da Mensagem</label>
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
            <div className="bg-slate-50 px-6 py-4 flex flex-wrap justify-end gap-3 border-t border-slate-100">
              <button
                onClick={() => {
                  const number = contactInfo?.phone.replace(/\s+/g, '') || "";
                  const url = `https://wa.me/${number}?text=${encodeURIComponent(messageText)}`;
                  window.open(url, '_blank');
                }}
                disabled={loadingContact || !contactInfo?.phone}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <MessageSquare size={14} />
                WhatsApp
              </button>
              <button
                onClick={handleSendSms}
                disabled={loadingContact || sendingSms || !contactInfo?.phone}
                className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                title="Envia a mensagem por SMS através do gateway (app.textbee.dev)"
              >
                {sendingSms ? <Loader2 size={14} className="animate-spin" /> : <MessageSquareText size={14} />}
                {sendingSms ? "A enviar..." : "SMS"}
              </button>
              {smsStatus && (
                <span className={`text-xs font-semibold self-center ${smsStatus.ok ? "text-emerald-600" : "text-red-600"}`}>
                  {smsStatus.text}
                </span>
              )}
              <button
                onClick={() => {
                  const mailto = `mailto:${contactInfo?.email || ''}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(messageText)}`;
                  window.open(mailto, '_blank');
                }}
                disabled={loadingContact}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <Mail size={14} />
                E-mail
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
