"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Ship, MapPin, Calendar, CheckCircle2, AlertTriangle, Loader2, Route } from "lucide-react";
import {
  CONTENTORES_SCHEDULE_SHIPS,
  TRANSINSULAR_SHIPS,
  expectedPort,
  isVoyageCode,
  isPort,
  portCoords,
  CONTENTORES_SCHEDULE,
} from "@/lib/contentores-schedule";

type Escala = {
  id: number;
  navioNome: string;
  armador: string | null;
  cais: string | null;
  dataChegada: string | null;
  dataPartida: string | null;
  origemDestino: string | null;
  estado: string;
};

const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then((m) => m.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });

export default function MapaContentoresPage() {
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("2026-10-16");
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

  const allShips = useMemo(() => [...CONTENTORES_SCHEDULE_SHIPS, ...TRANSINSULAR_SHIPS], []);

  const rows = useMemo(() => {
    return allShips.map((ship) => {
      const exp = expectedPort(ship, date);
      const navEscalas = escalas.filter((e) => e.navioNome === ship);
      const onDate = navEscalas.find((e) => {
        if (!e.dataChegada) return false;
        const c = new Date(e.dataChegada).toISOString().slice(0, 10);
        const p = e.dataPartida ? new Date(e.dataPartida).toISOString().slice(0, 10) : c;
        return c <= date && date <= p;
      });
      const registeredPort = onDate ? (onDate.cais || onDate.origemDestino || "") : "";
      let compliance: "ok" | "fail" | "travel" | "unknown" = "unknown";
      if (!exp) compliance = "unknown";
      else if (isVoyageCode(exp)) compliance = "travel";
      else if (onDate) compliance = "ok";
      else compliance = "fail";
      return { ship, expected: exp, onDate, registeredPort, compliance, coords: portCoords(exp) };
    });
  }, [date, escalas]);

  const portsInUse = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (isPort(r.expected) && r.expected) set.add(r.expected); });
    return Array.from(set);
  }, [rows]);

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
              <p className="text-sm text-slate-500 mt-0.5">Localização prevista dos navios e cumprimento do calendário de Outubro de 2026 (GS Lines / Mutualista Acoreana). Transinsular: itinerário em PDF (scan) não disponível para extracção automática.</p>
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
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
            <h2 className="font-extrabold text-slate-800">Cumprimento da escala (Outubro 2026)</h2>
            <p className="text-xs text-slate-500 mt-0.5">Comparação entre o porto previsto pelo calendário e as escalas registadas no Porto de Ponta Delgada.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Navio</th>
                  <th className="px-4 py-3 text-left">Porto previsto</th>
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
function MapaDynamic(props: { date: string; rows: any[]; portsInUse: string[]; selectedShip: string | null }) {
  const [mod, setMod] = useState<any>(null);
  useEffect(() => {
    (async () => {
      const rl = await import("react-leaflet");
      const L = await import("leaflet");
      // @ts-ignore
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

  // ports to show
  const ports = ["Ponta Delgada", "Leixões", "Lisboa", "Praia da Vitória", "Angra do Heroísmo", "Horta", "Pico", "Velas", "Graciosa", "Flores", "Vila do Porto"];

  return (
    <MapContainerC center={[38.5, -25.5]} zoom={6} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
      <TileLayerC url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
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
        .filter((r) => r.coords)
        .map((r) => {
          const color = r.compliance === "ok" ? "#10b981" : r.compliance === "fail" ? "#f43f5e" : "#6366f1";
          const icon = L.divIcon({
            className: "",
            html: `<div style="background:${color};width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,.4)"></div>`,
            iconSize: [16, 16],
          });
          return (
            <MarkerC key={"ship-" + r.ship} position={[r.coords.lat, r.coords.lng]} icon={icon}>
              <PopupC>
                <strong>{r.ship}</strong>
                <br />Previsto: {r.expected || "—"}
                <br />Estado: {r.compliance}
              </PopupC>
            </MarkerC>
          );
        })}
    </MapContainerC>
  );
}
