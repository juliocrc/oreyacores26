export type Row = Record<string, string | number | null>;

/** Artigo extraído de um quadro/certificado, pronto a aplicar na ficha. */
export type ExtractedArtigo = {
  name: string;
  validade?: string;
  quantidade?: number;
  referencia?: string;
  codigoFabricante?: string;
};

export type AnalyzeResult = {
  fileName: string;
  fileType: "pdf" | "excel";
  sizeBytes: number;
  /** Avisos (ex.: PDF digitalizado sem texto extraível). */
  warning?: string;
  summary: {
    estimatedRecords?: number;
    sheetCount?: number;
    words?: number;
    lines?: number;
  };
  preview: {
    columns: string[];
    rows: Row[];
    rawTextFull?: string;
    originalSheetHtml?: string;
    sourceSheetName?: string;
    extractedHeader?: HeaderFields;
    extractedArtigos?: ExtractedArtigo[];
    analysis?: {
      documentKind: "generated-certificate" | "generated-quadro" | "external-certificate" | "unknown";
      totalRows: number;
      flaggedRowsCount: number;
      manufacturingDateRows: number;
      nonExpiringRows: number;
      flaggedRows: Array<{
        rowNumber: number;
        item: string | null;
        reasons: string[];
      }>;
      autoRules: string[];
    };
    extractedChecklist?: Record<string, string | number | boolean>;
  };
};

export type BatchAnalyzeItem = {
  fileName: string;
  status: "ok" | "error";
  result?: AnalyzeResult;
  error?: string;
};

export type HeaderFields = {
  certificadoNumero: string;
  shipName: string;
  ownerName: string;
  raftSerial: string;
  brand: string;
  model: string;
  emergencyPackType: string;
  capacity: string;
  dataFabrico: string;
  fabricType: string;
  dataInspecao: string;
  dataProxInspecao: string;
  cylinderSerial: string;
  cylinderCo2: string;
  cylinderN2: string;
  cylinderTara: string;
  cylinderPesoBruto: string;
  cylinderSistema: string;
};

export type InspectionChecklistValues = Record<string, string | number | boolean>;

export type PreviewTab = "certificate" | "checklist";
export type HeaderFieldKey = keyof HeaderFields;

export const HEADER_LOOKUP_TERMS: Record<HeaderFieldKey, string[]> = {
  certificadoNumero: ["certificado", "certificate"],
  shipName: ["navio", "embarcacao", "ship", "vessel"],
  ownerName: ["armador", "proprietario", "owner", "cliente"],
  raftSerial: ["serial", "serie", "raft"],
  brand: ["marca", "brand"],
  model: ["modelo", "model"],
  emergencyPackType: ["pack", "solas", "iso", "orc"],
  capacity: ["lotacao", "capacidade", "capacity"],
  dataFabrico: ["data fabrico", "data de fabrico", "date of manuf", "manufacture date", "manuf"],
  fabricType: ["tipo de tela", "fabric type", "tela", "canvas"],
  dataInspecao: ["data inspecao", "inspecao", "inspection date"],
  dataProxInspecao: ["proxima inspecao", "prox inspecao", "validade", "expiry"],
  cylinderSerial: ["serial cilindro", "cilindro serial", "cylinder serial"],
  cylinderCo2: ["co2"],
  cylinderN2: ["n2"],
  cylinderTara: ["tara"],
  cylinderPesoBruto: ["peso bruto"],
  cylinderSistema: ["sistema insuflacao", "inflation system", "sistema"],
};

export const HEADER_LABEL_HINTS = [
  ...Array.from(new Set(Object.values(HEADER_LOOKUP_TERMS).flat())),
  "serial no",
  "date of manuf",
  "manufacture",
  "identification",
  "cylinders",
  "equipment",
  "verification",
  "service station",
  "type",
  "nome e no estacao",
];

export const REQUIRED_HEADER_FIELDS: HeaderFieldKey[] = [
  "brand",
  "model",
  "raftSerial",
  "capacity",
  "dataInspecao",
  "dataProxInspecao",
  "shipName",
  "ownerName",
  "cylinderSerial",
];

export const REQUIRED_CHECKLIST_FIELD_NAMES = new Set([
  "serial",
  "ship",
  "brand_model",
  "capacity",
  "owner",
  "packType",
  "equip_pack_type",
  "cilindro_co2",
  "cabeca_disparo",
  "comprimento_retenida",
]);

export const EMPTY_HEADER: HeaderFields = {
  certificadoNumero: "",
  shipName: "",
  ownerName: "",
  raftSerial: "",
  brand: "",
  model: "",
  emergencyPackType: "",
  capacity: "",
  dataFabrico: "",
  fabricType: "",
  dataInspecao: "",
  dataProxInspecao: "",
  cylinderSerial: "",
  cylinderCo2: "",
  cylinderN2: "",
  cylinderTara: "",
  cylinderPesoBruto: "",
  cylinderSistema: "",
};
