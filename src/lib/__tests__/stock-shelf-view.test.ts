import { availableShelfQuantity, buildShelfView, formatShelfAvailability } from "../stock-shelf-view";

describe("shelf display grouping", () => {
  it("excludes resources from locations, missing locations, search and availability", () => {
    const items = [
      { id: 1, referencia: "L-HORA", localizacao: "Resource-only", quantidade: 100 },
      { id: 2, referencia: " es123 ", quantidade: 0 },
      { id: 3, referencia: "ES456", localizacao: "A2", quantidade: 70 },
      { id: 4, referencia: "PART", localizacao: "A2", quantidade: 3, unit: "un" },
    ];
    const before = JSON.stringify(items);
    const groups = buildShelfView(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map(item => item.id)).toEqual([4]);
    expect(groups[0].availability).toEqual([{ unit: "un", quantity: 3 }]);
    expect(buildShelfView(items, "ES456")).toEqual([]);
    expect(JSON.stringify(items)).toBe(before);
  });
  it("naturally sorts recorded locations without mapping aliases or inventing shelves", () => {
    const items = ["A10", "A2", "P02", "A-2", null, " ", "Oficina"].map((localizacao, id) => ({ id, localizacao }));
    const before = JSON.stringify(items);
    expect(buildShelfView(items).map(group => group.location)).toEqual(["A-2", "A2", "A10", "Oficina", "P02", ""]);
    expect(buildShelfView(items).at(-1)?.items).toHaveLength(2);
    expect(JSON.stringify(items)).toBe(before);
    expect(buildShelfView([])).toEqual([]);
  });

  it("counts distinct referenced products across lots and keeps units separate", () => {
    const group = buildShelfView([
      { id: 1, referencia: "REF", lote: "10", localizacao: "A2", quantidade: 10, quantidadeReservada: 3, unit: "un" },
      { id: 2, referencia: "REF", lote: "2", localizacao: "A2", quantidade: 5, quantidadeReservada: 1, unit: "un" },
      { id: 3, referencia: "ROPE", localizacao: "A2", quantidade: 2.5, quantidadeReservada: 0.5, unit: "m" },
      { id: 4, localizacao: "A2", quantidade: 3 },
    ])[0];
    expect(group.productCount).toBe(3);
    expect(group.items.map(item => item.id)).toEqual([4, 2, 1, 3]);
    expect(group.availability).toEqual([{ unit: "m", quantity: 2 }, { unit: "un", quantity: 11 }, { unit: "unidade não indicada", quantity: 3 }]);
    expect(formatShelfAvailability(group.availability)).toBe("2 m · 11 un · 3 unidade não indicada");
  });

  it.each([
    [{ quantidade: 7, quantidadeReservada: 2 }, 5],
    [{ quantidade: 2, quantidadeReservada: 9 }, 0],
    [{ quantidade: -3, quantidadeReservada: 1 }, 0],
    [{ quantidade: 3, quantidadeReservada: -2 }, 3],
    [{ quantidade: null, quantidadeReservada: null }, 0],
    [{ quantidade: NaN, quantidadeReservada: Infinity }, 0],
  ])("handles missing, reserved and negative quantities: %j", (item, expected) => {
    expect(availableShelfQuantity({ id: 1, ...item })).toBe(expected);
  });

  it.each(["ref-2", "sinalizacao", "batch-10", "a10", "REF-2 A10 batch-10"])("searches reference, description, lot and location: %s", query => {
    const items = [{ id: 1, referencia: "REF-2", descricao: "Sinalização", lote: "BATCH-10", localizacao: "A10" }, { id: 2, nome: "Other", localizacao: "A2" }];
    expect(buildShelfView(items, query).flatMap(group => group.items.map(item => item.id))).toEqual([1]);
    expect(buildShelfView(items, "not-present")).toEqual([]);
  });
});
