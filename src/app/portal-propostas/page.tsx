"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  RefreshCcw,
  Search,
  Ship,
  XCircle,
} from "lucide-react";

type EquipamentoChange = {
  tipo?: string;
  id?: number;
  changes?: Record<string, unknown>;
};

type AssocItem = { tipoEquipamento?: string; serial?: string };

type ProposalDados = {
  tipo?: string;
  navioId?: number;
  clienteId?: number;
  pirotecnicosBordo?: unknown;
  equipamentos?: EquipamentoChange[];
  itens?: AssocItem[];
  campos?: Record<string, unknown>;
  estado?: string;
  decididoPor?: string | null;
  motivo?: string | null;
  observacoes?: string | null;
};

type ProposalNavio = {
  id: number;
  nome: string;
  matricula: string | null;
  cliente: string | null;
};

type ProposalCliente = {
  id: number;
  nome: string;
  nif: string | null;
};

type Proposal = {
  id: number;
  usuario?: string | null;
  descricao?: string | null;
  createdAt: string;
  dados?: ProposalDados | null;
  navio?: ProposalNavio | null;
  cliente?: ProposalCliente | null;
};

const TIPO_LABEL: Record<string, string> = {
  equipamentos: "Equipamentos e pirotécnicos",
  associacao: "Associação de equipamentos",
  ficha: "Ficha e contactos",
};

const FICHA_FIELD_LABEL: Record<string, string> = {
  email: "Email",
  telefone: "Telefone fixo",
  telmovel: "Telemóvel",
  morada: "Morada",
  moradaNumero: "Nº / andar",
  codigoPostal: "Código postal",
  localidade: "Localidade",
  ilha: "Ilha",
};

const ASSOC_TIPO_LABEL: Record<string, string> = {
  jangada: "Jangada",
  colete: "Colete",
  fato: "Fato de imersão",
  epirb: "EPIRB",
  extintor: "Extintor",
};

type EstadoFiltro = "TODAS" | "PENDENTE" | "APROVADA" | "REJEITADA";

const ESTADO_STYLE: Record<string, string> = {
  PENDENTE: "bg-amber-100 text-amber-800 border-amber-200",
  APROVADA: "bg-emerald-100 text-emerald-800 border-emerald-200",
  REJEITADA: "bg-rose-100 text-rose-700 border-rose-200",
};

