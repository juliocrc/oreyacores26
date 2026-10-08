import {
  hasNavioTextFilter,
  navioMatchesTextFilters,
} from "../navios-search";

describe("navioMatchesTextFilters", () => {
  it("encontra pelo nome sem acentos nem caixa", () => {
    const row = { nome: "PRINCESA SÃO MIGUEL", matricula: "HM-12-A" };
    expect(navioMatchesTextFilters(row, { nome: "são miguel" })).toBe(true);
    expect(navioMatchesTextFilters(row, { nome: "sao miguel" })).toBe(true);
    expect(navioMatchesTextFilters(row, { nome: "princesa" })).toBe(true);
  });

  it("rejeita nomes que não correspondem", () => {
    const row = { nome: "MAR DE NUVENS", matricula: "HM-12-A" };
    expect(navioMatchesTextFilters(row, { nome: "ilha" })).toBe(false);
    expect(navioMatchesTextFilters(row, { nome: "MAR DE NEBLINA" })).toBe(false);
  });

  it("ignora separadores na matrícula/CFR", () => {
    const row = { matricula: "FN-715-L" };
    expect(navioMatchesTextFilters(row, { matricula: "FN 715 L" })).toBe(true);
    expect(navioMatchesTextFilters(row, { matricula: "fn-715-l" })).toBe(true);
    expect(navioMatchesTextFilters(row, { matricula: "FN715L" })).toBe(true);
    expect(navioMatchesTextFilters(row, { matricula: "FN-999-L" })).toBe(false);
  });

  it("usa o CFR quando a matrícula não existe", () => {
    const row = { matricula: "", cfr: "450903345" };
    expect(navioMatchesTextFilters(row, { matricula: "4509 03345" })).toBe(true);
  });

  it("pesquisa q nos campos técnicos", () => {
    const row = { nome: "SOLDADO", mmsi: "263001234", callSignal: "CUH" };
    expect(navioMatchesTextFilters(row, { q: "263001234" })).toBe(true);
    expect(navioMatchesTextFilters(row, { q: "cuh" })).toBe(true);
    expect(navioMatchesTextFilters(row, { q: "outro" })).toBe(false);
  });

  it("sem filtros devolve sempre verdadeiro", () => {
    expect(navioMatchesTextFilters({}, {})).toBe(true);
    expect(navioMatchesTextFilters(null as unknown as Record<string, unknown>, { q: "  " })).toBe(true);
  });
});

describe("hasNavioTextFilter", () => {
  it("detecciona qualquer filtro de texto presente", () => {
    expect(hasNavioTextFilter({ nome: "a" })).toBe(true);
    expect(hasNavioTextFilter({ matricula: "b" })).toBe(true);
    expect(hasNavioTextFilter({ q: "c" })).toBe(true);
    expect(hasNavioTextFilter({})).toBe(false);
    expect(hasNavioTextFilter({ nome: "", matricula: null, q: undefined })).toBe(false);
  });
});