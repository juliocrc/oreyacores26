/**
 * Comprehensive type for the JangadaWizard inspection data.
 * Covers all 9 steps and the store initialization.
 */

export type ShipDetails = {
  nome?: string;
  proprietario?: string;
  tipoPesca?: string;
  tipoNavio?: string;
  bandeira?: string;
  imo?: string;
  callSignal?: string;
  cliente?: {
    id?: number;
    nome?: string;
    ilha?: string;
    telefone?: string | null;
    telmovel?: string | null;
  } | null;
  [key: string]: unknown;
} | null;

export type CylinderData = {
  serial: string;
  sistema: string;
  co2: string;
  n2: string;
  tara: string;
  pesoBruto: string;
  dataTeste: string;
  dataProxTeste: string;
  nextTestDate?: string;
};

export type TestResult = "PASSOU" | "REPROVOU" | "N/A" | "";

export type TestesData = {
  testeWP: string;
  testeGI: string;
  testeFS: string;
  testeNAP: string;
  testeDL: string;
  wpUnidadePressao: string;
  wpManometroId: string;
  wpBarometroId: string;
  wpHoraInicio: string;
  wpHoraFim: string;
  wpTempInicio: string;
  wpTempFim: string;
  wpPressaoAtmInicio: string;
  wpPressaoAtmFim: string;
  wpCamaraSupInicio: string;
  wpCamaraSupFim: string;
  wpCamaraInfInicio: string;
  wpCamaraInfFim: string;
  napUnidadePressao: string;
  napManometroId: string;
  napHoraInicio: string;
  napHoraFim: string;
  napTempInicio: string;
  napTempFim: string;
  napPressaoAtmInicio: string;
  napPressaoAtmFim: string;
  napCamaraSupInicio: string;
  napCamaraSupFim: string;
  napCamaraInfInicio: string;
  napCamaraInfFim: string;
  [key: string]: string;
};

export type ChecklistItem = {
  status?: string;
  notes?: string;
};

export type ComponenteItem = {
  id: string;
  type: string;
  reference: string;
  serialLote: string;
  validade: string;
  isAuto?: boolean;
  category?: string;
  notes?: string;
  stockId?: number | string | null;
  estado?: string;
};

export type PackItem = {
  checklistName: string;
  name: string;
  descricao?: string;
  quantidade: number;
  quantidadeVerificada?: number;
  validade?: string;
  validadeOriginal?: string;
  lote?: string;
  referencia?: string;
  stockId?: number | string | null;
  codigoFabricante?: string | null;
  estado?: string;
};

export type GlobalStockItem = {
  id: number;
  referencia: string;
  descricao: string;
  categoria: string | null;
  codigoFabricante: string | null;
  lote: string | null;
  validade: string | null;
  quantidade: number;
  precoVenda: number | null;
};

export type OrcamentoLinha = {
  id: string;
  stockId?: number | string | null;
  referencia: string;
  descricao: string;
  quantidade: number;
  unitPrice: number;
  total: number;
  source: "service" | "pack" | "componente" | "stock" | "manual" | "closure";
};

export type OrcamentoAprovacao = {
  status: 'rascunho' | 'enviado' | 'aprovado' | 'rejeitado';
  telefoneCliente?: string;
  mensagem?: string;
  enviadoEm?: string;
  respondidoEm?: string;
  alteracoesPedidas?: string;
  validadeDias?: number;
};

export type OrcamentoData = {
  linhas: OrcamentoLinha[];
  valorMaoObra: number;
  valorDesconto: number;
  isIsentoIva: boolean;
  usarOrcamento?: boolean;
  removedIds?: string[];
  aprovacaoWhatsApp?: OrcamentoAprovacao;
};

export type InspectionData = {
  // Step 1 — Identificação
  brand: string;
  model: string;
  serial: string;
  capacity: number | string;
  packType: string;
  dataFabrico: string;
  dataInspecao: string;
  dataProxInspecao: string;
  shipName: string;
  shipNameManual?: string;
  owner: string;
  painterLength: string;
  maxStowageHeight: string;
  fabricType: string;
  launchType: string;
  shipFlag: string;
  shipImo: string;
  shipCallSign: string;
  certificadoNumero: string;
  numeroObra: string;
  certificadoExternoNumero: string;
  certificadoExternoUrl: string;
  hruAplicavel: string;
  hruValidade: string;
  hruReference: string;
  hruExpiry: string;
  radarReflector: string;
  radarReflectorExpiry: string;
  shipDetails: ShipDetails;
  artigos: unknown[];

  // Step 1 computed
  responsavel: string;

  // Step 2 — Checklist
  checklist: Record<string, ChecklistItem>;

  // Step 3 — Componentes
  componentes: ComponenteItem[];
  hasAutoFilledComponents: boolean;
  globalStock: GlobalStockItem[];

  // Step 4 — Pack
  packItems: Record<string, PackItem>;

  // Step 5 — Cilindros
  cylinder: CylinderData;

  // Step 6 — Testes
  testes: TestesData;
  date: string;

  // Step de Reparações / Colagem (quando o teste WP reprova)
  reparacoes?: Array<{
    id: string;
    tipo: string;
    descricao: string;
    zona: string;
    materiais: string;
    custo: number;
  }>;

  // Step 7 — Equipamento de fecho do contentor (cintas, autocolantes, HRU)
  containerClosureItems?: Array<{
    key: string;
    kind: "cinta" | "autocolante" | "hru";
    referencia: string;
    descricao: string;
    quantidade: number;
    unitPrice: number;
    stockId?: number | null;
    partNumber?: string;
  }>;

  // Step 7 — Orçamento
  orcamento?: OrcamentoData;

  // Step 8 — Assinatura
  signatureBase64: string;

  // Allow additional fields from raftData spread
  [key: string]: unknown;
};
