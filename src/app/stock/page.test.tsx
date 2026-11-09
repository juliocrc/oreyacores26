import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import StockPage from "./page";
import DataTable from "@/components/shared/DataTable";
import type { ItemStock } from "@/types/stock-page";
import StockValiditySelect from "@/components/stock/StockValiditySelect";
import { compressStockPhoto } from "@/lib/compress-stock-photo";

jest.mock("@/lib/compress-stock-photo", () => ({ compressStockPhoto: jest.fn(async file => file) }));

jest.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { role: "ADMIN" } } }) }));
let mockQuery = "";
jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(mockQuery) }));
jest.mock("jsbarcode", () => jest.fn());
jest.mock("qrcode", () => ({ toDataURL: jest.fn() }));

const items: ItemStock[] = [
  { id: 1, nome: "Part", referencia: "PART", quantidade: 2, quantidadeMinima: 5, precoVenda: 10 },
  { id: 2, nome: "Resource", referencia: "L-HORA", quantidade: 99, quantidadeMinima: 100, precoVenda: 75, localizacao: "Resource-only" },
  { id: 3, nome: "Service", referencia: "ES123", quantidade: 0, precoVenda: 30 },
];

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);
}

function harness() {
  const states: unknown[] = [];
  let index = 0;
  let refIndex = 0;
  const refs: { current: unknown }[] = [];
  let effects: React.EffectCallback[] = [];
  jest.spyOn(React, "useState").mockImplementation(((initial: unknown) => {
    const current = index++;
    if (!(current in states)) states[current] = typeof initial === "function" ? initial() : initial;
    return [states[current], (value: unknown) => { states[current] = typeof value === "function" ? value(states[current]) : value; }];
  }) as typeof React.useState);
  jest.spyOn(React, "useRef").mockImplementation((initial => {
    const current = refIndex++;
    return refs[current] ||= { current: initial };
  }) as typeof React.useRef);
  jest.spyOn(React, "useEffect").mockImplementation(effect => { effects.push(effect); });
  jest.spyOn(React, "useMemo").mockImplementation(factory => factory());
  jest.spyOn(React, "useCallback").mockImplementation(callback => callback);
  const content = StockPage().props.children.type;
  const render = () => { index = 0; refIndex = 0; effects = []; return content(); };
  render();
  states[0] = true;
  states[1] = items;
  const tree = () => elements(render());
  const table = () => tree().find(el => el.type === DataTable)!.props;
  const choose = (label: string) => {
    const candidates = tree().filter(el => el.type === "button" && el.props.children === label);
    (candidates.find(el => typeof el.props["aria-pressed"] === "boolean") || candidates[0]).props.onClick();
  };
  const effect = (text: string) => {
    render();
    const matches = effects.filter(callback => callback.toString().includes(text));
    expect(matches).toHaveLength(1);
    return matches[0]();
  };
  return { render, tree, table, choose, effect, states };
}

afterEach(() => {
  jest.restoreAllMocks(); jest.useRealTimers(); mockQuery = "";
  Reflect.deleteProperty(global, "window");
  Reflect.deleteProperty(global, "FileReader");
});

it("filters Todos/Peças/Recursos independently of the existing scope and preserves prices", () => {
  const page = harness();
  expect(page.table().data).toHaveLength(3);
  page.choose("Peças");
  expect(page.table().data.map((item: ItemStock) => item.id)).toEqual([1]);
  page.choose("Recursos");
  expect(page.table().data.map((item: ItemStock) => item.id).sort()).toEqual([2, 3]);
  const price = page.table().columns.find((col: any) => col.key === "precoVenda");
  expect(price.accessor(items[1])).toBe(75);
  page.choose("Todos");
  expect(page.table().data).toHaveLength(3);
});

it("replaces resource quantities with a badge and hides stock operations, locations and needs", () => {
  const page = harness();
  const table = page.table();
  const column = (key: string) => table.columns.find((col: any) => col.key === key);
  expect(renderToStaticMarkup(column("quantidade").render(items[1]))).toContain("Recurso sem controlo stock");
  for (const key of ["quantidadeMinima", "prateleira", "necessidade12m", "saldoProjetado12m", "necessidadeMensal"]) {
    expect(column(key).render(items[1])).toBe("Não aplicável");
  }
  const actions = renderToStaticMarkup(table.rowActions(items[1]));
  expect(actions).not.toContain("+1");
  expect(actions).not.toContain(">-1<");
  expect(actions).toContain("Ficha");
  expect(renderToStaticMarkup(table.rowActions(items[0]))).toContain("+1");
});

