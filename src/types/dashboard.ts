export type JangadaDashboard = {
  id: number;
  serial: string;
  brand: string;
  model: string;
  launchType: string | null;
  painterLength: string | null;
  maxStowageHeight: string | null;
  capacity: number;
  owner: string;
  dataFabrico: string;
  packType: string;
  containerModel: string | null;
  shipId: number | null;
  shipNameManual: string | null;
  dataInspecao: string | null;
  dataProxInspecao: string | null;
  cylinderSerial: string | null;
  cylinderTara: string | null;
  cylinderPesoBruto: string | null;
  cylinderCo2: string | null;
  cylinderN2: string | null;
  cylinderDataTeste: string | null;
  cylinderDataProxTeste: string | null;
  cylinderSistema: string | null;
  cylinderCabecaDisparoRef: string | null;
  cylinderCabecaDisparoSerial: string | null;
  cylinderCabecaDisparoDescricao: string | null;
  cylinderTuboCamaraSuperiorRef: string | null;
  cylinderTuboCamaraSuperiorDescricao: string | null;
  cylinderTuboCamaraInferiorRef: string | null;
  cylinderTuboCamaraInferiorDescricao: string | null;
  cylinderAcessoriosCamaraSuperiorJson: string | null;
  cylinderAcessoriosCamaraInferiorJson: string | null;
  valvulasAlivio: string | null;
  valvulasAtestar: string | null;
  hruReferencia: string | null;
  hruDataInstalacao: string | null;
  hruValidade: string | null;
  radarReflector: string | null;
  radarReflectorValidade: string | null;
  tuboIdentificacao: string | null;
  numeroObra: string | null;
  ownerDisplay?: string | null;
  ultimoCertificadoNumero?: string | null;
  certificadoExternoNumero?: string | null;
  fabricType?: string | null;
  // Testes (resultados)
  testeWP?: string | null;
  testeNAP?: string | null;
  testeFS?: string | null;
  testeGI?: string | null;
  testeDL?: string | null;
  // Testes WP (medições)
  testeWPUnidadePressao?: string | null;
  testeWPHoraInicio?: string | null;
  testeWPHoraFim?: string | null;
  testeWPTemperaturaInicial?: string | null;
  testeWPTemperaturaFinal?: string | null;
  testeWPPressaoAtmosfericaInicial?: string | null;
  testeWPPressaoAtmosfericaFinal?: string | null;
  testeWPCamaraSuperiorInicio?: string | null;
  testeWPCamaraSuperiorFim?: string | null;
  testeWPCamaraInferiorInicio?: string | null;
  testeWPCamaraInferiorFim?: string | null;
  artigos: Array<{
    id: number;
    name: string;
    quantidade: number | string | null;
    validade: string | null;
    referencia: string | null;
    codigoFabricante: string | null;
  }>;
  linkedShipName: string | null;
  navio: {
    nome: string;
    cliente: { id: number; nome: string; ilha: string | null } | null;
  } | null;
  status: string | null;
  inQueue: boolean;
  queueStatus: string | null;
  queueDataChegada: string | null;
  queueDataPrevistaEntrega: string | null;
  queueObservacoes: string | null;
  serviceStationName: string | null;
  shipName: string | null;
  island: string | null;
  portoRegisto: string | null;
  applicableServiceBulletinsCount: number;
  applicableServiceBulletinTitles: string[];
  inspecoes?: Array<Record<string, unknown>>;
  createdAt?: string;
  updatedAt?: string;
};

export type DashboardStats = {
  faturacaoMes: number;
  faturacaoAno: number;
  aReceber: number;
  faturasPorCobrar: number;
  osAbertas: number;
  osConcluidasMes: number;
  osValorMes: number;
  osMaoObraMes: number;
  osPecasMes: number;
  margemBrutaMes: number;
  jangadasExpirar30: number;
  jangadasExpirar60: number;
  stockCriticoCount: number;
  totalClientes: number;
  totalJangadas: number;
};

export type ExpiringItem = {
  id: number;
  type: "stock" | "jangada";
  referencia: string;
  descricao: string;
  lote?: string;
  quantidade: number;
  validade: string;
  daysRemaining: number;
  owner?: string;
  serial?: string;
};

export type StockExpiringResponse = {
  summary: {
    expiredCount: number;
    expiring30dCount: number;
    expiring60dCount: number;
    expiring90dCount: number;
    totalAlerts: number;
  };
  expired: ExpiringItem[];
  expiring30d: ExpiringItem[];
  expiring60d: ExpiringItem[];
  expiring90d: ExpiringItem[];
};

export type CriticalStockItem = {
  id: number;
  referencia: string;
  descricao: string;
  quantidade: number;
  quantidadeMinima: number | null;
  categoria: string | null;
  serviceStationId: number | null;
  precoCompra: number | null;
  associavelJangada: boolean;
  deficit: number;
};

export type CriticalStockResponse = {
  criticalItems: CriticalStockItem[];
};

export type AlertItem = {
  tipo: string;
  id: number;
  referencia: string;
  data: string;
  jangadaSerial?: string | null;
  jangadaId?: number;
  ordemId?: number;
  extintorId?: number;
  status?: string;
  sourceYear?: number;
  tipoAgente?: string | null;
};

export type AlertasResponse = {
  total: number;
  inspecoes: number;
  certificados: number;
  pedidosAssistencia: number;
  epirbs: number;
  extintores: number;
  fatos: number;
  alertas: AlertItem[];
};

export type AgendaMetrics = {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  byMonth: Array<{ month: string; count: number }>;
  topResponsavel: Array<{ name: string; count: number }>;
  completionRate: number;
  averageDuration: number;
  upcomingNext7Days: number;
  overdueCount: number;
};

export type KanbanColumn = {
  id: string;
  title: string;
  status: string[];
  items: JangadaDashboard[];
  count: number;
};

export type ComplianceRaft = {
  id: number;
  serial: string;
  model: string;
  owner: string;
  shipName: string | null;
  dataInspecao: string | null;
  dataProxInspecao: string | null;
  certificadoNumero: string | null;
  certificadoValidoAte: string | null;
  status: "valido" | "expirando" | "expirado";
  diasParaExpirar: number;
  applicableServiceBulletinsCount: number;
  applicableServiceBulletinTitles: string[];
  hruValidade: string | null;
  cylinderDataProxTeste: string | null;
  artigosEstado: {
    ok: number;
    expirando: number;
    expirados: number;
  };
};

export type InspectorDashboardData = {
  currentInspection: JangadaDashboard | null;
  progress: number;
  currentStep: number;
  totalSteps: number;
  pendingItems: Array<{
    step: number;
    stepName: string;
    description: string;
  }>;
};

export type FleetSummary = {
  total: number;
  emInspecao: number;
  aguardandoPecas: number;
  prontas: number;
  certificadas: number;
  overdueCerts: number;
  lowStockItems: number;
  upcomingNext7Days: number;
  agendaOverdue: number;
  completionRate: number;
  averageDurationMinutes: number;
};

export type PackRequirements = {
  article: string;
  requiredQty: number;
  verifiedQty: number;
  replacedQty: number;
  validity: string | null;
  stockBatch: string | null;
  manualBatch: string | null;
  category: string;
  section: "emergency" | "equipment" | "raft";
  hasExpiry: boolean;
};