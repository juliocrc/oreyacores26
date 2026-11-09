import { persistedQuoteLines } from "./quote-editor";

describe("persistedQuoteLines", () => {
  it("reopens saved percentages and preserves a fully discounted zero total", () => {
    const lines = persistedQuoteLines({ metadados: { linhas: [
      { id: "discounted", quantidade: 3, unitPrice: 1.115, descontoPercentual: 10, total: 3.01 },
      { id: "free", quantidade: 2, unitPrice: 50, descontoPercentual: 100, total: 0 },
      { id: "fallback", quantidade: 3, precoUnitario: 1.115, descontoPercentual: 10 },
    ] } });
    expect(lines[0]).toMatchObject({ descontoPercentual: 10, unitPrice: 1.115, total: 3.01 });
    expect(lines[1]).toMatchObject({ descontoPercentual: 100, total: 0 });
    expect(lines[2]).toMatchObject({ descontoPercentual: 10, unitPrice: 1.115, total: 3.01 });
  });

  it("does not invent services for an empty order", () => {
    expect(persistedQuoteLines({})).toEqual([]);
  });

  it("preserves operational identity and persisted prices without mutating the record", () => {
    const line = { id: "operational-42", stockId: 42, referencia: "REF", descricao: "Part",
      quantidade: 2, unitPrice: 12.5, total: 25, source: "stock" };
    const row = { valorPecas: 999, metadados: { linhas: [line] } };
    const result = persistedQuoteLines(row);
    expect(result).toEqual([{ ...line, descontoPercentual: 0 }]);
    expect(result[0]).not.toBe(line);
    expect(row.metadados.linhas).toEqual([line]);
  });

  it("preserves a positive legacy amount when saved lines and materials are empty", () => {
    expect(persistedQuoteLines({ valorPecas: 500, metadados: { linhas: [], materials: [] } })).toEqual([
      expect.objectContaining({ id: "legacy-total", quantidade: 1, unitPrice: 500, total: 500 }),
    ]);
  });

  it("preserves a genuinely empty zero amount order", () => {
    expect(persistedQuoteLines({ valorPecas: 0, metadados: { linhas: [], materials: [] } })).toEqual([]);
  });

  it("derives persisted materials before a legacy aggregate when saved lines are empty", () => {
    expect(persistedQuoteLines({ valorPecas: 500, metadados: { linhas: [], materials: [
      { id: "material-1", stockId: 3, quantidadeUsada: 2, precoUnitario: 12.5 },
    ] } })).toEqual([expect.objectContaining({ id: "material-1", stockId: 3, quantidade: 2, unitPrice: 12.5, total: 25 })]);
  });

  it("uses the legacy precoUnitario alias for editing and missing totals", () => {
    const line = { id: "legacy-line", stockId: 42, quantidade: 2, precoUnitario: 12.5 };
    expect(persistedQuoteLines({ metadados: { linhas: [line] } })[0]).toMatchObject({
      id: "legacy-line", stockId: 42, quantidade: 2, unitPrice: 12.5, total: 25,
    });
    expect(line).not.toHaveProperty("unitPrice");
  });

  it("prefers a current unitPrice, including zero, over the legacy alias", () => {
    expect(persistedQuoteLines({ metadados: { linhas: [
      { quantidade: 2, unitPrice: 0, precoUnitario: 12.5 },
    ] } })[0]).toMatchObject({ unitPrice: 0, total: 0 });
  });

  it("uses material prices and preserves a zero used quantity", () => {
    const lines = persistedQuoteLines({ metadados: { materials: [
      { id: "material-1", stockId: 3, quantidadeUsada: 0, quantidadePrevista: 4, precoUnitario: 12 },
      { id: "material-2", referencia: "L-CERT", quantidadePrevista: 2, precoUnitario: 34.56 },
    ] } });
    expect(lines[0]).toMatchObject({ id: "material-1", stockId: 3, quantidade: 0, total: 0 });
    expect(lines[1]).toMatchObject({ id: "material-2", quantidade: 2, unitPrice: 34.56, total: 69.12, source: "service" });
  });

  it("represents the legacy parts amount exactly, excluding separate labour and discount", () => {
    const row = { valorPecas: 123.45, valorMaoObra: 50, valorDesconto: 10 };
    expect(persistedQuoteLines(row)).toEqual([expect.objectContaining({
      id: "legacy-total", quantidade: 1, unitPrice: 123.45, total: 123.45,
    })]);
  });

  it("generates stable missing IDs across openings", () => {
    const row = { metadados: { linhas: [{ quantidade: 2, unitPrice: 10 }] } };
    expect(persistedQuoteLines(row)).toEqual(persistedQuoteLines(row));
    expect(persistedQuoteLines(row)[0]).toMatchObject({ id: "persisted-0", total: 20 });
  });

  it("does not resurrect operational materials after all quote lines were removed", () => {
    expect(persistedQuoteLines({ valorPecas: 0, metadados: { linhas: [], materials: [
      { quantidadePrevista: 2, precoUnitario: 50 },
    ] } })).toEqual([]);
  });

  it("keeps a legacy total-only line when it is saved without edits", () => {
    expect(persistedQuoteLines({ metadados: { linhas: [{ descricao: "Legacy", total: 125 }] } })[0])
      .toMatchObject({ quantidade: 1, unitPrice: 125, total: 125 });
  });

  it("repairs duplicate IDs without colliding with persisted IDs", () => {
    const row = { metadados: { linhas: [
      { id: "a", quantidade: 1, unitPrice: 1 }, { id: "a", quantidade: 1, unitPrice: 2 },
      { id: "persisted-1", quantidade: 1, unitPrice: 3 },
    ] } };
    const result = persistedQuoteLines(row);
    expect(new Set(result.map(line => line.id)).size).toBe(3);
    expect(result[2].id).toBe("persisted-1");
    expect(result).toEqual(persistedQuoteLines(row));
  });
});
