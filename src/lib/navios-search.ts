import { compactForSearch, normalizeForSearch } from "@/lib/search";

export type NavioTextFilters = {
  nome?: string | null;
  matricula?: string | null;
  q?: string | null;
};

export type NavioSearchableRow = {
  nome?: string | null;
  matricula?: string | null;
  cfr?: string | null;
  mmsi?: string | null;
  imo?: string | null;
  callSignal?: string | null;
  portoRegisto?: string | null;
};

export function hasNavioTextFilter(filters: NavioTextFilters): boolean {
  return Boolean(filters.nome || filters.matricula || filters.q);
}

/**
 * Correspondência de texto sem acentos nem maiúsculas/minúsculas.
 *
 * A pesquisa na lista de navios ia para o SQL como { contains } (LIKE) e o
 * SQLite só normaliza maiúsculas/minúsculas para ASCII: "SÃO MIGUEL" nunca
 * aparecia a pesquisar "são miguel" ou "sao miguel". Aqui colapsamos acentos,
 * caixa e espaços dos dois lados antes de comparar, com uma variante compacta
 * (sem separadores) para matrículas/CFR escritos com traços ou espaços.
 */
export function navioMatchesTextFilters(
  row: NavioSearchableRow,
  filters: NavioTextFilters,
): boolean {
  const needleNome = normalizeForSearch(filters.nome);
  if (needleNome && !normalizeForSearch(row.nome).includes(needleNome)) return false;

  const needleMatricula = normalizeForSearch(filters.matricula);
  if (needleMatricula) {
    const haystackMatricula = normalizeForSearch(
      `${row.matricula ?? ""} ${row.cfr ?? ""}`,
    );
    const matchesDirect = haystackMatricula.includes(needleMatricula);
    const needleCompact = compactForSearch(needleMatricula);
    const matchesCompact =
      needleCompact.length > 0 &&
      haystackMatricula.length > 0 &&
      compactForSearch(haystackMatricula).includes(needleCompact);
    if (!matchesDirect && !matchesCompact) return false;
  }

  const needleQ = normalizeForSearch(filters.q);
  if (needleQ) {
    const haystackQ = normalizeForSearch(
      [row.nome, row.matricula, row.cfr, row.mmsi, row.imo, row.callSignal, row.portoRegisto]
        .map((value) => (value == null ? "" : value))
        .join(" "),
    );
    if (!haystackQ.includes(needleQ)) return false;
  }

  return true;
}