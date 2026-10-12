"use client";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline } from "react-leaflet";
import { parseCoordinate } from "@/lib/coordinates";

type ShipMapPosition = {
  lat?: number | string | null;
  lng?: number | string | null;
  speed?: number | string | null;
  course?: number | string | null;
  navStatus?: string | null;
  updatedAt?: string | null;
  source?: string;
  live?: boolean;
  error?: string | null;
};

type ShipMapTrackPoint = {
  lat?: number | string | null;
  lng?: number | string | null;
  time?: string | null;
};

type ShipMapTrack = {
  points?: ShipMapTrackPoint[];
  from?: string | null;
  to?: string | null;
};

type ShipMapNavio = {
  nome?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
};

export default function ShipMap({
  navio,
  position,
  track,
}: {
  navio: ShipMapNavio;
  position?: ShipMapPosition | null;
  track?: ShipMapTrack | null;
}) {
  const staticLat = parseCoordinate(navio?.lat, "lat");
  const staticLng = parseCoordinate(navio?.lng, "lng");

  const liveLat = parseCoordinate(position?.lat, "lat");
  const liveLng = parseCoordinate(position?.lng, "lng");

  const hasLive = Number.isFinite(liveLat) && Number.isFinite(liveLng) && liveLat !== null && liveLng !== null;
  const hasStatic = Number.isFinite(staticLat) && Number.isFinite(staticLng) && staticLat !== null && staticLng !== null;

  const trackArr: [number, number][] = (track?.points || [])
    .map((point) => {
      const lat = parseCoordinate(point?.lat, "lat");
      const lng = parseCoordinate(point?.lng, "lng");
      if (lat === null || lng === null) return null;
      return [lat, lng] as [number, number];
    })
    .filter((point): point is [number, number] => point !== null);

  const hasTrack = trackArr.length >= 2;
  const lastTrackPoint = hasTrack ? trackArr[trackArr.length - 1] : null;

  const hasPosition = hasLive || hasStatic || hasTrack;

  const positionArr: [number, number] = hasLive
    ? [liveLat as number, liveLng as number]
    : hasStatic
      ? [staticLat as number, staticLng as number]
      : lastTrackPoint
        ? lastTrackPoint
        : [0, 0];

  const speed = Number(position?.speed);
  const hasSpeed = Number.isFinite(speed) && speed >= 0;
  const course = Number(position?.course);
  const hasCourse = Number.isFinite(course);

  return (
    <MapContainer center={positionArr} zoom={hasPosition ? 8 : 2} style={{ height: "300px", width: "100%" }} scrollWheelZoom={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {hasPosition ? (
        <CircleMarker center={positionArr} radius={hasLive ? 10 : 8} pathOptions={{ color: hasLive ? "#16a34a" : "#2563eb", fillColor: hasLive ? "#22c55e" : "#3b82f6", fillOpacity: 0.5, weight: 2 }}>
          <Popup>
            <div className="text-sm space-y-1">
              <div className="font-bold">{navio?.nome || "Navio"}</div>
              {hasLive ? (
                <>
                  <div><span className="font-semibold">Posição AIS ao vivo</span> ({position?.source})</div>
                  {hasSpeed ? <div>Velocidade: {speed.toFixed(1)} kn</div> : null}
                  {hasCourse ? <div>Rumo: {course.toFixed(1)}°</div> : null}
                  {position?.navStatus ? <div>Estado: {position.navStatus}</div> : null}
                  {position?.updatedAt ? <div>Atualizado: {position.updatedAt}</div> : null}
                </>
              ) : (
                <div>Posição guardada</div>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ) : null}
      {hasTrack ? (
        <Polyline positions={trackArr} pathOptions={{ color: "#2563eb", weight: 3, opacity: 0.7 }}>
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">Traçado AIS</div>
              <div>{trackArr.length} posições registadas</div>
            </div>
          </Popup>
        </Polyline>
      ) : null}
      {!hasLive && hasStatic ? (
        <Marker position={positionArr}>
          <Popup>{navio?.nome || "Navio"}</Popup>
        </Marker>
      ) : null}
      {!hasPosition ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg bg-white/90 px-4 py-3 text-center text-sm text-slate-700 shadow">
            Sem coordenadas AIS ou posição guardada
          </div>
        </div>
      ) : null}
    </MapContainer>
  );
}