const ESTADO_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  APROVADA: "Aprovada",
  REJEITADA: "Rejeitada",
};

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("pt-PT");
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function PortalPropostasPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("PENDENTE");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [rejeitarId, setRejeitarId] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/portal/propostas", { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível carregar as propostas.");
      const data = await response.json();
      setProposals(Array.isArray(data?.proposals) ? data.proposals : []);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Erro ao carregar propostas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (id: number, decisao: "APROVADA" | "REJEITADA", justificacao?: string) => {
    setBusyId(id);
    setMessage(null);
    setIsError(false);
    try {
      const response = await fetch("/api/portal/propostas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decisao, motivo: justificacao || undefined }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Não foi possível processar a proposta.");
      setMessage(decisao === "APROVADA" ? "Proposta aprovada e sincronizada." : "Proposta rejeitada.");
      setRejeitarId(null);
      setMotivo("");
      await load();
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Erro ao processar proposta.");
    } finally {
      setBusyId(null);
    }
  };

  const contagens = useMemo(() => {
    return proposals.reduce(
      (acc, p) => {
        const estado = p.dados?.estado || "PENDENTE";
        acc.total += 1;
        if (estado === "PENDENTE") acc.pendente += 1;
        else if (estado === "APROVADA") acc.aprovada += 1;
        else if (estado === "REJEITADA") acc.rejeitada += 1;
        return acc;
      },
      { total: 0, pendente: 0, aprovada: 0, rejeitada: 0 },
    );
  }, [proposals]);

  const filtradas = useMemo(() => {
    const termo = search.trim().toLowerCase();
    return proposals.filter((p) => {
      const estado = p.dados?.estado || "PENDENTE";
      if (estadoFiltro !== "TODAS" && estado !== estadoFiltro) return false;
      if (!termo) return true;
      const alvo = [
        p.navio?.nome,
        p.navio?.matricula,
        p.navio?.cliente,
        p.cliente?.nome,
        p.cliente?.nif,
        p.usuario,
        String(p.dados?.navioId ?? ""),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return alvo.includes(termo);
    });
  }, [proposals, estadoFiltro, search]);

  const filtros: Array<{ key: EstadoFiltro; label: string; count: number }> = [
    { key: "PENDENTE", label: "Pendentes", count: contagens.pendente },
    { key: "APROVADA", label: "Aprovadas", count: contagens.aprovada },
    { key: "REJEITADA", label: "Rejeitadas", count: contagens.rejeitada },
    { key: "TODAS", label: "Todas", count: contagens.total },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Portal cliente</p>
          <h1 className="text-2xl font-black text-slate-800">Propostas de alteração</h1>
          <p className="mt-1 text-sm text-slate-500">
            Reveja, aprove ou rejeite alterações submetidas pelos clientes ao estado dos seus equipamentos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filtros.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setEstadoFiltro(f.key)}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold transition-colors ${
              estadoFiltro === f.key
                ? "border-indigo-300 bg-indigo-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f.label}
            <span
              className={`rounded-full px-1.5 text-xs ${
                estadoFiltro === f.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {f.count}
            </span>
          </button>
        ))}

        <div className="relative ml-auto w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar navio, armador..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {message && (
        <p
          className={`mb-4 rounded-xl p-3 text-sm font-semibold ${
            isError ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {message}
        </p>
      )}

      {loading && proposals.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-12 text-slate-500">
          <Loader2 size={18} className="animate-spin" />
          A carregar propostas...
        </div>
      ) : filtradas.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          <FileText size={28} className="mx-auto mb-3 text-slate-300" />
          Nenhuma proposta corresponde aos filtros selecionados.
        </div>
      ) : (
        <div className="space-y-4">
          {filtradas.map((proposal) => {
            const estado = proposal.dados?.estado || "PENDENTE";
            const equipamentos = Array.isArray(proposal.dados?.equipamentos)
              ? proposal.dados?.equipamentos ?? []
              : [];
            const pirotecnicos = Array.isArray(proposal.dados?.pirotecnicosBordo)
              ? (proposal.dados?.pirotecnicosBordo as unknown[])
              : [];
            const itens = Array.isArray(proposal.dados?.itens) ? proposal.dados?.itens ?? [] : [];
            const campos = proposal.dados?.campos && typeof proposal.dados.campos === "object" ? Object.entries(proposal.dados.campos) : [];
            const tipo = proposal.dados?.tipo || "equipamentos";
            const expandido = expandedId === proposal.id;
            const emDecisao = rejeitarId === proposal.id;

            const titulo =
              tipo === "ficha"
                ? proposal.cliente?.nome || `Cliente #${proposal.dados?.clienteId ?? "—"}`
                : proposal.navio?.nome || `Navio #${proposal.dados?.navioId ?? "—"}`;
            const subtitulo =
              tipo === "ficha"
                ? proposal.usuario || "Cliente"
                : proposal.navio?.cliente || proposal.usuario || "Armador não identificado";

            return (
              <article key={proposal.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-xl bg-indigo-50 p-2 text-indigo-600">
                      <Ship size={18} />
                    </div>
                    <div>
                      <h2 className="font-extrabold text-slate-800">
                        {titulo}
                        {tipo !== "ficha" && proposal.navio?.matricula && (
                          <span className="ml-2 text-xs font-semibold text-slate-400">{proposal.navio.matricula}</span>
                        )}
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                          {TIPO_LABEL[tipo] || tipo}
                        </span>
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        {subtitulo} · {formatDate(proposal.createdAt)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-bold ${
                      ESTADO_STYLE[estado] || ESTADO_STYLE.PENDENTE
                    }`}
                  >
                    {ESTADO_LABEL[estado] || estado}
                  </span>
                </div>

                <p className="mt-4 text-sm text-slate-600">
                  {tipo === "ficha"
                    ? `${campos.length} campo(s) da ficha`
                    : tipo === "associacao"
                      ? `${itens.length} equipamento(s) a associar`
                      : `${pirotecnicos.length > 0 ? `${pirotecnicos.length} registo(s) de pirotécnicos` : "Sem alterações de pirotécnicos"} · ${
                          equipamentos.length > 0 ? `${equipamentos.length} equipamento(s) atualizado(s)` : "Sem alterações de equipamentos"
                        }`}
                </p>

                {proposal.dados?.observacoes && (
                  <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Observações do cliente: {proposal.dados.observacoes}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setExpandedId(expandido ? null : proposal.id)}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
                >
                  {expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {expandido ? "Ocultar detalhes" : "Ver detalhes das alterações"}
                </button>

                {expandido && (
                  <div className="mt-3 space-y-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                    {tipo === "ficha" && (
                      <div>
                        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Ficha e contactos</p>
                        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500">
                              <tr>
                                <th className="px-3 py-2 font-bold">Campo</th>
                                <th className="px-3 py-2 font-bold">Novo valor</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {campos.map(([campo, valor]) => (
                                <tr key={campo}>
                                  <td className="px-3 py-2 font-semibold text-slate-700">{FICHA_FIELD_LABEL[campo] || campo}</td>
                                  <td className="px-3 py-2 font-semibold text-slate-800">{renderValue(valor)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {tipo === "associacao" && (
                      <div>
                        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Equipamentos a associar</p>
                        <ul className="space-y-1">
                          {itens.map((item, idx) => (
                            <li key={idx} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                              <span className="font-bold">{ASSOC_TIPO_LABEL[item.tipoEquipamento || ""] || item.tipoEquipamento}</span>
                              {" · "}
                              <span className="font-mono">{item.serial}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {equipamentos.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                          Equipamentos
                        </p>
                        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500">
                              <tr>
                                <th className="px-3 py-2 font-bold">Tipo</th>
                                <th className="px-3 py-2 font-bold">Campo</th>
                                <th className="px-3 py-2 font-bold">Novo valor</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {equipamentos.flatMap((item, idx) => {
                                const changes = Object.entries(item.changes || {});
                                if (changes.length === 0) {
                                  return [
                                    <tr key={`${idx}-vazio`}>
                                      <td className="px-3 py-2 font-semibold text-slate-700">{item.tipo || "—"}</td>
                                      <td className="px-3 py-2 text-slate-400">—</td>
                                      <td className="px-3 py-2 text-slate-400">Sem alterações</td>
                                    </tr>,
                                  ];
                                }
                                return changes.map(([campo, valor]) => (
                                  <tr key={`${idx}-${campo}`}>
                                    <td className="px-3 py-2 font-semibold text-slate-700">
                                      {item.tipo || "—"} #{item.id ?? "—"}
                                    </td>
                                    <td className="px-3 py-2 text-slate-500">{campo}</td>
                                    <td className="px-3 py-2 font-semibold text-slate-800">{renderValue(valor)}</td>
                                  </tr>
                                ));
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {pirotecnicos.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                          Pirotécnicos
                        </p>
                        <ul className="space-y-1">
                          {pirotecnicos.map((item, idx) => (
                            <li
                              key={idx}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
                            >
                              {renderValue(item)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {estado !== "PENDENTE" && (
                      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                        <p className="flex items-center gap-1 font-bold text-slate-700">
                          <Clock size={12} />
                          Decisão: {ESTADO_LABEL[estado] || estado}
                          {proposal.dados?.decididoPor ? ` por ${proposal.dados.decididoPor}` : ""}
                        </p>
                        {proposal.dados?.motivo && <p className="mt-1">Motivo: {proposal.dados.motivo}</p>}
                      </div>
                    )}
                  </div>
                )}

                {estado === "PENDENTE" && (
                  <div className="mt-4">
                    {emDecisao ? (
                      <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                        <label className="text-xs font-bold text-rose-800">
                          Motivo da rejeição (opcional)
                        </label>
                        <textarea
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          rows={2}
                          placeholder="Ex.: valores incorretos, equipamento não aplicável..."
                          className="mt-2 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                        />
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            disabled={busyId === proposal.id}
                            onClick={() => void decide(proposal.id, "REJEITADA", motivo)}
                            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60"
                          >
                            {busyId === proposal.id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                            Confirmar rejeição
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejeitarId(null);
                              setMotivo("");
                            }}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busyId === proposal.id}
                          onClick={() => void decide(proposal.id, "APROVADA")}
                          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {busyId === proposal.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                          Aprovar
                        </button>
                        <button
                          type="button"
                          disabled={busyId === proposal.id}
                          onClick={() => {
                            setRejeitarId(proposal.id);
                            setMotivo("");
                          }}
                          className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        >
                          <XCircle size={14} />
                          Rejeitar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
