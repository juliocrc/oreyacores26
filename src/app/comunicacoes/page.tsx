"use client";
import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Send, RefreshCw, MessageCircle, Mail, Smartphone, Loader2 } from "lucide-react";
import { appToast } from "@/lib/app-toast";

type Comunicacao = {
  id: number;
  tipo: "SMS" | "WHATSAPP" | "EMAIL";
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
};

type ClienteResumo = {
  id: number;
  nome: string;
  numeroCliente?: string | null;
  email?: string | null;
  telefone?: string | null;
  telmovel?: string | null;
};

const TEMPLATES: Array<{ key: string; label: string; build: (c: ClienteResumo | null) => string }> = [
  {
    key: "vistoria",
    label: "Recordação de vistoria",
    build: (c) => `Olá ${c?.nome || "Exmo. Cliente"},\n\nRelembramos que está na altura de agendar a vistoria técnica da(s) jangada(s) salva-vidas da sua embarcação.\n\nPara garantir a segurança da embarcação e a conformidade legal, confirme por favor se podemos agendar a vistoria e a emissão do novo certificado.\n\nFicamos a aguardar o seu contacto.\n\nCom os melhores cumprimentos,\nOrey Azores`,
  },
  {
    key: "orcamento",
    label: "Orçamento aprovado",
    build: (c) => `Olá ${c?.nome || "Exmo. Cliente"},\n\nO orçamento para a vistoria da sua jangada salva-vidas foi aprovado.\n\nEntraremos em contacto para agendar a data da intervenção.\n\nOrey Azores`,
  },
  {
    key: "certificado",
    label: "Certificado pronto",
    build: (c) => `Olá ${c?.nome || "Exmo. Cliente"},\n\nInformamos que o certificado da vistoria da sua jangada salva-vidas já está disponível.\n\nEstamos à sua disposição para qualquer esclarecimento.\n\nOrey Azores`,
  },
  {
    key: "pagamento",
    label: "Recordação de pagamento",
    build: (c) => `Olá ${c?.nome || "Exmo. Cliente"},\n\nRecordamos que existem faturas em dívida na nossa conta corrente.\n\nAgradecemos o seu contacto para regularização.\n\nOrey Azores`,
  },
];

