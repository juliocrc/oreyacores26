export type TecnicoRow = {
  id: number;
  nome: string;
  email: string | null;
  ativo: boolean;
  serviceStationId: number | null;
  observacoes?: string | null;
};

export type StationGroup = {
  id: number;
  codigo: string;
  nome: string;
  empresa: string | null;
  localizacao: string | null;
  territorioTipo: string;
  regiaoOperacional: string | null;
  totalTecnicos: number;
  tecnicos: TecnicoRow[];
};

export type TecnicosPayload = {
  activeStationId: number | null;
  activeStation: { id: number; codigo: string; nome: string } | null;
  canViewAllStations: boolean;
  stations: StationGroup[];
  unassigned: TecnicoRow[];
  totalTecnicos: number;
};

export type AusenciaItem = {
  id: number;
  tecnicoKey: string;
  tecnicoNome: string;
  tipo: "ferias" | "ausencia";
  dataInicio: string;
  dataFim: string;
  motivo: string | null;
};

export type AusenciasPayload = {
  ausencias: AusenciaItem[];
};

export type CertificacaoItem = {
  id: number;
  tecnicoId: number;
  fabricante: string;
  numeroCertificado: string | null;
  dataEmissao: string;
  dataValidade: string;
  ativo: boolean;
  observacoes: string | null;
};
