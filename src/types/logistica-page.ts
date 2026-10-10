export type JangadaLogistica = {
  id: number;
  serial: string;
  brand: string;
  model: string;
  capacity: number;
  shipId: number | null;
  shipName: string | null;
  owner: string;
  island: string | null;
  portoRegisto: string | null;
  dataInspecao: string | null;
  dataProxInspecao: string | null;
  status: string | null;
  serviceStationId: number | null;
  serviceStationName: string | null;
  numeroObra: string | null;
  inQueue: boolean;
  queueStatus: string | null;
  queueDataChegada: string | null;
  queueDataPrevistaEntrega: string | null;
  queueObservacoes: string | null;
  delivered?: boolean;
  deliveredAt?: string | null;
};

/** Estados que a Logística usa na sua UI. */
export type LogisticaStatus = "aguardando" | "recebida" | "agendada" | "em_inspecao" | "concluida" | "expedida";

/**
 * Traduz o estado da fila da estação de serviço (que fala
 * aguardar/agendada/progresso/a_secar/finalizada) para o vocabulário da
 * Logística (aguardando/recebida/agendada/em_inspecao/concluida/expedida).
 */
export function toLogisticaStatus(
  queueStatus: string | null | undefined,
  opts: { inQueue?: boolean; delivered?: boolean; dataInspecao?: string | null } = {},
): LogisticaStatus {
  if (opts.delivered) return "expedida";
  if (opts.dataInspecao) return "concluida";
  if (!opts.inQueue) return "aguardando";

  const s = String(queueStatus || "").trim().toLowerCase();

  if (opts.delivered || s === "expedida" || s === "entregue" || s === "enviada") return "expedida";

  switch (s) {
    case "finalizada":
    case "concluida":
    case "concluída":
      return "concluida";
    case "progresso":
    case "a_secar":
    case "em_inspecao":
    case "em_inspecção":
      return "em_inspecao";
    case "agendada":
      return "agendada";
    case "aguardar":
    case "aguardando":
    case "recebida":
      return "recebida";
    default:
      return "recebida";
  }
}

export type FilterState = {
  search: string;
  status: string;
  island: string;
  station: string;
  dateFrom: string;
  dateTo: string;
  /** "todas" | "proximas" (≤30 dias) | "caducadas" (já expiradas). */
  insp: string;
};

