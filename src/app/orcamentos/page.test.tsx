import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Page from "./page";
import PublicPage from "@/app/public/orcamento/[id]/page";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { role: "ADMIN" } }, status: "authenticated" }) }));
jest.mock("@/hooks/useDebounce", () => ({ useDebounce: (value: unknown) => value }));
jest.mock("@/hooks/useUnsavedChanges", () => ({ useUnsavedChanges: () => ({ confirmLeave: () => true }) }));

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);
}

afterEach(() => jest.restoreAllMocks());

it("shows public quote percentages and unit prices without resurrecting fully discounted values", () => {
  const order = { id: 42, valorMaoObra: 20, valorDesconto: 5, isIsentoIva: false, metadados: { linhas: [
    { referencia: "REF", descricao: "Discounted", quantidade: 2, unitPrice: 20, descontoPercentual: 25, total: 30 },
    { descricao: "Free", quantidade: 1, unitPrice: 50, descontoPercentual: 100, total: 0 },
  ] } };
  jest.spyOn(React, "use").mockReturnValue({ id: "42" });
  jest.spyOn(React, "useState")
    .mockReturnValueOnce([false, jest.fn()])
    .mockReturnValueOnce([order, jest.fn()])
    .mockReturnValueOnce([null, jest.fn()]);
  jest.spyOn(React, "useEffect").mockImplementation(() => {});
  const html = renderToStaticMarkup(PublicPage({ params: Promise.resolve({ id: "42" }) }));
  expect(html).toContain("Desconto (%)");
  expect(html).toContain("Preço unitário");
  expect(html).toContain("25%");
  expect(html).toContain("100%");
  expect(html).toContain("€ 0.00");
  expect(html).toContain("€ 45.00");
  expect(html).toContain("€ 7.20");
  expect(html).toContain("€ 52.20");
});

it("edits quantity, unit price and percentage, adds discounted lines, saves and reopens", async () => {
  let order = { id: 42, numeroOrdem: "OT-42", orcamentoStatus: "Rascunho", updatedAt: "2026-10-26T12:00:00Z",
    valorMaoObra: 10, valorDesconto: 2, isIsentoIva: true,
    metadados: { linhas: [{ id: "a", referencia: "REF", descricao: "Servico", quantidade: 1, unitPrice: 10, total: 10, source: "service" }] },
  };
  const slots: any[] = [];
  let cursor = 0;
  let effects: Array<() => unknown> = [];
  jest.spyOn(React, "useState").mockImplementation(((initial: any) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], (value: any) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  }) as typeof React.useState);
  jest.spyOn(React, "useRef").mockImplementation(((initial: any) => {
    const index = cursor++;
    return slots[index] ?? (slots[index] = { current: initial });
  }) as typeof React.useRef);
  const changed = (previous: any[] | undefined, next: any[] | undefined) => !previous || !next || previous.length !== next.length || next.some((value, i) => value !== previous[i]);
  jest.spyOn(React, "useCallback").mockImplementation(((fn: any, deps: any[]) => {
    const index = cursor++;
    if (!slots[index] || changed(slots[index].deps, deps)) slots[index] = { fn, deps };
    return slots[index].fn;
  }) as typeof React.useCallback);
  jest.spyOn(React, "useMemo").mockImplementation(fn => fn());
  jest.spyOn(React, "useEffect").mockImplementation((fn, deps) => {
    const index = cursor++;
    if (!slots[index] || changed(slots[index].deps, deps as any[])) {
      slots[index] = { deps };
      effects.push(fn);
    }
  });
  const fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    if (String(url).startsWith("/api/stock")) return { ok: true, json: async () => [] } as unknown as Response;
    if (options?.method === "PATCH") {
      order = { ...order, ...JSON.parse(String(options.body)), metadados: { linhas: JSON.parse(String(options.body)).linhas } };
      return { ok: true, json: async () => order } as Response;
    }
    return { ok: true, json: async () => [order] } as Response;
  });
  const render = () => { cursor = 0; effects = []; const node = Page(); effects.forEach(fn => fn()); return node; };
  const tree = () => elements(render());
  const change = (label: string, value: string) => {
    const input = tree().find(el => el.type === "input" && el.props["aria-label"] === label);
    expect(input).toBeDefined();
    input!.props.onChange({ target: { value } });
  };
  const click = async (text: string) => {
    const button = tree().find(el => el.type === "button" && renderToStaticMarkup(<>{el.props.children}</>).replace(/<[^>]*>/g, "").trim() === text);
    expect(button).toBeDefined();
    await button!.props.onClick();
  };
  for (let i = 0; i < 10; i++) { render(); await Promise.resolve(); }
  await tree().find(el => el.type === "tr" && el.props.onClick)!.props.onClick();
  expect(tree().find(el => el.props["aria-label"] === "Desconto (%): Servico")!.props.value).toBe(0);
  change("Quantidade: Servico", "3");
  change("Preço unitário: Servico", "1.115");
  change("Desconto (%): Servico", "10");
  expect(renderToStaticMarkup(render())).toContain("3.01");
  await click("Adicionar linha");
  tree().find(el => el.type === "input" && el.props.placeholder === "Descrição")!.props.onChange({ target: { value: "Gratis" } });
  change("Preço unitário da nova linha", "50");
  change("Desconto (%) da nova linha", "100");
  await click("Adicionar");
  await click("Guardar alterações");
  const saved = JSON.parse(String(fetchMock.mock.calls.find(([, options]) => options?.method === "PATCH")![1]!.body));
  expect(saved).toMatchObject({ valorMaoObra: 10, valorDesconto: 2, linhas: [
    expect.objectContaining({ quantidade: 3, unitPrice: 1.115, descontoPercentual: 10, total: 3.01 }),
    expect.objectContaining({ descricao: "Gratis", unitPrice: 50, descontoPercentual: 100, total: 0 }),
  ] });
  await tree().find(el => el.type === "tr" && el.props.onClick)!.props.onClick();
  expect(tree().find(el => el.props["aria-label"] === "Desconto (%): Servico")!.props.value).toBe(10);
  expect(tree().find(el => el.props["aria-label"] === "Desconto (%): Gratis")!.props.value).toBe(100);
});
