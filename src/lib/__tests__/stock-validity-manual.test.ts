import { stockItemSupportsValidity } from "@/lib/stock-validity";
import { getStockApplicabilityTypes, getStockValidityManualMode, parseStockValidityManualInput, stripStockMetadataToken, upsertStockMetadataInObservacoes } from "@/lib/stock-metadata";

test.each([false, "NAO", "false", "0"])("explicit %s overrides expiring heuristics", value => {
  expect(stockItemSupportsValidity({ descricao: "Hand flare", validadeAplicavel: value })).toBe(false);
  const observacoes = upsertStockMetadataInObservacoes("Notes", { validadeAplicavel: parseStockValidityManualInput(value) });
  expect(stockItemSupportsValidity({ descricao: "Hand flare", observacoes })).toBe(false);
});

test("SIM overrides non-expiring heuristics and AUTO restores inference without losing metadata", () => {
  const original = upsertStockMetadataInObservacoes("Notes", { validadeAplicavel: true, aplicavelTipos: ["JANGADAS"] });
  expect(stockItemSupportsValidity({ descricao: "Paddle", observacoes: original })).toBe(true);
  const automatic = upsertStockMetadataInObservacoes(original, { validadeAplicavel: null });
  expect(getStockValidityManualMode(automatic)).toBe("AUTO");
  expect(getStockApplicabilityTypes(automatic)).toEqual(["JANGADAS"]);
  expect(stripStockMetadataToken(automatic)).toBe("Notes");
  expect(stockItemSupportsValidity({ descricao: "Paddle", observacoes: automatic })).toBe(false);
});

test.each(["L-HORA", "ES123", "A10", "B10", "A8"])("resource %s never acquires validity", referencia => {
  expect(stockItemSupportsValidity({ referencia, descricao: "Hand flare", validadeAplicavelManual: "SIM" })).toBe(false);
  expect(stockItemSupportsValidity({ referencia, observacoes: upsertStockMetadataInObservacoes("", { validadeAplicavel: true }) })).toBe(false);
});
