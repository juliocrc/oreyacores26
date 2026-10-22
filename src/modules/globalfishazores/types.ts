export type GfwVesselTrack = {
  id: number;
  nome: string;
  matricula: string;
  ilha: string;
  tipoPesca: string;
  mmsi?: string | null;
  imo?: string | null;
  callSignal?: string | null;
  lat?: number | null;
  lng?: number | null;
  aisUpdatedAt?: string | null;
  comprimentoMetros?: number | null;
  estadoNavio?: string | null;
  proprietario?: string | null;
  gfwRiskScore?: "low" | "medium" | "high";
  fishingHoursEst?: number;
};

export type GfwFilterState = {
  ilha: string;
  tipoPesca: string;
  search: string;
  onlyActiveAis: boolean;
};
