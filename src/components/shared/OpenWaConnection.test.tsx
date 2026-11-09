import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { join } from "path";
import OpenWaConnection from "./OpenWaConnection";

const qr = "data:image/png;base64,iVBORw0KGgo=";
const state = { configured: true, ready: false, status: "qr_ready", open: true, timeZone: "Atlantic/Azores", hours: "hours", qrCode: qr };
const response = (data: unknown = state, status = 200) => ({ ok: status < 400, status, json: async () => data });

// Exercise effects and event handlers in the repository's Node-only test environment.
function mount() {
  const slots: any[] = [];
  const effects: { deps?: React.DependencyList; cleanup?: void | (() => void) }[] = [];
  let index = 0;
  let effectIndex = 0;
  let pending: (() => void)[] = [];
  const onStatusChange = jest.fn();
  jest.spyOn(React, "useState").mockImplementation(((initial: any) => {
    const slot = index++;
    if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
    return [slots[slot], (next: any) => { slots[slot] = typeof next === "function" ? next(slots[slot]) : next; }];
  }) as any);
  jest.spyOn(React, "useRef").mockImplementation(((initial: any) => {
    const slot = index++;
    if (!(slot in slots)) slots[slot] = { current: initial };
    return slots[slot];
  }) as any);
  jest.spyOn(React, "useId").mockReturnValue("pairing-panel");
  jest.spyOn(React, "useEffect").mockImplementation((effect, deps) => {
    const slot = effectIndex++;
    const previous = effects[slot];
    if (!previous || !deps || deps.some((dep, i) => !Object.is(dep, previous.deps?.[i]))) {
      pending.push(() => {
        previous?.cleanup?.();
        effects[slot] = { deps, cleanup: effect() };
      });
    }
  });
  let node: React.ReactElement;
  const render = () => {
    index = 0; effectIndex = 0; pending = [];
    node = OpenWaConnection({ onStatusChange });
    pending.forEach((effect) => effect());
  };
  const elements = (value: React.ReactNode): React.ReactElement<any>[] => React.Children.toArray(value).flatMap((child) => React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : []);
  render();
  return {
    render, onStatusChange,
    html: () => renderToStaticMarkup(node),
    click: (text: string) => {
      const button = elements(node).find((el) => el.type === "button" && renderToStaticMarkup(<>{el.props.children}</>).includes(text));
      if (!button || button.props.disabled) throw new Error(`Button unavailable: ${text}`);
      button.props.onClick(); render();
    },
    settle: async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); render(); },
    unmount: () => effects.forEach((effect) => effect.cleanup?.()),
  };
}

let fetchMock: jest.Mock;
beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { setTimeout, clearTimeout, setInterval, clearInterval } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { visibilityState: "visible" } });
  fetchMock = jest.fn().mockResolvedValue(response());
  globalThis.fetch = fetchMock;
});
afterEach(() => {
  jest.restoreAllMocks(); jest.useRealTimers();
  Reflect.deleteProperty(globalThis, "window"); Reflect.deleteProperty(globalThis, "document");
});

it("loads status without starting a session and shows cold-start guidance", async () => {
  const ui = mount();
  expect(ui.html()).toContain("A iniciar");
  expect(ui.html()).toContain("110 segundos");
  expect(ui.html()).toContain("perder a sessão");
  await ui.settle();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  expect(ui.html()).not.toContain("<img");
  expect(jest.getTimerCount()).toBe(0);
  jest.advanceTimersByTime(120_000); await ui.settle();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  ui.unmount();
});

it("starts only on explicit connect, then fetches and shows the pairing QR", async () => {
  const ui = mount(); await ui.settle();
  ui.click("Ligar WhatsApp"); await ui.settle();
  expect(fetchMock.mock.calls.map(([, init]) => init.method)).toEqual(["GET", "POST"]);
  expect(fetchMock.mock.calls[1][1].body).toBe('{"action":"connect"}');
  expect(fetchMock.mock.calls.every(([url]) => url === "/api/comunicacoes/openwa")).toBe(true);
  expect(ui.html()).toContain(qr);
  expect(ui.html()).toContain("Dispositivos associados");
  ui.click("Fechar QR");
  const count = fetchMock.mock.calls.length;
  jest.advanceTimersByTime(120_000); await ui.settle();
  expect(fetchMock).toHaveBeenCalledTimes(count);
  expect(ui.html()).not.toContain("<img");
  ui.unmount();
});

