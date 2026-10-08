export type Station = {
  id: number;
  codigo: string;
  nome: string;
  empresa: string | null;
  localizacao: string | null;
  territorioTipo: string | null;
  regiaoOperacional: string | null;
};

export type ActiveStationPayload = {
  activeStationId: number | null;
  activeStation: Station | null;
  availableStations: Station[];
  canSelectStation: boolean;
  canViewAllStations: boolean;
  profile?: {
    label?: string;
  } | null;
};

export type OrcamentoLinha = {
  id?: string;
  stockId?: number;
  referencia?: string;
  descricao?: string;
  quantidade?: number;
  unitPrice?: number;
  total?: number;
  source?: string;
};

export type QueueStatus = "aguardar" | "agendada" | "progresso" | "a_secar" | "finalizada";
export type BoardColumnKey = "aguardar" | "agendada" | "progresso" | "finalizada" | "entregues";
export type DeliveryMethod = "cliente" | "transitario" | "navio";
export type WorkflowStatus =
  | "entrada_estacao"
  | "agendada"
  | "em_inspecao"
  | "secagem"
  | "finalizada"
  | string;

export type ServiceStationQueueItem = {
  queueId: number;
  raftId: number;
  serviceStationId: number | null;
  serviceStation?: {
    id: number;
    codigo?: string | null;
    nome?: string | null;
  } | null;
  serial: string;
  model: string;
  shipName: string;
  dataFabrico?: string | null;
  launchType?: string | null;
  dataInspecao?: string | null;
  dataProxInspecao?: string | null;
  testeGI?: string | null;
  tecnico?: string;
  observacao?: string;
  status: QueueStatus;
  workflowStatus?: WorkflowStatus | null;
  arrivedViaForwarder?: boolean;
  arrivalDate?: string;
  readyForDelivery?: boolean;
  deliveryMethod?: DeliveryMethod | null;
  transitario?: string | null;
  saoMiguelPortCall?: string | null;
  delivered?: boolean;
  deliveredAt?: string | null;
  smsNotifications?: Array<{ type: string; ativo: string; phone: string; status: string; error?: string }>;
  notifiedLastAt?: string | null;
  receivedAt?: string;
  scheduledAt?: string;
  startedAt?: string;
  finishedAt?: string;
  expectedDeliveryDate?: string | null;
  ordemServicoId?: number | null;
  numeroOrdem?: string;
  ordemStatus?: string | null;
  orcamentoStatus?: string | null;
  valorPecas?: number;
  valorMaoObra?: number;
  valorDesconto?: number;
  valorTotal?: number;
  isIsentoIva?: boolean;
  orcamentoLinhas?: OrcamentoLinha[];
  updatedAt?: string;
};

export type RaftOption = {
  id: number;
  serial: string;
  brand?: string | null;
  model?: string | null;
  linkedShipName?: string | null;
  shipNameManual?: string | null;
  owner?: string | null;
  status?: string | null;
  serviceStationId?: number | null;
  capacity?: number | null;
  receivedAt?: string | null;
  serviceStation?: {
    id: number;
    codigo?: string | null;
    nome?: string | null;
  } | null;
};

export type TecnicoOption = {
  id: number;
  nome: string;
  email?: string | null;
  ativo?: boolean;
  serviceStationId?: number | null;
};

export type TecnicosPayload = {
  activeStationId: number | null;
  stations: Array<{
    id: number;
    nome: string;
    tecnicos: TecnicoOption[];
  }>;
  unassigned?: TecnicoOption[];
};

export const STATUS_LABELS: Record<QueueStatus, string> = {
  aguardar: "Aguardar inspeção",
  agendada: "Agendada",
  progresso: "Em inspeção",
  a_secar: "Secagem",
  finalizada: "Pronta para entrega",
};

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  cliente: "Entregar ao cliente",
  transitario: "Entregar ao transitário",
  navio: "Entregar no navio",
};

export const STATUS_BADGE_CLASSES: Record<QueueStatus, string> = {
  aguardar: "border-slate-300 bg-slate-100 text-slate-700",
  agendada: "border-blue-200 bg-blue-100 text-blue-700",
  progresso: "border-amber-200 bg-amber-100 text-amber-700",
  a_secar: "border-cyan-200 bg-cyan-100 text-cyan-700",
  finalizada: "border-emerald-200 bg-emerald-100 text-emerald-700",
};

export type OrcamentoStatus = "Rascunho" | "Enviado" | "Aprovado" | "Rejeitado" | string;

export const ORCAMENTO_STATUS_LABELS: Record<string, string> = {
  Rascunho: "Orçamento em rascunho",
  Enviado: "Orçamento em análise",
  Pendente: "Orçamento em análise",
  Aprovado: "Orçamento aprovado",
  Rejeitado: "Orçamento rejeitado",
};

export const ORCAMENTO_STATUS_BADGE_CLASSES: Record<string, string> = {
  Rascunho: "border-slate-300 bg-slate-100 text-slate-700",
  Enviado: "border-amber-200 bg-amber-50 text-amber-800",
  Pendente: "border-amber-200 bg-amber-50 text-amber-800",
  Aprovado: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Rejeitado: "border-rose-200 bg-rose-50 text-rose-800",
};

export const BOARD_COLUMNS: Array<{
  status: BoardColumnKey;
  title: string;
  description: string;
  accent: string;
}> = [
  {
    status: "aguardar",
    title: "A aguardar",
    description: "Receções prontas para entrar em bancada.",
    accent: "from-slate-700 to-slate-600",
  },
  {
    status: "agendada",
    title: "Agendadas",
    description: "Com plano e técnico definido.",
    accent: "from-blue-700 to-indigo-700",
  },
  {
    status: "progresso",
    title: "Em inspeção",
    description: "Trabalho em curso, incluindo secagem e validações intermédias.",
    accent: "from-amber-600 to-orange-600",
  },
  {
    status: "finalizada",
    title: "Prontas para entrega",
    description: "Inspeção concluída, já sincronizada com a logística para saída.",
    accent: "from-emerald-700 to-teal-700",
  },
  {
    status: "entregues",
    title: "Entregues",
    description: "Fecho logístico confirmado com data real de entrega.",
    accent: "from-violet-700 to-fuchsia-700",
  },
];
