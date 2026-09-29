/**
 * Bloqueio de inspeções finalizadas.
 *
 * Uma inspeção concluída é um documento legal: foi assinada, dá origem ao
 * certificado e já pode ter sido facturada. A partir do momento em que leva
 * carimbo de integridade, o registo não pode mudar por iniciativa própria.
 *
 * Para alterar uma inspeção finalizada é preciso uma **reabertura
 * explícita**, com justificação escrita, feita por quem tem permissão, e
 * registada em auditoria. É essa rastreabilidade — e não o bloqueio em si —
 * que dá valor legal ao certificado.
 *
 * Este módulo só decide; não toca na base de dados. Assim a regra fica
 * testável sem base de dados e sem mocks.
 */

/** Caracteres mínimos para a justificação de reabertura. */
export const MIN_REABERTURA_JUSTIFICACAO = 15;

/**
 * Erro de bloqueio de inspeção finalizada.
 *
 * Vive aqui, e não em `src/app/inspecoes/actions.ts`, porque esse ficheiro é
 * `"use server"` e o Next só permite exportar de lá funções assíncronas —
 * exportar uma classe quebra o build (o typecheck não dá pelo erro).
 *
 * Distinto dos restantes para que a API responda 409 (conflito) em vez de
 * 500: é um pedido recusado por regra, não uma falha.
 */
export class InspectionLockedError extends Error {
  readonly motivo: string;
  readonly status = 409;

  constructor(mensagem: string, motivo: string) {
    super(mensagem);
    this.name = "InspectionLockedError";
    this.motivo = motivo;
  }
}

/**
 * Status que fecham uma inspeção. Comparados sem acentos, maiúsculas e
 * espaços, porque o valor chega de vários sítios e nem todos usam a mesma
 * grafia ("Concluída", "concluida", "CONCLUÍDA").
 */
const STATUS_FINALIZADOS = new Set(["CONCLUIDA", "CONCLUIDO", "FINALIZADA", "FINALIZADO", "ASSINADA"]);

function normalizar(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

export function isFinalizedStatus(status: unknown): boolean {
  return STATUS_FINALIZADOS.has(normalizar(status));
}

/**
 * Uma inspeção está bloqueada quando leva carimbo de integridade.
 * O carimbo é aplicado na finalização, por isso a sua presença é o sinal
 * mais fiável — mais do que o status, que pode ter sido escrito à mão.
 */
export function isInspectionLocked(inspecao: unknown): boolean {
  if (!inspecao || typeof inspecao !== "object") return false;
  const registo = inspecao as { integrityHash?: unknown; status?: unknown };

  if (registo.integrityHash !== null && registo.integrityHash !== undefined && registo.integrityHash !== "") {
    return true;
  }
  return isFinalizedStatus(registo.status);
}

export type ReopenDecision =
  /** A edição pode seguir: não está bloqueada, ou foi reaberta com justificação. */
  | { permitido: true; reabertura: boolean }
  /** A edição tem de ser recusada. */
  | { permitido: false; motivo: "justificacao-curta" | "sem-permissao" | "pedido-de-reabertura"; mensagem: string };

/**
 * Decide se uma edição a uma inspeção bloqueada pode prosseguir.
 *
 * `isAdmin` só é consultado quando há reabertura: um técnico pode gravar
 * rascunhos livremente, mas não pode reabrir um documento já assinado.
 */
export function evaluateInspectionEdit(args: {
  bloqueada: boolean;
  reabrir?: unknown;
  justificacao?: unknown;
  isAdmin?: boolean;
  certificadoNumero?: string | null;
}): ReopenDecision {
  const { bloqueada, reabrir, justificacao, isAdmin, certificadoNumero } = args;
  const referencia = certificadoNumero ? ` do certificado ${certificadoNumero}` : "";

  if (!bloqueada) {
    return { permitido: true, reabertura: false };
  }

  // O cliente pediu a reabertura, mas não tem permissão para a fazer.
  if (reabrir === true && isAdmin !== true) {
    return {
      permitido: false,
      motivo: "sem-permissao",
      mensagem:
        `Só um administrador pode reabrir uma inspeção finalizada${referencia}.` +
        " Contacte o coordenador da estação.",
    };
  }

  // O cliente pediu a reabertura, mas não justificou.
  if (reabrir === true) {
    const texto = String(justificacao ?? "").trim();
    if (texto.length < MIN_REABERTURA_JUSTIFICACAO) {
      return {
        permitido: false,
        motivo: "justificacao-curta",
        mensagem:
          `Para reabrir a inspeção${referencia} é obrigatório escrever uma justificação ` +
          `com pelo menos ${MIN_REABERTURA_JUSTIFICACAO} caracteres.`,
      };
    }
    return { permitido: true, reabertura: true };
  }

  // Tentou editar sem pedir reabertura.
  return {
    permitido: false,
    motivo: "pedido-de-reabertura",
    mensagem:
      `A inspeção${referencia} está finalizada e não pode ser alterada. ` +
      " Para a corrigir, reabrir a inspeção com justificação — a alteração fica registada em auditoria.",
  };
}