it("keeps resource drafts free of required quantities and lots while retaining commercial inputs", () => {
  const page = harness();
  const table = page.table();
  table.onRowClick(items[1]);
  page.choose("Editar todos os dados");
  const quantity = page.tree().find(el => el.type === "input" && el.props.name === "quantidade")!;
  expect(quantity.props.disabled).toBe(true);
  page.choose("Comercial");
  const tree = page.tree();
  expect(tree.find(el => el.type === "input" && el.props.name === "precoVenda")!.props.value).toBe(75);
  expect(tree.find(el => el.type === "input" && el.props.name === "lote")!.props.disabled).toBe(true);
});

it("restricts low-stock filtering to parts and clears incompatible filters when choosing resources", () => {
  const page = harness();
  const lowStock = page.tree().find(el => el.type === "input" && el.props.type === "checkbox" && el.props.onChange?.toString().includes("setFiltroStockBaixo"));
  expect(lowStock).toBeDefined();
  lowStock!.props.onChange({ target: { checked: true } });
  expect(page.table().data.map((item: ItemStock) => item.id)).toEqual([1]);
  page.choose("Recursos");
  expect(page.table().data).toHaveLength(2);
});

it.each(["Quadros", "Detalhes", "Matriz"])("shows the resource badge in %s without valuing legacy resource quantities as physical stock", mode => {
  const page = harness();
  page.choose(mode);
  page.choose("Recursos");
  const html = renderToStaticMarkup(page.render());
  expect(html).toContain("Recurso sem controlo stock");
  expect(html).not.toContain("99 un");
  expect(html).not.toContain("7.425");
  expect(html).not.toContain(">+1<");
  expect(html).not.toContain(">-1<");
  if (mode !== "Matriz") expect(html).toContain("75.00");
});

it("counts only parts in mixed-catalog matrix physical totals", () => {
  const page = harness();
  page.choose("Matriz");
  const html = renderToStaticMarkup(page.render());
  expect(html).toContain("2 un");
  expect(html).not.toContain("101 un");
  expect(html).not.toContain("7.445");
});

function editName(page: ReturnType<typeof harness>, value: string) {
  page.tree().find(el => el.type === "input" && el.props.name === "nome")!.props.onChange({ target: { name: "nome", value, type: "text" } });
  page.effect("draftsRef.current[fichaDraft.id]");
}

async function settle() { for (let i = 0; i < 15; i++) await Promise.resolve(); }

function browser() {
  jest.useFakeTimers();
  Object.defineProperty(global, "window", { configurable: true, value: { setTimeout, clearTimeout } });
  jest.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
  jest.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
}

it("does not reopen a query modal after closing, a list refresh or photo hydration", async () => {
  browser();
  mockQuery = "id=1";
  const page = harness();
  page.effect("openedQueryRef");
  expect(page.tree().some(el => el.type === "button" && el.props.children === "Fechar")).toBe(true);
  page.choose("Fechar");
  page.states[1] = [...items];
  page.effect("openedQueryRef");
  expect(page.tree().some(el => el.type === "button" && el.props.children === "Fechar")).toBe(false);
});

it("serializes debounced edits, omits photos, preserves new typing and saves after closing", async () => {
  browser();
  let resolve!: (value: Response) => void;
  const fetchMock = jest.spyOn(global, "fetch").mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }))
    .mockResolvedValue({ ok: true, json: async () => ({ ...items[0], nome: "Latest" }) } as Response);
  const page = harness();
  page.table().onRowClick({ ...items[0], foto: "data:image/png;base64,large" });
  page.choose("Editar todos os dados");
  editName(page, "First");
  jest.advanceTimersByTime(500);
  await settle();
  editName(page, "Latest");
  jest.advanceTimersByTime(500);
  await settle();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).not.toHaveProperty("foto");
  resolve({ ok: true, json: async () => ({ ...items[0], nome: "First" }) } as Response);
  await settle();
  expect(page.tree().find(el => el.type === "input" && el.props.name === "nome")!.props.value).toBe("Latest");
  page.choose("Fechar");
  await settle();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(page.tree().some(el => el.props.children === "Fechar")).toBe(false);
});

it("retains failed edits when the ficha is closed and reopened", async () => {
  browser();
  jest.spyOn(global, "fetch").mockRejectedValue(new Error("offline"));
  const page = harness();
  page.table().onRowClick(items[0]);
  page.choose("Editar todos os dados");
  editName(page, "Unsaved typing");
  page.choose("Fechar");
  jest.advanceTimersByTime(500);
  await settle();
  page.table().onRowClick(items[0]);
  expect(page.tree().find(el => el.type === "input" && el.props.name === "nome")!.props.value).toBe("Unsaved typing");
});

