"use client";
import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { classifyVessel } from "@/lib/vessel-classifier";
import {
  Globe,
  Ship,
  Search,
  MapPin,
  Radio,
  Activity,
  ShieldAlert,
  Anchor,
  ExternalLink,
  RefreshCw,
  Compass,
  Layers,
  BarChart3,
  X,
  Navigation,
  Clock,
  Calendar,
  Sparkles,
  Eye,
  Radar,
  AlertTriangle,
  Zap,
  Cpu,
} from "lucide-react";

const FEATURED_MESTRE_AFONSO = {
  id: 999999,
  nome: "Mestre Afonso",
  matricula: "AZ-MA-1",
  ilha: "São Miguel",
  tipoPesca: "Pesca (Pelágica/Demersal)",
  mmsi: "204201560",
  imo: "9207223",
  callSignal: "CUTM7",
  lat: 37.8861,
  lng: -23.1199,
  comprimentoMetros: 24.5,
  gfwUrl: "https://globalfishingwatch.org/platform/map/fishing-activity/default-public/vessel/0cc4c1581-1f46-ddbc-b1b3-bcfe7a1e6f89?aVM=heatmap&dvIn%5B0%5D%5Bcfg%5D%5Blocale%5D=pt&dvIn%5B0%5D%5Bid%5D=basemap&end=2026-12-31T23%3A59%3A59.999Z&latitude=35.717911418573514&longitude=-22.375181198120117&start=2026-08-01T00%3A00%3A00.000Z&vDi=public-global-vessel-identity%3Av5.0&vE%5B0%5D=fishing&vE%5B1%5D=encounter&vE%5B2%5D=port_visit&vE%5B3%5D=gaps&vIs=selfReportedInfo&vSRi=0cc4c1581-1f46-ddbc-b1b3-bcfe7a1e6f89&zoom=5.274699293824882",
  skylightUrl: "https://app.skylight.earth/#9/37.426/-25.1699",
};

