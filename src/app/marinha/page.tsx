"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Anchor,
  Compass,
  ExternalLink,
  Info,
  MapPin,
  Plane,
  Radio,
  Search,
  Shield,
  Ship,
  Waves,
} from "lucide-react";
import {
  MARINHA_FONTE,
  MARINHA_LEGISLACAO,
  MARINHA_TOTAL_NAVIOS,
  marinhaClasses,
  marinhaContagemPorTipo,
  marinhaMeiosAereos,
  marinhaNavioSlug,
  marinhaPesquisar,
  marinhaZonas,
  type MarinhaClasse,
  type MarinhaTipo,
} from "@/lib/marinha";

type Tab = "frota" | "zonas";

const TIPO_BADGE: Record<MarinhaTipo, string> = {
  Fragata: "bg-sky-100 text-sky-700 ring-sky-200",
  Submarino: "bg-indigo-100 text-indigo-700 ring-indigo-200",
  Corveta: "bg-teal-100 text-teal-700 ring-teal-200",
  "Navio-patrulha oceânico": "bg-cyan-100 text-cyan-700 ring-cyan-200",
  "Navio-patrulha": "bg-emerald-100 text-emerald-700 ring-emerald-200",
  "Lancha rápida": "bg-amber-100 text-amber-700 ring-amber-200",
  "Navio hidrográfico": "bg-violet-100 text-violet-700 ring-violet-200",
  "Navio-escola": "bg-rose-100 text-rose-700 ring-rose-200",
  "Navio de apoio logístico": "bg-orange-100 text-orange-700 ring-orange-200",
  "Unidade auxiliar": "bg-slate-100 text-slate-700 ring-slate-200",
  "Embarcação salva-vidas": "bg-red-100 text-red-700 ring-red-200",
};