it("previews a pasted photo immediately and rolls it back after upload failure", async () => {
  browser();
  let reject!: (error: Error) => void;
  jest.spyOn(global, "fetch").mockImplementation(() => new Promise((_done, fail) => { reject = fail; }));
  const readers: any[] = [];
  Object.defineProperty(global, "FileReader", { configurable: true, value: class {
    result = "data:image/png;base64,new"; onload = () => {}; abort() {} readAsDataURL() { readers.push(this); }
  } });
  const listeners: Record<string, Function> = {};
  Object.assign(window, { addEventListener: (name: string, callback: Function) => { listeners[name] = callback; }, removeEventListener: jest.fn() });
  const page = harness();
  page.table().onRowClick({ ...items[0], foto: "/old.jpg" });
  page.effect('addEventListener("paste"');
  listeners.paste({ clipboardData: { items: [{ type: "image/png", getAsFile: () => ({ type: "image/png" }) }] }, preventDefault: jest.fn() });
  expect(page.tree().find(el => el.type === "img")!.props.src).toBe("blob:preview");
  await settle();
  readers[0].onload();
  expect(page.tree().find(el => el.type === "img")!.props.src).toBe("data:image/png;base64,new");
  await settle();
  reject(new Error("failed upload"));
  await settle();
  expect(page.tree().find(el => el.type === "img")!.props.src).toBe("/old.jpg");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
});

it("exposes editable manual validity in the ficha", () => {
  const page = harness();
  page.table().onRowClick(items[0]);
  page.choose("Editar todos os dados");
  const select = page.tree().find(el => el.type === StockValiditySelect)!;
  select.props.onChange('[[STOCK_META:{"validadeAplicavel":false}]]');
  expect(page.tree().find(el => el.type === StockValiditySelect)!.props.item.observacoes).toContain('"validadeAplicavel":false');
});

it("ignores an obsolete file read and cannot apply its photo to another article", async () => {
  browser();
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
  const readers: any[] = [];
  const abort = jest.fn();
  Object.defineProperty(global, "FileReader", { configurable: true, value: class {
    result = `data:image/png;base64,${readers.length}`; onload = () => {}; abort = abort;
    readAsDataURL() { readers.push(this); }
  } });
  const listeners: Record<string, Function> = {};
  Object.assign(window, { addEventListener: (name: string, callback: Function) => { listeners[name] = callback; }, removeEventListener: jest.fn() });
  const page = harness();
  page.table().onRowClick(items[0]);
  page.effect('addEventListener("paste"');
  const paste = () => listeners.paste({ clipboardData: { items: [{ type: "image/png", getAsFile: () => ({ type: "image/png" }) }] }, preventDefault: jest.fn() });
  paste(); await settle(); paste(); await settle();
  expect(abort).toHaveBeenCalledTimes(1);
  readers[1].onload();
  readers[0].onload();
  expect(page.tree().find(el => el.type === "img")!.props.src).toBe("data:image/png;base64,1");
  page.table().onRowClick(items[1]);
  await settle();
  expect(page.tree().some(el => el.type === "img")).toBe(false);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

it("reads only the compressed blob and releases previews when superseded or unmounted", async () => {
  browser();
  const upload = jest.spyOn(global, "fetch");
  jest.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
  let finish!: (blob: Blob) => void;
  const compressed = new Blob(["small"], { type: "image/webp" });
  jest.mocked(compressStockPhoto).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce(compressed);
  const read = jest.fn();
  const abort = jest.fn();
  const readers: any[] = [];
  Object.defineProperty(global, "FileReader", { configurable: true, value: class {
    abort = abort; readAsDataURL = read; result = "data:image/webp;base64,small";
    constructor() { readers.push(this); }
  } });
  const listeners: Record<string, Function> = {};
  Object.assign(window, { addEventListener: (name: string, callback: Function) => { listeners[name] = callback; }, removeEventListener: jest.fn() });
  const page = harness();
  const unmount = page.effect("photoDisposedRef")!;
  page.table().onRowClick(items[0]);
  page.effect('addEventListener("paste"');
  const paste = () => listeners.paste({ clipboardData: { items: [{ type: "image/png", getAsFile: () => ({ type: "image/png" }) }] }, preventDefault: jest.fn() });
  paste(); paste();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:first");
  await settle();
  finish(new Blob(["obsolete"]));
  await settle();
  expect(read).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith(compressed);
  unmount();
  expect(abort).toHaveBeenCalledTimes(1);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:second");
  await readers[0].onload();
  expect(upload).not.toHaveBeenCalled();
});
