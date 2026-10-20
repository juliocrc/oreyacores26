/**
 * Serviço de Integração AIS (Automated Identification System) para Rastreio de Navios
 */

export type AisVesselPosition = {
  mmsi: string;
  imo?: string;
  name: string;
  lat: number;
  lng: number;
  speedKnots: number;
  heading: number;
  destination?: string;
  lastUpdated: string;
};

export async function fetchMockAisPosition(shipName: string, mmsi?: string | null): Promise<AisVesselPosition | null> {
  if (!shipName) return null;
  // Simulação de telemetria AIS para navios da frota nos Açores
  return {
    mmsi: mmsi || "263100000",
    name: shipName,
    lat: 37.7412 + (Math.random() - 0.5) * 0.05,
    lng: -25.6756 + (Math.random() - 0.5) * 0.05,
    speedKnots: Number((Math.random() * 12).toFixed(1)),
    heading: Math.floor(Math.random() * 360),
    destination: "Ponta Delgada, PT",
    lastUpdated: new Date().toISOString(),
  };
}
