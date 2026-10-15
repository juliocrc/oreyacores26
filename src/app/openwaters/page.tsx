"use client";

import React from "react";
import { Waves, Navigation, Globe, Map, ShieldCheck, ExternalLink, Cpu, Compass, BookOpen } from "lucide-react";

const OPENWATERS_REPOS = [
  {
    name: "OpenWaters Core",
    description: "Plataforma principal open-source de monitorização marítima, gestão de dados oceanográficos e tracking de embarcações.",
    url: "https://github.com/openwatersio/OpenWaters",
    icon: Globe,
    color: "bg-sky-50 text-sky-700 border-sky-200",
  },
  {
    name: "AIScast",
    description: "Transmissor e recetor de dados AIS (Automatic Identification System) em tempo real para streaming de posições de navios.",
    url: "https://github.com/openwatersio/aiscast",
    icon: Navigation,
    color: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  {
    name: "Crowd Depth",
    description: "Mapeamento colaborativo de batimetria e profundidades oceânicas por crowdsourcing de embarcações.",
    url: "https://github.com/openwatersio/crowd-depth",
    icon: Waves,
    color: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    name: "Seamap",
    description: "Cartografia digital marítima, renderização de cartas náuticas interativas e rotas de navegação.",
    url: "https://github.com/openwatersio/seamap",
    icon: Map,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    name: "Maritime Zones",
    description: "Gestão de zonas marítimas jurisdicionais, limites de águas territoriais, EEZ e regulação portuária.",
    url: "https://github.com/openwatersio/maritime-zones",
    icon: ShieldCheck,
    color: "bg-purple-50 text-purple-700 border-purple-200",
  },
  {
    name: "SignalK Tides",
    description: "Integração de dados de marés e correntes compatíveis com o protocolo SignalK para navegação e portos.",
    url: "https://github.com/openwatersio/signalk-tides",
    icon: Compass,
    color: "bg-teal-50 text-teal-700 border-teal-200",
  },
  {
    name: "Coordinate Format",
    description: "Utilitários de conversão e formatação de coordenadas geográficas (lat/long, UTM, MGRS) para sistemas marítimos.",
    url: "https://github.com/openwatersio/coordinate-format",
    icon: Cpu,
    color: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    name: "Seascape",
    description: "Visualização e renderização de ambientes marinhos, dados de superfície e telemetria hidrográfica.",
    url: "https://github.com/openwatersio/seascape",
    icon: Waves,
    color: "bg-cyan-50 text-cyan-700 border-cyan-200",
  },
  {
    name: "Almanac",
    description: "Almanaque náutico digital com efemérides solares, lunares, tabelas astronómicas e dados de navegação.",
    url: "https://github.com/openwatersio/almanac",
    icon: BookOpen,
    color: "bg-rose-50 text-rose-700 border-rose-200",
  },
];

export default function OpenWatersModulePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-slate-50 to-indigo-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="rounded-3xl border border-slate-200/60 bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-sky-600 text-white rounded-2xl p-3 shadow-md shadow-sky-600/20">
              <Waves size={30} />
            </div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-widest text-sky-600">Orey Açores · Ecossistema Marítimo</p>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-800">Módulo OpenWaters</h1>
              <p className="text-sm text-slate-500 mt-1">
                Integração centralizada com as 9 ferramentas open-source do ecossistema OpenWaters para AIS, batimetria, cartas náuticas, marés, coordenadas, seascape e almanaque astronómico.
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {OPENWATERS_REPOS.map((repo) => {
            const Icon = repo.icon;
            return (
              <div key={repo.name} className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm flex flex-col justify-between transition hover:border-sky-300 hover:shadow-md">
                <div className="space-y-4">
                  <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${repo.color}`}>
                    <Icon size={24} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-lg">{repo.name}</h3>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">{repo.description}</p>
                  </div>
                </div>
                <div className="pt-6 border-t border-slate-100 mt-6">
                  <a
                    href={repo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-xs font-bold text-sky-600 hover:text-sky-700 hover:underline"
                  >
                    <span>Repositório GitHub</span>
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        <section className="rounded-3xl border border-sky-100 bg-sky-50/70 p-6 sm:p-8 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-sky-900 font-extrabold text-base">
            <Cpu size={20} className="text-sky-600" />
            <span>Estado da Integração AIS & Oceanografia</span>
          </div>
          <p className="text-xs text-sky-800 leading-relaxed">
            O ecossistema OpenWaters agrega os serviços de streaming AIS (`aiscast`), cartas (`seamap`), batimetria (`crowd-depth`), marés (`signalk-tides`), coordenadas (`coordinate-format`), zonas marítimas (`maritime-zones`), seascape (`seascape`) e almanaque náutico (`almanac`) conectados ao Gestor Naval.
          </p>
        </section>
      </div>
    </div>
  );
}
