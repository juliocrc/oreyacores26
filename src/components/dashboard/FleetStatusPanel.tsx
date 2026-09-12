"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Anchor,
  CalendarClock,
  Loader2,
  Ship,
  TriangleAlert,
} from "lucide-react";
import { parseFlexibleDateValue, formatDateDisplay } from "@/lib/date-display";
import { daysUntil } from "@/lib/home-page-helpers";

type NavioSimplificado = {
  id: number;
  nome: string;
  matricula?: string;
  ilha?: string;
};

type ArtigoListado = {
  id: number;
  name: string;
  quantidade?: number | string | null;
  validade?: string | null;
  referencia?: string | null;
};

type JangadaListada = {
  id: number;
  brand: string;
  model: string;
  serial: string;
  shipId?: number | null;
  dataProxInspecao?: string;
  navio?: { nome: string; cliente?: { nome: string } };
  artigos?: ArtigoListado[];
};

type Contagem = { caducados: number; aExpirar60: number; semValidade: number };

type NavioRow = {
  key: string;
  navio?: NavioSimplificado;
  nome: string;
  matricula?: string;
  ilha?: string;
  href: string;
  jangadas: JangadaListada[];
  contagem: Contagem;
  proximas30: number;
};

function contarArtigos(artigos?: ArtigoListado[]): Contagem {
  const c: Contagem = { caducados: 0, aExpirar60: 0, semValidade: 0 };
  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const limite60 = new Date(inicioHoje);
  limite60.setDate(limite60.getDate() + 60);

  for (const a of artigos || []) {
    const d = parseFlexibleDateValue(a.validade);
    if (!d) {
      c.semValidade += 1;
    } else if (d.getTime() < inicioHoje.getTime()) {
      c.caducados += 1;
    } else if (d.getTime() <= limite60.getTime()) {
      c.aExpirar60 += 1;
    }
  }
  return c;
}

function statusNavio(c: Contagem): "red" | "amber" | "green" {
  if (c.caducados > 0) return "red";
  if (c.aExpirar60 > 0 || c.semValidade > 0) return "amber";
  return "green";
}

const statusStyles = {
  red: { dot: "bg-red-500", ring: "bg-red-50 border-red-200", text: "text-red-700" },
  amber: { dot: "bg-amber-500", ring: "bg-amber-50 border-amber-200", text: "text-amber-700" },
  green: { dot: "bg-emerald-500", ring: "bg-emerald-50 border-emerald-200", text: "text-emerald-700" },
};

