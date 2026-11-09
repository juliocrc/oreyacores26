import React from "react";
import StockScannerPage from "./page";
import QrReaderModal from "@/components/shared/QrReaderModal";
import StockMovementHistory from "@/components/stock/StockMovementHistory";

jest.mock("@/components/shared/QrReaderModal", () => ({ __esModule: true, default: () => null }));

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<{ children?: React.ReactNode }>(child)
    ? [child, ...elements(child.props.children)] : []);
}
const item = { id: 41, referencia: "REF", descricao: "Agua", quantidade: 8, quantidadeReservada: 2, lote: "A" };
const fetchMock = jest.fn();
const originalFetch = global.fetch;

function page({ query = "LOT-A", selected = null as typeof item | null, qty = 1 } = {}) {
  const values = [query, false, selected, "", "", qty, "sub", false, 0];
  const setters = values.map(() => jest.fn());
  const state = jest.spyOn(React, "useState");
  values.forEach((value, index) => state.mockImplementationOnce(() => [value, setters[index]] as any));
  jest.spyOn(React, "useRef").mockImplementation((value: unknown) => ({ current: value }) as any);
  jest.spyOn(React, "useEffect").mockImplementation(() => {});
  const tree = elements(StockScannerPage());
  return { tree, setItem: setters[2], setError: setters[3], setQuery: setters[0], setHistoryRevision: setters[8] };
}
const response = (status: number, data: unknown) => ({ ok: status < 300, status, json: async () => data });
const flush = () => new Promise(resolve => setImmediate(resolve));

beforeEach(() => { fetchMock.mockReset(); global.fetch = fetchMock; });
afterEach(() => { jest.restoreAllMocks(); global.fetch = originalFetch; });

test.each([401, 403, 404, 409, 500])("lookup failure %s never falls back to first list result", async status => {
  fetchMock.mockResolvedValue(response(status, { error: "Codigo ambiguo ou indisponivel" }));
  const { tree, setItem, setError } = page();
  tree.find(el => el.type === "form")!.props.onSubmit({ preventDefault: jest.fn() });
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/stock/by-barcode?code=LOT-A", { cache: "no-store" });
  expect(setItem).toHaveBeenCalledTimes(1);
  expect(setItem).toHaveBeenCalledWith(null);
  expect(setError).toHaveBeenLastCalledWith("Codigo ambiguo ou indisponivel");
});
test("camera callback looks up raw code without navigation or automatic movement", async () => {
  fetchMock.mockResolvedValue(response(200, item));
  const { tree, setItem, setQuery } = page();
  tree.find(el => el.type === QrReaderModal)!.props.onScan("LOT-A");
  await flush();
  expect(setQuery).toHaveBeenCalledWith("LOT-A");
  expect(setItem).toHaveBeenLastCalledWith(item);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
test("movement posts a positive delta to the exact ID and displays server quantity", async () => {
  fetchMock.mockResolvedValue(response(200, { ...item, quantidade: 4 }));
  const { tree, setItem, setHistoryRevision } = page({ selected: item, qty: 2 });
  expect(tree.find(el => el.type === StockMovementHistory)!.props).toMatchObject({ stockId: item.id, revision: 0 });
  const button = tree.find(el => el.type === "button" && el.props.children?.includes?.("Aplicar Movimento"))!;
  button.props.onClick();
  button.props.onClick();
  await flush();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/stock/41/movimentos", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operacao: "saida", quantidade: 2 }),
  });
  expect(setItem).toHaveBeenLastCalledWith({ ...item, quantidade: 4 });
  expect(setHistoryRevision).toHaveBeenCalledTimes(1);
  expect(setHistoryRevision.mock.calls[0][0](3)).toBe(4);
});
test.each([0, -1, 1.2, NaN])("invalid movement quantity %s never sends a request", qty => {
  const { tree, setError } = page({ selected: item, qty });
  tree.find(el => el.type === "button" && el.props.children?.includes?.("Aplicar Movimento"))!.props.onClick();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(setError).toHaveBeenCalledWith("Indique uma quantidade inteira positiva.");
});
test("failed movement clears selection and cannot be automatically retried", async () => {
  fetchMock.mockResolvedValue(response(409, { error: "Stock insuficiente" }));
  const { tree, setItem, setError, setHistoryRevision } = page({ selected: item });
  tree.find(el => el.type === "button" && el.props.children?.includes?.("Aplicar Movimento"))!.props.onClick();
  await flush();
  expect(setItem).toHaveBeenLastCalledWith(null);
  expect(setError).toHaveBeenLastCalledWith("Stock insuficiente");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(setHistoryRevision).not.toHaveBeenCalled();
});
