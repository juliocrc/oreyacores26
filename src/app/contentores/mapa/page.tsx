"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Ship, Calendar, CheckCircle2, AlertTriangle, Loader2, Route } from "lucide-react";
import {
  CONTENTORES_SCHEDULE_SHIPS,
  TRANSINSULAR_SHIPS,
  expectedPort,
  isVoyageCode,
  isPort,
  portCoords,
  CONTENTORES_SCHEDULE,
} from "@/lib/contentores-schedule";
import { formatDateTime } from "@/lib/date-utils";

type Escala = {
  id: number;
  navioNome: string;
  imo: string | null;
  tipoCarga: string | null;
  armador: string | null;
  cais: string | null;
  dataChegada: string | null;
  dataPartida: string | null;
  origemDestino: string | null;
  estado: string;
};

type ArrivalBadge = {
  label: string;
  dot: string;
  bg: string;
  text: string;
  border: string;
};

type MapaRow = {
  ship: string;
  expected: string | null;
  onDate: Escala | null;
  nextArrival: Escala | null;
  arrival: { key: string; badge: ArrivalBadge } | null;
  registeredPort: string;
  compliance: "ok" | "fail" | "travel" | "unknown";
  coords: { lat: number; lng: number } | null;
};

type LeafletModules = {
  rl: typeof import("react-leaflet");
  L: typeof import("leaflet");
};

const ALL_SHIPS = [...CONTENTORES_SCHEDULE_SHIPS, ...TRANSINSULAR_SHIPS];

const DAY_MS = 86_400_000;
const AZORES_TZ = "Atlantic/Azores";

const TILE_PROVIDERS = [
  {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
    subdomains: "abc",
  },
  {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    subdomains: "abcd",
  },
];

const PORT_STYLES: Record<string, string> = {
  "Ponta Delgada": "bg-sky-100 text-sky-800 border-sky-200",
  "Leixões": "bg-indigo-100 text-indigo-800 border-indigo-200",
  "Lisboa": "bg-violet-100 text-violet-800 border-violet-200",
  "Praia da Vitória": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Angra do Heroísmo": "bg-teal-100 text-teal-800 border-teal-200",
  "Horta": "bg-amber-100 text-amber-800 border-amber-200",
  "Pico": "bg-orange-100 text-orange-800 border-orange-200",
  "Velas": "bg-lime-100 text-lime-800 border-lime-200",
  "Graciosa": "bg-cyan-100 text-cyan-800 border-cyan-200",
  "Flores": "bg-rose-100 text-rose-800 border-rose-200",
  "Vila do Porto": "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
};

function portStyle(port: string) {
  return PORT_STYLES[port] || "bg-slate-100 text-slate-700 border-slate-200";
}

