import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MarinhaJangadasSection from "./MarinhaJangadasSection";
import type { MarinhaRaft } from "@/lib/marinha-associations";

const raft: MarinhaRaft = { id: 9, serial: "5017210100018", brand: "RFD", model: "SURVIVA", capacity: 25, shipId: null, shipNameManual: "", serviceStationId: 1, dataFabrico: "", dataProxInspecao: "" };

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);
}

function section({ rows = [raft], loading = false, query = "", selected = "", error = null, shipId = 710, canAssociate = true }: {
  rows?: MarinhaRaft[]; loading?: boolean; query?: string; selected?: string; error?: string | null; shipId?: number; canAssociate?: boolean;
} = {}) {
  const states = [rows, shipId, canAssociate, loading, selected, query, false, error, null, 1];
  const setters = states.map(() => jest.fn());
  const useState = jest.spyOn(React, "useState");
  states.forEach((value, index) => useState.mockImplementationOnce(() => [value, setters[index]] as any));
  jest.spyOn(React, "useEffect").mockImplementation(() => {});
  const node = MarinhaJangadasSection({ navioNumero: "F330", navioNome: "Vasco da Gama" });
  return { node, tree: elements(node), setters };
}

afterEach(() => jest.restoreAllMocks());

it("finds the requested serial with whitespace and clears a stale selection when searching", () => {
  const { tree, setters } = section({ query: " 5017210100018 " });
  expect(tree.some(el => el.type === "option" && el.props.value === 9)).toBe(true);
  tree.find(el => el.type === "input")!.props.onChange({ target: { value: "other" } });
  expect(setters[4]).toHaveBeenCalledWith("");
  expect(setters[5]).toHaveBeenCalledWith("other");
});

it("shows persisted links by shipId even with an empty manual name", () => {
  const { node, tree } = section({ rows: [{ ...raft, shipId: 710 }] });
  expect(renderToStaticMarkup(node)).toContain("5017210100018");
  expect(tree.some(el => el.type === "button" && el.props.title === "Desassociar jangada")).toBe(true);
  expect(tree.some(el => el.type === "option" && el.props.value === 9)).toBe(false);
});

it("leaves exact legacy links selectable for an intentional migration", () => {
  const { tree } = section({ rows: [{ ...raft, shipNameManual: "F330 - Vasco da Gama" }] });
  const option = tree.find(el => el.type === "option" && el.props.value === 9)!;
  expect(React.Children.toArray(option.props.children).join("")).toContain("Confirmar associacao antiga");
});

it("shows current persisted ownership instead of stale manual text", () => {
  const { node } = section({ rows: [{ ...raft, shipId: 42, linkedShipName: "Outro navio real", shipNameManual: "Vasco da Gama" }] });
  const html = renderToStaticMarkup(node);
  expect(html).toContain("Outro Navio: Outro navio real");
  expect(html).toContain("Nenhuma jangada associada");
});

it("shows loading, empty search, and retryable errors distinctly", () => {
  let result = section({ loading: true });
  expect(renderToStaticMarkup(result.node)).toContain("A carregar jangadas");
  expect(result.tree.find(el => el.type === "select")!.props.disabled).toBe(true);
  jest.restoreAllMocks();
  result = section({ query: "missing" });
  expect(renderToStaticMarkup(result.node)).toContain("Nenhuma jangada disponivel corresponde");
  jest.restoreAllMocks();
  result = section({ rows: [], error: "Sessao obrigatoria." });
  expect(renderToStaticMarkup(result.node)).toContain("Sessao obrigatoria.");
  expect(renderToStaticMarkup(result.node)).toContain("Tentar novamente");
});

it("disables all mutations without jangada edit permission", () => {
  const { tree } = section({ rows: [{ ...raft, shipId: 710 }], selected: "9", canAssociate: false });
  expect(tree.filter(el => el.type === "button" && el.props.title === "Desassociar jangada").every(el => el.props.disabled)).toBe(true);
  expect(tree.find(el => el.type === "select")!.props.disabled).toBe(true);
});

it.each(["5017210100016", "5017210100018"])("shows unassigned-station serial %s with a transfer diagnostic", serial => {
  const { node, tree } = section({ rows: [{ ...raft, serial, serviceStationId: null, requiresStationTransfer: true }], query: serial });
  expect(tree.some(el => el.type === "option" && el.props.value === 9)).toBe(true);
  expect(renderToStaticMarkup(node)).toContain("Sem estacao: requer confirmacao");
});

it("preserves the loaded associations if refreshing fails", async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockRejectedValue(new Error("Ligacao indisponivel"));
  try {
    const { tree, setters } = section({ rows: [{ ...raft, shipId: 710 }] });
    tree.find(el => el.type === "button" && el.props.children === "Atualizar associacoes")!.props.onClick();
    await Promise.resolve();
    await Promise.resolve();
    expect(setters[0]).not.toHaveBeenCalled();
    expect(setters[7]).toHaveBeenCalledWith("Ligacao indisponivel");
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/navios/marinha?fresh="), { cache: "no-store" });
  } finally { global.fetch = originalFetch; }
});

it("requires station-transfer consent before posting a real ship association", async () => {
  const originalFetch = global.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(global, "window");
  const confirm = jest.fn().mockReturnValue(false);
  Object.defineProperty(global, "window", { configurable: true, value: { confirm } });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ navios: [{ id: 710, matricula: "F330" }], jangadas: [{ ...raft, shipId: 710 }], stationId: 1, canAssociate: true }) });
  try {
    const { tree } = section({ rows: [{ ...raft, serviceStationId: null, requiresStationTransfer: true }], selected: "9" });
    const button = tree.find(el => el.type === "button" && el.props.onClick?.name === "handleAssociar")!;
    await button.props.onClick();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Confirma a transferencia"));
    expect(global.fetch).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await button.props.onClick();
    const [url, options] = jest.mocked(global.fetch).mock.calls[0];
    expect(url).toBe("/api/navios/marinha");
    expect(JSON.parse(String(options?.body))).toMatchObject({ action: "associate", jangadaId: 9, numero: "F330", expectedServiceStationId: null, expectedActiveStationId: 1, confirmStationTransfer: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  } finally {
    global.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(global, "window", originalWindow);
    else Reflect.deleteProperty(global, "window");
  }
});
