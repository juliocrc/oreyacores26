"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, X, Search } from "lucide-react";
import { toast } from "@/components/shared/Toast";
import { performOfflineAwareJsonRequest } from "@/lib/offline-sync/client";

type JangadaOption = {
  id: number;
  serial: string;
  brand?: string;
  model?: string;
  shipNameManual?: string;
  navio?: { nome: string; cliente?: { id: number; nome: string } | null } | null;
};

type ClienteInfo = {
  id: number;
  nome: string;
  navios: { id: number; nome: string; matricula: string }[];
};

const STATUS_OPTIONS = [
  { value: "pendente", label: "Pendente" },
  { value: "agendada", label: "Agendada" },
  { value: "em_progresso", label: "Em progresso" },
];

const PRIORITY_OPTIONS = [
  { value: "baixa", label: "Baixa" },
  { value: "normal", label: "Normal" },
  { value: "alta", label: "Alta" },
  { value: "critica", label: "Critica" },
];

const TIPO_OPTIONS = [
  { value: "inspecao", label: "Inspecao" },
  { value: "manutencao", label: "Manutencao" },
  { value: "reparacao", label: "Reparacao" },
  { value: "outro", label: "Outro" },
];

export default function CriarOtPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clienteIdParam = searchParams.get("clienteId");
  const jangadaIdParam = searchParams.get("jangadaId");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tipo, setTipo] = useState("inspecao");
  const [prioridade, setPrioridade] = useState("normal");
  const [status, setStatus] = useState("pendente");
  const [tecnicoResponsavel, setTecnicoResponsavel] = useState("");
  const [slaHoras, setSlaHoras] = useState("");
  const [dataPlaneadaInicio, setDataPlaneadaInicio] = useState("");
  const [dataPlaneadaFim, setDataPlaneadaFim] = useState("");
  const [descricao, setDescricao] = useState("");

  // Cliente -> Navio -> Jangadas cascade
  const [cliente, setCliente] = useState<ClienteInfo | null>(null);
  const [selectedNavioId, setSelectedNavioId] = useState("");
  const [navioJangadas, setNavioJangadas] = useState<JangadaOption[]>([]);
  const [selectedJangadaIds, setSelectedJangadaIds] = useState<Set<number>>(new Set());
  const [loadingJangadas, setLoadingJangadas] = useState(false);

  // Legacy search-by-serial
  const [searchJangada, setSearchJangada] = useState("");
  const [jangadas, setJangadas] = useState<JangadaOption[]>([]);
  const [searchingJangada, setSearchingJangada] = useState(false);
  const [selectedJangada, setSelectedJangada] = useState<JangadaOption | null>(null);

  const useCascade = !!clienteIdParam;

  // Load jangada by ID if provided
  useEffect(() => {
    if (!jangadaIdParam) return;
    const id = Number(jangadaIdParam);
    if (!id) return;
    fetch(`/api/jangadas/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data?.serial) {
          setSearchJangada(data.serial);
          setSelectedJangada({ id: data.id, serial: data.serial, brand: data.brand, model: data.model, navio: data.navio });
        }
      })
      .catch(() => {});
  }, [jangadaIdParam]);

  // Load client and navios
  useEffect(() => {
    if (!clienteIdParam) return;
    const id = Number(clienteIdParam);
    if (!id) return;
    fetch(`/api/clientes/${id}`)
      .then((r) => r.json())
      .then((data) => setCliente(data))
      .catch(() => toast.error("Erro ao carregar cliente", "Criar OT"));
  }, [clienteIdParam]);

  // Load jangadas when navio is selected
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset do estado das jangadas quando o navio selecionado muda.
    if (!selectedNavioId) { setNavioJangadas([]); setSelectedJangadaIds(new Set()); return; }
    setLoadingJangadas(true);
    fetch(`/api/jangadas?shipId=${selectedNavioId}`)
      .then((r) => r.json())
      .then((data) => {
        setNavioJangadas(Array.isArray(data) ? data : []);
      })
      .catch(() => toast.error("Erro ao carregar jangadas", "Criar OT"))
      .finally(() => setLoadingJangadas(false));
  }, [selectedNavioId]);

  // Legacy search
  useEffect(() => {
    if (useCascade) return;
    if (!searchJangada || searchJangada.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset da lista de jangadas quando o termo de pesquisa é esvaziado.
      setJangadas([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingJangada(true);
      try {
        const r = await fetch(`/api/jangadas?serial=${encodeURIComponent(searchJangada)}`);
        if (r.ok) {
          const data = await r.json();
          setJangadas(Array.isArray(data) ? data : []);
        }
      } catch { } finally {
        setSearchingJangada(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchJangada, useCascade]);

  const toggleJangada = (id: number) => {
    setSelectedJangadaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = useCallback(async () => {
    if (useCascade) {
      if (!selectedNavioId) { toast.error("Seleciona um navio.", "Criar OT"); return; }
      if (selectedJangadaIds.size === 0) { toast.error("Seleciona pelo menos uma jangada.", "Criar OT"); return; }
    } else {
      if (!selectedJangada) { toast.error("Seleciona uma jangada.", "Criar OT"); return; }
    }

    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        tipo,
        prioridade,
        status,
        tecnicoResponsavel: tecnicoResponsavel || undefined,
        slaHoras: slaHoras ? Number(slaHoras) : undefined,
        dataPlaneadaInicio: dataPlaneadaInicio || undefined,
        dataPlaneadaFim: dataPlaneadaFim || undefined,
        descricao: descricao || undefined,
      };

      if (useCascade) {
        body.jangadaIds = Array.from(selectedJangadaIds);
        body.shipId = Number(selectedNavioId);
      } else {
        body.jangadaId = selectedJangada!.id;
      }

      const r = await performOfflineAwareJsonRequest<unknown>({
        path: "/api/ordens-servico",
        method: "POST",
        body,
        queueEntry: {
          entityType: "ordem-servico",
          summary: useCascade ? `OT em cascata (${selectedJangadaIds.size} jangadas)` : `OT ${selectedJangada!.id} · ${tipo}`,
        },
      });

      if (r.queued) {
        toast.success("OT criada na fila offline; será enviada quando houver ligação.", "Offline");
        router.push("/ordens-servico");
        return;
      }

      const result = r.data;
      const newOrder = Array.isArray(result) ? result[0] : result;
      if (!newOrder || typeof newOrder !== "object" || !("id" in newOrder) || !(newOrder as { id?: unknown }).id) {
        throw new Error("Resposta invalida do servidor.");
      }
      const label = useCascade ? `OT para ${selectedJangadaIds.size} jangada(s)` : `OT ${String((newOrder as { numeroOrdem?: unknown }).numeroOrdem || (newOrder as { id?: unknown }).id)}`;
      toast.success(`${label} criada.`, "Sucesso");
      router.push(`/ordens-servico/${String((newOrder as { id: unknown }).id)}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao criar OT.";
      setError(msg);
      toast.error(msg, "Criar OT");
    } finally {
      setSaving(false);
    }
  }, [useCascade, selectedNavioId, selectedJangadaIds, selectedJangada, tipo, prioridade, status, tecnicoResponsavel, slaHoras, dataPlaneadaInicio, dataPlaneadaFim, descricao, router]);

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto max-w-3xl space-y-6 px-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Nova Ordem de Servico</h1>
            <p className="text-sm text-slate-500">Criar uma nova ordem de servico</p>
          </div>
          <button onClick={() => router.back()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <X size={16} className="inline mr-1" /> Cancelar
          </button>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {/* Cascade: Cliente -> Navio -> Jangadas */}
        {useCascade && (
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Cliente / Navio / Jangadas</h2>

            {cliente ? (
              <>
                <p className="text-sm text-slate-700 mb-3">
                  <span className="font-medium">Cliente:</span> {cliente.nome}
                </p>

                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Navio</label>
                  <select
                    value={selectedNavioId}
                    onChange={(e) => setSelectedNavioId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Selecionar navio...</option>
                    {(cliente.navios || []).map((n) => (
                      <option key={n.id} value={n.id}>{n.nome} ({n.matricula || "—"})</option>
                    ))}
                  </select>
                </div>

                {selectedNavioId && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Jangadas do navio</label>
                    {loadingJangadas ? (
                      <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                        <Loader2 size={14} className="animate-spin" /> A carregar...
                      </div>
                    ) : navioJangadas.length === 0 ? (
                      <p className="text-sm text-slate-400 italic py-2">Nenhuma jangada associada a este navio.</p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-2">
                        {navioJangadas.map((j) => (
                          <label key={j.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={selectedJangadaIds.has(j.id)}
                              onChange={() => toggleJangada(j.id)}
                              className="rounded border-slate-300"
                            />
                            <span className="font-medium">{j.brand} {j.model}</span>
                            <span className="text-slate-500">· {j.serial}</span>
                            {j.shipNameManual && <span className="text-slate-400 text-xs">Navio: {j.shipNameManual}</span>}
                          </label>
                        ))}
                      </div>
                    )}
                    {selectedJangadaIds.size > 0 && (
                      <p className="text-xs text-blue-600 mt-1">{selectedJangadaIds.size} jangada(s) selecionada(s)</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                <Loader2 size={14} className="animate-spin" /> A carregar cliente...
              </div>
            )}
          </section>
        )}

        {/* Legacy: search by serial (when no clienteId) */}
        {!useCascade && (
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Jangada</h2>
            {selectedJangada ? (
              <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div>
                  <p className="font-semibold text-blue-900">{selectedJangada.brand} {selectedJangada.model}</p>
                  <p className="text-sm text-blue-700">Serial: {selectedJangada.serial}</p>
                  {selectedJangada.navio?.nome && <p className="text-sm text-blue-700">Navio: {selectedJangada.navio.nome}</p>}
                  {selectedJangada.navio?.cliente?.nome && <p className="text-sm text-blue-700">Cliente: {selectedJangada.navio.cliente.nome}</p>}
                </div>
                <button onClick={() => { setSelectedJangada(null); setSearchJangada(""); }} className="text-sm text-blue-700 hover:underline">
                  Alterar
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchJangada}
                  onChange={(e) => setSearchJangada(e.target.value)}
                  placeholder="Pesquisar jangada por serial, marca, navio..."
                  className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm"
                />
                {searchingJangada && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
                {jangadas.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-60 overflow-y-auto">
                    {jangadas.map((j) => (
                      <button
                        key={j.id}
                        type="button"
                        onClick={() => { setSelectedJangada(j); setJangadas([]); }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 border-b border-slate-100 last:border-0"
                      >
                        <span className="font-medium">{j.brand} {j.model}</span>
                        <span className="text-slate-500 ml-2">· {j.serial}</span>
                        {(j.navio?.nome || j.shipNameManual) && <span className="text-slate-400 ml-2">Navio: {j.navio?.nome || j.shipNameManual}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Dados da Ordem</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Tipo</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {TIPO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Estado</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Prioridade</label>
              <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Tecnico Responsavel</label>
              <input value={tecnicoResponsavel} onChange={(e) => setTecnicoResponsavel(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Nome do tecnico" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">SLA (horas)</label>
              <input type="number" min="0" value={slaHoras} onChange={(e) => setSlaHoras(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Inicio Planeado</label>
              <input type="date" value={dataPlaneadaInicio} onChange={(e) => setDataPlaneadaInicio(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Fim Planeado</label>
              <input type="date" value={dataPlaneadaFim} onChange={(e) => setDataPlaneadaFim(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-slate-600">Descricao</label>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Descricao da intervencao..." />
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <button onClick={() => router.back()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            <Save size={16} />
            {saving ? "A criar..." : "Criar Ordem"}
          </button>
        </div>
      </div>
    </div>
  );
}