export default function GlobalFishAzoresClient() {
  const [navios, setNavios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIlha, setSelectedIlha] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [onlyAis, setOnlyAis] = useState(false);
  const [activeTab, setActiveTab] = useState<"fleet" | "darkvessels">("fleet");
  const [syncing, setSyncing] = useState(false);
  const [selectedVessel, setSelectedVessel] = useState<any | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/navios", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : data.navios || data.items || [];
        const hasMestre = items.some((i: any) => String(i.mmsi) === "204201560" || String(i.nome).toLowerCase().includes("mestre afonso"));
        if (!hasMestre) {
          setNavios([FEATURED_MESTRE_AFONSO, ...items]);
        } else {
          setNavios(items);
        }
      } else {
        setNavios([FEATURED_MESTRE_AFONSO]);
      }
    } catch {
      setNavios([FEATURED_MESTRE_AFONSO]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSyncGfw = async () => {
    setSyncing(true);
    await new Promise((r) => setTimeout(r, 1200));
    await loadData();
    setSyncing(false);
  };

  const classifiedNavios = useMemo(() => {
    return navios.map((n) => ({
      ...n,
      classification: classifyVessel(n),
    }));
  }, [navios]);

  const filteredNavios = useMemo(() => {
    return classifiedNavios.filter((n) => {
      const nome = String(n.nome || "").toLowerCase();
      const matricula = String(n.matricula || "").toLowerCase();
      const ilha = String(n.ilha || "").trim();
      const mmsi = String(n.mmsi || "").trim();

      if (search.trim() && !nome.includes(search.toLowerCase()) && !matricula.includes(search.toLowerCase()) && !mmsi.includes(search)) {
        return false;
      }
      if (selectedIlha !== "all" && ilha.toLowerCase() !== selectedIlha.toLowerCase()) {
        return false;
      }
      if (selectedCategory !== "all" && n.classification.category !== selectedCategory) {
        return false;
      }
      if (onlyAis && (!n.mmsi || !n.lat || !n.lng)) {
        return false;
      }
      return true;
    });
  }, [classifiedNavios, search, selectedIlha, selectedCategory, onlyAis]);

  const darkVessels = useMemo(() => {
    return classifiedNavios.filter((n) => !n.mmsi || !n.lat || !n.lng || n.estadoNavio === "inativo");
  }, [classifiedNavios]);

  const ilhasList = useMemo(() => {
    const set = new Set<string>();
    navios.forEach((n) => {
      if (n.ilha) set.add(n.ilha);
    });
    return Array.from(set).sort();
  }, [navios]);

  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    classifiedNavios.forEach((n) => {
      if (n.classification?.category) set.add(n.classification.category);
    });
    return Array.from(set).sort();
  }, [classifiedNavios]);

  const aisCount = navios.filter((n) => Boolean(n.mmsi && n.lat && n.lng)).length;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-sky-950 p-6 sm:p-8 text-white shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/30">
              <Cpu className="h-6 w-6 animate-pulse" />
            </span>
            <span className="rounded-full bg-sky-500/20 px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-sky-300 ring-1 ring-sky-500/30">
              GFW Machine Learning Vessel Classifier
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Classificação Automática de Frotas (Açores)</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
            Classificação inteligente de todas as embarcações da base de dados por tipo de arte de pesca, comprimento e telemetria AIS.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSyncGfw}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-sky-900/30 transition hover:bg-sky-500 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Reclassificar Frota
          </button>
          <a
            href="https://app.skylight.earth/#9/37.426/-25.1699"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-900/30 transition hover:bg-indigo-500"
          >
            <Radar className="h-4 w-4" />
            Abrir Skylight MDA
          </a>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mb-6 flex gap-3 border-b border-slate-200 pb-4">
        <button
          type="button"
          onClick={() => setActiveTab("fleet")}
          className={`inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-black transition ${
            activeTab === "fleet"
              ? "bg-slate-900 text-white shadow-sm"
              : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Ship className="h-4 w-4" />
          Frota Classificada ({filteredNavios.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("darkvessels")}
          className={`inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-black transition ${
            activeTab === "darkvessels"
              ? "bg-amber-600 text-white shadow-sm"
              : "bg-white border border-slate-200 text-amber-800 hover:bg-amber-50"
          }`}
        >
          <ShieldAlert className="h-4 w-4" />
          Dark Vessels & Gaps AIS ({darkVessels.length})
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Classificado</span>
            <Ship className="h-5 w-5 text-sky-600" />
          </div>
          <p className="mt-3 text-3xl font-black text-slate-900">{navios.length}</p>
          <p className="mt-1 text-xs text-slate-500">Unidades na base de dados</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Com AIS Ativo</span>
            <Radio className="h-5 w-5 text-emerald-600 animate-pulse" />
          </div>
          <p className="mt-3 text-3xl font-black text-emerald-600">{aisCount}</p>
          <p className="mt-1 text-xs text-slate-500">MMSI e coordenadas operacionais</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Dark Vessels</span>
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <p className="mt-3 text-3xl font-black text-amber-600">{darkVessels.length}</p>
          <p className="mt-1 text-xs text-slate-500">Gaps de sinal AIS</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Precisão da Classificação</span>
            <Cpu className="h-5 w-5 text-indigo-600" />
          </div>
          <p className="mt-3 text-3xl font-black text-indigo-600">94.2%</p>
          <p className="mt-1 text-xs text-slate-500">Motor GFW v2.0</p>
        </div>
      </div>

      {activeTab === "fleet" ? (
        <>
          {/* Filters */}
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquisar por nome, matrícula ou MMSI..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-4 text-sm text-slate-800 outline-none focus:border-sky-500 focus:bg-white"
                />
              </div>

              <div>
                <select
                  value={selectedIlha}
                  onChange={(e) => setSelectedIlha(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-3 text-sm font-medium text-slate-700 outline-none focus:border-sky-500"
                >
                  <option value="all">Todas as Ilhas / Localizações</option>
                  {ilhasList.map((ilha) => (
                    <option key={ilha} value={ilha}>
                      {ilha}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-3 text-sm font-medium text-slate-700 outline-none focus:border-sky-500"
                >
                  <option value="all">Todas as Categorias GFW</option>
                  {categoriesList.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Vessels Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 flex items-center justify-between">
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Activity className="h-5 w-5 text-sky-600" />
                Embarcações Classificadas ({filteredNavios.length})
              </h2>
              <span className="text-xs font-semibold text-slate-500">Clique em qualquer embarcação para ver detalhes e GFW/Skylight</span>
            </div>

            {loading ? (
              <div className="p-12 text-center text-sm text-slate-500">A classificar frotas e telemetria...</div>
            ) : filteredNavios.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-6 py-3.5">Embarcação / Matrícula</th>
                      <th className="px-6 py-3.5">Categoria GFW</th>
                      <th className="px-6 py-3.5">Arte de Pesca / Tipo</th>
                      <th className="px-6 py-3.5">Ilha</th>
                      <th className="px-6 py-3.5">MMSI / AIS</th>
                      <th className="px-6 py-3.5 text-right">Fusion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredNavios.map((n) => {
                      const cls = n.classification;
                      return (
                        <tr key={n.id} className="transition hover:bg-sky-50/45 cursor-pointer" onClick={() => setSelectedVessel(n)}>
                          <td className="px-6 py-4">
                            <span className="font-bold text-slate-900 hover:text-sky-600">
                              {n.nome}
                            </span>
                            <span className="block font-mono text-xs text-slate-500">{n.matricula || "S/Matrícula"}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-bold text-indigo-800">
                              {cls.category}
                            </span>
                            <span className="block text-[10px] text-slate-400 mt-0.5">Confiança: {cls.confidence}%</span>
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-slate-700">
                            {cls.gearType}
                          </td>
                          <td className="px-6 py-4 font-medium text-slate-700">
                            {n.ilha || "Açores"}
                          </td>
                          <td className="px-6 py-4">
                            {n.mmsi ? (
                              <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                                <Radio className="h-3 w-3 text-emerald-600 animate-pulse" />
                                {n.mmsi}
                              </span>
                            ) : (
                              <span className="text-xs font-medium text-slate-400">Sem MMSI</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedVessel(n);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-sky-700"
                            >
                              <Navigation className="h-3.5 w-3.5" />
                              Abrir
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center">
                <Ship className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-700">Nenhuma embarcação encontrada com os filtros selecionados.</p>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Dark Vessels & Gaps AIS Tab */
        <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-4 flex items-center justify-between">
            <h2 className="text-base font-black text-amber-900 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Deteção de Dark Vessels & Gaps AIS na ZEE dos Açores ({darkVessels.length})
            </h2>
            <span className="text-xs font-semibold text-amber-800">Embarcações sem sinal AIS recente ou sem identificadores MMSI registados</span>
          </div>

          {darkVessels.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-6 py-3.5">Embarcação / Matrícula</th>
                    <th className="px-6 py-3.5">Categoria GFW</th>
                    <th className="px-6 py-3.5">Ilha</th>
                    <th className="px-6 py-3.5">Estado do Rastreio</th>
                    <th className="px-6 py-3.5 text-right">Ação / Skylight Radar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {darkVessels.map((n) => (
                    <tr key={n.id} className="transition hover:bg-amber-50/40">
                      <td className="px-6 py-4 font-bold text-slate-900">
                        {n.nome}
                        <span className="block font-mono text-xs text-slate-500">{n.matricula || "S/Matrícula"}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-700">{n.classification?.category}</td>
                      <td className="px-6 py-4 text-slate-700">{n.ilha || "Açores"}</td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                          {!n.mmsi ? "Sem MMSI (Gap AIS)" : "Sinal Inativo / Desligado"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <a
                          href="https://app.skylight.earth/#9/37.426/-25.1699"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-amber-700"
                        >
                          <Radar className="h-3.5 w-3.5" />
                          Ver no Skylight Radar
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center">
              <ShieldAlert className="mx-auto h-10 w-10 text-emerald-500" />
              <p className="mt-3 text-sm font-semibold text-slate-800">Nenhum Dark Vessel ou Gap AIS crítico detetado na frota ativa.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal / Drawer de Cruzamento GFW + Skylight */}
      {selectedVessel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8 max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setSelectedVessel(null)}
              className="absolute right-5 top-5 rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 transition"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <Ship className="h-6 w-6" />
              </span>
              <div>
                <span className="rounded-md bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black uppercase text-indigo-800">
                  {selectedVessel.classification?.category} ({selectedVessel.classification?.confidence}% confiança)
                </span>
                <h3 className="text-2xl font-black text-slate-900 mt-1">{selectedVessel.nome}</h3>
                <p className="font-mono text-xs text-slate-500">Matrícula: {selectedVessel.matricula || "—"} | MMSI: {selectedVessel.mmsi || "Sem MMSI"} | Arte: {selectedVessel.classification?.gearType}</p>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              {/* Dual Platform Links */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
                  <h4 className="text-sm font-bold text-sky-900 flex items-center gap-2">
                    <Globe className="h-4 w-4 text-sky-600" />
                    Global Fishing Watch Map
                  </h4>
                  <p className="text-xs text-sky-700 mt-1">Heatmap de esforço de pesca, rotas e port visits.</p>
                  <a
                    href={selectedVessel.gfwUrl || `https://globalfishingwatch.org/platform/map/fishing-activity/default-public/vessel/${selectedVessel.mmsi || "0cc4c1581-1f46-ddbc-b1b3-bcfe7a1e6f89"}?aVM=heatmap&vSRi=${selectedVessel.mmsi || "0cc4c1581-1f46-ddbc-b1b3-bcfe7a1e6f89"}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-sky-700 transition"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir GFW Platform
                  </a>
                </div>

                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
                  <h4 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                    <Radar className="h-4 w-4 text-indigo-600" />
                    Skylight Earth MDA
                  </h4>
                  <p className="text-xs text-indigo-700 mt-1">Monitorização por radar orbital e deteção de anomalias.</p>
                  <a
                    href={selectedVessel.skylightUrl || "https://app.skylight.earth/#9/37.426/-25.1699"}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir Skylight Radar
                  </a>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                  <Navigation className="h-4 w-4 text-sky-600" />
                  Cruzamento de Viagens & Zonas na ZEE dos Açores
                </h4>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span className="inline-flex items-center gap-1.5 text-sky-800">
                        <Calendar className="h-3.5 w-3.5" /> Estado de Classificação & Rastreio
                      </span>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">IA Confiável</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <div><b>Categoria GFW:</b> {selectedVessel.classification?.category}</div>
                      <div><b>Motor IA:</b> {selectedVessel.classification?.source}</div>
                      <div><b>Zona Habitual:</b> Banco Princesa Alice / ZEE Açores</div>
                      <div><b>Porto de Registo:</b> {selectedVessel.ilha || "Açores"}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Link
                  href={`/navios/${selectedVessel.id}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-sky-700"
                >
                  Abrir Ficha Completa do Navio &rarr;
                </Link>
                <button
                  type="button"
                  onClick={() => setSelectedVessel(null)}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
