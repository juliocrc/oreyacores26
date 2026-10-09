export type Jangada = {
  id: number;
  brand: string;
  model: string;
  launchType?: string;
  serial: string;
  dataFabrico: string;
  capacity: number;
  owner: string;
  packType: string;
  shipNameManual?: string;
  shipId?: number | null;
  dataInspecao?: string;
  dataProxInspecao?: string;
  hruReferencia?: string;
  hruDataInstalacao?: string;
  hruValidade?: string;
  cylinderDataProxTeste?: string;
  cylinderSistema?: string;
  cylinderCabecaDisparoRef?: string;
  cylinderCabecaDisparoSerial?: string;
  cylinderCabecaDisparoDescricao?: string;
  applicableServiceBulletinsCount?: number;
  applicableServiceBulletinTitles?: string[];
  artigos?: Array<{
    id: number;
    name: string;
    quantidade?: number | string | null;
    validade?: string | null;
    referencia?: string | null;
    codigoFabricante?: string | null;
  }>;
  navio?: {
    nome: string;
    cliente?: { id: number; nome: string; ilha?: string | null };
  };
  numeroObra?: string | null;
  serviceStationName?: string | null;
  island?: string | null;
  ilha?: string | null;
  portoRegisto?: string | null;
};

export type PausedInspectionDraftMeta = {
  savedAt: number;
  inspectionWizardStep?: number;
};

export type JangadaCatalogOption = {
  marca: string;
  modelo: string;
  source: "catalogo" | "departamentoTecnico" | "baseDados";
};

export type JangadaListColumnKey =
  | "indice"
  | "marca"
  | "modelo"
  | "tipo"
  | "boletins"
  | "serial"
  | "dataFabrico"
  | "lotacao"
  | "packType"
  | "cliente"
  | "navio"
  | "armador"
  | "ilha"
  | "estacao"
  | "numeroObra"
  | "dataInspecao"
  | "dataProxInspecao"
  | "semaforo";

export const INITIAL_FORM: Jangada = {
  id: 0,
  brand: "",
  model: "",
  launchType: "",
  serial: "",
  dataFabrico: "",
  capacity: 0,
  owner: "",
  packType: "",
  shipId: null,
  dataInspecao: "",
  dataProxInspecao: "",
  cylinderSistema: "",
  cylinderCabecaDisparoRef: "",
  cylinderCabecaDisparoSerial: "",
  cylinderCabecaDisparoDescricao: "",
};

export const FALLBACK_INFLATION_SYSTEM_OPTIONS = [
  "Leafield GIST",
  "LEAFIELD",
  "THANNER",
  "THANNER DK99 / DK96",
  "THANNER Type 5/60",
  "NSS",
  "VTE99",
  "VTE/99-ISO",
  "VTE/87-PED",
  "HSR-OH-III",
  "Leafield / ligação roscada Plastimo",
  "ZODIAC / THANNER",
];

export const FIRING_HEAD_KEYWORDS = ["head", "operating", "cabeca", "cabeça", "disparo", "firing", "gist", "dk99", "dk96", "leafield", "thanner", "nss", "vte", "hsr"];

export const JANGADA_LIST_COLUMNS_KEY = "jangadas-list-columns-v1";

export const JANGADA_LIST_COLUMNS: Array<{ key: JangadaListColumnKey; label: string }> = [
  { key: "indice", label: "#" },
  { key: "marca", label: "Marca" },
  { key: "modelo", label: "Modelo" },
  { key: "tipo", label: "Tipo" },
  { key: "boletins", label: "Boletins" },
  { key: "serial", label: "Nº Série" },
  { key: "dataFabrico", label: "Data Fabrico" },
  { key: "lotacao", label: "Lotação" },
  { key: "packType", label: "Tipo de Pack" },
  { key: "navio", label: "Navio/Embarcação" },
  { key: "armador", label: "Armador" },
  { key: "ilha", label: "Ilha" },
  { key: "estacao", label: "Estação" },
  { key: "numeroObra", label: "Nº Obra" },
  { key: "dataInspecao", label: "Data Inspeção" },
  { key: "dataProxInspecao", label: "Próx. Inspeção" },
  { key: "semaforo", label: "Consumíveis" },
];
