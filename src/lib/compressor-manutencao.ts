/**
 * Fonte única de verdade do plano de manutenção do compressor de ar
 * comprimido Michelin 300L.
 *
 * Fonte: "Manutenção de ar comprimido v.2.xlsx", folha "Manutenção de ar
 * comprimido". As tarefas e os intervalos vêm das linhas 5 e 6 do documento
 * (colunas C..O), com a legenda da linha 59:
 *
 *   W = Semanal   M = Mensal   3M = Trimestral   6M = Semestral   Y = Anual
 *
 * As datas são calculadas a partir da última manutenção registada. Nunca se
 * confia numa data enviada pelo cliente: `proximaDataManutencao` é a única
 * fonte do cálculo.
 */

export type IntervaloCodigo = "W" | "M" | "3M" | "6M" | "Y";

/** Meses por código de intervalo. `W` é semanal e não entra na tabela. */
export const INTERVALO_MESES: Record<Exclude<IntervaloCodigo, "W">, number> = {
  M: 1,
  "3M": 3,
  "6M": 6,
  Y: 12,
};

export const INTERVALO_DESCRICAO: Record<IntervaloCodigo, string> = {
  W: "Semanal",
  M: "Mensal",
  "3M": "Trimestral",
  "6M": "Semestral",
  Y: "Anual",
};

const DIAS_POR_SEMANA = 7;

/**
 * Soma meses preservando o dia do mês. `addMeses(31 Jan, 1)` devolve 28/29 de
 * Fevereiro em vez de transbordar para Março.
 */
export function addMeses(base: Date, meses: number): Date {
  const dia = base.getDate();
  const result = new Date(base.getTime());
  result.setDate(1);
  result.setMonth(result.getMonth() + meses);
  const ultimoDiaDoMes = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(dia, ultimoDiaDoMes));
  return result;
}

/** Data da próxima manutenção a partir da última realizada. */
export function proximaDataManutencao(base: Date, codigo: IntervaloCodigo): Date {
  if (codigo === "W") {
    const result = new Date(base.getTime());
    result.setDate(result.getDate() + DIAS_POR_SEMANA);
    return result;
  }
  return addMeses(base, INTERVALO_MESES[codigo]);
}

/** True quando a próxima manutenção já passou (ou é hoje). */
export function estaVencida(proximaData: Date | null | undefined, hoje = new Date()): boolean {
  if (!proximaData) return false;
  return proximaData.getTime() <= hoje.getTime();
}

/** Dias que faltam até à próxima manutenção. Negativo quando vencida. */
export function diasAteProxima(proximaData: Date | null | undefined, hoje = new Date()): number | null {
  if (!proximaData) return null;
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  const alvo = new Date(
    proximaData.getFullYear(),
    proximaData.getMonth(),
    proximaData.getDate(),
  ).getTime();
  return Math.round((alvo - inicio) / (24 * 60 * 60 * 1000));
}

export type TarefaManutencaoCompressor = {
  /** Coluna no documento (C=2 ... O=14). Serve para auditoria contra o xlsx. */
  coluna: number;
  referencia: string;
  /** Prefixo `tipo` usado pelo modelo CalibracaoEquipamento. */
  tipo: string;
  nome: string;
  intervalo: IntervaloCodigo;
  observacoes: string;
};

/**
 * As 13 tarefas do documento, na ordem das colunas.
 *
 * As referências mantêm as três que já existiam na aplicação
 * (MICHELIN-300L-OLEO / -FILTRO / -VALVULA) para não duplicar registos; as
 * restantes são novas.
 */
