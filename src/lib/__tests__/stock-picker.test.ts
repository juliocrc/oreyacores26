import {
  filterStockItems,
  formatStockOptionLabel,
  isClosureStockItem,
  isComponentStockItem,
  isHruStockItem,
  isLightStockItem,
  isVacuumBagStockItem,
  type StockPickerItem,
} from "@/lib/stock-picker";

const make = (overrides: Partial<StockPickerItem> & { id: number }): StockPickerItem => ({
  referencia: null,
  descricao: null,
  codigoFabricante: null,
  validade: null,
  lote: null,
  quantidade: 0,
  categoria: null,
  foto: null,
  ...overrides,
});

describe("filterStockItems", () => {
  const items: StockPickerItem[] = [
    make({ id: 1, referencia: "HRU-01", descricao: "Libertador hidrostático Hammar" }),
    make({ id: 2, referencia: "BAT-12", descricao: "Bateria de lítio" }),
    make({ id: 3, referencia: "VAL-7", descricao: "Válvula de alívio" }),
  ];

  it("devolve todos os artigos sem pesquisa", () => {
    expect(filterStockItems(items, "")).toHaveLength(3);
    expect(filterStockItems(items, "   ")).toHaveLength(3);
  });

  it("pesquisa sem acentos e sem distinguir maiúsculas", () => {
    expect(filterStockItems(items, "valvula").map((i) => i.id)).toEqual([3]);
    expect(filterStockItems(items, "LÍTIO").map((i) => i.id)).toEqual([2]);
  });

  it("pesquisa por referência, fabricante e categoria", () => {
    expect(filterStockItems(items, "HRU").map((i) => i.id)).toEqual([1]);
    expect(
      filterStockItems([make({ id: 9, codigoFabricante: "MM-99" })], "mm-99").map((i) => i.id),
    ).toEqual([9]);
    expect(
      filterStockItems([make({ id: 8, categoria: "Contentor" })], "contentor").map((i) => i.id),
    ).toEqual([8]);
  });

  it("devolve vazio quando nada corresponde", () => {
    expect(filterStockItems(items, "inexistente")).toEqual([]);
  });
});

describe("formatStockOptionLabel", () => {
  it("formata com quantidade disponível", () => {
    const item = make({ id: 1, referencia: "REF-1", descricao: "Peça", quantidade: 5 });
    expect(formatStockOptionLabel(item)).toBe("REF-1 - Peça (Qtd: 5)");
  });

  it("marca artigos sem stock", () => {
    const item = make({ id: 1, referencia: "REF-1", descricao: "Peça", quantidade: 0 });
    expect(formatStockOptionLabel(item)).toBe("REF-1 - Peça (Sem Stock)");
  });

  it("inclui a validade quando solicitado", () => {
    const item = make({
      id: 1,
      referencia: "REF-1",
      descricao: "Peça",
      quantidade: 3,
      validade: "2027-04-01",
    });
    expect(formatStockOptionLabel(item, { showValidade: true })).toBe(
      "REF-1 - Peça (Val: 04/2027) (Qtd: 3)",
    );
  });

  it("recorre ao id quando não há referência nem descrição", () => {
    expect(formatStockOptionLabel(make({ id: 42 }))).toBe("#42 (Sem Stock)");
  });
});

describe("predicados de categoria", () => {
  it("isHruStockItem reconhece HRU/libertador/hidrostático", () => {
    expect(isHruStockItem(make({ id: 1, descricao: "Libertador hidrostático" }))).toBe(true);
    expect(isHruStockItem(make({ id: 2, categoria: "HRU" }))).toBe(true);
    expect(isHruStockItem(make({ id: 3, descricao: "Válvula" }))).toBe(false);
  });

  it("isLightStockItem reconhece luzes e baterias", () => {
    expect(isLightStockItem(make({ id: 1, descricao: "Luz exterior" }))).toBe(true);
    expect(isLightStockItem(make({ id: 2, descricao: "Bateria de lítio" }))).toBe(true);
    expect(isLightStockItem(make({ id: 3, descricao: "HRU" }))).toBe(false);
  });

  it("isComponentStockItem reconhece válvulas/cilindros/mangueiras", () => {
    expect(isComponentStockItem(make({ id: 1, descricao: "Válvula de alívio" }))).toBe(true);
    expect(isComponentStockItem(make({ id: 2, categoria: "CILINDRO" }))).toBe(true);
    expect(isComponentStockItem(make({ id: 3, descricao: "Bateria" }))).toBe(false);
  });

  it("isClosureStockItem reconhece cintas/autocolantes/selos/saco de vácuo", () => {
    expect(isClosureStockItem(make({ id: 1, descricao: "Cinta de fecho" }))).toBe(true);
    expect(isClosureStockItem(make({ id: 2, descricao: "Saco de vácuo" }))).toBe(true);
    expect(isClosureStockItem(make({ id: 3, categoria: "Contentor" }))).toBe(true);
    expect(isClosureStockItem(make({ id: 4, descricao: "Válvula" }))).toBe(false);
  });

  it("isVacuumBagStockItem reconhece saco de vácuo (com/sem acentos)", () => {
    expect(isVacuumBagStockItem(make({ id: 1, descricao: "Saco de Vácuo" }))).toBe(true);
    expect(isVacuumBagStockItem(make({ id: 2, referencia: "VACUUM-BAG" }))).toBe(true);
    expect(isVacuumBagStockItem(make({ id: 3, descricao: "Cinta" }))).toBe(false);
  });
});