export default function FleetStatusPanel() {
  const [navios, setNavios] = useState<NavioSimplificado[]>([]);
  const [jangadas, setJangadas] = useState<JangadaListada[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([fetch("/api/navios"), fetch("/api/jangadas?scope=all")])
      .then(async ([naviosRes, jangadasRes]) => {
        if (!alive) return;
        const naviosData = naviosRes.ok ? await naviosRes.json() : [];
        const jangadasData = jangadasRes.ok ? await jangadasRes.json() : [];
        setNavios(Array.isArray(naviosData) ? naviosData : []);
        setJangadas(Array.isArray(jangadasData) ? jangadasData : []);
      })
      .catch(() => {
        if (alive) setErro(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo<NavioRow[]>(() => {
    const navioPorId = new Map<number, NavioSimplificado>();
    for (const n of navios) navioPorId.set(Number(n.id), n);

    const mapa = new Map<string, NavioRow>();
    const ensure = (key: string) => {
      if (!mapa.has(key)) {
        mapa.set(key, {
          key,
          jangadas: [],
          contagem: { caducados: 0, aExpirar60: 0, semValidade: 0 },
          proximas30: 0,
          nome: "",
          href: "/jangadas",
        });
      }
      return mapa.get(key)!;
    };

    for (const j of jangadas) {
      const shipId = j.shipId ?? null;
      const row = shipId ? ensure(String(shipId)) : ensure("sem-navio");
      row.jangadas.push(j);
      const c = contarArtigos(j.artigos);
      row.contagem.caducados += c.caducados;
      row.contagem.aExpirar60 += c.aExpirar60;
      row.contagem.semValidade += c.semValidade;
      const d = daysUntil(j.dataProxInspecao);
      if (typeof d === "number" && d >= 0 && d <= 30) row.proximas30 += 1;

      if (shipId != null) {
        const navio = navioPorId.get(Number(shipId));
        row.navio = navio;
        row.nome = navio?.nome || j.navio?.nome || `Navio #${shipId}`;
        row.matricula = navio?.matricula;
        row.ilha = navio?.ilha;
        row.href = `/navios/${shipId}`;
      } else {
        row.nome = "Sem navio atribuído";
      }
    }

    return Array.from(mapa.values()).sort((a, b) => {
      if (a.key === "sem-navio") return 1;
      if (b.key === "sem-navio") return -1;
      return a.nome.localeCompare(b.nome, "pt");
    });
  }, [navios, jangadas]);

  const totais = useMemo(() => {
    const t = { navios: 0, jangadas: 0, caducados: 0, aExpirar60: 0 };
    for (const r of rows) {
      t.navios += 1;
      t.jangadas += r.jangadas.length;
      t.caducados += r.contagem.caducados;
      t.aExpirar60 += r.contagem.aExpirar60;
    }
    return t;
  }, [rows]);

  const chips = [
    { label: "Navios", value: totais.navios, className: "bg-sky-50 border-sky-200 text-sky-700" },
    { label: "Jangadas", value: totais.jangadas, className: "bg-indigo-50 border-indigo-200 text-indigo-700" },
    { label: "Artigos ≤60d", value: totais.aExpirar60, className: "bg-amber-50 border-amber-200 text-amber-700" },
    { label: "Artigos caducados", value: totais.caducados, className: "bg-red-50 border-red-200 text-red-700" },
  ];

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-md">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <span className="p-2 rounded-xl bg-sky-100 border border-sky-200 text-sky-700">
              <Ship className="h-5 w-5" />
            </span>
            Estado da frota
          </h3>
          <p className="text-sm text-slate-500">Validade dos artigos por navio, navio a navio.</p>
        </div>
        {loading && <Loader2 className="h-5 w-5 text-indigo-600 animate-spin" />}
        {!loading && !erro && (
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <span key={c.label} className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${c.className}`}>
                {c.value} {c.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-32 flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 animate-pulse">
          <p className="text-sm text-slate-500 font-semibold">A carregar estado da frota...</p>
        </div>
      ) : erro ? (
        <div className="h-32 flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
          <p className="text-sm text-slate-500 font-semibold">Não foi possível carregar os dados.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4">
          <TriangleAlert className="h-6 w-6 text-emerald-500 shrink-0" />
          <p className="text-sm font-extrabold text-emerald-800">Sem navios ou jangadas registadas.</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100">
          {rows.map((row) => {
            const st = statusNavio(row.contagem);
            const style = statusStyles[st];
            return (
              <div key={row.key} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Link
                    href={row.href}
                    className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${style.ring} hover:opacity-90`}
                  >
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      {st !== "green" && (
                        <span className={`absolute inline-flex h-full w-full rounded-full ${style.dot} opacity-60 animate-ping`} />
                      )}
                      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${style.dot}`} />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-extrabold text-slate-900">{row.nome}</span>
                      <span className="truncate text-[11px] font-medium text-slate-500">
                        {[row.matricula, row.ilha, row.jangadas.length === 1 ? "1 jangada" : `${row.jangadas.length} jangadas`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </Link>

                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                    {row.contagem.caducados > 0 && (
                      <span className="rounded-lg bg-red-50 border border-red-200 px-2 py-1 text-red-700">Caducados: {row.contagem.caducados}</span>
                    )}
                    {row.contagem.aExpirar60 > 0 && (
                      <span className="rounded-lg bg-amber-50 border border-amber-200 px-2 py-1 text-amber-700">≤60d: {row.contagem.aExpirar60}</span>
                    )}
                    {row.contagem.semValidade > 0 && (
                      <span className="rounded-lg bg-slate-100 border border-slate-200 px-2 py-1 text-slate-600">S/ validade: {row.contagem.semValidade}</span>
                    )}
                    {row.proximas30 > 0 && (
                      <span className="flex items-center gap-1 rounded-lg bg-orange-50 border border-orange-200 px-2 py-1 text-orange-700">
                        <CalendarClock className="h-3 w-3" /> Inspeção ≤30d: {row.proximas30}
                      </span>
                    )}
                    {statusNavio(row.contagem) === "green" && (
                      <span className="rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-emerald-700">Conforme</span>
                    )}
                  </div>
                </div>

                {row.contagem.caducados > 0 && (
                  <div className="mt-2 ml-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {row.jangadas.flatMap((j) =>
                      (j.artigos || [])
                        .map((a) => ({ a, j }))
                        .filter(({ a }) => {
                          const d = parseFlexibleDateValue(a.validade);
                          return d && d.getTime() < Date.now();
                        })
                        .slice(0, 3)
                    ).map(({ a, j }, i) => (
                      <Link key={`${j.id}-${a.id}-${i}`} href={`/jangadas`} className="rounded-lg border border-red-100 bg-red-50/60 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50">
                        <span className="flex items-center gap-1">
                          <Anchor className="h-3 w-3 shrink-0" />
                          <span className="truncate">{j.serial} · {a.name}</span>
                        </span>
                        <span className="block text-[10px] font-medium text-red-600">Validade: {formatDateDisplay(a.validade)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}