export default function ComunicacoesPage() {
  const [items, setItems] = useState<Comunicacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Filtros
  const [filterTipo, setFilterTipo] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterQ, setFilterQ] = useState("");

  // Formulário
  const [clientes, setClientes] = useState<ClienteResumo[]>([]);
  const [clienteBusca, setClienteBusca] = useState("");
  const [cliente, setCliente] = useState<ClienteResumo | null>(null);
  const [tipo, setTipo] = useState<"SMS" | "WHATSAPP" | "EMAIL">("SMS");
  const [destinatario, setDestinatario] = useState("");
  const [assunto, setAssunto] = useState("");
  const [mensagem, setMensagem] = useState(TEMPLATES[0].build(null));

  const carregarClientes = useCallback(async (q: string) => {
    try {
      const res = await fetch(`/api/clientes?nome=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const list = await res.json();
      setClientes(Array.isArray(list) ? list.slice(0, 15) : []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    carregarClientes("");
  }, [carregarClientes]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterTipo) params.set("tipo", filterTipo);
      if (filterStatus) params.set("status", filterStatus);
      if (filterQ) params.set("q", filterQ);
      const res = await fetch(`/api/comunicacoes?${params.toString()}`);
      if (!res.ok) throw new Error("Falha ao carregar");
      const json = await res.json();
      setItems(json.items || []);
    } catch {
      appToast.error("Não foi possível carregar o histórico.");
    } finally {
      setLoading(false);
    }
  }, [filterTipo, filterStatus, filterQ]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (!cliente) return;
    const tel = String(cliente.telmovel || "").trim() || String(cliente.telefone || "").trim();
    setDestinatario(tipo === "EMAIL" ? String(cliente.email || "").trim() : tel);
  }, [cliente, tipo]);

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
          clienteId: cliente?.id || undefined,
          refTipo: cliente ? "Cliente" : undefined,
          refId: cliente?.id || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        return appToast.error(json.error || "Falha ao enviar.");
      }
      if (json.whatsappUrl) {
        window.open(json.whatsappUrl, "_blank");
        appToast.success("Link WhatsApp aberto. Confirme o envio na aplicação.");
      } else {
        appToast.success("Comunicação enviada com sucesso!");
      }
      await fetchHistory();
    } catch {
      appToast.error("Erro ao enviar comunicação.");
    } finally {
      setSending(false);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      enviado: "bg-emerald-100 text-emerald-700 border-emerald-200",
      pendente: "bg-amber-100 text-amber-700 border-amber-200",
      falhou: "bg-rose-100 text-rose-700 border-rose-200",
      rascunho: "bg-slate-100 text-slate-600 border-slate-200",
    };
    return map[status] || map.rascunho;
  };

  const tipoIcon = (tipo: string) =>
    tipo === "WHATSAPP" ? <MessageCircle size={14} className="text-emerald-600" /> : tipo === "EMAIL" ? <Mail size={14} className="text-indigo-500" /> : <Smartphone size={14} className="text-sky-600" />;

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="ds-page space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="text-indigo-600" size={28} />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Módulo de Comunicação</h1>
              <p className="text-sm text-slate-500">Envios por SMS, WhatsApp e e-mail com histórico centralizado</p>
            </div>
          </div>
          <button
            onClick={fetchHistory}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            <RefreshCw size={13} /> Atualizar
          </button>
        </div>

        {/* Nova comunicação */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 font-semibold text-sm text-slate-700">Nova comunicação</div>
          <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cliente</label>
                <input
                  value={clienteBusca}
                  onChange={(e) => {
                    setClienteBusca(e.target.value);
                    carregarClientes(e.target.value);
                  }}
                  placeholder="Pesquisar cliente..."
                  className="mt-1 w-full border border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {clienteBusca && clientes.length > 0 && (
                  <ul className="mt-1 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg text-sm divide-y divide-slate-100">
                    {clientes.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition"
                          onClick={() => {
                            setCliente(c);
                            setClienteBusca("");
                            setClientes([]);
                          }}
                        >
                          <span className="font-semibold text-slate-800">{c.nome}</span>
                          <span className="ml-2 text-xs text-slate-400">
                            {c.numeroCliente && `n.º ${c.numeroCliente}`}
                            {c.telmovel && ` · ${c.telmovel}`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {cliente && (
                  <div className="mt-2 flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm">
                    <span className="font-semibold text-indigo-800">{cliente.nome}</span>
                    <button type="button" onClick={() => setCliente(null)} className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold">
                      Remover
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Canal</label>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {(["SMS", "WHATSAPP", "EMAIL"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTipo(t)}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition ${
                        tipo === t
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      {t === "WHATSAPP" ? <MessageCircle size={14} /> : t === "EMAIL" ? <Mail size={14} /> : <Smartphone size={14} />}
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Destinatário</label>
                  <input
                    value={destinatario}
                    onChange={(e) => setDestinatario(e.target.value)}
                    placeholder={tipo === "EMAIL" ? "email@exemplo.pt" : "9XXXXXXXX"}
                    className="mt-1 w-full border border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assunto (opcional)</label>
                  <input
                    value={assunto}
                    onChange={(e) => setAssunto(e.target.value)}
                    placeholder="Ex: Recordação de vistoria"
                    className="mt-1 w-full border border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Modelo de mensagem</label>
                <select
                  value=""
                  onChange={(e) => {
                    const t = TEMPLATES.find((x) => x.key === e.target.value);
                    if (t) setMensagem(t.build(cliente));
                  }}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="" disabled>Escolher modelo...</option>
                  {TEMPLATES.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mensagem</label>
                <textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  rows={9}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-right text-xs text-slate-400">{mensagem.length} caracteres</p>
              </div>
              <button
                onClick={handleEnviar}
                disabled={sending}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {tipo === "WHATSAPP" ? "Abrir WhatsApp" : `Enviar ${tipo}`}
              </button>
            </div>
          </div>
        </div>

        {/* Histórico */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <span className="font-semibold text-sm text-slate-700">Histórico de comunicações</span>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-xs">
                <option value="">Todos os canais</option>
                <option value="SMS">SMS</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="EMAIL">Email</option>
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-xs">
                <option value="">Todos os estados</option>
                <option value="enviado">Enviado</option>
                <option value="pendente">Pendente</option>
                <option value="falhou">Falhou</option>
              </select>
              <input
                value={filterQ}
                onChange={(e) => setFilterQ(e.target.value)}
                placeholder="Pesquisar..."
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-xs w-40"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-10 text-center text-slate-400 text-sm">A carregar histórico...</div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              <MessageSquare size={36} className="mx-auto mb-3 opacity-40" />
              <p className="font-semibold text-slate-500">Nenhuma comunicação registada</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 text-sm max-h-[480px] overflow-auto">
              {items.map((c) => (
                <div key={c.id} className="px-5 py-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {tipoIcon(c.tipo)}
                      <span className="font-semibold text-slate-800">{c.tipo}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadge(c.status)}`}>{c.status}</span>
                      {c.refTipo && <span className="text-xs text-slate-400">· {c.refTipo}{c.refId ? ` #${c.refId}` : ""}</span>}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {c.destinatario && `→ ${c.destinatario}`}
                      {c.enviadoEm && ` · ${new Date(c.enviadoEm).toLocaleString("pt-PT")}`}
                      {c.enviadoPor && ` · por ${c.enviadoPor}`}
                    </p>
                    <p className="mt-1 text-slate-600 whitespace-pre-line line-clamp-2">{c.mensagem}</p>
                    {c.erro && <p className="mt-1 text-xs text-rose-600">Erro: {c.erro}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
