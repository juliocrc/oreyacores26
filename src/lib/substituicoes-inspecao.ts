/**
 * Regra única do que conta como "substituído" numa inspeção.
 *
 * Existe para que o orçamento, o quadro e o certificado nunca discordem:
 * se um artigo entra no orçamento por ter sido substituído, tem de aparecer
 * como substituído no quadro, e vice-versa.
 *
 * Princípio: só entra o que foi **explicitamente registado** como troca.
 * Tudo o que o técnico apenas inspecionou e deu por bom fica de fora —
 * verificar não é gastar.
 */

/** Estados que registam uma substituição, em qualquer grafia. */
const SUBSTITUIDO_ESTADOS = new Set(["SUBSTITUIDO", "SUBSTITUIDA", "TROCADO", "TROCADA"]);

/** Normaliza para comparação: sem acentos, maiúsculas, sem espaços nas pontas. */
function normalizarEstado(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

/**
 * Um componente (válvula, mangueira, lanterna, pilha...) só é substituído
 * quando o técnico o assinalou como tal no passo dos componentes.
 *
 * Antes, o orçamento entrava qualquer componente que tivesse data de validade,
 * o que fazia pagar ao cliente peças que apenas foram inspecionadas.
 */
export function isComponenteSubstituido(componente: unknown): boolean {
  if (!componente || typeof componente !== "object") return false;
  const comp = componente as { estado?: unknown };
  return SUBSTITUIDO_ESTADOS.has(normalizarEstado(comp.estado));
}

/**
 * Um artigo do pack é substituído quando foi registada quantidade a
 * repor. A quantidade 0 significa "verificado, não trocado" — coerente com
 * o que o `buildCertificatePayload` já usava para marcar o quadro.
 */
export function isPackItemSubstituido(item: unknown): boolean {
  if (!item || typeof item !== "object") return false;
  const pack = item as { quantidade?: unknown };
  return Number(pack.quantidade) > 0;
}

/**
 * Filtro pronto a usar no orçamento: devolve apenas os componentes
 * substituídos, ignorando registos incompletos.
 */
export function apenasComponentesSubstituidos<T>(componentes: T[] | null | undefined): T[] {
  if (!Array.isArray(componentes)) return [];
  return componentes.filter((comp) => isComponenteSubstituido(comp));
}

/**
 * Equipamento de fecho de contentor (cintas, autocolantes, HRU) é material
 * novo por definição: entra sempre no orçamento se tiver quantidade.
 */
export function isClosureItemSubstituido(item: unknown): boolean {
  if (!item || typeof item !== "object") return false;
  const closure = item as { quantidade?: unknown };
  return Number(closure.quantidade) > 0;
}