it("bounds visible-panel polling to 60 seconds and requires manual refresh afterwards", async () => {
  const ui = mount(); await ui.settle(); ui.click("Mostrar QR");
  for (let i = 0; i < 14; i++) { jest.advanceTimersByTime(5_000); await ui.settle(); }
  const count = fetchMock.mock.calls.length;
  expect(count).toBeLessThanOrEqual(13);
  expect(ui.html()).toContain("Atualização automática terminada");
  expect(ui.html()).not.toContain("<img");
  jest.advanceTimersByTime(120_000); await ui.settle();
  expect(fetchMock).toHaveBeenCalledTimes(count);
  ui.unmount();
});

it.each([401, 403])("handles authorization %s without leaking server messages", async (status) => {
  fetchMock.mockResolvedValue(response({ error: "SECRET session-identifier" }, status));
  const ui = mount(); await ui.settle();
  expect(ui.html()).toContain("conta autorizada");
  expect(ui.html()).not.toMatch(/SECRET|session-identifier/);
  expect(ui.onStatusChange).toHaveBeenLastCalledWith(null);
  ui.unmount();
});

it("times out and permits an explicit retry without automatic POST retries", async () => {
  fetchMock.mockImplementationOnce((_, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("SECRET")))));
  const ui = mount();
  jest.advanceTimersByTime(110_000); await ui.settle();
  expect(ui.html()).toContain("demorou demasiado");
  expect(ui.html()).not.toContain("SECRET");
  ui.click("Atualizar estado WhatsApp"); await ui.settle();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(ui.onStatusChange.mock.calls.at(-1)?.[0]?.connected).toBe(false);
  ui.unmount();
});

it.each(["https://secret.onrender.com/qr?token=SECRET", "data:image/svg+xml;base64,PHN2Zz4=", "javascript:SECRET"])("rejects unsafe QR sources: %s", async (qrCode) => {
  fetchMock.mockResolvedValue(response({ ...state, qrCode, sessionId: "SECRET", apiKey: "SECRET", status: "SECRET" }));
  const ui = mount(); await ui.settle(); ui.click("Mostrar QR");
  expect(ui.html()).not.toContain("SECRET");
  expect(ui.html()).not.toContain("<img");
  ui.unmount();
});

it("uses readiness rather than service health, and respects the server's Azores hours", async () => {
  fetchMock.mockResolvedValue(response({ ...state, ready: true, open: false }));
  const ui = mount(); await ui.settle();
  expect(ui.html()).toContain("Fora horário");
  expect(ui.html()).toContain("envio está suspenso");
  expect(ui.html()).not.toContain("<img");
  expect(ui.onStatusChange.mock.calls.at(-1)?.[0]).toMatchObject({ connected: true, businessHours: { open: false, timeZone: "Atlantic/Azores" } });
  ui.unmount();
});

it("stops pairing requests once the session is ready", async () => {
  const ui = mount(); await ui.settle(); ui.click("Mostrar QR");
  fetchMock.mockResolvedValue(response({ ...state, ready: true, status: "ready" }));
  jest.advanceTimersByTime(5_000); await ui.settle(); await ui.settle();
  expect(ui.html()).toContain("Sessão WhatsApp ligada");
  expect(ui.html()).not.toContain("<img");
  const count = fetchMock.mock.calls.length;
  jest.advanceTimersByTime(120_000); await ui.settle();
  expect(fetchMock).toHaveBeenCalledTimes(count);
  ui.unmount();
});

it("allows connecting and displaying the QR outside sending hours", async () => {
  fetchMock.mockResolvedValue(response({ ...state, open: false }));
  const ui = mount(); await ui.settle();
  ui.click("Ligar WhatsApp"); await ui.settle();
  expect(fetchMock.mock.calls[1][1].method).toBe("POST");
  expect(ui.html()).toContain(qr);
  expect(ui.html()).toContain("envio está suspenso");
  expect(ui.onStatusChange.mock.calls.at(-1)?.[0]).toMatchObject({ connected: false, businessHours: { open: false } });
  ui.unmount();
});

it("keeps the current QR visible while refreshing its status", async () => {
  const ui = mount(); await ui.settle(); ui.click("Mostrar QR");
  fetchMock.mockImplementationOnce(() => new Promise(() => {}));
  ui.click("Atualizar estado WhatsApp");
  ui.render();
  expect(ui.html()).toContain(qr);
  expect(ui.html()).toContain("A consultar a sessão");
  ui.unmount();
});

