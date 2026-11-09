import { marinhaClasses, type MarinhaNavio } from "@/lib/marinha";

export function normalizeMarinhaIdentity(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/\s+/g, " ");
}

export const marinhaCatalogue = marinhaClasses.flatMap(classe =>
  classe.navios.map(navio => ({ ...navio, tipo: classe.tipo })),
);

export function isLegacyMarinhaAssociation(manual: string | null, navio: MarinhaNavio) {
  const key = normalizeMarinhaIdentity(manual || "");
  return [navio.numero, navio.nome, `${navio.numero} - ${navio.nome}`]
    .some(value => normalizeMarinhaIdentity(value) === key);
}

export type MarinhaRaft = {
  id: number;
  serial: string;
  brand: string;
  model: string;
  capacity: number;
  shipId: number | null;
  shipNameManual: string | null;
  serviceStationId: number | null;
  dataFabrico: string | null;
  dataProxInspecao: string | null;
  linkedShipName?: string | null;
  requiresStationTransfer?: boolean;
};

export function isMarinhaAssociation(raft: Pick<MarinhaRaft, "shipId" | "shipNameManual">, navio: MarinhaNavio, shipId: number | null) {
  return raft.shipId !== null
    ? raft.shipId === shipId
    : isLegacyMarinhaAssociation(raft.shipNameManual, navio);
}
