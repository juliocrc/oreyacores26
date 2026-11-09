import React from "react";
import JangadaWizardLoader from "./JangadaWizardLoader";
import { useJangadaWizardStore } from "./store/useJangadaWizardStore";

jest.mock("./store/useJangadaWizardStore", () => ({ useJangadaWizardStore: jest.fn() }));

test("stock loading preserves the API station scope instead of treating every row as general", async () => {
  const setGlobalStock = jest.fn();
  const setInspectionData = jest.fn();
  (useJangadaWizardStore as unknown as jest.Mock).mockReturnValue({
    initializeWizard: jest.fn(), setStepByKey: jest.fn(), setInspectionData, setGlobalStock,
  });
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null } });
  const effects: Array<() => void> = [];
  jest.spyOn(React, "useState").mockImplementation(() => [true, jest.fn()] as any);
  jest.spyOn(React, "useEffect").mockImplementation(effect => { effects.push(effect as () => void); });
  jest.spyOn(globalThis, "fetch").mockImplementation(async input => {
    const url = String(input);
    const body = url === "/api/stock?includeFoto=true" ? { items: [
      { id: 1, serviceStationId: 7, foto: '/catalog/water.jpg' },
      { id: 2, serviceStationId: null },
      { id: 3, stationId: 8 },
      { id: 4, serviceStationId: 7, stationId: 8 },
    ] } : url.startsWith("/api/jangadas/") ? { id: 5 } : [{ id: 40, status: "Draft" }];
    return { ok: true, json: async () => body } as Response;
  });
  try {
    JangadaWizardLoader({ jangadaId: 5, children: null });
    effects.forEach(effect => effect());
    await new Promise(resolve => setImmediate(resolve));
    const expected = expect.arrayContaining([
      expect.objectContaining({ id: 1, stationId: 7, foto: '/catalog/water.jpg' }),
      expect.objectContaining({ id: 2, stationId: null }),
      expect.objectContaining({ id: 3, stationId: 8 }),
      expect.objectContaining({ id: 4, stationId: 7 }),
    ]);
    expect(setGlobalStock).toHaveBeenCalledWith(expected);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/stock?includeFoto=true');
    expect(setInspectionData).toHaveBeenCalledWith({ globalStock: expected });
  } finally {
    jest.restoreAllMocks();
    if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
