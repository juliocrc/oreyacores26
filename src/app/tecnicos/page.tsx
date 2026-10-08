"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { APP_CONFIG } from "@/lib/app-config";
import type { TecnicosPayload, AusenciasPayload, AusenciaItem, CertificacaoItem, TecnicoRow } from "@/types/tecnicos-page";
import { toDateInput, emptyPayload } from "@/lib/tecnicos-page-helpers";
import { TecnicoFormModal } from "@/components/tecnicos/TecnicoFormModal";
import { TecnicoTabela } from "@/components/tecnicos/TecnicoTabela";
import type { TecnicoFormState } from "@/components/tecnicos/TecnicoFormModal";

const EMPTY_TECNICO_FORM: TecnicoFormState = {
  nome: "",
  email: "",
  serviceStationId: "",
  ativo: true,
  observacoes: "",
};

type ProductividadeRow = {
  id: number;
  nome: string;
  estacao: string;
  email?: string;
  completedCount: number;
  totalHours: number;
  avgMinutes: number;
};

export default function TecnicosPage() {
  const [payload, setPayload] = useState<TecnicosPayload>(emptyPayload);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState("");
  const [selectedTecnico, setSelectedTecnico] = useState<string>("");
  const [selectedTecnicoId, setSelectedTecnicoId] = useState<number | null>(null);
  const [ausencias, setAusencias] = useState<AusenciaItem[]>([]);
  const [ausenciasLoading, setAusenciasLoading] = useState(false);
  const [ausenciasError, setAusenciasError] = useState("");
  const [savingAusencia, setSavingAusencia] = useState(false);
  const [absenceForm, setAbsenceForm] = useState({
    tipo: "ferias" as "ferias" | "ausencia",
    dataInicio: "",
    dataFim: "",
    motivo: "",
  });
  const [certificacoes, setCertificacoes] = useState<CertificacaoItem[]>([]);
  const [certLoading, setCertLoading] = useState(false);
  const [certError, setCertError] = useState("");
  const [savingCert, setSavingCert] = useState(false);
  const [certForm, setCertForm] = useState({
    fabricante: "",
    numeroCertificado: "",
    dataEmissao: "",
    dataValidade: "",
    observacoes: "",
  });

  const [activeTab, setActiveTab] = useState<"directory" | "productivity">("directory");
  const [productivityData, setProductivityData] = useState<ProductividadeRow[]>([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [prodError, setProdError] = useState("");

  const [showTecnicoModal, setShowTecnicoModal] = useState(false);
  const [tecnicoForm, setTecnicoForm] = useState<TecnicoFormState>(EMPTY_TECNICO_FORM);
  const [editingTecnicoId, setEditingTecnicoId] = useState<number | null>(null);
  const [savingTecnico, setSavingTecnico] = useState(false);
  const [tecnicoErro, setTecnicoErro] = useState("");

  const podeGerirTecnicos = payload.canViewAllStations;

  const estacoesParaAtribuir = useMemo(
    () =>
      payload.stations.map((station) => ({
        id: station.id,
        nome: station.nome,
        codigo: station.codigo,
      })),
    [payload.stations],
  );

  function openNovoTecnico() {
    setTecnicoForm({ ...EMPTY_TECNICO_FORM });
    setEditingTecnicoId(null);
    setTecnicoErro("");
    setShowTecnicoModal(true);
  }

  function openEditarTecnico(tecnico: TecnicoRow) {
    setTecnicoForm({
      nome: tecnico.nome,
      email: tecnico.email || "",
      serviceStationId: tecnico.serviceStationId ? String(tecnico.serviceStationId) : "",
      ativo: tecnico.ativo,
      observacoes: tecnico.observacoes || "",
    });
    setEditingTecnicoId(tecnico.id);
    setTecnicoErro("");
    setShowTecnicoModal(true);
  }

  async function submitTecnico(event: React.FormEvent) {
    event.preventDefault();
    if (!tecnicoForm.nome.trim()) {
      setTecnicoErro("Nome é obrigatório.");
      return;
    }

    setSavingTecnico(true);
    setTecnicoErro("");
    try {
      const url = editingTecnicoId ? `/api/tecnicos?id=${editingTecnicoId}` : "/api/tecnicos";
      const res = await fetch(url, {
        method: editingTecnicoId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: tecnicoForm.nome,
          email: tecnicoForm.email,
          serviceStationId: tecnicoForm.serviceStationId || null,
          ativo: tecnicoForm.ativo,
          observacoes: tecnicoForm.observacoes,
        }),
      });

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(data?.error || "Erro ao gravar técnico.");
      }

      setShowTecnicoModal(false);
      setTecnicoForm(EMPTY_TECNICO_FORM);
      setEditingTecnicoId(null);
      await loadTecnicos();
    } catch (err) {
      setTecnicoErro(err instanceof Error ? err.message : "Erro ao gravar técnico.");
    } finally {
      setSavingTecnico(false);
    }
  }

  async function alternarAtivo(tecnico: TecnicoRow) {
    const alvo = !tecnico.ativo;
    try {
      // Envia apenas `ativo`: o PUT é parcial, por isso os restantes campos
      // (nome, email, estação, observações) ficam intactos.
      const res = await fetch(`/api/tecnicos?id=${tecnico.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: alvo }),
      });

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(data?.error || "Erro ao alterar o estado do técnico.");
      }

      await loadTecnicos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao alterar o estado do técnico.");
    }
  }

  async function eliminarTecnico(tecnico: TecnicoRow) {
    const confirmar = confirm(
      `Eliminar ${tecnico.nome}? Isto só é possível se não tiver histórico associado.`,
    );
    if (!confirmar) return;

    try {
      const res = await fetch(`/api/tecnicos?id=${tecnico.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(data?.error || "Erro ao eliminar técnico.");
      }

      await loadTecnicos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao eliminar técnico.");
    }
  }

  const loadProductivity = useCallback(async () => {
    setProdLoading(true);
    setProdError("");
    try {
      const res = await fetch("/api/tecnicos/produtividade", { cache: "no-store" });
      if (!res.ok) throw new Error("Erro ao carregar dados de produtividade.");
      const data = await res.json();
      setProductivityData(data);
    } catch (err) {
      setProdError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setProdLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "productivity") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- carregamento de dados de produtividade quando o separador é ativado.
      void loadProductivity();
    }
  }, [activeTab, loadProductivity]);

  const loadTecnicos = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (showInactive) params.set("includeInactive", "true");

      const res = await fetch(`/api/tecnicos${params.toString() ? `?${params.toString()}` : ""}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as TecnicosPayload | { error?: string } | null;
      if (!res.ok) {
        throw new Error((data as { error?: string } | null)?.error || "Erro ao carregar técnicos.");
      }

      setPayload(data as TecnicosPayload);
    } catch (err) {
      setPayload(emptyPayload());
      setError(err instanceof Error ? err.message : "Erro ao carregar técnicos.");
    } finally {
      setLoading(false);
    }
  }, [search, showInactive]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carregamento inicial da lista de técnicos.
    void loadTecnicos();
  }, [loadTecnicos]);

  const loadAusencias = useCallback(async (tecnicoNome: string) => {
    setAusenciasLoading(true);
    setAusenciasError("");
    try {
      const params = new URLSearchParams({ tecnicoNome });
      const res = await fetch(`/api/tecnicos/ausencias?${params.toString()}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as AusenciasPayload | { error?: string } | null;
      if (!res.ok) {
        throw new Error((data as { error?: string } | null)?.error || "Erro ao carregar ausências.");
      }
      setAusencias(Array.isArray((data as AusenciasPayload).ausencias) ? (data as AusenciasPayload).ausencias : []);
    } catch (err) {
      setAusencias([]);
      setAusenciasError(err instanceof Error ? err.message : "Erro ao carregar ausências.");
    } finally {
      setAusenciasLoading(false);
    }
  }, []);

  const loadCertificacoes = useCallback(async (tecnicoId: number) => {
    setCertLoading(true);
    setCertError("");
    try {
      const res = await fetch(`/api/tecnicos/certificacoes?tecnicoId=${tecnicoId}`);
      if (!res.ok) throw new Error("Erro ao carregar certificacoes.");
      const data = await res.json();
      setCertificacoes(Array.isArray(data) ? data : []);
    } catch (err) {
      setCertificacoes([]);
      setCertError(err instanceof Error ? err.message : "Erro ao carregar certificacoes.");
    } finally {
      setCertLoading(false);
    }
  }, []);

  const openTecnicoModal = useCallback((tecnicoNome: string, tecnicoId?: number) => {
    setSelectedTecnico(tecnicoNome);
    setSelectedTecnicoId(tecnicoId || null);
    const today = new Date();
    const todayText = toDateInput(today.toISOString());
    setAbsenceForm({ tipo: "ferias", dataInicio: todayText, dataFim: todayText, motivo: "" });
    setCertForm({ fabricante: "", numeroCertificado: "", dataEmissao: "", dataValidade: "", observacoes: "" });
    void loadAusencias(tecnicoNome);
    if (tecnicoId) void loadCertificacoes(tecnicoId);
  }, [loadAusencias, loadCertificacoes]);

  const closeTecnicoModal = useCallback(() => {
    setSelectedTecnico("");
    setSelectedTecnicoId(null);
    setAusencias([]);
    setAusenciasError("");
    setCertificacoes([]);
    setCertError("");
  }, []);

  const saveAusencia = useCallback(async () => {
    if (!selectedTecnico) return;
    if (!absenceForm.dataInicio || !absenceForm.dataFim) {
      setAusenciasError("Preenche data início e data fim.");
      return;
    }

    setSavingAusencia(true);
    setAusenciasError("");
    try {
      const res = await fetch("/api/tecnicos/ausencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tecnicoNome: selectedTecnico,
          tipo: absenceForm.tipo,
          dataInicio: absenceForm.dataInicio,
          dataFim: absenceForm.dataFim,
          motivo: absenceForm.motivo,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Não foi possível guardar.");
      await loadAusencias(selectedTecnico);
    } catch (err) {
      setAusenciasError(err instanceof Error ? err.message : "Não foi possível guardar.");
    } finally {
      setSavingAusencia(false);
    }
  }, [selectedTecnico, absenceForm, loadAusencias]);

  const removeAusencia = useCallback(async (id: number) => {
    if (!selectedTecnico) return;
    try {
      const res = await fetch(`/api/tecnicos/ausencias?id=${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Não foi possível remover.");
      await loadAusencias(selectedTecnico);
    } catch (err) {
      setAusenciasError(err instanceof Error ? err.message : "Não foi possível remover.");
    }
  }, [selectedTecnico, loadAusencias]);

  const saveCertificacao = useCallback(async () => {
    if (!selectedTecnicoId) { setCertError("Tecnico nao selecionado."); return; }
    if (!certForm.fabricante || !certForm.dataEmissao || !certForm.dataValidade) {
      setCertError("Preenche fabricante, data emissao e data validade.");
      return;
    }
    setSavingCert(true);
    setCertError("");
    try {
      const res = await fetch("/api/tecnicos/certificacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tecnicoId: selectedTecnicoId,
          fabricante: certForm.fabricante,
          numeroCertificado: certForm.numeroCertificado || undefined,
          dataEmissao: new Date(certForm.dataEmissao).toISOString(),
          dataValidade: new Date(certForm.dataValidade).toISOString(),
          observacoes: certForm.observacoes || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Erro ao guardar certificacao.");
      setCertForm({ fabricante: "", numeroCertificado: "", dataEmissao: "", dataValidade: "", observacoes: "" });
      if (selectedTecnicoId) await loadCertificacoes(selectedTecnicoId);
    } catch (err) {
      setCertError(err instanceof Error ? err.message : "Erro ao guardar certificacao.");
    } finally {
      setSavingCert(false);
    }
  }, [selectedTecnicoId, certForm, loadCertificacoes]);

  const removeCertificacao = useCallback(async (id: number) => {
    if (!selectedTecnicoId) return;
    try {
      const res = await fetch(`/api/tecnicos/certificacoes?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao remover certificacao.");
      await loadCertificacoes(selectedTecnicoId);
    } catch (err) {
      setCertError(err instanceof Error ? err.message : "Erro ao remover certificacao.");
    }
  }, [selectedTecnicoId, loadCertificacoes]);

  const totalStations = payload.stations.length;
  const totalActive = useMemo(
    () => payload.stations.reduce((acc, station) => acc + station.tecnicos.filter((tecnico) => tecnico.ativo).length, 0) + payload.unassigned.filter((tecnico) => tecnico.ativo).length,
    [payload]
  );

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="ds-page flex flex-col gap-6">
        <div className="app-hero-panel flex flex-col gap-4 rounded-2xl p-6 text-white">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-100">Orey Técnica</p>
              <h1 className="mt-2 text-3xl font-bold">Técnicos</h1>
              <p className="mt-2 max-w-3xl text-sm text-sky-100">
                Lista dos técnicos afetos a cada estação de serviço, respeitando a estação ativa selecionada na aplicação.
              </p>
            </div>
            <div className="rounded-lg bg-white/10 px-4 py-3 text-sm text-sky-50 ring-1 ring-white/20">
              {payload.activeStation
                ? `Estação ativa: ${payload.activeStation.nome}`
                : payload.canViewAllStations
                  ? "Vista global: todas as estações"
                  : "Sem estação ativa explícita"}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Técnicos totais", value: payload.totalTecnicos },
              { label: "Técnicos ativos", value: totalActive },
              { label: "Estações visíveis", value: totalStations },
              { label: "Sem estação", value: payload.unassigned.length },
            ].map((item) => (
              <div key={item.label} className="app-hero-card rounded-xl p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-sky-100">{item.label}</p>
                <p className="mt-2 text-2xl font-bold">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {APP_CONFIG.theme === 'deluxe' && (
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab("directory")}
              className={`px-5 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'directory' ? 'border-indigo-650 text-indigo-650' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              Diretório de Técnicos
            </button>
            <button
              onClick={() => setActiveTab("productivity")}
              className={`px-5 py-3 text-sm font-bold border-b-2 transition ${activeTab === 'productivity' ? 'border-indigo-650 text-indigo-650' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              📊 Produtividade & Análise (Deluxe)
            </button>
          </div>
        )}

        {activeTab === "directory" && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Diretório de técnicos</h2>
              <p className="text-sm text-slate-500">Pesquisa por nome ou email e consulta o agrupamento por estação.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {podeGerirTecnicos ? (
                <button
                  type="button"
                  onClick={openNovoTecnico}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Novo técnico
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void loadTecnicos()}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Atualizar lista
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[2fr,auto]">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar técnico por nome ou email"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
              <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
              Mostrar inativos
            </label>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          {loading ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              A carregar técnicos...
            </div>
          ) : payload.stations.length === 0 && payload.unassigned.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Não há técnicos para mostrar com os filtros atuais.
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              {payload.stations.map((station) => (
                <div key={station.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60">
                  <div className="flex flex-col gap-2 border-b border-slate-200 bg-white px-4 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">{station.nome}</h3>
                        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-800">
                          {station.codigo}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {[station.empresa, station.localizacao, station.regiaoOperacional].filter(Boolean).join(" · ") || "Sem detalhe adicional"}
                      </p>
                    </div>
                    <div className="text-sm font-semibold text-slate-700">{station.totalTecnicos} técnico(s)</div>
                  </div>

                  <TecnicoTabela
                    tecnicos={station.tecnicos}
                    vazioTexto="Sem técnicos registados nesta estação."
                    onOpenAusencias={(nome, id) => openTecnicoModal(nome, id)}
                    onEdit={podeGerirTecnicos ? openEditarTecnico : undefined}
                    onToggleAtivo={podeGerirTecnicos ? alternarAtivo : undefined}
                    onDelete={podeGerirTecnicos ? eliminarTecnico : undefined}
                  />
                </div>
              ))}

              {payload.unassigned.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60">
                  <div className="border-b border-amber-200 bg-white px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Sem estação atribuída</h3>
                        <p className="mt-1 text-sm text-slate-500">Técnicos ativos na base de dados sem afetação a uma estação de serviço.</p>
                      </div>
                      <div className="text-sm font-semibold text-slate-700">{payload.unassigned.length} técnico(s)</div>
                    </div>
                  </div>
                  <TecnicoTabela
                    tecnicos={payload.unassigned}
                    vazioTexto="Sem técnicos sem estação."
                    onOpenAusencias={(nome, id) => openTecnicoModal(nome, id)}
                    onEdit={podeGerirTecnicos ? openEditarTecnico : undefined}
                    onToggleAtivo={podeGerirTecnicos ? alternarAtivo : undefined}
                    onDelete={podeGerirTecnicos ? eliminarTecnico : undefined}
                  />
                </div>
              ) : null}
            </div>
          )}
        </section>
        )}

        {activeTab === "productivity" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {prodLoading ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                A carregar métricas de produtividade...
              </div>
            ) : prodError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{prodError}</div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total de Inspeções Concluídas</p>
                    <h3 className="text-3xl font-black text-slate-800 mt-2">
                      {productivityData.reduce((sum, t) => sum + t.completedCount, 0)}
                    </h3>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Tempo de Bancada Total</p>
                    <h3 className="text-3xl font-black text-indigo-600 mt-2">
                      {productivityData.reduce((sum, t) => sum + t.totalHours, 0).toFixed(1)} <span className="text-sm font-semibold">horas</span>
                    </h3>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Tempo Médio por Inspeção</p>
                    <h3 className="text-3xl font-black text-emerald-700 mt-2">
                      {Math.round(
                        productivityData.reduce((sum, t) => sum + t.avgMinutes, 0) /
                        (productivityData.filter(t => t.completedCount > 0).length || 1)
                      )} <span className="text-sm font-semibold">min</span>
                    </h3>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                      <h3 className="font-bold text-slate-800 text-base">Desempenho por Técnico</h3>
                      <p className="text-xs text-slate-500 mt-1">Comparação de ordens de serviço concluídas e horas dedicadas.</p>
                    </div>
                    <button
                      onClick={() => {
                        const ws = XLSX.utils.json_to_sheet(productivityData.map(t => ({
                          'Técnico': t.nome,
                          'E-mail': t.email || '—',
                          'Estação': t.estacao,
                          'Inspeções Concluídas': t.completedCount,
                          'Horas Dedicadas': t.totalHours,
                          'Tempo Médio (min)': t.avgMinutes
                        })));
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, 'Produtividade');
                        XLSX.writeFile(wb, `produtividade_tecnicos_${new Date().toISOString().slice(0, 10)}.xlsx`);
                      }}
                      className="inline-flex items-center gap-1.5 bg-emerald-650 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-xl text-xs transition shadow-sm cursor-pointer"
                    >
                      Exportar Excel
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-100">
                        <tr>
                          <th className="p-4 pl-6">Técnico</th>
                          <th className="p-4">Estação</th>
                          <th className="p-4 text-center">OTs Concluídas</th>
                          <th className="p-4 text-center">Horas Dedicadas</th>
                          <th className="p-4 text-center">Tempo Médio / OT</th>
                          <th className="p-4 pr-6">Rácio de Volume</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {productivityData.map((t) => {
                          const maxCount = Math.max(...productivityData.map(x => x.completedCount), 1);
                          const pct = Math.round((t.completedCount / maxCount) * 100);
                          return (
                            <tr key={t.id} className="hover:bg-slate-50/50 transition">
                              <td className="p-4 pl-6 font-semibold text-slate-800">{t.nome}</td>
                              <td className="p-4 text-slate-600">
                                <span className="bg-slate-100 text-slate-700 rounded px-2 py-0.5 text-xs font-medium border border-slate-200">
                                  {t.estacao}
                                </span>
                              </td>
                              <td className="p-4 text-center font-bold text-slate-900">{t.completedCount}</td>
                              <td className="p-4 text-center font-semibold text-indigo-600">{t.totalHours} h</td>
                              <td className="p-4 text-center text-slate-500">{t.avgMinutes} min</td>
                              <td className="p-4 pr-6">
                                <div className="flex items-center gap-2">
                                  <div className="w-32 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                                    <div className="bg-indigo-650 h-full rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-xs text-slate-400 font-semibold">{pct}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {selectedTecnico ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={closeTecnicoModal}>
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Ausências e férias</h3>
                <p className="text-sm text-slate-500">Técnico: <span className="font-semibold text-slate-700">{selectedTecnico}</span></p>
              </div>
              <button type="button" onClick={closeTecnicoModal} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Fechar</button>
            </div>

            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
              <select
                value={absenceForm.tipo}
                onChange={(event) => setAbsenceForm((current) => ({ ...current, tipo: event.target.value as "ferias" | "ausencia" }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="ferias">Férias</option>
                <option value="ausencia">Ausência</option>
              </select>
              <input
                type="date"
                value={absenceForm.dataInicio}
                onChange={(event) => setAbsenceForm((current) => ({ ...current, dataInicio: event.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={absenceForm.dataFim}
                onChange={(event) => setAbsenceForm((current) => ({ ...current, dataFim: event.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void saveAusencia()}
                disabled={savingAusencia}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingAusencia ? "A guardar..." : "Guardar"}
              </button>
              <input
                type="text"
                value={absenceForm.motivo}
                onChange={(event) => setAbsenceForm((current) => ({ ...current, motivo: event.target.value }))}
                placeholder="Motivo (opcional)"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-4"
              />
            </div>

            {ausenciasError ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{ausenciasError}</div> : null}

            <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-100 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Tipo</th>
                    <th className="px-3 py-2 font-semibold">Início</th>
                    <th className="px-3 py-2 font-semibold">Fim</th>
                    <th className="px-3 py-2 font-semibold">Motivo</th>
                    <th className="px-3 py-2 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {ausenciasLoading ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-slate-500">A carregar...</td>
                    </tr>
                  ) : ausencias.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-slate-500">Sem registos para este técnico.</td>
                    </tr>
                  ) : (
                    ausencias.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${item.tipo === "ferias" ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700"}`}>
                            {item.tipo === "ferias" ? "Férias" : "Ausência"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-700">{toDateInput(item.dataInicio)}</td>
                        <td className="px-3 py-2 text-slate-700">{toDateInput(item.dataFim)}</td>
                        <td className="px-3 py-2 text-slate-600">{item.motivo || "—"}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => void removeAusencia(item.id)}
                            className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <hr className="my-6 border-slate-200" />

            <div className="mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Certificacoes</h3>
              <p className="text-sm text-slate-500">Certificacoes de fabricante do tecnico</p>
            </div>

            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
              <input type="text" value={certForm.fabricante} onChange={(e) => setCertForm(f => ({ ...f, fabricante: e.target.value }))} placeholder="Fabricante *" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input type="text" value={certForm.numeroCertificado} onChange={(e) => setCertForm(f => ({ ...f, numeroCertificado: e.target.value }))} placeholder="N. Certificado" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input type="date" value={certForm.dataEmissao} onChange={(e) => setCertForm(f => ({ ...f, dataEmissao: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input type="date" value={certForm.dataValidade} onChange={(e) => setCertForm(f => ({ ...f, dataValidade: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input type="text" value={certForm.observacoes} onChange={(e) => setCertForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Observacoes" className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-3" />
              <button type="button" onClick={() => void saveCertificacao()} disabled={savingCert || !certForm.fabricante || !certForm.dataEmissao || !certForm.dataValidade}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
                {savingCert ? "A guardar..." : "Adicionar"}
              </button>
            </div>

            {certError ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{certError}</div> : null}

            <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-100 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Fabricante</th>
                    <th className="px-3 py-2 font-semibold">N. Certificado</th>
                    <th className="px-3 py-2 font-semibold">Emissao</th>
                    <th className="px-3 py-2 font-semibold">Validade</th>
                    <th className="px-3 py-2 font-semibold">Estado</th>
                    <th className="px-3 py-2 font-semibold">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {certLoading ? (
                    <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-500">A carregar...</td></tr>
                  ) : certificacoes.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-500">Sem certificacoes.</td></tr>
                  ) : (
                    certificacoes.map((cert) => (
                      <tr key={cert.id}>
                        <td className="px-3 py-2 font-medium text-slate-800">{cert.fabricante}</td>
                        <td className="px-3 py-2 text-slate-600">{cert.numeroCertificado || "—"}</td>
                        <td className="px-3 py-2 text-slate-700">{toDateInput(cert.dataEmissao)}</td>
                        <td className="px-3 py-2 text-slate-700">{toDateInput(cert.dataValidade)}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${cert.ativo ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                            {cert.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => void removeCertificacao(cert.id)}
                            className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">Remover</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {showTecnicoModal ? (
        <TecnicoFormModal
          editId={editingTecnicoId}
          form={tecnicoForm}
          estacoes={estacoesParaAtribuir}
          saving={savingTecnico}
          erro={tecnicoErro}
          onChange={setTecnicoForm}
          onSubmit={submitTecnico}
          onClose={() => {
            setShowTecnicoModal(false);
            setEditingTecnicoId(null);
            setTecnicoErro("");
          }}
        />
      ) : null}
    </div>
  );
}
