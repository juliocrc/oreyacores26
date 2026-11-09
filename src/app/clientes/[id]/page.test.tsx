import React from "react";
import { useSession } from "next-auth/react";
import Page from "./page";

jest.mock("next-auth/react", () => ({ useSession: jest.fn() }));
jest.mock("next/navigation", () => ({ useParams: () => ({ id: "7" }), useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/lib/ship-downloads", () => ({ saveShipDocument: jest.fn(), ensureFolderPermissionNow: jest.fn() }));
jest.mock("@/lib/app-toast", () => ({ appToast: {} }));

const elements = (node: React.ReactNode): React.ReactElement<any>[] => React.Children.toArray(node).flatMap(child =>
  React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);

function harness() {
  const states: unknown[] = [null, "acoes", false, null, { id: 7, nome: "Cliente", email: "client@example.com", telmovel: "912345678", navios: [] }];
  let index = 0;
  const busy = { current: false };
  jest.spyOn(React, "useRef").mockReturnValue(busy);
  jest.spyOn(React, "useState").mockImplementation(((initial: unknown) => {
    const key = index++;
    if (!(key in states)) states[key] = initial;
    return [states[key], (value: unknown) => { states[key] = value; }];
  }) as never);
  jest.spyOn(React, "useEffect").mockImplementation(() => {});
  jest.spyOn(React, "useMemo").mockImplementation((callback) => callback());
  const render = () => { index = 0; return elements(Page()); };
  return { render, button: (label: string) => render().find(el => el.type === "button" && el.props.children === label)! };
}

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
let confirmSend: jest.Mock;
beforeEach(() => {
  jest.mocked(useSession).mockReturnValue({ data: { user: { role: "ADMIN", email: " JULIO.CORREIA@OREY.COM " } } } as never);
  confirmSend = jest.fn(() => true);
  Object.defineProperty(globalThis, "window", { configurable: true, value: { confirm: confirmSend } });
  globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "Pedido WhatsApp aceite; entrega por confirmar.", target: "+351912345678" }) });
});
afterEach(() => {
  jest.restoreAllMocks();
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

it("confirms the saved email target and does not send on cancellation", async () => {
  const ui = harness();
  confirmSend.mockReturnValue(false);
  await ui.button("Enviar codigo por email").props.onClick();
  expect(confirmSend).toHaveBeenCalledWith(expect.stringContaining("client@example.com"));
  expect(fetch).not.toHaveBeenCalled();
});

it("blocks concurrent code actions and shows the accepted-not-delivered result", async () => {
  let resolve!: (value: unknown) => void;
  jest.mocked(fetch).mockReturnValue(new Promise(done => { resolve = done; }) as never);
  const ui = harness();
  const emailAction = ui.button("Enviar codigo por email").props.onClick;
  const sending = ui.button("Enviar codigo por WhatsApp").props.onClick();
  expect(confirmSend).toHaveBeenCalledWith(expect.stringContaining("912345678"));
  expect(ui.button("Enviar codigo por email").props.disabled).toBe(true);
  await emailAction();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/portal/clientes/7/gerar-codigo", expect.objectContaining({ body: JSON.stringify({ channel: "whatsapp" }) }));
  resolve({ ok: true, json: async () => ({ message: "Pedido WhatsApp aceite; entrega por confirmar.", target: "+351912345678" }) });
  await sending;
  expect(ui.render().some(el => el.props.role === "status" && String(el.props.children).includes("entrega por confirmar"))).toBe(true);
});

it("shows uncertain errors without automatically retrying", async () => {
  jest.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: "Sem confirmacao. Nao repita sem verificar.", uncertain: true }) } as Response);
  const ui = harness();
  await ui.button("Enviar codigo por WhatsApp").props.onClick();
  expect(ui.render().some(el => el.props.role === "alert" && el.props.children.includes("Nao repita"))).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("does not show WhatsApp for other admins or send buttons for non-admins", () => {
  const ui = harness();
  jest.mocked(useSession).mockReturnValue({ data: { user: { role: "ADMIN", email: "other@orey.com" } } } as never);
  expect(ui.button("Enviar codigo por WhatsApp")).toBeUndefined();
  expect(ui.button("Enviar codigo por email")).toBeDefined();
  jest.mocked(useSession).mockReturnValue({ data: { user: { role: "USER", email: "julio.correia@orey.com" } } } as never);
  expect(ui.button("Enviar codigo por email")).toBeUndefined();
  expect(ui.button("Enviar codigo por WhatsApp")).toBeUndefined();
});