it.each([
  response({ error: "SECRET" }, 500),
  response({ ...state, status: "unavailable", error: "SECRET" }),
  response({ configured: true, health: "ok", sessionId: "SECRET" }),
])("handles unavailable or invalid status without assuming a paired session", async (res) => {
  fetchMock.mockResolvedValue(res);
  const ui = mount(); await ui.settle();
  expect(ui.html()).toContain("Não foi possível confirmar a ligação");
  expect(ui.html()).not.toMatch(/SECRET|<img/);
  expect(ui.onStatusChange).toHaveBeenLastCalledWith(null);
  ui.unmount();
});

it("does not request Render status while the browser tab is hidden", async () => {
  const ui = mount(); await ui.settle(); ui.click("Mostrar QR");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { visibilityState: "hidden" } });
  jest.advanceTimersByTime(60_000); await ui.settle();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  ui.unmount();
});

it("resumes polling after a hidden tab becomes visible", async () => {
  const ui = mount(); await ui.settle(); ui.click("Mostrar QR");
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  jest.advanceTimersByTime(5_000); await ui.settle();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  jest.advanceTimersByTime(5_000); await ui.settle();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  ui.unmount();
});

it("never overlaps a slow poll or retries connect automatically", async () => {
  const ui = mount(); await ui.settle(); ui.click("Ligar WhatsApp"); await ui.settle();
  fetchMock.mockImplementationOnce(() => new Promise(() => {}));
  jest.advanceTimersByTime(5_000); await ui.settle(); await ui.settle();
  jest.advanceTimersByTime(20_000); await ui.settle();
  expect(fetchMock.mock.calls.map(([, init]) => init.method)).toEqual(["GET", "POST", "GET"]);
  ui.unmount();
});

it("unlocks after timeout even when fetch ignores abort and ignores its late response", async () => {
  let finish!: (value: unknown) => void;
  fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const ui = mount();
  jest.advanceTimersByTime(110_000); await ui.settle();
  expect(ui.html()).toContain("demorou demasiado");
  ui.click("Atualizar estado WhatsApp"); await ui.settle();
  finish(response({ ...state, ready: true })); await ui.settle();
  expect(ui.onStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ connected: false }));
  expect(jest.getTimerCount()).toBe(0);
  ui.unmount();
});

it.each([401, 200])("closing cancels pending work and ignores late HTTP %s responses", async (httpStatus) => {
  const ui = mount(); await ui.settle(); ui.click("Mostrar QR");
  let finish!: (value: unknown) => void;
  fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  ui.click("Atualizar estado WhatsApp"); await ui.settle();
  const signal = fetchMock.mock.calls.at(-1)[1].signal;
  ui.click("Fechar QR"); await ui.settle();
  const calls = ui.onStatusChange.mock.calls.length;
  expect(signal.aborted).toBe(true);
  finish(response({ ...state, ready: true }, httpStatus)); await ui.settle();
  expect(ui.onStatusChange).toHaveBeenCalledTimes(calls);
  expect(ui.html()).not.toContain("conta autorizada");
  expect(jest.getTimerCount()).toBe(0);
  ui.click("Mostrar QR");
  jest.advanceTimersByTime(5_000); await ui.settle();
  expect(fetchMock).toHaveBeenCalledTimes(3);
  ui.unmount();
});

it("unmount aborts work and suppresses late status callbacks", async () => {
  let finish!: (value: unknown) => void;
  fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const ui = mount();
  const calls = ui.onStatusChange.mock.calls.length;
  ui.unmount();
  finish(response());
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(ui.onStatusChange).toHaveBeenCalledTimes(calls);
  expect(jest.getTimerCount()).toBe(0);
});

it.each(["initializing", "authenticating"])("does not reconnect while %s", async (status) => {
  fetchMock.mockResolvedValue(response({ ...state, status }));
  const ui = mount(); await ui.settle();
  expect(() => ui.click("Ligar WhatsApp")).toThrow("Button unavailable");
  ui.click("Mostrar QR");
  jest.advanceTimersByTime(5_000); await ui.settle();
  expect(fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  ui.unmount();
});

it("removes active Twilio, SMS and call prompts while retaining historical channels and Edge TTS", () => {
  const source = readFileSync(join(process.cwd(), "src/modules/ComunicacaoInbox.tsx"), "utf8");
  expect(source).not.toMatch(/Twilio|voip-call|webrtc|Enviar SMS|tel:|InfiniReach/);
  expect(source).toContain('const CHANNELS: Channel[] = ["WHATSAPP", "EMAIL"]');
  expect(source).toContain('"SMS", ...CHANNELS, "CHAMADA"');
  expect(source).toContain("Ouvir antes de enviar");
  expect(source).toContain("TTS_VOICES.map");
  expect(source).toContain("preview?.identity === previewIdentity");
  expect(source).toContain("configured === true");
});
