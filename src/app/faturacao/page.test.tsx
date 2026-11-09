import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Page from "./page";
import OfficialInvoiceCompose from '@/components/shared/OfficialInvoiceCompose';

jest.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { role: "ADMIN" } }, status: "authenticated" }) }));
jest.mock("@/hooks/useDebounce", () => ({ useDebounce: (value: unknown) => value }));
jest.mock("@/hooks/useUnsavedChanges", () => ({ useUnsavedChanges: () => ({ confirmLeave: () => true }) }));
jest.mock("@/lib/use-whatsapp-allowed", () => ({ useWhatsAppAllowed: () => ({ allowed: false }) }));
jest.mock("react-chartjs-2", () => ({ Bar: () => null, Doughnut: () => null }));
jest.mock("chart.js", () => ({ Chart: { register: jest.fn() } }));

const recipient = { nome: "Cliente real", nif: "123456789", morada: "Rua real", localidade: "Horta", ilha: "Faial" };
const order = { id: 2307, numeroOrdem: "OS2026-0024", status: "concluida", orcamentoStatus: "Aprovado", updatedAt: "2026-10-26T12:00:00Z",
  valorPecas: 10, valorMaoObra: 0, valorDesconto: 0, isIsentoIva: true, cliente: { id: 17 },
  metadados: { linhas: [{ id: "service", referencia: "ES", descricao: "Servico", quantidade: 1, unitPrice: 10, total: 10, source: "service" }] },
};

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  return React.Children.toArray(node).flatMap(child => React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);
}

// Run the actual handlers and effects without a browser or external services.
function harness(locked = false, invoices: any[] = []) {
  const loadedOrder = invoices.length ? { ...order, metadados: { ...order.metadados, faturaId: invoices[0].id, faturaNumero: invoices[0].numeroFatura } } : order;
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
  jest.spyOn(React, "useEffect").mockImplementation((fn, deps) => {
    const index = cursor++;
    if (!slots[index] || changed(slots[index].deps, deps as any[])) {
      slots[index]?.cleanup?.();
      slots[index] = { deps };
      effects.push(() => { slots[index].cleanup = fn(); });
    }
  });
  const fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    const path = String(url);
    if (path.endsWith("/destinatario")) return { ok: true, json: async () => ({ destinatario: recipient, locked, updatedAt: order.updatedAt }) } as Response;
    if (path.startsWith("/api/faturas")) return { ok: true, json: async () => ({ faturas: invoices }) } as Response;
    if (path.includes("apoio-orcamento")) return { ok: true, json: async () => ({ stock: [] }) } as Response;
    if (path.endsWith("/faturar")) return { ok: true, json: async () => ({ fatura: { id: 100, numeroFatura: "FO102600098" }, numeroFatura: "FO102600098" }) } as Response;
    if (options?.method) return { ok: true, json: async () => ({ ...order, ...JSON.parse(String(options.body)) }) } as Response;
    return { ok: true, json: async () => [loadedOrder] } as Response;
  });
  let node: React.ReactNode;
  const render = () => { cursor = 0; effects = []; node = Page(); effects.forEach(fn => fn()); return node; };
  const settle = async () => { for (let i = 0; i < 10; i++) { render(); await Promise.resolve(); } return render(); };
  const click = async (text: string) => {
    const button = elements(render()).find(el => el.type === "button" && renderToStaticMarkup(<>{el.props.children}</>).replace(/<[^>]*>/g, "").trim() === text);
    expect(button).toBeDefined();
    expect(button!.props.disabled).not.toBe(true);
    await button!.props.onClick();
  };
  return { render, settle, click, fetchMock, tree: () => elements(render()) };
}

afterEach(() => jest.restoreAllMocks());

