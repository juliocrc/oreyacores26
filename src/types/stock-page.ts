export type ItemStock = {
  id: number;
  nome: string;
  quantidade: number;
  referencia?: string;
  estadoArtigo?: string;
  referenciaSubstituta?: string;
  aplicavelMarcaJangada?: string;
  aplicavelModeloJangada?: string;
  precoCompra?: number | null;
  precoVenda?: number;
  codigoFabricante?: string;
  inventario?: string;
  lote?: string;
  validade?: string;
  associavelJangada?: boolean;
  categoria?: string;
  descricao?: string;
  foto?: string;
  quantidadeMinima?: number | null;
  localizacao?: string;
  observacoes?: string;
  tiposPackAssociados?: string[];
};

export type ViewMode = "quadros" | "lista" | "detalhes";

export type MonthlyNeed = {
  month: string;
  quantidade: number;
};

export type StockNeedRow = {
  stockId: number;
  referencia: string;
  nome: string;
  stockAtual: number;
  necessidade12m: number;
  saldoProjetado12m: number;
  mensal: MonthlyNeed[];
  matchedBy: "referencia" | "nome" | null;
};

export type MonthlyArticleNeed = {
  nome: string;
  referencia?: string;
  quantidade: number;
};

export type NeedsSummary = {
  artigosComValidadeAte12Meses: number;
  artigosVencidos: number;
  quantidadeTotalNecessaria12m: number;
  jangadasAfetadas: number;
  necessidadesMensaisTotais: MonthlyNeed[];
};

export type StockPriorityGroupKey = "validade" | "jangadas" | "restantes";
export type StockScope = "all" | "jangadas-ocean";

export type StockPrioritySection = {
  key: StockPriorityGroupKey;
  label: string;
  description: string;
  items: ItemStock[];
  categories: Array<{
    category: string;
    items: ItemStock[];
  }>;
};

export type StockListColumnKey =
  | "foto"
  | "nome"
  | "referencia"
  | "estado"
  | "referenciaSubstituta"
  | "codigoFabricante"
  | "quantidade"
  | "quantidadeMinima"
  | "precoVenda"
  | "marcaModelo"
  | "categoria"
  | "prateleira"
  | "descricao"
  | "packs"
  | "necessidade12m"
  | "saldoProjetado12m"
  | "necessidadeMensal";

export const STOCK_NEW_ITEM_DRAFT_KEY = "stock-new-item-draft-v1";
export const STOCK_LIST_COLUMNS_KEY = "stock-list-columns-v1";
export const STOCK_CATEGORY_ACCORDIONS_KEY = "stock-category-accordions-v1";
export const STOCK_SCOPE_KEY = "stock-scope-v1";
export const STOCK_LIST_DENSITY_KEY = "stock-list-density-v1";

export const STOCK_LIST_COLUMNS: Array<{ key: StockListColumnKey; label: string }> = [
  { key: "foto", label: "Foto" },
  { key: "nome", label: "Nome" },
  { key: "referencia", label: "Referência" },
  { key: "estado", label: "Estado" },
  { key: "referenciaSubstituta", label: "Ref. Substituta" },
  { key: "codigoFabricante", label: "Cód. Fabricante" },
  { key: "quantidade", label: "Quantidade" },
  { key: "quantidadeMinima", label: "Qtd. mínima" },
  { key: "precoVenda", label: "Preço de venda" },
  { key: "marcaModelo", label: "Marca/Modelo Jangada" },
  { key: "categoria", label: "Categoria" },
  { key: "prateleira", label: "Prateleira" },
  { key: "descricao", label: "Descrição" },
  { key: "packs", label: "Packs" },
  { key: "necessidade12m", label: "Necess. 12m" },
  { key: "saldoProjetado12m", label: "Saldo proj. 12m" },
  { key: "necessidadeMensal", label: "Necessidade mensal" },
];

export const INITIAL_STOCK_FORM: ItemStock = {
  id: 0,
  nome: "",
  quantidade: 0,
  referencia: "",
  estadoArtigo: "ATIVO",
  referenciaSubstituta: "",
  aplicavelMarcaJangada: "",
  aplicavelModeloJangada: "",
  precoCompra: null,
  precoVenda: 0,
  codigoFabricante: "",
  inventario: "",
  lote: "",
  validade: "",
  associavelJangada: false,
  categoria: "",
  descricao: "",
  quantidadeMinima: null,
  localizacao: "",
  observacoes: "",
  tiposPackAssociados: [],
};

export const CRITICAL_VALIDITY_CATEGORY_KEYWORDS = [
  "sinalizacao",
  "iluminacao",
  "primeiros socorros",
  "consumiveis",
  "pirotecn",
  "agua",
  "racao",
  "farm",
  "comprim",
  "bateria",
  "luz",
  "cilindr",
  "pressao",
  "ots65",
  "valvula",
];
