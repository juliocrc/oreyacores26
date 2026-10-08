"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Anchor, CalendarDays, Mail, MessageSquare, Phone, Tag } from "lucide-react";

type ClienteOption = { id: number; nome: string; email?: string | null; telefone?: string | null; telmovel?: string | null };
type NavioOption = { id: number; nome: string; matricula?: string | null; clienteId?: number | null };
type JangadaOption = { id: number; serial: string; shipId?: number | null };

const ESTADOS_PEDIDO_ASSISTENCIA = [
  "novo",
  "em_atendimento",
  "concluido",
  "arquivado",
] as const;

type EstadoPedidoAssistencia = (typeof ESTADOS_PEDIDO_ASSISTENCIA)[number];

type PedidoAssistencia = {
  id: number;
  serviceStationId: number | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  navio: string | null;
  jangadaSerial: string | null;
  tipoAssistencia: string | null;
  descricao: string;
  dataPreferida: string | null;
  origem: string;
  estado: string;
  metadados: string | null;
  createdAt: string;
  updatedAt: string;
  ordensServico?: Array<{
    id: number;
    numeroOrdem: string;
    status: string;
  }>;
};

const ESTADO_BADGES: Record<string, { label: string; cls: string }> = {
  novo: { label: "Novo", cls: "bg-blue-100 text-blue-800 border-blue-300" },
  em_atendimento: { label: "Em atendimento", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  concluido: { label: "Concluído", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  arquivado: { label: "Arquivado", cls: "bg-gray-100 text-gray-700 border-gray-300" },
};

const ESTADO_ACCENT: Record<string, string> = {
  novo: "from-blue-500 to-sky-400",
  em_atendimento: "from-amber-500 to-orange-400",
  concluido: "from-emerald-500 to-green-400",
  arquivado: "from-slate-400 to-slate-300",
};

function estadoBadge(estado: string | null | undefined) {
  const key = String(estado || "novo").toLowerCase();
  return (
    ESTADO_BADGES[key] || {
      label: String(estado || "Novo"),
      cls: "bg-slate-100 text-slate-700 border-slate-300",
    }
  );
}

function estadoAccent(estado: string | null | undefined) {
  const key = String(estado || "novo").toLowerCase();
  return ESTADO_ACCENT[key] || ESTADO_ACCENT.novo;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function origemLabel(origem: string | null | undefined) {
  const key = String(origem || "").trim().toLowerCase();
  if (key === "zapier") return "Formulário (Zapier)";
  if (key === "interno") return "Interno";
  return key || "—";
}

export default function PedidosAssistenciaPage() {
  const [pedidos, setPedidos] = useState<PedidoAssistencia[]>([]);
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estadoFilter, setEstadoFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [convertingId, setConvertingId] = useState<number | null>(null);
  const [convertMsg, setConvertMsg] = useState<{ id: number; text: string; error: boolean } | null>(null);
  const [commsMsg, setCommsMsg] = useState<{ id: number; text: string } | null>(null);
  const [commsSavingId, setCommsSavingId] = useState<number | null>(null);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [navios, setNavios] = useState<NavioOption[]>([]);
  const [jangadas, setJangadas] = useState<JangadaOption[]>([]);
  const [form, setForm] = useState({
    clienteId: "",
    navioId: "",
    jangadaIds: [] as number[],
    nome: "",
    email: "",
    telefone: "",
    tipoAssistencia: "inspecao",
    descricao: "",
    dataPreferida: "",
  });
  const [submittingForm, setSubmittingForm] = useState(false);
  const [formMessage, setFormMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const selectedCliente = useMemo(
    () => clientes.find((cliente) => String(cliente.id) === String(form.clienteId)) || null,
    [clientes, form.clienteId],
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/clientes?limite=200", { cache: "no-store" });
        if (!res.ok) return;
        const payload = await res.json();
        setClientes(Array.isArray(payload.clientes) ? payload.clientes : Array.isArray(payload) ? payload : []);
      } catch {
        setClientes([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!form.clienteId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset dos dependentes quando o cliente é desmarcado.
      setNavios([]);
       
      setJangadas([]);
      setForm((current) => ({ ...current, navioId: "", jangadaIds: [] }));
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/navios?clienteId=${encodeURIComponent(form.clienteId)}&limite=200`, { cache: "no-store" });
        if (!res.ok) return;
        const payload = await res.json();
        const items = Array.isArray(payload.navios) ? payload.navios : Array.isArray(payload) ? payload : [];
        setNavios(items);
      } catch {
        setNavios([]);
      }
      setForm((current) => ({ ...current, navioId: "", jangadaIds: [] }));
      setJangadas([]);
    })();
  }, [form.clienteId]);

  useEffect(() => {
    if (!form.navioId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset de dependentes quando o navio é desmarcado.
      setJangadas([]);
      setForm((current) => ({ ...current, jangadaIds: [] }));
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/jangadas?shipId=${encodeURIComponent(form.navioId)}&limite=200`, { cache: "no-store" });
        if (!res.ok) return;
        const payload = await res.json();
        const items = Array.isArray(payload.jangadas) ? payload.jangadas : Array.isArray(payload) ? payload : [];
        setJangadas(items);
      } catch {
        setJangadas([]);
      }
      setForm((current) => ({ ...current, jangadaIds: [] }));
    })();
  }, [form.navioId]);

  const toggleJangada = (id: number) => {
    setForm((current) => {
      const exists = current.jangadaIds.includes(id);
      return {
        ...current,
        jangadaIds: exists ? current.jangadaIds.filter((value) => value !== id) : [...current.jangadaIds, id],
      };
    });
  };

  async function handleCreatePedido(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage(null);
    setSubmittingForm(true);

    try {
      const res = await fetch("/api/pedidos-assistencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origem: "interno",
          requestSource: "interno",
          clienteId: form.clienteId,
          navioId: form.navioId,
          jangadaIds: form.jangadaIds,
          nome: form.nome || selectedCliente?.nome || "",
          email: form.email || selectedCliente?.email || "",
          telefone: form.telefone || selectedCliente?.telmovel || selectedCliente?.telefone || "",
          tipoAssistencia: form.tipoAssistencia,
          descricao: form.descricao,
          dataPreferida: form.dataPreferida,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Não foi possível criar o pedido.");
      }

      setFormMessage({ type: "success", text: `Pedido criado com sucesso (${payload?.pedido?.id ?? "#"}).` });
      setForm({
        clienteId: "",
        navioId: "",
        jangadaIds: [],
        nome: "",
        email: "",
        telefone: "",
        tipoAssistencia: "inspecao",
        descricao: "",
        dataPreferida: "",
      });
      await load();
    } catch (err) {
      setFormMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao criar o pedido.",
      });
    } finally {
      setSubmittingForm(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pedidos-assistencia?estado=${encodeURIComponent(estadoFilter)}&limite=500`, {
        cache: "no-store",
      });
      if (res.status === 401) throw new Error("Sessão obrigatória.");
      if (res.status === 403) throw new Error("Apenas utilizadores internos podem ver pedidos de assistência.");
      if (!res.ok) throw new Error("Não foi possível carregar os pedidos.");
      const payload = await res.json();
      setPedidos(Array.isArray(payload.pedidos) ? payload.pedidos : []);
      setCount(typeof payload.count === "number" ? payload.count : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar pedidos.");
      setPedidos([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [estadoFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredPedidos = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pedidos;
    return pedidos.filter((p) =>
      [p.nome, p.navio, p.email, p.telefone, p.jangadaSerial, p.tipoAssistencia, p.descricao, p.origem]
        .some((field) => String(field || "").toLowerCase().includes(q))
    );
  }, [pedidos, search]);

  async function updateEstado(id: number, estado: EstadoPedidoAssistencia) {
    setSavingId(id);
    try {
      const res = await fetch("/api/pedidos-assistencia", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, estado }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Não foi possível atualizar o pedido.");
      }
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao atualizar o pedido.");
    } finally {
      setSavingId(null);
    }
  }

  async function registarComunicacao(pedido: PedidoAssistencia, tipo: "whatsapp" | "chamada" | "email", event: { preventDefault: () => void; stopPropagation: () => void }) {
    event.preventDefault();
    event.stopPropagation();
    if (!tipo || !pedido.id) return;

    if (tipo === "whatsapp" && !pedido.telefone) return;
    if (tipo === "email" && !pedido.email) return;
    if (tipo === "chamada" && !pedido.telefone) return;

    setCommsSavingId(pedido.id);
    setCommsMsg(null);
    try {
      const res = await fetch(`/api/pedidos-assistencia/${pedido.id}/comunicacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo }),
      });
      const payload = await res.json().catch(() => ({}));

      if (tipo === "chamada" && pedido.telefone) {
        window.location.href = `tel:${pedido.telefone.replace(/\s+/g, "")}`;
      } else if (tipo === "email" && pedido.email) {
        window.location.href = `mailto:${pedido.email}`;
      } else if (tipo === "whatsapp") {
        const url = typeof payload?.whatsappUrl === "string" && payload.whatsappUrl
          ? payload.whatsappUrl
          : `https://wa.me/${pedido.telefone!.replace(/\s+/g, "")}`;
        window.open(url, "_blank", "noopener,noreferrer");
      }

      if (!res.ok) {
        throw new Error(payload?.error || "Não foi possível registar a comunicação.");
      }

      setCommsMsg({ id: pedido.id, text: tipo === "whatsapp" ? "Mensagem WhatsApp aberta e registada no histórico." : "Contacto iniciado e registado no histórico." });
    } catch (err) {
      setCommsMsg({ id: pedido.id, text: `Falha ao registar: ${err instanceof Error ? err.message : "erro desconhecido"}` });
    } finally {
      setCommsSavingId(null);
    }
  }

  const stats = useMemo(() => {
    const porEstado: Record<string, number> = { novo: 0, em_atendimento: 0, concluido: 0, arquivado: 0 };
    for (const p of pedidos) {
      const key = String(p.estado || "novo").toLowerCase();
      porEstado[key] = (porEstado[key] || 0) + 1;
    }
    return {
      total: pedidos.length,
      novo: porEstado.novo || 0,
      em_atendimento: porEstado.em_atendimento || 0,
      concluido: porEstado.concluido || 0,
      arquivado: porEstado.arquivado || 0,
    };
  }, [pedidos]);

  async function abrirJangada(serial: string | null | undefined) {
    if (!serial) return;
    try {
      const res = await fetch(`/api/jangadas/serial/${encodeURIComponent(serial)}`);
      if (!res.ok) return;
      const data = await res.json();
      const id = data?.id ?? data?.jangada?.id;
      if (id) window.open(`/jangadas/${id}`, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
    }
  }

  async function converterEmOT(id: number) {
    setConvertingId(id);
    setConvertMsg(null);
    try {
      const res = await fetch(`/api/pedidos-assistencia/${id}/converter`, { method: "POST" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Não foi possível converter o pedido em OT.");
      }
      if (payload.jaExistente) {
        setConvertMsg({
          id,
          text: `Já existe uma OT associada: ${payload.ordem?.numeroOrdem || ""}`,
          error: false,
        });
      } else {
        setConvertMsg({
          id,
          text: `OT ${payload.ordem?.numeroOrdem || ""} criada. Pedido passou a 'em atendimento'.`,
          error: false,
        });
      }
      await load();
    } catch (err) {
      setConvertMsg({
        id,
        text: err instanceof Error ? err.message : "Erro ao converter o pedido em OT.",
        error: true,
      });
    } finally {
      setConvertingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="ds-page flex flex-col gap-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Criar pedido de assistência</h2>
            <p className="text-sm text-slate-500">Registe internamente um pedido com cliente, navio e jangadas selecionados.</p>
          </div>

          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreatePedido}>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Cliente</label>
              <select
                value={form.clienteId}
                onChange={(e) => setForm((current) => ({ ...current, clienteId: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                <option value="">Selecionar cliente</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={String(cliente.id)}>
                    {cliente.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Navio</label>
              <select
                value={form.navioId}
                onChange={(e) => setForm((current) => ({ ...current, navioId: e.target.value }))}
                disabled={!form.clienteId}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100"
              >
                <option value="">Selecionar navio</option>
                {navios.map((navio) => (
                  <option key={navio.id} value={String(navio.id)}>
                    {navio.nome} {navio.matricula ? `(${navio.matricula})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Jangadas</label>
              <div className="flex flex-wrap gap-2 rounded-lg border border-slate-300 bg-slate-50 p-2 min-h-[44px]">
                {!form.navioId && <span className="text-xs text-slate-500">Selecione primeiro um navio.</span>}
                {jangadas.map((jangada) => {
                  const checked = form.jangadaIds.includes(jangada.id);
                  return (
                    <button
                      key={jangada.id}
                      type="button"
                      onClick={() => toggleJangada(jangada.id)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${checked ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}
                    >
                      {jangada.serial}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Nome do contacto</label>
              <input
                value={form.nome}
                onChange={(e) => setForm((current) => ({ ...current, nome: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                placeholder="Nome do cliente ou contacto"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Tipo de pedido</label>
              <select
                value={form.tipoAssistencia}
                onChange={(e) => setForm((current) => ({ ...current, tipoAssistencia: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                <option value="inspecao">Inspeção</option>
                <option value="reparo">Reparo</option>
                <option value="manutencao">Manutenção</option>
                <option value="avaria">Avaria</option>
                <option value="outro">Outro</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">E-mail</label>
              <input
                value={form.email}
                onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                type="email"
                placeholder="cliente@empresa.com"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Telefone</label>
              <input
                value={form.telefone}
                onChange={(e) => setForm((current) => ({ ...current, telefone: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                placeholder="+351 912 345 678"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Descrição</label>
              <textarea
                value={form.descricao}
                onChange={(e) => setForm((current) => ({ ...current, descricao: e.target.value }))}
                className="min-h-[110px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                placeholder="Descreva o problema, serviço solicitado e prioridade..."
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Data preferida</label>
              <input
                value={form.dataPreferida}
                onChange={(e) => setForm((current) => ({ ...current, dataPreferida: e.target.value }))}
                type="date"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              />
            </div>

            <div className="md:col-span-2 flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={submittingForm || !form.clienteId || !form.navioId || form.jangadaIds.length === 0 || !form.descricao.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {submittingForm ? "A criar..." : "Criar pedido"}
              </button>
            </div>

            {formMessage && (
              <div className={`md:col-span-2 rounded-lg border px-3 py-2 text-sm ${formMessage.type === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-red-300 bg-red-50 text-red-700"}`}>
                {formMessage.text}
              </div>
            )}
          </form>
        </section>

        <div className="app-hero-panel flex flex-col gap-3 rounded-2xl p-4 text-white lg:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">Orey Técnica</p>
              <h1 className="mt-1 text-2xl font-bold lg:text-3xl">Pedidos de Assistência</h1>
              <p className="mt-1 max-w-3xl text-xs text-sky-100/95 lg:text-sm">
                Pedidos recebidos pelo formulário de assistência (Zapier Forms), com gestão de estado e pesquisa.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:px-4 sm:text-sm"
                onClick={load}
                disabled={loading}
              >
                {loading ? "A atualizar..." : "Atualizar"}
              </button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <div className="app-hero-card rounded-xl p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-sky-100">Total</p>
              <p className="mt-1 text-xl font-bold sm:text-2xl">{stats.total}</p>
            </div>
            <div className="app-hero-card rounded-xl p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-sky-100">Novos</p>
              <p className="mt-1 text-xl font-bold sm:text-2xl">{stats.novo}</p>
            </div>
            <div className="app-hero-card rounded-xl p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-sky-100">Em atendimento</p>
              <p className="mt-1 text-xl font-bold sm:text-2xl">{stats.em_atendimento}</p>
            </div>
            <div className="app-hero-card rounded-xl p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-sky-100">Concluídos</p>
              <p className="mt-1 text-xl font-bold sm:text-2xl">{stats.concluido}</p>
            </div>
            <div className="app-hero-card rounded-xl p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-sky-100">Arquivados</p>
              <p className="mt-1 text-xl font-bold sm:text-2xl">{stats.arquivado}</p>
            </div>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Pedidos</h2>
              <p className="text-sm text-slate-500">Pesquisa, filtros e mudança de estado dos pedidos recebidos.</p>
            </div>
            <div className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
              {count} pedido(s) com o filtro atual
            </div>
          </div>

          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div>
                <label className="block text-xs mb-1 text-gray-600">Estado</label>
                <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)} className="border rounded-lg bg-white px-3 py-2 w-full">
                  <option value="">Todos</option>
                  {ESTADOS_PEDIDO_ASSISTENCIA.map((estado) => (
                    <option key={estado} value={estado}>
                      {ESTADO_BADGES[estado]?.label || estado}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs mb-1 text-gray-600">Pesquisa</label>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome, navio, email, telefone, serial da jangada, descrição..."
                  className="border rounded-lg bg-white px-3 py-2 w-full"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                {filteredPedidos.length} pedido(s) encontrados com os filtros atuais.
              </div>
              <button
                className="self-start rounded-lg bg-gray-200 px-3 py-2 text-xs font-medium text-slate-700"
                onClick={() => {
                  setSearch("");
                  setEstadoFilter("");
                }}
              >
                Limpar filtros
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          )}

          {loading ? (
            <div className="text-center py-8 text-gray-600">Carregando...</div>
          ) : filteredPedidos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
              <p className="text-sm text-gray-500">Nenhum pedido encontrado com os filtros aplicados.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPedidos.map((pedido) => {
                const badge = estadoBadge(pedido.estado);
                const accent = estadoAccent(pedido.estado);
                const expanded = expandedId === pedido.id;
                const iniciais = String(pedido.nome || "P")
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase();
                const temOT = (pedido.ordensServico?.length || 0) > 0;
                const commsSaving = commsSavingId === pedido.id;
                return (
                  <div
                    key={pedido.id}
                    className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                  >
                    <span className={`absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b ${accent}`} aria-hidden />

                    <div className="p-4 pl-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600 ring-1 ring-slate-200">
                            {iniciais}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                className="text-left font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                                onClick={() => setExpandedId(expanded ? null : pedido.id)}
                              >
                                {pedido.nome || `Pedido #${pedido.id}`}
                              </button>
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${badge.cls}`}>
                                {badge.label}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">
                                <Tag size={11} /> {origemLabel(pedido.origem)}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                              <span>#{pedido.id}</span>
                              <span className="inline-flex items-center gap-1">
                                <CalendarDays size={12} /> {formatDate(pedido.createdAt)}
                              </span>
                              {pedido.jangadaSerial && (
                                <button
                                  onClick={() => abrirJangada(pedido.jangadaSerial)}
                                  className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                                  title={`Abrir ficha da jangada ${pedido.jangadaSerial}`}
                                >
                                  <Anchor size={12} /> {pedido.jangadaSerial}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={pedido.estado}
                            disabled={savingId === pedido.id}
                            onChange={(e) => updateEstado(pedido.id, e.target.value as EstadoPedidoAssistencia)}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium disabled:opacity-50"
                          >
                            {ESTADOS_PEDIDO_ASSISTENCIA.map((estado) => (
                              <option key={estado} value={estado}>
                                {ESTADO_BADGES[estado]?.label || estado}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-lg bg-slate-50 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">Navio</p>
                          <p className="mt-0.5 font-medium text-slate-700">{pedido.navio || "—"}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">Tipo de pedido</p>
                          <p className="mt-0.5 font-medium text-slate-700">{pedido.tipoAssistencia || "—"}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">Data preferida</p>
                          <p className="mt-0.5 font-medium text-slate-700">{formatDate(pedido.dataPreferida)}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">Contacto</p>
                          <p className="mt-0.5 font-medium text-slate-700">
                            {[pedido.nome && pedido.nome.split(/\s+/)[0], pedido.telefone, pedido.email]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {pedido.telefone && (
                          <>
                            <button
                              type="button"
                              disabled={commsSaving || !pedido.telefone}
                              onClick={(e) => registarComunicacao(pedido, "whatsapp", e)}
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Abrir WhatsApp e registar no histórico"
                            >
                              <MessageSquare size={13} /> WhatsApp
                            </button>
                            <button
                              type="button"
                              disabled={commsSaving || !pedido.telefone}
                              onClick={(e) => registarComunicacao(pedido, "chamada", e)}
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-800 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Iniciar chamada e registar no histórico"
                            >
                              <Phone size={13} /> Chamada
                            </button>
                          </>
                        )}
                        {pedido.email && (
                          <button
                            type="button"
                            disabled={commsSaving || !pedido.email}
                            onClick={(e) => registarComunicacao(pedido, "email", e)}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Enviar e-mail e registar no histórico"
                          >
                            <Mail size={13} /> E-mail
                          </button>
                        )}
                        {temOT &&
                          pedido.ordensServico?.map((os) => (
                            <a
                              key={os.id}
                              href={`/ordens-servico/${os.id}`}
                              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                              OT {os.numeroOrdem}
                            </a>
                          ))}
                      </div>

                      {commsMsg && commsMsg.id === pedido.id && (
                        <div className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                          {commsMsg.text}
                        </div>
                      )}

                      {convertMsg && convertMsg.id === pedido.id && (
                        <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${convertMsg.error ? "border-red-300 bg-red-50 text-red-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"}`}>
                          {convertMsg.text}
                        </div>
                      )}

                      {expanded && (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Descrição</p>
                          <p className="whitespace-pre-wrap text-gray-800">{pedido.descricao}</p>
                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                            <span><b>Email:</b> {pedido.email || "—"}</span>
                            <span><b>Telefone:</b> {pedido.telefone || "—"}</span>
                            <span><b>Atualizado:</b> {formatDate(pedido.updatedAt)}</span>
                          </div>
                          {pedido.metadados && (
                            <div className="mt-3">
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Metadados</p>
                              <pre className="whitespace-pre-wrap text-xs text-gray-700">{pedido.metadados}</pre>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                        <button
                          type="button"
                          disabled={convertingId === pedido.id || temOT}
                          onClick={() => converterEmOT(pedido.id)}
                          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {convertingId === pedido.id ? "A criar..." : "Criar OT"}
                        </button>
                        <button
                          type="button"
                          disabled={savingId === pedido.id}
                          onClick={() => updateEstado(pedido.id, "em_atendimento")}
                          className="rounded-md bg-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-300 disabled:opacity-50"
                        >
                          Em atendimento
                        </button>
                        <button
                          type="button"
                          disabled={savingId === pedido.id}
                          onClick={() => updateEstado(pedido.id, "concluido")}
                          className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                        >
                          Concluir
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : pedido.id)}
                          className="rounded-md bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-300"
                        >
                          {expanded ? "Ocultar detalhes" : "Ver detalhes"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}