test("loads the real recipient, edits quantity/price, adds and removes a billable resource and saves canonical lines", async () => {
  const ui = harness();
  await ui.settle();
  expect(renderToStaticMarkup(ui.render())).toContain("Rua real");
  const row = ui.tree().find(el => el.type === "tr" && elements(el).some(input => input.type === "input" && input.props.value === "ES"))!;
  const inputs = elements(row).filter(el => el.type === "input");
  inputs[2].props.onChange({ target: { value: "3" } });
  const updatedRow = ui.tree().find(el => el.type === "tr" && elements(el).some(input => input.type === "input" && input.props.value === "ES"))!;
  elements(updatedRow).filter(el => el.type === "input")[3].props.onChange({ target: { value: "12.50" } });
  expect(renderToStaticMarkup(ui.render())).toContain("37.50");
  await ui.click("Adicionar Linha");
  const description = ui.tree().find(el => el.type === "input" && el.props.placeholder === "Ex: Colete Coleman size 5")!;
  description.props.onChange({ target: { value: "Recurso A8/10" } });
  ui.tree().find(el => el.type === "input" && el.props.placeholder === "REF-001")!.props.onChange({ target: { value: "A8/10" } });
  await ui.click("Adicionar");
  expect(renderToStaticMarkup(ui.render())).toContain("Recurso A8/10");
  const addedRow = ui.tree().find(el => el.type === "tr" && elements(el).some(input => input.type === "input" && input.props.value === "Recurso A8/10"))!;
  elements(addedRow).find(el => el.type === "button" && el.props.title === "Remover linha")!.props.onClick();
  await ui.click("Guardar valores e linhas");
  expect(ui.fetchMock).toHaveBeenCalledWith("/api/ordens-servico/2307", expect.objectContaining({ method: "PATCH", body: expect.stringContaining('"total":37.5') }));
  expect(ui.fetchMock.mock.calls.some(([url]) => /stock.*(consum|moviment)/.test(String(url)))).toBe(false);
  const register = ui.tree().find(el => el.type === "button" && renderToStaticMarkup(<>{el.props.children}</>).includes("Registar fatura"));
  expect(register).toBeDefined();
  expect(renderToStaticMarkup(ui.render())).toContain("sticky top-0");
});

test("an issued invoice locks recipient and hides article editing", async () => {
  const ui = harness(true);
  await ui.settle();
  expect(ui.tree().find(el => el.type === "fieldset" && renderToStaticMarkup(<>{el.props.children}</>).includes("Destinatario de faturacao"))!.props.disabled).toBe(true);
  expect(renderToStaticMarkup(ui.render())).not.toContain("Adicionar Linha");
});

