export type FatoImersao = {
  id: number;
  shipId?: number | null;
  serial?: string | null;
  marca?: string | null;
  modelo?: string | null;
  designNo?: string | null;
  tamanho?: string | null;
  tipo?: string | null;
  material?: string | null;
  estado?: string | null;
  dataFabrico?: string | null;
  dataInspecao?: string | null;
  dataProxInspecao?: string | null;
  intervaloServicoMeses?: number | null;
  observacoes?: string | null;
  luzRef?: string | null;
  luzLote?: string | null;
  luzValidade?: string | null;
  apitoRef?: string | null;
  apitoLote?: string | null;
  apitoValidade?: string | null;
  fechoTipo?: string | null;
  fechoEstado?: string | null;
  botasEstado?: string | null;
  luvasEstado?: string | null;
  capuzEstado?: string | null;
  wristSealsEstado?: string | null;
  buddyLineEstado?: string | null;
  liftingStropEstado?: string | null;
  buoyancyEstado?: string | null;
  testeImpermeabilidade?: string | null;
  testeFlutuabilidade?: string | null;
  testeFecho?: string | null;
  leakMetodo?: string | null;
  leakPressaoKpa?: string | null;
  leakResultado?: string | null;
  codigoBER?: string | null;
  certificado?: {
    numeroCertificado?: string | null;
    resultado?: string | null;
    dataValidade?: string | null;
  } | null;
};

export type FatoImersaoForm = {
  id?: number;
  shipId: string;
  serial: string;
  marca: string;
  modelo: string;
  tamanho: string;
  tipo: string;
  material: string;
  estado: string;
  dataFabrico: string;
  dataInspecao: string;
  dataProxInspecao: string;
  observacoes: string;
};

export const EMPTY_FATO_IMERSAO_FORM: FatoImersaoForm = {
  shipId: "",
  serial: "",
  marca: "",
  modelo: "",
  tamanho: "",
  tipo: "",
  material: "",
  estado: "Ativo",
  dataFabrico: "",
  dataInspecao: "",
  dataProxInspecao: "",
  observacoes: "",
};

export const FATO_IMERSAO_LIST_COLUMNS_KEY = "fatos-imersao-list-columns-v1";

export type FatoImersaoListColumnKey =
  | "navio"
  | "serial"
  | "marca"
  | "modelo"
  | "tamanho"
  | "tipo"
  | "estado"
  | "dataFabrico"
  | "dataInspecao"
  | "dataProxInspecao"
  | "observacoes";

export const FATO_IMERSAO_LIST_COLUMNS: Array<{ key: FatoImersaoListColumnKey; label: string }> = [
  { key: "navio", label: "Navio" },
  { key: "serial", label: "Nº Série" },
  { key: "marca", label: "Marca" },
  { key: "modelo", label: "Modelo" },
  { key: "tamanho", label: "Tamanho" },
  { key: "tipo", label: "Tipo" },
  { key: "estado", label: "Estado" },
  { key: "dataFabrico", label: "Data Fabrico" },
  { key: "dataInspecao", label: "Data Inspeção" },
  { key: "dataProxInspecao", label: "Próxima Inspeção" },
  { key: "observacoes", label: "Observações" },
];

export function buildDefaultFatoImersaoColumns(): Record<FatoImersaoListColumnKey, boolean> {
  return FATO_IMERSAO_LIST_COLUMNS.reduce((acc, col) => {
    acc[col.key] = true;
    return acc;
  }, {} as Record<FatoImersaoListColumnKey, boolean>);
}

export const FATO_IMERSAO_CHECKLIST_OPTIONS = ["OK", "F", "S", "R"] as const;
