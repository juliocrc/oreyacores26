/**
 * Pesquisa tolerante a erros, partilhada por todas as listas.
 *
 * Objetivo: o técnico escreve depressa no campo de pesquisa e mesmo assim
 * encontra. Lidamos com três problemas reais do dia-a-dia:
 *
 *   1. Acentos      — "acores" encontra "Açores"
 *   2. Separadores  — "SR 1234" encontra "SR-1234", "L R 9 7" encontra "LR97"
 *   3. Erros de dedo— "jagnada" encontra "jangada" (transposições e falhas)
 */

/** Remove acentos, minúsculas e colapsa espaços. */
export function normalizeForSearch(value?: string | null): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Como {@link normalizeForSearch}, mas sem separadores — para números de série. */
export function compactForSearch(value?: string | null): string {
  return normalizeForSearch(value).replace(/[^a-z0-9]/g, "");
}

/**
 * Distância de edição (Damerau-Levenshtein / OSA) com corte antecipado.
 *
 * Ao contrário do Levenshtein clássico, uma transposição de letras vizinhas
 * custa 1 e não 2. Isto importa em números de série curtos: "SRV-9" escrito
 * "RSV-9" tem de continuar a encontrar correspondência, e essas palavras são
 * curtas demais para queimar 2 dos 2 erros permitidos.
 */
export function editDistance(a: string, b: string, maxDistance: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Três linhas: a transposição salta duas casas, logo precisamos de "duas atrás".
  const identityRow = (): number[] => Array.from({ length: b.length + 1 }, (_, j) => j);
  let twoBack = identityRow();
  let oneBack = identityRow();
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = current[0];

    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        current[j - 1] + 1, // inserção
        oneBack[j] + 1, // remoção
        oneBack[j - 1] + substitutionCost // substituição
      );

      // Transposição: "ab" <-> "ba"
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, twoBack[j - 2] + 1);
      }

      current[j] = value;
      if (value < rowMin) rowMin = value;
    }

    // Nenhuma célula da linha pode melhorar se já excedeu o limite.
    if (rowMin > maxDistance) return maxDistance + 1;

    const recycled = twoBack;
    twoBack = oneBack;
    oneBack = current;
    current = recycled;
  }

  return oneBack[b.length];
}

/** Tolerância proporcional ao tamanho da palavra: 1 erro até 4 letras, 2 acima disso. */
export function allowedTypoDistance(term: string): number {
  if (term.length <= 4) return 1;
  if (term.length <= 8) return 2;
  return 3;
}

/** O termo aparece como sub-sequência de caracteres? ("jgnd" -> "jangada") */
function isSubsequence(term: string, candidate: string): boolean {
  if (!term) return true;
  let ti = 0;
  for (let ci = 0; ci < candidate.length && ti < term.length; ci += 1) {
    if (candidate[ci] === term[ti]) ti += 1;
  }
  return ti === term.length;
}

/**
 * Normaliza um valor para construir o "haystack" a pesquisar.
 * Devolve string vazia para valores ausentes, para não gerarem falsos positivos.
 */
export function toSearchable(value?: string | number | null): string {
  if (value === null || value === undefined) return "";
  return normalizeForSearch(String(value));
}

/**
 * Verifica se `term` encontra algum dos `values`.
 *
 * `values` pode ser um array de campos (marca, série, navio, cliente...).
 * A comparação é feita em três níveis, do mais forte para o mais fraco:
 * sub-cadeia directa, sub-cadeia sem separadores, e por último tolerância
 * a erros palavra a palavra.
 */
export function matchesSearch(
  term: string | null | undefined,
  ...values: Array<string | number | null | undefined>
): boolean {
  const needle = normalizeForSearch(term);
  if (!needle) return true; // sem pesquisa, não filtra nada

  const haystack = values.map(toSearchable).filter(Boolean);
  if (haystack.length === 0) return false;

  // Nível 1 — sub-cadeia directa.
  if (haystack.some((h) => h.includes(needle))) return true;

  // Nível 2 — ignorando separadores ("SR 1234" vs "SR-1234").
  const needleCompact = compactForSearch(needle);
  if (needleCompact) {
    if (haystack.some((h) => compactForSearch(h).includes(needleCompact))) return true;
  }

  // Nível 3 — tolerância a erros, palavra a palavra.
  const maxDistance = allowedTypoDistance(needle);
  const needleWords = needle.split(" ").filter(Boolean);
  const candidateWords = haystack.flatMap((h) => h.split(" ")).filter(Boolean);

  if (needleWords.length === 0 || candidateWords.length === 0) return false;

  return needleWords.every((needleWord) =>
    candidateWords.some(
      (candidateWord) =>
        candidateWord.startsWith(needleWord) ||
        isSubsequence(needleWord, candidateWord) ||
        editDistance(needleWord, candidateWord, maxDistance) <= maxDistance
    )
  );
}

/**
 * Pontuação para ordenação: quanto maior, melhor o resultado.
 * 100 = comece exacto · 70 = sub-cadeia · 50 = sem separadores · 25 = tolerante.
 */
export function scoreMatch(
  term: string | null | undefined,
  ...values: Array<string | number | null | undefined>
): number {
  const needle = normalizeForSearch(term);
  if (!needle) return 0;

  let best = 0;
  for (const value of values) {
    const haystack = toSearchable(value);
    if (!haystack) continue;

    if (haystack === needle) return 100;
    if (haystack.startsWith(needle)) {
      best = Math.max(best, 90);
      continue;
    }
    if (haystack.includes(needle)) {
      best = Math.max(best, 70);
      continue;
    }
    if (compactForSearch(haystack).includes(compactForSearch(needle))) {
      best = Math.max(best, 50);
      continue;
    }
    if (matchesSearch(needle, haystack)) best = Math.max(best, 25);
  }
  return best;
}
