import type { OreyCertificateTemplateInput } from "./orey-certificate-template";
import type { InspectionCertificateInput } from "./inspection-certificate";

export type JangadaForOreyCertificate = {
  brand?: string | null;
  model?: string | null;
  serial?: string | null;
  capacity?: number | string | null;
  dataFabrico?: string | null;
  dataProxInspecao?: string | null;
  packType?: string | null;
  fabricType?: string | null;
  painterLength?: string | null;
  maxStowageHeight?: string | null;
  cylinderSerial?: string | null;
  cylinderCo2?: string | null;
  cylinderN2?: string | null;
  cylinderDataTeste?: string | null;
  hruReferencia?: string | null;
  hruSerial?: string | null;
  hruValidade?: string | null;
  radarReflector?: string | null;
  radarReflectorValidade?: string | null;
  launchType?: string | null;
  owner?: string | null;
  shipNameManual?: string | null;
};

export type NavioForOreyCertificate = {
  nome?: string | null;
  bandeira?: string | null;
  imo?: string | null;
  callSignal?: string | null;
};

/**
 * Constrói o payload do template OREY (`template certificado orey.xltx`) a partir
 * da jangada, do navio e do certificado já derivado (`buildInspectionCertificateInput`).
 * Reproduz o mesmo mapeamento usado pelo cliente em `handleExportCertificadoExcel`.
 */
export function buildOreyCertificateTemplateInput(params: {
  raft: JangadaForOreyCertificate;
  ship?: NavioForOreyCertificate | null;
  inspection: InspectionCertificateInput;
}): OreyCertificateTemplateInput {
  const { raft, ship, inspection } = params;
  const owner = String(inspection.clientName ?? raft.owner ?? "").trim();

  return {
    certNumber: inspection.certNumber ?? "",
    inspectionDate: inspection.inspectionDate ?? "",
    nextInspectionDate: raft.dataProxInspecao ?? "",
    shipName: inspection.shipName ?? raft.shipNameManual ?? ship?.nome ?? "",
    shipFlag: ship?.bandeira ?? "",
    shipImo: ship?.imo ?? "",
    shipCallSign: ship?.callSignal ?? "",
    owner,
    brand: raft.brand ?? "",
    launchType: raft.launchType ?? "",
    raftType: raft.packType ?? "",
    raftModel: raft.model ?? "",
    raftCapacity: raft.capacity ?? "",
    raftSerial: raft.serial ?? "",
    manufactureDate: raft.dataFabrico ?? "",
    fabricType: raft.fabricType ?? "",
    painterLength: raft.painterLength ?? "",
    maxStowageHeight: raft.maxStowageHeight ?? "",
    cylinderSerial: raft.cylinderSerial ?? "",
    cylinderCo2: raft.cylinderCo2 ?? "",
    cylinderN2: raft.cylinderN2 ?? "",
    cylinderHydroTestDate: raft.cylinderDataTeste ?? "",
    packType: raft.packType ?? "",
    hruReference: raft.hruReferencia ?? "",
    hruSerial: raft.hruSerial || raft.hruReferencia || "",
    hruExpiry: raft.hruValidade ?? "",
    radarReflector: raft.radarReflector ?? "",
    radarReflectorExpiry: raft.radarReflectorValidade ?? "",
    technician: inspection.technician ?? "",
    status: inspection.status ?? "",
    checklist: inspection.checklist ?? {},
  };
}
