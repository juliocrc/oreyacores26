import { hasQuoteFinancialChange, normalizeQuoteLines, normalizeQuoteStatus, QuoteInputError } from "../ordem-quote-input";

it("ignores caller totals and rounds each line to cents", () => {
  expect(normalizeQuoteLines([{ quantidade: 3, unitPrice: 1.115, total: 999 }])[0].total).toBe(3.35);
});

it.each([-1, NaN, Infinity, -Infinity, "", null, true, {}, undefined])("rejects invalid quantity/price %p", (value) => {
  expect(() => normalizeQuoteLines([{ quantidade: value, unitPrice: 1 }])).toThrow(QuoteInputError);
  expect(() => normalizeQuoteLines([{ quantidade: 1, unitPrice: value }])).toThrow(QuoteInputError);
});

it("accepts zero and numeric strings, including persisted precoUnitario", () => {
  expect(normalizeQuoteLines([{ quantidade: "2", precoUnitario: "0" }])[0]).toMatchObject({ quantidade: 2, unitPrice: 0, total: 0 });
});

it("preserves stock identity and operational flags during partial edits", () => {
  const old = [{ id: "a", stockId: 4, consumido: true, reservado: false, origem: "inspecao", customPersisted: "keep" }];
  expect(normalizeQuoteLines([{ id: "a", quantidade: 2, unitPrice: 3, arbitraryInput: "drop" }], old)[0]).toEqual({
    ...old[0], quantidade: 2, unitPrice: 3, descontoPercentual: 0, total: 6, referencia: "", descricao: "", source: "",
  });
  expect(normalizeQuoteLines([{ id: "b", stockId: "7", consumido: false, quantidade: 1, unitPrice: 2 }])[0]).toMatchObject({ id: "b", stockId: 7, consumido: false });
});

it.each([null, {}, [null], [{ quantidade: 1, unitPrice: 2, stockId: -1 }], [{ quantidade: 1, unitPrice: 2, consumido: "false" }]])("rejects malformed lines %p", (lines) => {
  expect(() => normalizeQuoteLines(lines)).toThrow(QuoteInputError);
});

it("rejects overflow and duplicate identities", () => {
  expect(() => normalizeQuoteLines([{ quantidade: 1e300, unitPrice: 1e300 }])).toThrow(QuoteInputError);
  expect(() => normalizeQuoteLines([{ id: "a", quantidade: 1, unitPrice: 1 }, { id: "a", quantidade: 1, unitPrice: 1 }])).toThrow(QuoteInputError);
});

it.each([-1, 100.01, NaN, Infinity, -Infinity, "", null, true, {}])("rejects invalid line discount %p", descontoPercentual => {
  expect(() => normalizeQuoteLines([{ quantidade: 2, unitPrice: 10, descontoPercentual }])).toThrow(QuoteInputError);
});

it.each([[undefined, 20], [0, 20], [100, 0], [12.5, 17.5], ["25", 15]])("normalizes discount %p and ignores forged totals", (descontoPercentual, total) => {
  expect(normalizeQuoteLines([{ quantidade: 2, unitPrice: 10, descontoPercentual, total: 999 }])[0])
    .toMatchObject({ descontoPercentual: Number(descontoPercentual ?? 0), total });
});

it("rounds the net amount once, without rounding price or gross amount first", () => {
  expect(normalizeQuoteLines([{ quantidade: 3, unitPrice: 1.115, descontoPercentual: 10 }])[0].total).toBe(3.01);
});

it.each([{ linhas: [] }, { metadados: { linhas: [] } }, { codigoIsencaoIva: "M01" }, { metadados: { materials: [] } }, { metadados: { totais: {} } }])("detects invoice financial changes in either request shape %p", (body) => {
  expect(hasQuoteFinancialChange(body, { codigoIsencaoIva: null }, { linhas: [{ quantidade: 1 }], materials: [{}], totais: { totalComIva: 1 } }, true)).toBe(true);
});

it("allows technical consumption updates without granting financial editing", () => {
  const row = { id: "a", stockId: 1, quantidadePrevista: 2, precoUnitario: 3, consumido: false };
  const body = { metadados: { materials: [{ ...row, consumido: true }] } };
  expect(hasQuoteFinancialChange(body, {}, { materials: [row] })).toBe(false);
  expect(hasQuoteFinancialChange(body, {}, { materials: [row] }, true)).toBe(true);
});

it("validates canonical and known legacy quote statuses", () => {
  expect(normalizeQuoteStatus("aprovado")).toBe("Aprovado");
  expect(normalizeQuoteStatus("Enviado")).toBe("Enviado");
  expect(normalizeQuoteStatus("em_execucao")).toBe("em_execucao");
  expect(() => normalizeQuoteStatus("anything")).toThrow(QuoteInputError);
});