const ARRIVAL_BADGES: Record<string, ArrivalBadge> = {
  hoje: { label: "Chega hoje", dot: "bg-rose-600", bg: "bg-rose-50", text: "text-rose-700", border: "#e11d48" },
  amanha: { label: "Chega amanhã", dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700", border: "#f59e0b" },
  "2-3": { label: "Em 2–3 dias", dot: "bg-sky-600", bg: "bg-sky-50", text: "text-sky-700", border: "#0284c7" },
  semana: { label: "Esta semana", dot: "bg-emerald-600", bg: "bg-emerald-50", text: "text-emerald-700", border: "#059669" },
  "mais-tarde": { label: "Mais tarde", dot: "bg-slate-500", bg: "bg-slate-50", text: "text-slate-600", border: "#94a3b8" },
  atracado: { label: "No porto", dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700", border: "#10b981" },
  atrasado: { label: "ETA ultrapassada", dot: "bg-orange-600", bg: "bg-orange-50", text: "text-orange-700", border: "#ea580c" },
};

function normalizeShipName(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function azoresDayKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AZORES_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function arrivalMeta(value: string | null | undefined, estado: string): { key: string; badge: ArrivalBadge } | null {
  if (!value) return null;
  if (estado === "Atracado") return { key: "atracado", badge: ARRIVAL_BADGES.atracado };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const days = Math.round(
    (Date.parse(`${azoresDayKey(date)}T12:00:00Z`) - Date.parse(`${azoresDayKey(new Date())}T12:00:00Z`)) / DAY_MS,
  );
  if (days < 0) return { key: "atrasado", badge: ARRIVAL_BADGES.atrasado };
  if (days === 0) return { key: "hoje", badge: ARRIVAL_BADGES.hoje };
  if (days === 1) return { key: "amanha", badge: ARRIVAL_BADGES.amanha };
  if (days <= 3) return { key: "2-3", badge: ARRIVAL_BADGES["2-3"] };
  if (days <= 7) return { key: "semana", badge: ARRIVAL_BADGES.semana };
  return { key: "mais-tarde", badge: ARRIVAL_BADGES["mais-tarde"] };
}

export default function MapaContentoresPage() {
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedShip, setSelectedShip] = useState<string | null>(null);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const s = params.get("ship");
      if (s) setSelectedShip(s);
    } catch {}
  }, []);

  useEffect(() => {
    fetch("/api/porto-ponta-delgada", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { escalas: [] }))
      .then((d) => setEscalas(d.escalas || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    return ALL_SHIPS.map((ship): MapaRow => {
      const exp = expectedPort(ship, date);
      const navEscalas = escalas.filter((e) => normalizeShipName(e.navioNome) === normalizeShipName(ship));
      const onDate = navEscalas.find((e) => {
        if (!e.dataChegada) return false;
        const c = new Date(e.dataChegada).toISOString().slice(0, 10);
        const p = e.dataPartida ? new Date(e.dataPartida).toISOString().slice(0, 10) : c;
        return c <= date && date <= p;
      });
      const nextArrival = navEscalas
        .filter((e) => e.estado !== "Partido" && e.estado !== "Cancelado" && e.dataChegada)
        .sort((a, b) => new Date(a.dataChegada!).getTime() - new Date(b.dataChegada!).getTime())[0] || null;
      const pdCall = onDate || nextArrival;
      const registeredPort = pdCall ? (pdCall.cais || pdCall.origemDestino || "") : "";
      let compliance: "ok" | "fail" | "travel" | "unknown" = "unknown";
      if (!exp) compliance = "unknown";
      else if (isVoyageCode(exp)) compliance = "travel";
      else if (onDate) compliance = "ok";
      else compliance = "fail";
      return {
        ship,
        expected: exp,
        onDate: onDate ?? null,
        nextArrival,
        arrival: nextArrival ? arrivalMeta(nextArrival.dataChegada, nextArrival.estado) : null,
        registeredPort,
        compliance,
        coords: portCoords(exp),
      };
    });
  }, [date, escalas]);

  const portsInUse = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (isPort(r.expected) && r.expected) set.add(r.expected); });
    return Array.from(set);
  }, [rows]);

  const monthly = useMemo(() => {
    const byShip = new Map<string, { name: string; byPort: Map<string, Set<number>> }>();
    const officialShips = new Set<string>();
    const officialPd = new Map<string, Set<number>>();

    const ensureShip = (ship: string, preferName = false) => {
      const key = normalizeShipName(ship);
      if (!key) return null;
      if (!byShip.has(key)) {
        byShip.set(key, { name: String(ship || "").trim(), byPort: new Map() });
      }
      const entry = byShip.get(key)!;
      if (preferName) entry.name = String(ship || "").trim();
      return entry;
    };
    const addDay = (ship: string, port: string, day: number, preferName = false) => {
      if (!Number.isFinite(day) || day < 1 || day > 31) return;
      const entry = ensureShip(ship, preferName);
      if (!entry) return;
      if (!entry.byPort.has(port)) entry.byPort.set(port, new Set());
      entry.byPort.get(port)!.add(day);
    };
    const addRange = (ship: string, port: string, start: Date, end: Date, official = false) => {
      const startKey = azoresDayKey(start);
      const endKey = azoresDayKey(end.getTime() >= start.getTime() ? end : start);
      const cursor = new Date(`${startKey}T12:00:00Z`);
      const limit = new Date(`${endKey}T12:00:00Z`);
      for (let i = 0; i < 93 && cursor.getTime() <= limit.getTime(); i += 1) {
        const key = cursor.toISOString().slice(0, 10);
        if (key.startsWith(month)) {
          const day = Number(key.slice(8, 10));
          addDay(ship, port, day);
          if (official) {
            const shipKey = normalizeShipName(ship);
            officialShips.add(shipKey);
            if (!officialPd.has(shipKey)) officialPd.set(shipKey, new Set());
            officialPd.get(shipKey)!.add(day);
          }
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    };

    for (const entry of CONTENTORES_SCHEDULE) {
      if (!entry.date.startsWith(month)) continue;
      if (!entry.port || isVoyageCode(entry.port) || !isPort(entry.port)) continue;
      addDay(entry.ship, entry.port, Number(entry.date.slice(8, 10)), true);
    }

    for (const escala of escalas) {
      if (String(escala.tipoCarga || "").toLowerCase() !== "contentores") continue;
      if (escala.estado === "Cancelado" || !escala.dataChegada) continue;
      const arrival = new Date(escala.dataChegada);
      if (Number.isNaN(arrival.getTime())) continue;
      const departure = escala.dataPartida ? new Date(escala.dataPartida) : arrival;
      addRange(escala.navioNome, "Ponta Delgada", arrival, departure, true);
    }

    // Ponta Delgada é substituída pelos dados oficiais quando existem,
    // para não misturar dias do calendário com a escala real.
    for (const [key, days] of officialPd) {
      const entry = byShip.get(key);
      if (entry && days.size) entry.byPort.set("Ponta Delgada", new Set(days));
    }

    const priority = [
      "Ponta Delgada",
      "Leixões",
      "Lisboa",
      "Praia da Vitória",
      "Angra do Heroísmo",
      "Horta",
      "Pico",
      "Velas",
      "Graciosa",
      "Flores",
      "Vila do Porto",
    ];
    const portSet = new Set<string>();
    byShip.forEach((entry) => entry.byPort.forEach((_days, port) => portSet.add(port)));
    const ports = Array.from(portSet).sort((a, b) => {
      const ai = priority.indexOf(a);
      const bi = priority.indexOf(b);
      if (ai !== -1 || bi !== -1) {
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
      return a.localeCompare(b, "pt");
    });

    const shipRows = Array.from(byShip.entries())
      .map(([key, entry]) => ({
        ship: entry.name,
        byPort: entry.byPort,
        official: officialShips.has(key),
      }))
      .sort((a, b) => a.ship.localeCompare(b.ship, "pt"));

    return { ports, shipRows };
  }, [month, escalas]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-slate-50 to-sky-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="rounded-3xl border border-slate-200/60 bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white rounded-2xl p-3 shadow-md shadow-indigo-600/20">
              <Route size={28} />
            </div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-widest text-indigo-600">Orey Acores · Mapa de Contentores</p>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-800">Mapa e Cumprimento de Escalas</h1>
              <p className="text-sm text-slate-500 mt-0.5">Localização prevista dos navios e cumprimento do calendário de Outubro de 2026 (GS Lines / Mutualista Acoreana). Escalas de Ponta Delgada sincronizadas com a fonte oficial Portos dos Açores.</p>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Calendar size={16} /> Data de verificação:
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          {loading && <Loader2 className="animate-spin text-indigo-600" size={18} />}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm" style={{ height: 420 }}>
          <MapaDynamic date={date} rows={rows} portsInUse={portsInUse} selectedShip={selectedShip} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-extrabold text-slate-800">Dias do mês por navio e porto</h2>
              <p className="text-xs text-slate-500 mt-0.5">Ex.: em que dias o navio está em Leixões, em Ponta Delgada ou na Praia da Vitória.</p>
            </div>
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              Mês
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
          {monthly.shipRows.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              Sem itinerário conhecido para este mês.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Navio</th>
                    {monthly.ports.map((port) => (
                      <th key={port} className="px-3 py-3 text-left whitespace-nowrap">{port}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthly.shipRows.map((row) => (
                    <tr key={row.ship} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">
                        {row.ship}
                        {row.official && (
                          <span className="ml-2 rounded-full bg-sky-100 text-sky-700 px-1.5 py-0.5 text-[9px] font-bold uppercase">
                            PD oficial
                          </span>
                        )}
                      </td>
                      {monthly.ports.map((port) => {
                        const days = row.byPort.get(port);
                        const list = days ? Array.from(days).sort((a, b) => a - b) : [];
                        return (
                          <td key={port} className="px-3 py-3">
                            {list.length ? (
                              <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 font-mono text-[11px] font-bold ${portStyle(port)}`}>
                                {list.join(", ")}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-5 py-3 text-[11px] text-slate-400">
            Calendário GS Lines / Mutualista Açoreana (Outubro 2026) + escalas oficiais de Ponta Delgada (Portos dos Açores). Os dias de Ponta Delgada são atualizados de hora a hora.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
            <h2 className="font-extrabold text-slate-800">Cumprimento da escala (Outubro 2026)</h2>
            <p className="text-xs text-slate-500 mt-0.5">Comparação entre o porto previsto pelo calendário e as escalas oficiais do Porto de Ponta Delgada (fonte: Portos dos Açores).</p>
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold text-slate-500">
              {["hoje", "amanha", "2-3", "semana", "mais-tarde", "atracado"].map((key) => (
                <span key={key} className="inline-flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${ARRIVAL_BADGES[key].dot}`} /> {ARRIVAL_BADGES[key].label}
                </span>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Navio</th>
                  <th className="px-4 py-3 text-left">Porto previsto</th>
                  <th className="px-4 py-3 text-left">Chegada a Ponta Delgada</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Escala registada</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ship} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-800 flex items-center gap-2"><Ship size={14} className="text-indigo-500" /> {r.ship}</td>
                    <td className="px-4 py-3 text-slate-700">{r.expected || "—"}</td>
                    <td className="px-4 py-3">
                      {r.arrival && r.nextArrival?.dataChegada ? (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${r.arrival.badge.bg} ${r.arrival.badge.text}`}
                          title={r.nextArrival.origemDestino || undefined}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${r.arrival.badge.dot}`} />
                          {r.arrival.badge.label}
                          <span className="font-mono text-[10px] opacity-70">{formatDateTime(r.nextArrival.dataChegada)}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.compliance === "ok" && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-1 text-xs font-bold"><CheckCircle2 size={13} /> No porto previsto</span>}
                      {r.compliance === "fail" && <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 text-rose-800 px-2.5 py-1 text-xs font-bold"><AlertTriangle size={13} /> Sem registo no porto</span>}
                      {r.compliance === "travel" && <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 text-sky-800 px-2.5 py-1 text-xs font-bold">Em viagem (código de viagem)</span>}
                      {r.compliance === "unknown" && <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-600 px-2.5 py-1 text-xs font-bold">Sem calendário</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.onDate ? `${r.onDate.estado} · ${r.onDate.cais || ""}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

// Dynamic leaflet map, client-only
function MapaDynamic(props: { date: string; rows: MapaRow[]; portsInUse: string[]; selectedShip: string | null }) {
  const [mod, setMod] = useState<LeafletModules | null>(null);
  const [tileProviderIndex, setTileProviderIndex] = useState(0);
  const [tileLoaded, setTileLoaded] = useState(false);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (tileLoaded || tileError || tileProviderIndex !== TILE_PROVIDERS.length - 1) return;
    const timer = setTimeout(() => setTileError(true), 12000);
    return () => clearTimeout(timer);
  }, [tileLoaded, tileError, tileProviderIndex]);

  useEffect(() => {
    (async () => {
      const rl = await import("react-leaflet");
      const L = await import("leaflet");
      // @ts-expect-error leaflet private API
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      setMod({ rl, L });
    })();
  }, []);

  if (!mod) return <div className="flex items-center justify-center h-full text-slate-400"><Loader2 className="animate-spin" size={24} /></div>;

  const { rl, L } = mod;
  const MapContainerC = rl.MapContainer;
  const TileLayerC = rl.TileLayer;
  const MarkerC = rl.Marker;
  const PopupC = rl.Popup;
  const tileProvider = TILE_PROVIDERS[tileProviderIndex];

  const handleTileLoad = () => {
    setTileLoaded(true);
    setTileError(false);
  };

  const handleTileError = () => {
    setTileLoaded(false);
    if (tileProviderIndex < TILE_PROVIDERS.length - 1) {
      setTileProviderIndex(tileProviderIndex + 1);
      return;
    }
    setTileError(true);
  };

  // ports to show
  const ports = ["Ponta Delgada", "Leixões", "Lisboa", "Praia da Vitória", "Angra do Heroísmo", "Horta", "Pico", "Velas", "Graciosa", "Flores", "Vila do Porto"];

  return (
    <div className="relative h-full w-full">
      <MapContainerC center={[38.5, -25.5]} zoom={6} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <TileLayerC
          key={tileProvider.url}
          url={tileProvider.url}
          attribution={tileProvider.attribution}
          subdomains={tileProvider.subdomains}
          eventHandlers={{ tileload: handleTileLoad, tileerror: handleTileError }}
        />
      {ports.map((p) => {
        const c = portCoords(p);
        if (!c) return null;
        return (
          <MarkerC key={"port-" + p} position={[c.lat, c.lng]}>
            <PopupC>
              <strong>{p}</strong>
              <br />Porto
            </PopupC>
          </MarkerC>
        );
      })}
      {props.rows
        .map((r) => {
          const coords = r.coords;
          if (!coords) return null;
          const color = r.compliance === "ok" ? "#10b981" : r.compliance === "fail" ? "#f43f5e" : "#6366f1";
          const icon = L.divIcon({
            className: "",
            html: `<div style="background:${color};width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,.4)"></div>`,
            iconSize: [16, 16],
          });
          return (
            <MarkerC key={"ship-" + r.ship} position={[coords.lat, coords.lng]} icon={icon}>
              <PopupC>
                <strong>{r.ship}</strong>
                <br />Previsto: {r.expected || "—"}
                <br />Estado: {r.compliance}
                {r.arrival && r.nextArrival?.dataChegada && (
                  <>
                    <br />Chegada a PD: {r.arrival.badge.label} ({formatDateTime(r.nextArrival.dataChegada)})
                  </>
                )}
              </PopupC>
            </MarkerC>
          );
        })}
      </MapContainerC>
      {tileError && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-slate-100/90 p-4 text-center">
          <div className="max-w-sm rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-bold text-slate-800">Não foi possível carregar o mapa</p>
            <p className="mt-1 text-xs text-slate-500">Verifica a ligação à internet ou recarrega a página.</p>
          </div>
        </div>
      )}
    </div>
  );
}