function ClassCard({ classe }: { classe: MarinhaClasse }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Ship className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-black text-slate-900">{classe.nome}</h3>
              <p className="text-xs font-semibold text-slate-500">
                {classe.navios.length} {classe.navios.length === 1 ? "unidade" : "unidades"}
              </p>
            </div>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide ring-1 ${TIPO_BADGE[classe.tipo]}`}
          >
            {classe.tipo}
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{classe.resumo}</p>
      </header>

      <div className="grid gap-5 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <h4 className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
            Especificações
          </h4>
          <dl className="grid gap-2 sm:grid-cols-2">
            {classe.especificacoes.map(especificacao => (
              <div key={especificacao.label} className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {especificacao.label}
                </dt>
                <dd className="text-xs font-semibold text-slate-700">{especificacao.valor}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h4 className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
            Unidades
          </h4>
          <ul className="space-y-2">
            {classe.navios.map(navio => (
              <li key={navio.numero}>
                <Link
                  href={`/marinha/${marinhaNavioSlug(navio)}`}
                  className="flex items-start gap-3 rounded-lg border border-slate-100 px-3 py-2 transition hover:border-sky-200 hover:bg-sky-50/50"
                >
                  <span className="mt-0.5 rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-black tracking-wide text-white">
                    {navio.numero}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800">{navio.nome}</p>
                    <p className="text-[11px] text-slate-500">
                      {navio.ano ? `Ao serviço desde ${navio.ano}` : navio.base || "Em serviço"}
                    </p>
                    {navio.nota ? <p className="mt-1 text-[11px] text-slate-500">{navio.nota}</p> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}

export default function MarinhaPage() {
  const [tab, setTab] = useState<Tab>("frota");
  const [query, setQuery] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<MarinhaTipo | "todos">("todos");

  const contagens = useMemo(() => marinhaContagemPorTipo(), []);
  const classesFiltradas = useMemo(() => {
    const porPesquisa = marinhaPesquisar(query);
    if (tipoFiltro === "todos") return porPesquisa;
    return porPesquisa.filter(classe => classe.tipo === tipoFiltro);
  }, [query, tipoFiltro]);

  const totalUnidadesFiltradas = useMemo(
    () => classesFiltradas.reduce((total, classe) => total + classe.navios.length, 0),
    [classesFiltradas],
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-sky-900 text-white shadow-xl">
        <div className="flex flex-col gap-6 px-6 py-7 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                <Anchor className="h-6 w-6" />
              </span>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-sky-200">
                  Marinha Portuguesa
                </p>
                <h1 className="text-2xl font-black leading-tight sm:text-3xl">
                  Frota e Zonas Marítimas
                </h1>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-200">
              Inventário de referência dos meios navais e aéreos da Armada e da organização
              territorial do Comando Naval, incluindo os comandos de zona marítima do continente,
              Açores e Madeira.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
              <p className="text-2xl font-black">{MARINHA_TOTAL_NAVIOS}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-200">Navios</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
              <p className="text-2xl font-black">{marinhaClasses.length}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-200">Classes</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
              <p className="text-2xl font-black">{marinhaZonas.length}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-sky-200">Comandos</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("frota")}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${
            tab === "frota"
              ? "bg-slate-900 text-white shadow"
              : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          }`}
        >
          <Ship className="h-4 w-4" />
          Frota
        </button>
        <button
          type="button"
          onClick={() => setTab("zonas")}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${
            tab === "zonas"
              ? "bg-slate-900 text-white shadow"
              : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          }`}
        >
          <Shield className="h-4 w-4" />
          Zonas Marítimas
        </button>
      </div>

      {tab === "frota" ? (
        <>
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Pesquisar navio, número de amura ou classe"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100"
              />
            </div>
            <p className="text-xs font-semibold text-slate-500">
              {totalUnidadesFiltradas} de {MARINHA_TOTAL_NAVIOS} unidades
            </p>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setTipoFiltro("todos")}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                tipoFiltro === "todos"
                  ? "bg-sky-600 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              Todos ({MARINHA_TOTAL_NAVIOS})
            </button>
            {contagens.map(item => (
              <button
                key={item.tipo}
                type="button"
                onClick={() => setTipoFiltro(item.tipo)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  tipoFiltro === item.tipo
                    ? "bg-sky-600 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {item.tipo} ({item.total})
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-4">
            {classesFiltradas.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                <Search className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-bold text-slate-700">Sem resultados</p>
                <p className="text-xs text-slate-500">
                  Ajuste a pesquisa ou selecione outro tipo de navio.
                </p>
              </div>
            ) : (
              classesFiltradas.map(classe => <ClassCard key={classe.id} classe={classe} />)
            )}
          </div>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Plane className="h-4 w-4 text-sky-600" />
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-800">
                Meios aéreos
              </h2>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {marinhaMeiosAereos.map(meio => (
                <div key={meio.id} className="rounded-xl bg-slate-50 px-4 py-3">
                  <p className="text-sm font-bold text-slate-800">
                    {meio.quantidade} × {meio.modelo}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {meio.esquadrilha} · {meio.base}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">{meio.funcao}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                <Compass className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-black text-slate-800">Organização territorial</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  O Comando Naval (CN) exerce o comando operacional das forças navais e coordena a
                  busca e salvamento marítimo. Dependem dele os comandos de zona marítima do
                  continente, dos Açores e da Madeira.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {marinhaZonas.map(zona => (
              <article
                key={zona.sigla}
                className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-[11px] font-black text-white">
                      {zona.sigla}
                    </span>
                    <h3 className="text-sm font-black leading-tight text-slate-900">{zona.nome}</h3>
                  </div>
                  <Waves className="h-4 w-4 shrink-0 text-slate-300" />
                </div>

                <div className="mt-4 space-y-2 text-xs text-slate-600">
                  <p className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-semibold text-slate-800">Sede:</span>
                    {zona.sede ?? "A confirmar"}
                  </p>
                  <p className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-semibold text-slate-800">Dependência:</span>
                    {zona.dependencia}
                  </p>
                  <p className="flex items-start gap-2">
                    <Compass className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span>
                      <span className="font-semibold text-slate-800">Jurisdição:</span>{" "}
                      {zona.jurisdicao}
                    </span>
                  </p>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                    Unidades e órgãos dependentes
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {zona.unidades.map(unidade => (
                      <li key={unidade} className="flex items-start gap-2 text-xs text-slate-600">
                        <Radio className="mt-0.5 h-3 w-3 shrink-0 text-sky-500" />
                        {unidade}
                      </li>
                    ))}
                  </ul>
                </div>

                {zona.sigla === "CZMA" && (
                  <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/60 p-3.5">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-sky-900 mb-2">
                      Estações Salva-Vidas e Embarcações Afetas (Açores)
                    </p>
                    <div className="grid gap-2 text-xs">
                      <Link href="/marinha/esv-pdl" className="flex items-center justify-between rounded-lg bg-white p-2.5 border border-sky-100 hover:border-sky-300 transition shadow-xs">
                        <div>
                          <p className="font-bold text-slate-900">Estação Principal de Ponta Delgada</p>
                          <p className="text-sky-700 font-semibold mt-0.5">Embarcação: Nossa Senhora da Boa Viagem</p>
                        </div>
                        <span className="rounded-md bg-sky-600 px-2 py-1 text-[10px] font-black text-white">ESV-PDL</span>
                      </Link>
                      <Link href="/marinha/esv-hor" className="flex items-center justify-between rounded-lg bg-white p-2.5 border border-sky-100 hover:border-sky-300 transition shadow-xs">
                        <div>
                          <p className="font-bold text-slate-900">Estação Principal da Horta</p>
                          <p className="text-sky-700 font-semibold mt-0.5">Embarcação: Nossa Senhora da Conceição</p>
                        </div>
                        <span className="rounded-md bg-indigo-600 px-2 py-1 text-[10px] font-black text-white">ESV-HOR</span>
                      </Link>
                      <Link href="/marinha/esv-pdv" className="flex items-center justify-between rounded-lg bg-white p-2.5 border border-sky-100 hover:border-sky-300 transition shadow-xs">
                        <div>
                          <p className="font-bold text-slate-900">Estação Principal da Praia da Vitória / Angra</p>
                          <p className="text-sky-700 font-semibold mt-0.5">Embarcação: Mestre Gringilha</p>
                        </div>
                        <span className="rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-black text-white">ESV-PDV</span>
                      </Link>
                    </div>
                  </div>
                )}

                {zona.nota ? (
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {zona.nota}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </>
      )}

      <footer className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-[11px] leading-relaxed text-slate-500">
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            Dados institucionais de referência. Meios navais e aéreos segundo o portal da Marinha;
            organização dos comandos de zona marítima segundo o {MARINHA_LEGISLACAO}. A composição
            da frota e as sedes dos comandos podem ser atualizadas, pelo que se recomenda confirmar
            a informação mais recente na fonte oficial.
          </span>
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <a
            href={MARINHA_FONTE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-bold text-sky-700 hover:text-sky-800"
          >
            marinha.pt · Os meios
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </footer>
    </div>
  );
}