test("registration requires confirmation, saves before issuing, and disables duplicate registration", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const confirm = jest.fn().mockReturnValue(false);
  Object.defineProperty(globalThis, "window", { configurable: true, value: { confirm, open: jest.fn() } });
  try {
    const ui = harness();
    await ui.settle();
    await ui.click("Registar fatura");
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("123456789"));
    expect(ui.fetchMock.mock.calls.filter(([, options]) => options?.method)).toHaveLength(0);
    confirm.mockReturnValue(true);
    await ui.click("Registar fatura");
    const writes = ui.fetchMock.mock.calls.filter(([, options]) => options?.method);
    expect(writes.map(([url]) => url)).toEqual([
      "/api/ordens-servico/2307/destinatario", "/api/ordens-servico/2307", "/api/ordens-servico/2307/faturar",
    ]);
    expect(renderToStaticMarkup(ui.render())).toContain("FO102600098");
    expect(ui.tree().find(el => el.type === "button" && renderToStaticMarkup(<>{el.props.children}</>).includes("Fatura registada"))!.props.disabled).toBe(true);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

const invoice = { id: 100, numeroFatura: "FT1026000001", numeroFaturaOficial: "NAV-OLD", updatedAt: "2026-10-26T12:00:00.000Z",
  valorTotal: 10, valorPago: 0, valorPendente: 10, pagamentoStatus: "Pendente", ordemServicos: [{ id: order.id }] };

test("Navision cancel restores saved number and drops selected file without a write", async () => {
  const ui = harness(true, [invoice]);
  await ui.settle();
  await ui.click("Fatura / Navision");
  expect(renderToStaticMarkup(ui.render())).toContain("NAV-OLD");
  expect(renderToStaticMarkup(ui.render())).toContain("Referencia interna preservada: FT1026000001");
  await ui.click("Editar referencia / anexar PDF Navision");
  ui.tree().find(el => el.type === "input" && el.props.maxLength === 120)!.props.onChange({ target: { value: "UNSAVED" } });
  ui.tree().find(el => el.type === "input" && el.props.type === "file")!.props.onChange({ target: { files: [new File(["%PDF-"], "new.pdf")] } });
  await ui.click("Cancelar edicao Navision");
  await ui.click("Editar referencia / anexar PDF Navision");
  expect(ui.tree().find(el => el.type === "input" && el.props.maxLength === 120)!.props.value).toBe("NAV-OLD");
  expect(ui.fetchMock.mock.calls.filter(([, options]) => options?.method)).toHaveLength(0);
});

test("Navision save sends number and PDF together, locks while awaiting response and refreshes display", async () => {
  const ui = harness(true, [invoice]);
  await ui.settle();
  await ui.click("Fatura / Navision");
  await ui.click("Editar referencia / anexar PDF Navision");
  ui.tree().find(el => el.type === "input" && el.props.maxLength === 120)!.props.onChange({ target: { value: "NAV-NEW" } });
  ui.tree().find(el => el.type === "input" && el.props.type === "file")!.props.onChange({ target: { files: [new File(["%PDF-"], "official.pdf")] } });
  let resolve!: (response: Response) => void;
  ui.fetchMock.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
  await ui.click("Guardar dados Navision");
  const [url, options] = ui.fetchMock.mock.calls[ui.fetchMock.mock.calls.length - 1];
  expect(url).toBe("/api/faturas/100/oficial");
  const body = options!.body as FormData;
  expect(body.get("numeroFaturaOficial")).toBe("NAV-NEW");
  expect(body.get("expectedUpdatedAt")).toBe(invoice.updatedAt);
  expect((body.get("pdf") as File).name).toBe("official.pdf");
  expect(renderToStaticMarkup(ui.render())).toContain("A guardar Navision...");
  expect(ui.tree().find(el => el.type === "fieldset" && renderToStaticMarkup(<>{el.props.children}</>).includes("Fatura externa Navision"))!.props.disabled).toBe(true);
  resolve({ ok: true, json: async () => ({ id: 100, numeroFaturaOficial: "NAV-NEW", numeroFaturaDisplay: "NAV-NEW", updatedAt: "2026-10-26T13:00:00Z",
    pdfOficial: { filename: "official.pdf", size: 100, uploadedBy: "admin@test", uploadedAt: invoice.updatedAt, sha256: "digest" } }) } as Response);
  await ui.settle();
  expect(renderToStaticMarkup(ui.render())).toContain("NAV-NEW");
  expect(renderToStaticMarkup(ui.render())).toContain("PDF oficial Navision");
  expect(renderToStaticMarkup(ui.render())).not.toContain("Guardar dados Navision");
  expect(renderToStaticMarkup(ui.render())).toContain(invoice.numeroFatura);
});

test("failed Navision save retains draft and file, blank number cannot submit", async () => {
  const ui = harness(true, [invoice]);
  await ui.settle();
  await ui.click("Fatura / Navision");
  await ui.click("Editar referencia / anexar PDF Navision");
  ui.tree().find(el => el.type === "input" && el.props.maxLength === 120)!.props.onChange({ target: { value: " " } });
  expect(ui.tree().find(el => el.type === "button" && el.props.children === "Guardar dados Navision")!.props.disabled).toBe(true);
  ui.tree().find(el => el.type === "input" && el.props.maxLength === 120)!.props.onChange({ target: { value: "NAV-DRAFT" } });
  ui.fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Conflito: atualize a fatura." }) } as Response);
  await ui.click("Guardar dados Navision");
  await ui.settle();
  expect(renderToStaticMarkup(ui.render())).toContain("Conflito: atualize a fatura.");
  expect(ui.tree().find(el => el.type === "input" && el.props.maxLength === 120)!.props.value).toBe("NAV-DRAFT");
});

test('invoice communication actions are absent for internal or reference-only invoices', async () => {
  const ui = harness(true, [invoice]);
  await ui.settle();
  await ui.click('Fatura / Navision');
  expect(renderToStaticMarkup(ui.render())).not.toContain('Preparar email / WhatsApp da fatura oficial');
  expect(renderToStaticMarkup(ui.render())).not.toContain('Partilhar Fatura');
});

test('uploaded official invoice prepares contextual templates without any write or automatic send', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://portal.example.test' }, open: jest.fn() } });
  try {
    const ui = harness(true, [{ ...invoice, pdfOficial: { filename: 'official.pdf', size: 100, uploadedAt: invoice.updatedAt } }]);
    await ui.settle();
    await ui.click('Fatura / Navision');
    await ui.click('Preparar email / WhatsApp da fatura oficial');
    const compose = ui.tree().find(el => el.type === OfficialInvoiceCompose)!;
    expect(compose.props).toEqual(expect.objectContaining({ invoiceId: 100, officialNumber: 'NAV-OLD', portalUrl: 'https://portal.example.test/area-cliente#faturas' }));
    expect(ui.fetchMock.mock.calls.filter(([, options]) => options?.method)).toHaveLength(0);
    expect(window.open).not.toHaveBeenCalled();
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