export const TAREFAS_MANUTENCAO_COMPRESSOR: readonly TarefaManutencaoCompressor[] = [
  {
    coluna: 2,
    referencia: "MICHELIN-300L-PURGA-AUTOMATICA",
    tipo: "compressor_purga_automatica",
    nome: "Compressor Michelin 300L - Verificar funcionamento da purga automática",
    intervalo: "3M",
    observacoes: "Trimestral. Confirmar que a purga automática do depósito arranca e drenagem.",
  },
  {
    coluna: 3,
    referencia: "MICHELIN-300L-VAZAMENTOS",
    tipo: "compressor_vazamentos",
    nome: "Compressor Michelin 300L - Verificar vazamentos na tubagem",
    intervalo: "M",
    observacoes: "Mensal. Inspecionar a tubagem de ar comprimido e procurar eventuais fugas.",
  },
  {
    coluna: 4,
    referencia: "MICHELIN-300L-FILTROS-LINHA",
    tipo: "compressor_filtros_linha",
    nome: "Compressor Michelin 300L - Limpar e purgar os filtros de linha",
    intervalo: "W",
    observacoes: "Semanal. Limpeza e purga dos filtros de linha.",
  },
  {
    coluna: 5,
    referencia: "MICHELIN-300L-PRESSOSTATO",
    tipo: "compressor_pressostato",
    nome: "Compressor Michelin 300L - Verificar funcionamento do pressostato",
    intervalo: "M",
    observacoes: "Mensal. Verificar corte e arranque nas pressões de trabalho.",
  },
  {
    coluna: 6,
    referencia: "MICHELIN-300L-PURGA-SISTEMA",
    tipo: "compressor_purga_sistema",
    nome: "Compressor Michelin 300L - Sangrar a linha e purgar o sistema",
    intervalo: "M",
    observacoes: "Mensal. Sangrar a linha e purgar o sistema de ar comprimido.",
  },
  {
    coluna: 7,
    referencia: "MICHELIN-300L-NIVEL-OLEO",
    tipo: "compressor_nivel_oleo",
    nome: "Compressor Michelin 300L - Verificar o nível de óleo",
    intervalo: "3M",
    observacoes: "Trimestral. Verificar nível de óleo do compressor.",
  },
  {
    coluna: 8,
    referencia: "MICHELIN-300L-CORREIA",
    tipo: "compressor_correia",
    nome: "Compressor Michelin 300L - Verificar estado e tensão da correia",
    intervalo: "6M",
    observacoes: "Semestral. Verificar estado e tensão da correia de transmissão.",
  },
  {
    coluna: 9,
    referencia: "MICHELIN-300L-LIMPEZA-FILTRO-AR",
    tipo: "compressor_limpeza_filtro_ar",
    nome: "Compressor Michelin 300L - Limpar o filtro de ar do compressor",
    intervalo: "3M",
    observacoes: "Trimestral. Limpeza do filtro de ar (não confundir com a troca do elemento).",
  },
  {
    coluna: 10,
    referencia: "MICHELIN-300L-LIMPEZA-EXTERNA",
    tipo: "compressor_limpeza_externa",
    nome: "Compressor Michelin 300L - Limpar a parte externa do compressor",
    intervalo: "Y",
    observacoes: "Anual. Limpeza da parte externa / refrigeração.",
  },
  {
    coluna: 11,
    referencia: "MICHELIN-300L-OLEO",
    tipo: "compressor_oleo",
    nome: "Compressor Michelin 300L - Trocar o óleo do compressor",
    intervalo: "Y",
    observacoes: "Anual (documento v.2). Óleo sintético para compressor 5.5kW / 400V.",
  },
  {
    coluna: 12,
    referencia: "MICHELIN-300L-FILTRO",
    tipo: "compressor_filtro",
    nome: "Compressor Michelin 300L - Trocar o elemento do filtro de ar",
    intervalo: "Y",
    observacoes: "Anual (documento v.2). Troca do elemento filtrante.",
  },
  {
    coluna: 13,
    referencia: "MICHELIN-300L-VALVULA",
    tipo: "compressor_valvula",
    nome: "Compressor Michelin 300L - Verificar funcionamento da válvula de segurança",
    intervalo: "6M",
    observacoes: "Semestral (documento v.2). Teste da válvula de segurança. Máx. 10 bar / 145 psi.",
  },
  {
    coluna: 14,
    referencia: "MICHELIN-300L-APERTOS",
    tipo: "compressor_apertos",
    nome: "Compressor Michelin 300L - Verificar apertos do conjunto compressor",
    intervalo: "Y",
    observacoes: "Anual. Rever apertos do conjunto compressor.",
  },
] as const;

/**
 * Itens antigos da aplicação que não correspondem a nenhuma tarefa do
 * documento v.2. Não são apagados automaticamente — fica a decisão de
 * desativar.
 */
export const ITENS_COMPRESSOR_SEM_EQUIVALENTE = [
  {
    referencia: "MICHELIN-300L-PURGA",
    tipo: "compressor_ar",
    nome: "Compressor Michelin 300L - Purga de Condensos do Depósito",
    motivo:
      "O documento v.2 não tem uma tarefa de purga de condensados do depósito. As tarefas próximas são 'Verificar funcionamento da purga automática' (trimestral) e 'Sangrar a linha e purgar o sistema' (mensal).",
  },
] as const;

export function tarefaPorReferencia(referencia: string): TarefaManutencaoCompressor | undefined {
  const alvo = String(referencia || "").trim().toUpperCase();
  return TAREFAS_MANUTENCAO_COMPRESSOR.find((t) => t.referencia.toUpperCase() === alvo);
}

export function tarefaPorTipo(tipo: string): TarefaManutencaoCompressor | undefined {
  const alvo = String(tipo || "").trim().toLowerCase();
  return TAREFAS_MANUTENCAO_COMPRESSOR.find((t) => t.tipo.toLowerCase() === alvo);
}

/**
 * Calcula a próxima data de uma tarefa a partir da última manutenção.
 * Devolve `null` para tarefas sem intervalo conhecido, para o caller não
 * inventar uma data.
 */
export function proximaDataParaTarefa(
  tarefa: Pick<TarefaManutencaoCompressor, "intervalo"> | null | undefined,
  ultimaManutencao: Date,
): Date {
  return proximaDataManutencao(ultimaManutencao, tarefa?.intervalo ?? "Y");
}
