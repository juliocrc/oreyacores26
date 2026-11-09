import { isLowPhysicalStock, isPhysicalStockItem, matchesStockCatalogKind } from "../stock-page-helpers";

describe("catalog parts and resources", () => {
  it.each(["L-HORA", " l-test ", "ES123", " es001 "])("excludes resource %s from physical stock even with legacy quantities", referencia => {
    const item = { referencia, quantidade: 20, quantidadeMinima: 50, precoVenda: 75 };
    expect(isPhysicalStockItem(item)).toBe(false);
    expect(isLowPhysicalStock(item)).toBe(false);
    expect(matchesStockCatalogKind(item, "all")).toBe(true);
    expect(matchesStockCatalogKind(item, "resources")).toBe(true);
    expect(matchesStockCatalogKind(item, "parts")).toBe(false);
    expect(item.precoVenda).toBe(75);
  });

  it.each(["ES12A", "ES", "L123", "30202084", ""])("keeps physical part %s", referencia => {
    const item = { referencia, quantidade: 0, quantidadeMinima: 2 };
    expect(isPhysicalStockItem(item)).toBe(true);
    expect(isLowPhysicalStock(item)).toBe(true);
    expect(matchesStockCatalogKind(item, "parts")).toBe(true);
    expect(matchesStockCatalogKind(item, "resources")).toBe(false);
  });

  it("preserves the minimum threshold and optional minimum for parts", () => {
    expect(isLowPhysicalStock({ quantidade: 2, quantidadeMinima: 2 })).toBe(true);
    expect(isLowPhysicalStock({ quantidade: 3, quantidadeMinima: 2 })).toBe(false);
    expect(isLowPhysicalStock({ quantidade: 0 })).toBe(false);
  });
});
