"use client";

import { MapContainer, TileLayer, CircleMarker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { VesselHistory } from "./history";

export default function HistoryMap({ history, name }: { history: VesselHistory | null; name: string }) {
  const points = history?.points || [];
  const positions: [number, number][] = points.map((point) => [point.lat, point.lng]);
  return (
    <MapContainer center={positions[0] || [38, -28]} zoom={6} bounds={positions.length ? positions : undefined}
      boundsOptions={{ padding: [24, 24], maxZoom: 12 }} scrollWheelZoom={false}
      style={{ height: "clamp(320px, 60vh, 640px)", width: "100%" }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
      {points.map((point, index) => (
        <CircleMarker key={`${point.time}:${point.lat}:${point.lng}`} center={[point.lat, point.lng]} radius={index === points.length - 1 ? 8 : 4} pathOptions={{ color: "#0369a1", fillOpacity: 0.7 }}>
          <Popup><strong>{name}</strong><br />MMSI: {history?.mmsi}<br />IMO: {history?.imo || "em falta"}<br />Observacao AIS: {point.time}<br />{point.lat}, {point.lng}<br />Fonte: {history?.source}<br />Nao comprova pesca.</Popup>
        </CircleMarker>
      ))}
      {positions.length > 1 && <Polyline positions={positions} pathOptions={{ color: "#0369a1", weight: 2, dashArray: "6 6" }} />}
    </MapContainer>
  );
}
